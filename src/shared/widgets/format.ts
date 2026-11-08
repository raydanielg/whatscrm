/** Number & currency helpers used across widgets. */
/** `currency` is required: callers resolve it from the tenant, never from a default here. */
export function formatCurrency(
  value: number,
  currency: string,
  locale = "en-US",
  opts: Intl.NumberFormatOptions = {},
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    ...opts,
  }).format(value);
}

export function formatCompact(value: number, locale = "en-US") {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

export function formatPercent(value: number, digits = 1) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatRelativeTime(date: Date | string | number, now: Date = new Date()) {
  const d = typeof date === "object" ? date : new Date(date);
  const diff = (d.getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const table: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [604800, "day"],
    [2592000, "week"],
    [31536000, "month"],
  ];
  for (const [limit, unit] of table) {
    if (abs < limit) {
      const div = limit === 60 ? 1 : table[table.findIndex(([l]) => l === limit) - 1][0];
      return rtf.format(Math.round(diff / div), unit);
    }
  }
  return rtf.format(Math.round(diff / 31536000), "year");
}
