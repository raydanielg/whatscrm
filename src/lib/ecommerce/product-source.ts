/**
 * Where an imported product came from.
 *
 * Products synced from a store carry their origin in `metadata`
 * (`connection_id`, `external_id`, `source`, `store_name`) and in a
 * `retailer_id` of the form `<platform>:<connectionId>:<externalId>`.
 *
 * The connection id is the part that matters: WooCommerce product ids are only
 * unique *within* a store, so two connected stores can both own product 42.
 * Identity, lookup and display must all key on the connection, never on the
 * external id alone.
 */

export interface ProductSource {
  connectionId: string;
  externalId: string;
  /** Platform slug as stored (`woocommerce`, `shopify`, `wordpress`). */
  platform: string;
  /** Store name captured at sync time; may be absent on older rows. */
  storeName: string | null;
}

/** Row shape this module needs — deliberately loose, products are untyped JSON. */
interface SourceBearingRow {
  metadata?: unknown;
  retailer_id?: unknown;
}

const PLATFORM_LABELS: Record<string, string> = {
  woocommerce: "WooCommerce",
  shopify: "Shopify",
  wordpress: "WordPress",
};

/** The stable per-store identity for an imported product. */
export function buildRetailerId(
  platform: string,
  connectionId: string,
  externalId: string,
): string {
  return `${platform}:${connectionId}:${externalId}`;
}

/**
 * Parse `<platform>:<connectionId>:<externalId>`.
 *
 * Returns null for the legacy two-part form (`<platform>:<externalId>`), which
 * carried no store identity and is why a second store could overwrite the
 * first. Those rows fall back to `metadata`.
 */
export function parseRetailerId(
  retailerId: string | null | undefined,
): { platform: string; connectionId: string; externalId: string } | null {
  if (typeof retailerId !== "string") return null;
  const parts = retailerId.split(":");
  if (parts.length < 3) return null;
  const [platform, connectionId, ...rest] = parts;
  const externalId = rest.join(":");
  if (!platform || !connectionId || !externalId) return null;
  return { platform, connectionId, externalId };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Read a product's source store, preferring `metadata` (which carries the store
 * name) and falling back to `retailer_id`. Returns null for products created by
 * hand, which have no source and should not be badged.
 */
export function productSource(row: SourceBearingRow): ProductSource | null {
  const meta = asRecord(row.metadata);
  const fromId = parseRetailerId(typeof row.retailer_id === "string" ? row.retailer_id : null);

  const connectionId = str(meta?.connection_id) ?? fromId?.connectionId ?? null;
  const externalId = str(meta?.external_id) ?? fromId?.externalId ?? null;
  if (!connectionId || !externalId) return null;

  return {
    connectionId,
    externalId,
    platform: str(meta?.source) ?? fromId?.platform ?? "unknown",
    storeName: str(meta?.store_name),
  };
}

/** Label for the source badge — the store's own name when we captured it. */
export function productSourceLabel(source: ProductSource): string {
  return source.storeName ?? PLATFORM_LABELS[source.platform] ?? source.platform;
}
