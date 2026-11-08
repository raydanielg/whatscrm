import type { DateRange, Granularity } from "./types";

export function resolveDateRange(range: DateRange): { from: Date; to: Date; previousFrom: Date; previousTo: Date } {
  const now = new Date();
  const to = new Date(now);
  let from = new Date(now);

  switch (range.preset) {
    case "today": from = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
    case "yesterday":
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      to.setTime(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - 1);
      break;
    case "last_7d": from.setDate(from.getDate() - 7); break;
    case "last_14d": from.setDate(from.getDate() - 14); break;
    case "last_30d": from.setDate(from.getDate() - 30); break;
    case "last_90d": from.setDate(from.getDate() - 90); break;
    case "mtd": from = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case "qtd": {
      const qStart = Math.floor(now.getMonth() / 3) * 3;
      from = new Date(now.getFullYear(), qStart, 1);
      break;
    }
    case "ytd": from = new Date(now.getFullYear(), 0, 1); break;
    case "custom":
      from = range.from ? new Date(range.from) : from;
      to.setTime(range.to ? new Date(range.to).getTime() : to.getTime());
      break;
  }

  const span = to.getTime() - from.getTime();
  const previousTo = new Date(from.getTime() - 1);
  const previousFrom = new Date(previousTo.getTime() - span);
  return { from, to, previousFrom, previousTo };
}

export function bucketKey(d: Date, bucket: Granularity["bucket"]): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  switch (bucket) {
    case "hour": return `${y}-${m}-${day}T${h}:00:00Z`;
    case "day": return `${y}-${m}-${day}`;
    case "week": {
      const first = new Date(Date.UTC(y, 0, 1));
      const days = Math.floor((d.getTime() - first.getTime()) / 86400000);
      const week = Math.ceil((days + first.getUTCDay() + 1) / 7);
      return `${y}-W${String(week).padStart(2, "0")}`;
    }
    case "month": return `${y}-${m}`;
    case "quarter": return `${y}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
    case "year": return `${y}`;
  }
}

export function defaultGranularity(range: DateRange): Granularity["bucket"] {
  const { from, to } = resolveDateRange(range);
  const days = (to.getTime() - from.getTime()) / 86400000;
  if (days <= 2) return "hour";
  if (days <= 60) return "day";
  if (days <= 365) return "week";
  return "month";
}
