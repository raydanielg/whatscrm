/**
 * The one money formatter.
 *
 * Pure and dependency-free so server functions, React hooks and tests all use
 * the same code path. `useCurrencyFormatter` in `@/hooks/use-currency` wraps
 * this with the tenant currency; server code pairs it with
 * `resolveWorkspaceCurrency` from `./resolve.server`.
 *
 * This never converts between currencies. An amount is rendered in the currency
 * it is already denominated in — relabelling a USD figure as ZAR would be worse
 * than showing the wrong symbol.
 */

export interface FormatMoneyOptions {
  /** Formatting locale; the runtime's default when omitted. */
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  /** Divide by 100 first — for amounts stored in minor units (cents). */
  fromCents?: boolean;
}

/** Last-resort code, matching `resolve.server.ts`, used only when none is given. */
export const FALLBACK_CURRENCY = "USD";

/**
 * Normalise a currency code.
 *
 * Returns null for anything that is not a usable code, so callers can fall back
 * to the tenant's currency rather than printing a blank or a stray symbol.
 * Non-string input is tolerated because these formatters get passed to library
 * callbacks that supply their own second argument (Recharts' `tickFormatter`
 * calls `format(value, index)`).
 */
export function normalizeCurrencyCode(currency: unknown): string | null {
  if (typeof currency !== "string") return null;
  const trimmed = currency.trim().toUpperCase();
  return trimmed ? trimmed : null;
}

/**
 * Format an amount as money.
 *
 * An unknown or malformed currency code must not blank out the figure the page
 * exists to show, so `Intl` failures degrade to `CODE 1,234.56`.
 */
export function formatMoney(
  value: number | null | undefined,
  currency?: string | null,
  options: FormatMoneyOptions = {},
): string {
  const { locale, minimumFractionDigits, maximumFractionDigits, fromCents = false } = options;
  const code = normalizeCurrencyCode(currency) ?? FALLBACK_CURRENCY;
  const raw = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const amount = raw / (fromCents ? 100 : 1);

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      ...(minimumFractionDigits !== undefined ? { minimumFractionDigits } : {}),
      ...(maximumFractionDigits !== undefined ? { maximumFractionDigits } : {}),
    }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString(locale)}`;
  }
}

/**
 * The currency a set of rows is denominated in, when they agree.
 *
 * The client-side mirror of `resolveAggregateCurrency` in `./resolve.server`.
 * A pipeline total is only meaningful in one currency: taking `rows[0].currency`
 * labels a mixed-currency sum with whichever row sorted first, so a
 * disagreement falls back to the tenant's currency rather than asserting
 * something untrue. Summing across currencies is still wrong — this only makes
 * the label honest, and never converts.
 */
export function aggregateCurrency(
  rows: ReadonlyArray<{ currency?: string | null }> | null | undefined,
  fallback: string,
): string {
  const distinct = new Set(
    (rows ?? [])
      .map((r) => normalizeCurrencyCode(r?.currency))
      .filter((c): c is string => c !== null),
  );
  return distinct.size === 1 ? [...distinct][0] : fallback;
}

/** True when rows carry more than one currency, so a total cannot be summed honestly. */
export function hasMixedCurrencies(
  rows: ReadonlyArray<{ currency?: string | null }> | null | undefined,
): boolean {
  const distinct = new Set(
    (rows ?? [])
      .map((r) => normalizeCurrencyCode(r?.currency))
      .filter((c): c is string => c !== null),
  );
  return distinct.size > 1;
}

/** Compact form for dashboard tiles — `R 1,2 M` style grouping is locale-driven. */
export function formatMoneyCompact(
  value: number | null | undefined,
  currency?: string | null,
  options: Omit<FormatMoneyOptions, "minimumFractionDigits"> = {},
): string {
  const { locale, fromCents = false, maximumFractionDigits = 1 } = options;
  const code = normalizeCurrencyCode(currency) ?? FALLBACK_CURRENCY;
  const raw = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const amount = raw / (fromCents ? 100 : 1);

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      notation: "compact",
      maximumFractionDigits,
    }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString(locale)}`;
  }
}
