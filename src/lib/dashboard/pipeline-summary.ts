import { normalizeCurrencyCode } from "../currency/format";

export type PipelineAmount = {
  currency: string;
  amount: number;
  weighted: number;
  count: number;
};

export type PipelineDealAmount = {
  amount: number | string | null;
  currency: string | null;
  probability: number | string | null;
};

/** Keep currencies separate: no exchange rate is available for a valid grand total. */
export function groupPipelineAmounts(deals: readonly PipelineDealAmount[]): PipelineAmount[] {
  const totals = new Map<string, PipelineAmount>();

  for (const deal of deals) {
    const currency = normalizeCurrencyCode(deal.currency) ?? "UNKNOWN";
    const amount = Number(deal.amount) || 0;
    const probability = Number(deal.probability) || 0;
    const total = totals.get(currency) ?? { currency, amount: 0, weighted: 0, count: 0 };
    total.amount += amount;
    total.weighted += (amount * probability) / 100;
    total.count += 1;
    totals.set(currency, total);
  }

  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

export type PipelineDataState = "no_pipeline" | "no_stages" | "no_open_deals" | "ready";

export function pipelineDataState(
  pipelineCount: number,
  stageCount: number,
  openDealCount: number,
): PipelineDataState {
  if (!pipelineCount) return "no_pipeline";
  if (!stageCount) return "no_stages";
  if (!openDealCount) return "no_open_deals";
  return "ready";
}
