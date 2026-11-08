/**
 * Client-side A/B testing analytics.
 * Wilson intervals, significance testing, winner recommendation.
 */

export type MetricKey = "delivered" | "read" | "replied" | "clicked";

export type AbVariant = {
  id: string;
  name: string;
  weight: number;
  message_body: string | null;
  media_url: string | null;
  template_id: string | null;
  is_winner: boolean;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  replied_count: number;
  clicked_count: number;
  failed_count: number;
};

export type VariantAnalytics = {
  id: string;
  name: string;
  isWinner: boolean;
  weight: number;
  sent: number;
  successes: number;
  rate: number;
  wilsonLow: number;
  wilsonHigh: number;
  vsBaselinePct: number | null; // lift vs first variant
  pValue: number | null; // vs first variant
  significant: boolean;
  sampleSufficient: boolean;
};

export type AbSummary = {
  metric: MetricKey;
  variants: VariantAnalytics[];
  winner: VariantAnalytics | null;
  confidence: number; // 0-1
  totalSent: number;
  minSampleRecommended: number;
  hasEnoughData: boolean;
  ranking: VariantAnalytics[];
};

const Z_95 = 1.96;

function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

export function twoProportionPValue(
  x1: number,
  n1: number,
  x2: number,
  n2: number,
): number {
  if (n1 === 0 || n2 === 0) return 1;
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return 1;
  const z = (p1 - p2) / se;
  return 2 * (1 - normalCdf(Math.abs(z)));
}

export function wilsonInterval(x: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const p = x / n;
  const z = Z_95;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(centre - spread) / denom, (centre + spread) / denom];
}

/** Minimum sample per variant to detect an `mde` (e.g. 0.05 = 5 pp) at 95% / 80% power. */
export function minSamplePerVariant(baselineRate: number, mde: number): number {
  if (mde <= 0) return 0;
  const z_alpha = 1.96;
  const z_beta = 0.84;
  const p1 = Math.min(Math.max(baselineRate, 0.001), 0.999);
  const p2 = Math.min(Math.max(p1 + mde, 0.001), 0.999);
  const pBar = (p1 + p2) / 2;
  const n =
    Math.pow(
      z_alpha * Math.sqrt(2 * pBar * (1 - pBar)) +
        z_beta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)),
      2,
    ) / Math.pow(p2 - p1, 2);
  return Math.ceil(n);
}

function successFor(v: AbVariant, m: MetricKey): number {
  return v[`${m}_count` as const];
}

export function analyzeAb(
  variants: AbVariant[],
  metric: MetricKey = "replied",
  mde = 0.05,
): AbSummary {
  const baseline = variants[0];
  const totalSent = variants.reduce((s, v) => s + v.sent_count, 0);
  const overallRate =
    totalSent > 0
      ? variants.reduce((s, v) => s + successFor(v, metric), 0) / totalSent
      : 0;
  const minPerVariant = minSamplePerVariant(Math.max(overallRate, 0.02), mde);

  const analytics: VariantAnalytics[] = variants.map((v) => {
    const successes = successFor(v, metric);
    const n = v.sent_count;
    const rate = n > 0 ? successes / n : 0;
    const [lo, hi] = wilsonInterval(successes, n);
    const isBaseline = baseline && v.id === baseline.id;
    let pValue: number | null = null;
    let vsBaselinePct: number | null = null;
    if (!isBaseline && baseline) {
      pValue = twoProportionPValue(
        successFor(baseline, metric),
        baseline.sent_count,
        successes,
        n,
      );
      const baseRate =
        baseline.sent_count > 0
          ? successFor(baseline, metric) / baseline.sent_count
          : 0;
      vsBaselinePct =
        baseRate > 0 ? ((rate - baseRate) / baseRate) * 100 : null;
    }
    return {
      id: v.id,
      name: v.name,
      isWinner: v.is_winner,
      weight: Number(v.weight),
      sent: n,
      successes,
      rate,
      wilsonLow: lo,
      wilsonHigh: hi,
      vsBaselinePct,
      pValue,
      significant: pValue !== null && pValue < 0.05,
      sampleSufficient: n >= minPerVariant,
    };
  });

  const ranking = [...analytics].sort((a, b) => b.rate - a.rate);
  const best = ranking[0];
  const hasEnough = analytics.every((a) => a.sampleSufficient) && analytics.length >= 2;
  const winner =
    hasEnough &&
    best &&
    best !== analytics[0] &&
    best.pValue !== null &&
    best.pValue < 0.05
      ? best
      : hasEnough && best && best === analytics[0] && ranking[1]?.pValue !== null && ranking[1]!.pValue! < 0.05
      ? best
      : null;

  const confidence = best?.pValue !== null && best?.pValue !== undefined
    ? Math.max(0, Math.min(1, 1 - best.pValue))
    : 0;

  return {
    metric,
    variants: analytics,
    winner,
    confidence,
    totalSent,
    minSampleRecommended: minPerVariant,
    hasEnoughData: hasEnough,
    ranking,
  };
}

export const METRIC_LABEL: Record<MetricKey, string> = {
  delivered: "Delivery rate",
  read: "Read rate",
  replied: "Reply rate",
  clicked: "Click rate",
};
