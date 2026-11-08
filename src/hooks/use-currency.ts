/**
 * useTenantCurrency — the single source of truth for the currency the CRM
 * renders money in.
 *
 * Resolution order: the active organization's own currency, then the
 * platform-wide default set in Super Admin → Platform Settings → Localization,
 * and only then "USD". Never hardcode "USD" in CRM copy — call this so a
 * tenant that runs in ZAR/EUR sees its own currency everywhere.
 */
import { useActiveOrganization } from "@/hooks/use-organization";
import { usePlatformRuntime } from "@/hooks/use-platform-runtime";
import { formatMoney, normalizeCurrencyCode } from "@/lib/currency/format";

export function useTenantCurrency(): string {
  const { active } = useActiveOrganization();
  const { config } = usePlatformRuntime();
  const orgCurrency = (active?.currency ?? "").trim();
  if (orgCurrency) return orgCurrency.toUpperCase();
  const platform = (config.localization?.defaultCurrency ?? "").trim();
  return (platform || "USD").toUpperCase();
}

/** Currency-aware money formatter bound to the active tenant currency. */
export function useMoneyFormatter(): (value: number) => string {
  const currency = useTenantCurrency();
  return (value: number) => formatMoney(value, currency, { maximumFractionDigits: 0 });
}

export interface CurrencyFormatterOptions {
  /**
   * Formatting locale. Left undefined (the browser's) by default; callers that
   * are replacing a hardcoded `"en-US"` pass it through so grouping and decimal
   * separators do not shift for anyone as a side effect of a currency fix.
   */
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  /** Divide by 100 first — for amounts stored in minor units (cents). */
  fromCents?: boolean;
}

/**
 * Money formatter whose fallback is the tenant currency rather than `"USD"`.
 *
 * Deliberately shaped like the `const money = (v, ccy = "USD") => ` helper it
 * replaces — `(value, currency?)` — so a file adopts it by swapping the local
 * definition for one call to this hook, leaving every call site untouched.
 *
 * The per-row argument still wins when present: an invoice raised in EUR has to
 * keep rendering EUR even inside a ZAR tenant, because the stored amount is in
 * the currency it was issued in. The tenant currency only fills the gap where
 * the row has no currency of its own — which is the case that used to silently
 * print dollars.
 *
 * `undefined`, `null` and `""` all fall through, so a column that exists but is
 * blank behaves the same as a column that was never selected.
 */
export function useCurrencyFormatter(
  options: CurrencyFormatterOptions = {},
): (value: number | null | undefined, currency?: string | null) => string {
  const tenantCurrency = useTenantCurrency();
  const { locale, minimumFractionDigits, maximumFractionDigits, fromCents = false } = options;

  return (value, currency) =>
    // `normalizeCurrencyCode` returns null for anything that is not a usable
    // code — including the numeric second argument that library callbacks pass
    // (Recharts' `tickFormatter={money}` calls `money(value, index)`) — so the
    // tenant currency fills the gap instead of `index.trim` throwing.
    formatMoney(value, normalizeCurrencyCode(currency) ?? tenantCurrency, {
      locale,
      minimumFractionDigits,
      maximumFractionDigits,
      fromCents,
    });
}
