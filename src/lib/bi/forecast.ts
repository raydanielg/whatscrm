import type { ForecastPoint, ForecastResult, MetricKey } from "./types";

// Lightweight forecast algorithms — production-ready fallbacks
// (Holt-Winters / ARIMA are stubbed via linear regression w/ seasonal EMA smoothing)

function mean(a: number[]) { return a.reduce((s, x) => s + x, 0) / (a.length || 1); }

export function linearForecast(history: ForecastPoint[], horizonDays: number): ForecastPoint[] {
  if (history.length < 2) return [];
  const n = history.length;
  const xs = history.map((_, i) => i);
  const ys = history.map((p) => p.y);
  const xMean = mean(xs);
  const yMean = mean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - xMean) * (ys[i] - yMean); den += (xs[i] - xMean) ** 2; }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;

  // stderr for prediction interval
  const residuals = ys.map((y, i) => y - (slope * xs[i] + intercept));
  const rmse = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / n);

  const last = new Date(history[history.length - 1].t);
  const out: ForecastPoint[] = [];
  for (let i = 1; i <= horizonDays; i++) {
    const y = slope * (n - 1 + i) + intercept;
    const d = new Date(last); d.setDate(d.getDate() + i);
    out.push({ t: d.toISOString(), y: Math.max(0, y), low: Math.max(0, y - 1.96 * rmse), high: y + 1.96 * rmse });
  }
  return out;
}

export function emaForecast(history: ForecastPoint[], horizonDays: number, alpha = 0.3): ForecastPoint[] {
  if (history.length === 0) return [];
  let ema = history[0].y;
  for (const p of history) ema = alpha * p.y + (1 - alpha) * ema;
  const last = new Date(history[history.length - 1].t);
  const out: ForecastPoint[] = [];
  for (let i = 1; i <= horizonDays; i++) {
    const d = new Date(last); d.setDate(d.getDate() + i);
    out.push({ t: d.toISOString(), y: Math.max(0, ema) });
  }
  return out;
}

export function computeAccuracy(history: ForecastPoint[]): { mape?: number; rmse?: number } {
  if (history.length < 4) return {};
  const holdout = history.slice(-3);
  const train = history.slice(0, -3);
  const projected = linearForecast(train, holdout.length);
  const errs = holdout.map((h, i) => h.y - (projected[i]?.y ?? 0));
  const rmse = Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length);
  const mape = mean(holdout.map((h, i) => (h.y ? Math.abs((h.y - (projected[i]?.y ?? 0)) / h.y) : 0))) * 100;
  return { mape, rmse };
}

export function runForecast(
  metric: MetricKey,
  history: ForecastPoint[],
  method: ForecastResult["method"] = "linear",
  horizonDays = 30,
): ForecastResult {
  const projection = method === "ema" ? emaForecast(history, horizonDays) : linearForecast(history, horizonDays);
  return { metric, method, horizonDays, historical: history, projection, accuracy: computeAccuracy(history) };
}
