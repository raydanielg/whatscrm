export type AppTimeFormat = "12h" | "24h";

export function normalizeAppTimeFormat(value: unknown): AppTimeFormat | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (["12h", "12hr", "12hour", "12hours"].includes(normalized)) return "12h";
  if (["24h", "24hr", "24hour", "24hours"].includes(normalized)) return "24h";
  return null;
}

export function resolveAppTimeFormat(
  personalPreference: unknown,
  platformDefault: unknown,
): AppTimeFormat {
  return (
    normalizeAppTimeFormat(personalPreference) ??
    normalizeAppTimeFormat(platformDefault) ??
    "12h"
  );
}
