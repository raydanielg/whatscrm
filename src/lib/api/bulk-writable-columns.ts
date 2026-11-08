/**
 * Mass-assignment protection for the public bulk API.
 *
 * Explicit allow-list of writable columns per resource. Anything not listed
 * here (id, organization_id, workspace_id, created_by/at, updated_at,
 * deleted_at, ) can never be set through the bulk endpoint — this prevents
 * mass-assignment attacks such as reassigning a record to another tenant.
 *
 * Kept in its own client-safe module so security regression tests can import
 * it without pulling in server-only route dependencies.
 */
export const WRITABLE_COLUMNS: Record<string, ReadonlySet<string>> = {
  contacts: new Set([
    "name", "phone", "email", "avatar_url", "tags", "notes", "last_seen_at",
    "company_id", "first_name", "last_name", "job_title", "department",
    "lifecycle_stage", "status", "owner_id", "source", "do_not_contact",
    "timezone", "locale", "custom_fields", "display_name", "phones", "emails",
    "whatsapp", "birthday", "website", "address", "is_favorite", "is_archived",
    "assigned_agent_id", "lead_status", "customer_status",
    "customer_lifetime_value", "customer_health_score", "segments", "preferences",
  ]),
  companies: new Set([
    "owner_id", "name", "legal_name", "domain", "website", "industry",
    "company_size", "annual_revenue", "currency", "phone", "email",
    "description", "logo_url", "linkedin_url", "twitter_handle", "status",
    "source", "tags", "custom_fields", "business_type", "about", "address",
    "country", "timezone", "assigned_team_id", "is_favorite", "is_archived",
  ]),
  deals: new Set([
    "pipeline_id", "stage_id", "owner_id", "contact_id", "company_id", "title",
    "description", "amount", "currency", "probability", "expected_close_date",
    "actual_close_date", "status", "loss_reason", "source", "priority", "tags",
    "custom_fields",
  ]),
};

/**
 * Columns that must never be writable on any resource, regardless of the
 * per-resource allow-list. Used by security regression tests.
 */
export const PROTECTED_COLUMNS = [
  "id",
  "organization_id",
  "workspace_id",
  "created_by",
  "created_at",
  "updated_at",
  "deleted_at",
  "tenant_id",
  "user_id",
] as const;

/** Returns `{ row }` with only allowed keys, or `{ rejected }` listing forbidden keys. */
export function sanitizeRecord(
  resource: string,
  rec: Record<string, unknown>,
  { allowId }: { allowId: boolean },
): { row: Record<string, unknown>; rejected: string[] } {
  const allowed = WRITABLE_COLUMNS[resource] ?? new Set<string>();
  const row: Record<string, unknown> = {};
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(rec)) {
    if (key === "id") {
      if (!allowId) rejected.push(key);
      continue;
    }
    if (allowed.has(key)) row[key] = value;
    else rejected.push(key);
  }
  return { row, rejected };
}
