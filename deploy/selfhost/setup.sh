#!/usr/bin/env bash
#
# WACRM self-host bootstrap.
# Brings up: self-hosted Supabase (Postgres+Auth+REST+Realtime+Storage) + WACRM app + nginx.
#
# Usage (on the VPS, as root or sudoer):
#   bash deploy/selfhost/setup.sh [PUBLIC_IP]
#
# If PUBLIC_IP is omitted it is auto-detected.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SUPA_DIR="$ROOT/deploy/selfhost/supabase"
cd "$SUPA_DIR"

PUBLIC_IP="${1:-}"
if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP="$(curl -fsS4 https://ifconfig.me 2>/dev/null || curl -fsS4 https://icanhazip.com 2>/dev/null || true)"
fi
if [ -z "$PUBLIC_IP" ]; then
  echo "ERROR: could not detect public IP. Pass it: bash $0 <IP>"
  exit 1
fi

APP_URL="http://${PUBLIC_IP}"
SB_URL="http://${PUBLIC_IP}:8000"
echo "==> Public IP:   $PUBLIC_IP"
echo "==> App URL:     $APP_URL"
echo "==> Supabase:    $SB_URL"

# ---------------------------------------------------------------- docker ----
if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker 2>/dev/null || true
fi
docker compose version >/dev/null 2>&1 || { echo "ERROR: 'docker compose' plugin missing."; exit 1; }

# ------------------------------------------------------------------- env ----
if [ ! -f .env ]; then
  echo "==> Generating Supabase secrets..."
  cp .env.example .env
  sh utils/generate-keys.sh --update-env >/dev/null
  rm -f .env.old
fi

set_env() { sed -i.bak -e "s|^$1=.*|$1=$2|" .env; }
set_env COMPOSE_FILE "docker-compose.yml:docker-compose.app.yml"
set_env SUPABASE_PUBLIC_URL "$SB_URL"
set_env API_EXTERNAL_URL "$SB_URL"
set_env SITE_URL "$APP_URL"
set_env ADDITIONAL_REDIRECT_URLS "${APP_URL}/**"
set_env ENABLE_EMAIL_AUTOCONFIRM "true"   # no real SMTP yet — confirm signups instantly
set_env POOLER_TENANT_ID "wacrm"
set_env STUDIO_DEFAULT_ORGANIZATION "WACRM"
set_env STUDIO_DEFAULT_PROJECT "wacrm"
rm -f .env.bak .env.old

# Postgres must NOT be reachable from the internet — bind the pooler ports
# to localhost. (Remote psql still works via SSH tunnel.)
sed -i.bak \
  -e 's|${POSTGRES_PORT}:5432|127.0.0.1:${POSTGRES_PORT}:5432|' \
  -e 's|${POOLER_PROXY_PORT_TRANSACTION}:6543|127.0.0.1:${POOLER_PROXY_PORT_TRANSACTION}:6543|' \
  docker-compose.yml
rm -f docker-compose.yml.bak

ANON_KEY_VAL="$(grep '^ANON_KEY=' .env | cut -d= -f2-)"
SERVICE_KEY_VAL="$(grep '^SERVICE_ROLE_KEY=' .env | cut -d= -f2-)"

# ------------------------------------------------------------ app secrets ----
CRON_TOKEN="$(openssl rand -hex 32)"

if [ ! -f .env.production ]; then
  echo "==> Writing .env.production for the app..."
  cat > .env.production <<EOF
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
APP_ORIGIN=${APP_URL}
APP_MODE=production
VITE_APP_MODE=production
VITE_APP_ENV=production
LOG_LEVEL=info

# Supabase (self-hosted on this VPS)
VITE_SUPABASE_URL=${SB_URL}
VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY_VAL}
SUPABASE_URL=${SB_URL}
SUPABASE_PUBLISHABLE_KEY=${ANON_KEY_VAL}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_KEY_VAL}

# Generated app secrets
SESSION_SECRET=$(openssl rand -hex 32)
SETUP_BOOTSTRAP_TOKEN=$(openssl rand -hex 32)
WEBHOOK_SECRET=$(openssl rand -hex 32)
WEBHOOK_DISPATCH_SECRET=$(openssl rand -hex 32)
WIDGET_SIGNING_SECRET=$(openssl rand -hex 32)
APP_USER_CONNECTION_KEY_SECRET=$(openssl rand -hex 32)
INTERNAL_CRON_TOKEN=${CRON_TOKEN}

