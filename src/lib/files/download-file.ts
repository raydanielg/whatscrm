/**
 * Force a real file download for a remote URL.
 *
 * The HTML `download` attribute is ignored for cross-origin links (storage,
 * CDN, provider-hosted media), so the browser just navigates/previews the
 * file instead. Fetching the bytes and saving a same-origin blob URL keeps
 * the intended filename and always downloads.
 */
export async function downloadRemoteFile(url: string, fileName?: string | null): Promise<void> {
  if (!isSafeDownloadUrl(url)) return;
  const name = (fileName ?? "").trim() || guessNameFromUrl(url);
  try {
    const res = await fetch(url, { credentials: "same-origin", mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerAnchor(objectUrl, name);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    // CORS-blocked or offline: fall back to opening the file directly.
    triggerAnchor(url, name, true);
  }
}

/** Accept navigable file locations, never script or inline-data schemes from message metadata. */
export function isSafeDownloadUrl(url: string | null | undefined): url is string {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(
      url,
      typeof window === "undefined" ? "https://localhost/" : window.location.href,
    );
    return (
      parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "blob:"
    );
  } catch {
    return false;
  }
}

function triggerAnchor(href: string, name: string, newTab = false) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.rel = "noopener noreferrer";
  if (newTab) a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function guessNameFromUrl(url: string): string {
  try {
    const path = new URL(url, window.location.origin).pathname;
    const last = path.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : "download";
  } catch {
    return "download";
  }
}
