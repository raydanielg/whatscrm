/**
 * Branding asset uploads (logos, favicon, PWA icons).
 *
 * Files land in the private `branding` bucket and are served back through
 * `/api/public/branding/<path>` so signed-out visitors and the OS installer
 * can fetch them. Filenames are UUID-prefixed, which keeps the delivery URL
 * immutable and cache-safe.
 */
import { supabase } from "@/integrations/supabase/client";

export const BRANDING_MAX_BYTES = 5 * 1024 * 1024;

export const BRANDING_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/gif",
] as const;

export const BRANDING_ACCEPT = ".png,.jpg,.jpeg,.webp,.svg,.ico,.gif";

export type BrandingScope =
  | { kind: "platform" }
  | { kind: "org"; orgId: string }
  | { kind: "workspace"; workspaceId: string };

function safeName(name: string): string {
  const cleaned = name.trim().replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").slice(-80);
  return cleaned.replace(/^[-.]+/, "") || "asset";
}

export function validateBrandingFile(file: File): string | null {
  const type = file.type || "";
  const isIco = /\.ico$/i.test(file.name);
  if (!isIco && !(BRANDING_MIME_TYPES as readonly string[]).includes(type)) {
    return "Use a PNG, JPG, WEBP, SVG, GIF, or ICO image.";
  }
  if (file.size > BRANDING_MAX_BYTES) return "Image must be 5 MB or smaller.";
  return null;
}

/** Uploads one branding image and returns its public delivery path. */
export async function uploadBrandingAsset(
  file: File,
  scope: BrandingScope,
  slot: string,
): Promise<string> {
  const invalid = validateBrandingFile(file);
  if (invalid) throw new Error(invalid);

  const prefix = scope.kind === "platform"
    ? "platform"
    : scope.kind === "workspace"
      ? `workspace/${scope.workspaceId}`
      : `org/${scope.orgId}`;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${prefix}/${slot}/${id}-${safeName(file.name)}`;

  const { error } = await supabase.storage.from("branding").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) {
    throw new Error(
      /row-level security|not authorized|permission/i.test(error.message)
        ? "You do not have permission to upload branding images here."
        : error.message,
    );
  }

  return `/api/public/branding/${path}`;
}

/** True when a URL points at an asset this app stores in the branding bucket. */
export function isBrandingAssetUrl(url: string | null | undefined): boolean {
  return !!url && url.startsWith("/api/public/branding/");
}

/** Best-effort cleanup when a branding image is replaced or cleared. */
export async function removeBrandingAsset(url: string | null | undefined): Promise<void> {
  if (!isBrandingAssetUrl(url)) return;
  const path = url!.slice("/api/public/branding/".length);
  await supabase.storage.from("branding").remove([path]);
}
