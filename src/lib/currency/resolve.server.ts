/**
 * Server-side tenant currency resolution.
 *
 * The mirror of `useTenantCurrency()` for code that has no React context:
 * the organization's own currency, then the platform default from Super Admin →
 * Platform Settings → Localization, and only then `"USD"`.
 *
 * Why this has to exist: several server functions returned a literal `"USD"`
 * for "unknown", and a concrete value from the server *defeats* a client-side
 * fallback — `kpis?.currency || tenantCurrency` keeps the dollars the server
 * just asserted. The two sides have to agree on the same resolution order, so
 * they read the same two sources in the same order.
 *
 * Reads go through the service-role client because `settings` is platform
 * scoped, and every caller has already authorised the workspace it passes in.
 */

const LAST_RESORT = "USD";

/** Structural shape of a Supabase client, so any caller's alias fits. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

function normalise(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().toUpperCase() : null;
}

/** The platform-wide default currency, or null when none is configured. */
export async function platformDefaultCurrency(): Promise<string | null> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data, error } = await (supabaseAdmin as unknown as Client)
    .from("settings")
    .select("value")
    .eq("scope", "platform")
    .eq("key", "localization")
    .maybeSingle();
  if (error || !data) return null;
  const value = (data as { value?: Record<string, unknown> }).value ?? {};
  return normalise(value["default_currency"]);
}

/** ISO currency codes enabled in Super Admin → Platform Settings → Localization. */
export async function platformEnabledCurrencies(): Promise<string[]> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data, error } = await (supabaseAdmin as unknown as Client)
    .from("settings")
    .select("value")
    .eq("scope", "platform")
    .eq("key", "localization");
  if (error || !data) return [(await platformDefaultCurrency()) ?? LAST_RESORT];

  const localization = (data as Array<{ value?: Record<string, unknown> }>).reduce(
    (merged, row) => ({ ...merged, ...(row.value ?? {}) }),
    {} as Record<string, unknown>,
  );
  const values = Array.isArray(localization["enabled_currencies"])
    ? localization["enabled_currencies"]
    : [localization["default_currency"]];
  const configured = values
    .map(normalise)
    .filter((currency): currency is string => currency !== null);
  return [...new Set(configured.length ? configured : [(await platformDefaultCurrency()) ?? LAST_RESORT])];
}

/**
 * Resolve the currency for an organization.
 *
 * `null` is never returned — callers that want "unknown" should not call this.
 */
export async function resolveOrganizationCurrency(
  organizationId: string | null | undefined,
): Promise<string> {
  if (!organizationId) return (await platformDefaultCurrency()) ?? LAST_RESORT;

  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data: org } = await (supabaseAdmin as unknown as Client)
    .from("organizations")
    .select("currency")
    .eq("id", organizationId)
    .maybeSingle();

  return (
    normalise((org as { currency?: unknown } | null)?.currency) ??
    (await platformDefaultCurrency()) ??
    LAST_RESORT
  );
}

/**
 * Resolve the currency for a workspace, via the organization that owns it.
 *
 * `null` is never returned — callers that want "unknown" should not call this.
 */
export async function resolveWorkspaceCurrency(
  workspaceId: string | null | undefined,
): Promise<string> {
  if (!workspaceId) return (await platformDefaultCurrency()) ?? LAST_RESORT;

  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data: ws } = await (supabaseAdmin as unknown as Client)
    .from("workspaces")
    .select("organization_id")
    .eq("id", workspaceId)
    .maybeSingle();

  return await resolveOrganizationCurrency(
    (ws as { organization_id?: string | null } | null)?.organization_id ?? null,
  );
}

/**
 * The currency of a set of rows, when they agree, else the workspace's.
 *
 * Aggregates (a pipeline total, a revenue forecast) are only meaningful in one
 * currency. Taking `rows[0].currency` — the previous habit — silently labels a
 * mixed-currency total with whichever row happened to sort first, so a
 * disagreement falls back to the tenant's currency instead of pretending.
 */
export async function resolveAggregateCurrency(
  rows: ReadonlyArray<{ currency?: string | null }> | null | undefined,
  workspaceId: string | null | undefined,
): Promise<string> {
  const distinct = new Set(
    (rows ?? []).map((r) => normalise(r?.currency)).filter((c): c is string => c !== null),
  );
  if (distinct.size === 1) return [...distinct][0];
  return await resolveWorkspaceCurrency(workspaceId);
}
