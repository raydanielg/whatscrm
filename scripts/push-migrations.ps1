<#
.SYNOPSIS
  Applies supabase/migrations/*.sql to the remote Supabase project, in order.

.DESCRIPTION
  Bootstraps a blank Supabase project from this repo's migration history without
  needing `supabase link` or a database password.

  Each file is sent to public.__bootstrap_exec(sql text) over PostgREST using the
  service role key, and runs in its own transaction. The SQL is streamed straight
  from disk, so what lands in the database is byte-identical to the repo.

  On success it rewrites supabase_migrations.schema_migrations to the exact
  filenames in supabase/migrations, so a later `supabase db push` sees the
  history as already applied instead of trying to re-run everything. It then
  drops the __bootstrap_exec helper.

.PARAMETER ServiceRoleKey
  The service_role key. If omitted, read from .env (SUPABASE_SERVICE_ROLE_KEY).
  Supabase dashboard -> Project Settings -> API Keys -> service_role.

.PARAMETER Skip
  Number of leading migration files already applied. Migrations are NOT all
  idempotent, so this must be exact. Defaults to 14 (applied 2026-09-22).

.PARAMETER DryRun
  List what would be applied and exit without sending anything.

.EXAMPLE
  .\scripts\push-migrations.ps1
  .\scripts\push-migrations.ps1 -ServiceRoleKey "sb_secret_..." -Skip 14
  .\scripts\push-migrations.ps1 -DryRun
#>
[CmdletBinding()]
param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$ServiceRoleKey,
  [int]$Skip = 14,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ---- read .env ---------------------------------------------------------------
$envPath = Join-Path $ProjectRoot ".env"
if (-not (Test-Path $envPath)) { throw "No .env at $envPath" }

$envMap = @{}
foreach ($line in Get-Content $envPath) {
  if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$') {
    $k = $Matches[1]
    $v = $Matches[2]
    # Strip trailing inline comments (" # ..."). Several lines in .env carry
    # them, and without this the comment text — including non-ASCII glyphs —
    # ends up inside the value and is rejected as an HTTP header.
    if ($v -match '^\s*(".*?"|''.*?'')\s*(#.*)?$') {
      $v = $Matches[1]
    } elseif ($v -match '^(.*?)\s+#') {
      $v = $Matches[1]
    }
    $envMap[$k] = $v.Trim().Trim('"').Trim("'")
  }
}

$url = $envMap["SUPABASE_URL"]
if ([string]::IsNullOrWhiteSpace($url)) { $url = $envMap["VITE_SUPABASE_URL"] }
if ([string]::IsNullOrWhiteSpace($url)) { throw "SUPABASE_URL is not set in .env" }
$url = $url.TrimEnd('/')

if ([string]::IsNullOrWhiteSpace($ServiceRoleKey)) {
  $ServiceRoleKey = $envMap["SUPABASE_SERVICE_ROLE_KEY"]
}

# ---- collect migrations ------------------------------------------------------
$migDir = Join-Path $ProjectRoot "supabase\migrations"
$all = Get-ChildItem -Path $migDir -Filter *.sql | Sort-Object Name
if ($all.Count -eq 0) { throw "No .sql files in $migDir" }
if ($Skip -gt $all.Count) { throw "-Skip $Skip exceeds the $($all.Count) migration files present." }

# -Skip equal to the file count is allowed on purpose: it re-runs only the
# ledger stamp and helper drop, so a run that applied every migration but died
# during cleanup can be resumed without touching the schema again.
$todo = $all | Select-Object -Skip $Skip

Write-Host ""
Write-Host "Project : $url"
Write-Host "Total   : $($all.Count) migrations"
Write-Host "Skipping: $Skip already applied"
Write-Host "Applying: $($todo.Count)"
Write-Host ""

if ($DryRun) {
  Write-Host "-- DRY RUN, nothing sent --"
  $todo | ForEach-Object { Write-Host "  $($_.Name)" }
  return
}

# Checked after -DryRun so the plan can be reviewed without a key to hand.
# Guard against stray whitespace/comment text surviving the .env parse — such a
# value fails deep inside the HTTP stack with an opaque "invalid Control
# characters" error rather than anything actionable.
if ($ServiceRoleKey -match '\s') {
  throw "SUPABASE_SERVICE_ROLE_KEY contains whitespace after parsing. Check .env line formatting."
}
if (-not ($ServiceRoleKey -match '^(eyJ|sb_secret_)')) {
  throw @"
SUPABASE_SERVICE_ROLE_KEY is missing or not a service role key.
Set it in .env, or pass -ServiceRoleKey.
Supabase dashboard -> Project Settings -> API Keys -> service_role.
"@
}

# Content-Type is passed via -ContentType, NOT in this hashtable. Windows
# PowerShell 5.1 treats Content-Type as a restricted header on HttpWebRequest
# and throws "The 'Content-Type' header must be modified using the appropriate
# property or method" if it appears in -Headers.
$headers = @{
  "apikey"        = $ServiceRoleKey
  "Authorization" = "Bearer $ServiceRoleKey"
}
$rpc = "$url/rest/v1/rpc/__bootstrap_exec"

function Invoke-Sql([string]$sql, [string]$label) {
  $body = (@{ sql = $sql } | ConvertTo-Json -Depth 3 -Compress)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  try {
    Invoke-RestMethod -Uri $rpc -Method Post -Headers $headers `
      -ContentType 'application/json; charset=utf-8' -Body $bytes | Out-Null
  } catch {
    $detail = $_.Exception.Message
    if ($_.Exception.Response) {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $detail = $reader.ReadToEnd()
      $reader.Close()
    }
    Write-Host ""
    Write-Host "FAILED at: $label" -ForegroundColor Red
    Write-Host $detail -ForegroundColor Red
    Write-Host ""
    Write-Host "Nothing after this point was applied. Fix the cause, then re-run with" -ForegroundColor Yellow
    Write-Host "  -Skip $script:appliedTotal" -ForegroundColor Yellow
    exit 1
  }
}

# ---- apply -------------------------------------------------------------------
$script:appliedTotal = $Skip
$i = 0
foreach ($f in $todo) {
  $i++
  $sql = [System.IO.File]::ReadAllText($f.FullName) -replace "`r`n", "`n"
  Invoke-Sql $sql $f.Name
  $script:appliedTotal++
  if ($i % 25 -eq 0 -or $i -eq $todo.Count) {
    Write-Host ("  {0,4}/{1}  {2}" -f $i, $todo.Count, $f.Name)
  }
}

Write-Host ""
Write-Host "All $($todo.Count) migrations applied." -ForegroundColor Green

# ---- rewrite the migration ledger -------------------------------------------
# apply_migration / this helper do not record the repo's own version strings, so
# stamp the ledger with the real filenames. Without this, `supabase db push`
# would consider all $($all.Count) migrations unapplied and try to re-run them.
Write-Host "Stamping migration ledger..."

$values = ($all | ForEach-Object {
  if ($_.BaseName -match '^(\d{14})_(.*)$') {
    $version = $Matches[1]
    $name    = $Matches[2] -replace "'", "''"
  } else {
    $version = $_.BaseName
    $name    = ""
  }
  "('$version','$name')"
}) -join ","

$ledgerSql = @"
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);
DELETE FROM supabase_migrations.schema_migrations;
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES $values
ON CONFLICT (version) DO NOTHING;
"@
Invoke-Sql $ledgerSql "ledger stamp"
Write-Host "Ledger stamped with $($all.Count) versions." -ForegroundColor Green

# ---- drop the bootstrap helper ----------------------------------------------
# It executes arbitrary SQL. It was service_role-only, but it must not outlive
# the bootstrap.
Write-Host "Dropping __bootstrap_exec helper..."
Invoke-Sql "DROP FUNCTION IF EXISTS public.__bootstrap_exec(text); NOTIFY pgrst, 'reload schema';" "drop helper"
Write-Host "Helper dropped." -ForegroundColor Green

Write-Host ""
Write-Host "Done. Next: verify with" -ForegroundColor Cyan
Write-Host "  npx supabase db diff --linked   (or regenerate types and diff)" -ForegroundColor Cyan
Write-Host ""
