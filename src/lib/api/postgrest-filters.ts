/**
 * Helpers for safely embedding user-supplied text into PostgREST filter
 * expressions (`.or(...)`, `.ilike(...)`).
 *
 * PostgREST's filter grammar treats `,` `.` `(` `)` `:` and `"` as structure.
 * Interpolating raw user text lets a caller inject extra filter clauses, so
 * every search term must be neutralized first.
 */

/** Strip PostgREST grammar characters and LIKE wildcards from a search term. */
export function sanitizeSearchTerm(input: string, maxLength = 100): string {
  return input
    .replace(/[,.()":*%\\]/g, " ")
    // Control characters have no place in a filter string either.
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** Build a safe `ilike` pattern (`%term%`) for use inside `.or()`. */
export function ilikePattern(input: string, maxLength = 100): string | null {
  const term = sanitizeSearchTerm(input, maxLength);
  return term ? `%${term}%` : null;
}

/** Build an `.or()` expression matching a sanitized term across columns. */
export function orIlike(columns: string[], input: string): string | null {
  const pattern = ilikePattern(input);
  if (!pattern) return null;
  return columns.map((c) => `${c}.ilike.${pattern}`).join(",");
}