# --- Fill these in when you have them (optional integrations) ---
# WHATSAPP_APP_SECRET=
# WHATSAPP_VERIFY_TOKEN=
# WHATSAPP_ACCESS_TOKEN=
# OPENAI_API_KEY=
# GEMINI_API_KEY=
# ANTHROPIC_API_KEY=
# META_APP_ID=
# META_APP_SECRET=
# META_WEBHOOK_VERIFY_TOKEN=
# SMTP_HOST= / SMTP_PORT= / SMTP_USER= / SMTP_PASS=
# STRIPE_SECRET_KEY=
# WA_QR_WORKER_URL=http://qr-worker:8787   (with --profile qr)
# WA_QR_WORKER_TOKEN=$(openssl rand -hex 32)
# WA_QR_WORKER_SIGNING_SECRET=$(openssl rand -hex 32)
# WA_QR_WEBHOOK_SECRET=$(openssl rand -hex 32)
EOF
fi

# ----------------------------------------------------------------- stack ----
echo "==> Pulling Supabase images & building app (first run takes a while)..."
docker compose --env-file .env up -d

echo "==> Waiting for Postgres..."
for i in $(seq 1 60); do
  docker exec supabase-db pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done
docker exec supabase-db pg_isready -U postgres >/dev/null 2>&1 || { echo "ERROR: Postgres did not come up."; exit 1; }

# ------------------------------------------------------------ migrations ----
MARKER=".migrations-applied"
if [ ! -f "$MARKER" ]; then
  TOTAL="$(ls "$ROOT"/supabase/migrations/*.sql | wc -l | tr -d ' ')"
  echo "==> Applying $TOTAL migrations..."
  i=0
  for f in "$ROOT"/supabase/migrations/*.sql; do
    i=$((i+1))
    name="$(basename "$f")"
    printf '\r   [%s/%s] %s' "$i" "$TOTAL" "$name"
    if ! docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres -q -f - < "$f" > /tmp/wacrm-mig.log 2>&1; then
      echo ""
      echo "ERROR: migration failed: $name"
      tail -20 /tmp/wacrm-mig.log
      echo "Fix the migration or apply manually, delete $MARKER if re-running."
      exit 1
    fi
  done
  echo ""
  touch "$MARKER"
else
  echo "==> Migrations already applied ($MARKER exists) — skipping."
fi

# --------------------------------------------------------- vault secrets ----
# pg_cron jobs read their HTTP target + token from Supabase Vault.
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<SQL
create extension if not exists supabase_vault with schema vault;
select vault.create_secret('${APP_URL}', 'wacrm_cron_base_url')
where not exists (select 1 from vault.secrets where name = 'wacrm_cron_base_url');
select vault.create_secret('${CRON_TOKEN}', 'wacrm_cron_token')
where not exists (select 1 from vault.secrets where name = 'wacrm_cron_token');
SQL

# Restart app so it boots against a migrated schema.
docker compose --env-file .env restart app >/dev/null 2>&1 || true

# ---------------------------------------------------------------- summary ---
DASH_PASS="$(grep '^DASHBOARD_PASSWORD=' .env | cut -d= -f2-)"
DASH_USER="$(grep '^DASHBOARD_USERNAME=' .env | cut -d= -f2-)"

cat <<DONE

============================================================
 WACRM is deployed.
============================================================
 App:                ${APP_URL}
 Supabase API:       ${SB_URL}
 Supabase Studio:    ${SB_URL}  (login: ${DASH_USER} / ${DASH_PASS})
 App health:         ${APP_URL}/healthz  and  ${APP_URL}/api/public/health

 Files on this VPS:
   Supabase env:     ${SUPA_DIR}/.env
   App env:          ${SUPA_DIR}/.env.production

 Useful commands (from ${SUPA_DIR}):
   docker compose ps                    # status
   docker compose logs -f app           # app logs
   docker compose --profile qr up -d    # enable WhatsApp QR worker
   ssh -L 5432:127.0.0.1:5432 <vps>     # Postgres tunnel

 NOTE: running on bare HTTP+IP. WhatsApp/Meta webhooks require
 HTTPS — point a domain (or free sslip.io subdomain) at this IP
 and re-run setup with it to get TLS.
============================================================
DONE
