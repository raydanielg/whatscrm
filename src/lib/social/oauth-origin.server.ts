/** Use the configured external origin behind proxies; reject arbitrary redirects. */
export function oauthOrigin(input: string, requestOrigin?: string): string {
  const parsed = new URL(input);
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/" ||
    !["http:", "https:"].includes(parsed.protocol)
  )
    throw new Error("Invalid OAuth origin");
  const configured = process.env["APP_ORIGIN"]?.trim();
  const expected = new URL(configured || requestOrigin || input).origin;
  if (requestOrigin && !configured && parsed.origin !== expected)
    throw new Error("OAuth origin does not match this application");
  // APP_ORIGIN is authoritative for reverse-proxied deployments.
  return expected;
}

export function safeOAuthReturnTo(path: string | undefined): string {
  return path && path.startsWith("/") && !path.startsWith("//") && !path.includes("\\")
    ? path
    : "/social";
}

export function savedOAuthRedirect(saved: string | undefined, fallback: string): string {
  if (!saved) return fallback; // Existing, short-lived login links remain valid.
  const url = new URL(saved);
  const expected = new URL(fallback);
  if (
    url.pathname !== expected.pathname ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    !["http:", "https:"].includes(url.protocol)
  )
    throw new Error("Invalid OAuth callback");
  // The URI was HMAC signed at authorization. Retain it verbatim at exchange,
  // even when the proxy's callback Request URL has a different origin.
  return saved;
}
