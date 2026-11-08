/**
 * Tax Engine — deterministic tax calculation.
 *
 * Given a subtotal and a tax context (country/region + tax rate row from
 * `tax_rates`), compute inclusive/exclusive tax. Providers (Stripe Tax,
 * Paddle) may also compute tax on their side; when they do, we accept their
 * result. This engine is the fallback for the manual provider and for
 * previews before a provider round-trip.
 */

export interface TaxRateRow {
  id?: string | null;
  code?: string | null;
  rate: number; // percentage e.g. 20 for 20%
  inclusive?: boolean;
  country?: string | null;
  region?: string | null;
}

export interface TaxContext {
  country?: string | null;
  region?: string | null;
  tax_id?: string | null; // if provided, may be reverse-charged (B2B EU)
  reverse_charge?: boolean;
}

export interface TaxResult {
  tax_cents: number;
  taxable_cents: number;
  effective_rate: number;
  inclusive: boolean;
  applied_rate?: TaxRateRow;
}

export function computeTax(
  subtotal_cents: number,
  ctx: TaxContext,
  rates: TaxRateRow[],
): TaxResult {
  if (ctx.reverse_charge) {
    return { tax_cents: 0, taxable_cents: subtotal_cents, effective_rate: 0, inclusive: false };
  }
  const applied = pickRate(rates, ctx);
  if (!applied) {
    return { tax_cents: 0, taxable_cents: subtotal_cents, effective_rate: 0, inclusive: false };
  }
  const rate = Number(applied.rate) / 100;
  if (applied.inclusive) {
    const taxable = Math.round(subtotal_cents / (1 + rate));
    return {
      tax_cents: subtotal_cents - taxable,
      taxable_cents: taxable,
      effective_rate: rate,
      inclusive: true,
      applied_rate: applied,
    };
  }
  const tax = Math.round(subtotal_cents * rate);
  return {
    tax_cents: tax,
    taxable_cents: subtotal_cents,
    effective_rate: rate,
    inclusive: false,
    applied_rate: applied,
  };
}

function pickRate(rates: TaxRateRow[], ctx: TaxContext): TaxRateRow | undefined {
  const country = ctx.country?.toUpperCase();
  const region = ctx.region?.toUpperCase();
  // Most specific match wins: country+region > country > global fallback.
  return (
    rates.find((r) => r.country?.toUpperCase() === country && r.region?.toUpperCase() === region) ||
    rates.find((r) => r.country?.toUpperCase() === country && !r.region) ||
    rates.find((r) => !r.country)
  );
}
