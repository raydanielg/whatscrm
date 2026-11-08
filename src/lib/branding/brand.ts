/**
 * Deploy-time brand name.
 *
 * Static contexts that cannot call React hooks — route `head()` metadata,
 * server notifications, iCal producers, sample payloads — must read the brand
 * from here instead of hardcoding the product name, so a white-label deploy
 * only has to set `VITE_BRAND_NAME`.
 *
 * Rendered React copy should prefer `useBrandName()` / `<Brand />`, which also
 * honour per-workspace white-label overrides.
 */
const fromEnv =
  (typeof import.meta !== "undefined" ? (import.meta as any).env?.VITE_BRAND_NAME : undefined) ??
  (typeof process !== "undefined" ? process.env?.["VITE_BRAND_NAME"] : undefined);

export const BRAND_NAME: string = (typeof fromEnv === "string" && fromEnv.trim()) || "WACRM";

function env(key: string): string | undefined {
  const v =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (typeof import.meta !== "undefined" ? (import.meta as any).env?.[key] : undefined) ??
    (typeof process !== "undefined" ? process.env?.[key] : undefined);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Lower-case, identifier-safe form of the brand, used where a name has to be
 * machine-readable: SDK package names, env-var prefixes, API hostnames.
 *
 * `BRAND_NAME` cannot be used for these — it may contain spaces ("Auto
 * Engage"), which would emit invalid code into the developer-portal samples.
 */
export const BRAND_SLUG: string = env("VITE_BRAND_SLUG") ?? "wacrm";

/** Public API host shown in developer documentation and code samples. */
export const BRAND_API_HOST: string = env("VITE_BRAND_API_HOST") ?? "api.wacrm.io";

/**
 * The exported client class / SDK symbol. Deliberately NOT derived from
 * `BRAND_NAME`: it must stay a valid identifier in every language we print
 * samples for, and it names the published SDK, not the deployment's brand.
 */
export const SDK_CLIENT_NAME = "WACRM" as const;

/** Env-var name the samples tell API consumers to set, e.g. WACRM_API_KEY. */
export const BRAND_ENV_PREFIX: string = BRAND_SLUG.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
