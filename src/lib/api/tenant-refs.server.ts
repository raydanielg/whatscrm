/**
 * Cross-tenant reference validation for the public API.
 *
 * The deals endpoints accept client-supplied `contact_id`, `company_id`,
 * `pipeline_id`, `stage_id` and `owner_id`. Without a lookup, an API key
 * holder for one tenant could attach their deal to another tenant's records.
 * Every referenced ID is therefore resolved against the caller's own tenant
 * before any insert/update runs.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Tables keyed by the tenant columns they may expose. */
const TENANT_COLUMNS: Record<string, string[]> = {
  contacts: ["organization_id", "workspace_id"],
  companies: ["organization_id", "workspace_id"],
  deal_pipelines: ["workspace_id"],
  deal_stages: ["workspace_id"],
};

const REFERENCE_TABLES: Record<string, string> = {
  contact_id: "contacts",
  company_id: "companies",
  pipeline_id: "deal_pipelines",
  stage_id: "deal_stages",
};

async function belongsToTenant(
  supabase: SupabaseClient,
  table: string,
  id: string,
  tenantId: string,
): Promise<boolean> {
  const cols = TENANT_COLUMNS[table] ?? ["organization_id"];
  const { data, error } = await supabase
    .from(table)
    .select(cols.join(", "))
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return false;
  const row = data as unknown as Record<string, unknown>;
  return cols.some((c) => row[c] === tenantId);
}

async function isTenantMember(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const [org, ws] = await Promise.all([
    supabase
      .from("organization_members")
      .select("id")
      .eq("user_id", userId)
      .eq("organization_id", tenantId)
      .maybeSingle(),
    supabase
      .from("workspace_members")
      .select("id")
      .eq("user_id", userId)
      .eq("workspace_id", tenantId)
      .maybeSingle(),
  ]);
  return Boolean(org.data || ws.data);
}

/**
 * Validates every tenant-scoped reference present in `record`.
 * Returns the list of offending field names (empty when everything resolves).
 */
export async function findForeignReferences(
  supabase: SupabaseClient,
  tenantId: string,
  record: Record<string, unknown>,
): Promise<string[]> {
  const bad: string[] = [];

  for (const [field, table] of Object.entries(REFERENCE_TABLES)) {
    const value = record[field];
    if (typeof value !== "string" || value.length === 0) continue;
    if (!(await belongsToTenant(supabase, table, value, tenantId))) bad.push(field);
  }

  const owner = record["owner_id"];
  if (typeof owner === "string" && owner.length > 0) {
    if (!(await isTenantMember(supabase, owner, tenantId))) bad.push("owner_id");
  }

  return bad;
}
