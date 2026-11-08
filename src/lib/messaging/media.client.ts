/**
 * Client media utilities.
 *
 *   - `uploadMedia` — end-to-end upload: compress images, request signed
 *     upload URL, PUT bytes to Supabase Storage, finalize the DB row.
 *   - `useSignedMediaUrl` — React hook that fetches a short-lived signed URL
 *     for viewing an attachment and refreshes before it expires. Results are
 *     cached in-memory per session so the same attachment doesn't re-sign
 *     on every render.
 */

import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import imageCompression from "browser-image-compression";
import {
  createMediaUploadUrl,
  finalizeMediaUpload,
  getMediaSignedUrl,
} from "@/lib/messaging/media.functions";
import { getActiveOrgIdOrThrow } from "@/hooks/use-organization";

// -------------------------------------------------------------- upload

export interface UploadOptions {
  workspaceId: string;
  messageId?: string;
  file: File;
  expiresAt?: string;
  visibility?: "workspace" | "internal" | "public";
  /** Skip client-side image compression. */
  skipCompression?: boolean;
  onProgress?: (loaded: number, total: number) => void;
}

export interface UploadedMedia {
  id: string;
  path: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export async function uploadMedia(opts: UploadOptions): Promise<UploadedMedia> {
  let file = opts.file;

  // Image optimization: WebP conversion + max-dim + quality reduction.
  if (!opts.skipCompression && file.type.startsWith("image/") && file.type !== "image/gif") {
    try {
      file = await imageCompression(file, {
        maxSizeMB: 1.5,
        maxWidthOrHeight: 2048,
        useWebWorker: true,
        fileType: file.type === "image/png" ? "image/png" : "image/webp",
        initialQuality: 0.82,
      });
    } catch {
      // If compression fails, fall through with the original file.
    }
  }

  const dims = file.type.startsWith("image/") ? await readImageDimensions(file) : null;
  const buf = await file.arrayBuffer();
  const sha256 = await sha256Hex(buf);

  const signed = await createMediaUploadUrl({
    data: {
      workspaceId: opts.workspaceId,
      activeOrgId: getActiveOrgIdOrThrow(),
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    },
  });

  // Direct PUT to Supabase Storage using the signed URL (bypasses server fn body limits).
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signed.signedUrl, true);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded, e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(buf);
  });

  const row = await finalizeMediaUpload({
    data: {
      workspaceId: opts.workspaceId,
      messageId: opts.messageId,
      storagePath: signed.path,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      sha256,
      width: dims?.width,
      height: dims?.height,
      expiresAt: opts.expiresAt,
      visibility: opts.visibility ?? "workspace",
    },
  });

  return {
    id: row.id,
    path: signed.path,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    width: dims?.width,
    height: dims?.height,
  };
}

// -------------------------------------------------------------- signed URL cache

interface CacheEntry {
  url: string;
  expiresAt: number;
  mimeType?: string | null;
  filename?: string | null;
}
const urlCache = new Map<string, CacheEntry>();
const SAFETY_WINDOW_MS = 30_000; // refresh 30s before expiry

function cacheKey(attachmentId: string, orgId: string, opts?: { download?: boolean; width?: number; height?: number }): string {
  // Include the active org so a switch cannot serve a URL minted under org-A
  // to a viewer now operating inside org-B.
  return `${orgId}:${attachmentId}:${opts?.download ? "d" : "v"}:${opts?.width ?? ""}:${opts?.height ?? ""}`;
}

/**
 * Fetches (and caches) a signed URL for an attachment. Automatically refreshes
 * before expiry. Pass `download: true` to force a `Content-Disposition`.
 */
export function useSignedMediaUrl(
  attachmentId: string | null | undefined,
  opts?: { download?: boolean; width?: number; height?: number; enabled?: boolean },
) {
  const [state, setState] = useState<{ url: string | null; loading: boolean; error: string | null; mimeType?: string | null; filename?: string | null }>({
    url: null, loading: false, error: null,
  });
  const getUrl = useServerFn(getMediaSignedUrl);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!attachmentId || opts?.enabled === false) return;
    const orgId = getActiveOrgIdOrThrow();
    const key = cacheKey(attachmentId, orgId, opts);
    let cancelled = false;

    async function load() {
      if (!attachmentId) return;
      const cached = urlCache.get(key);
      if (cached && cached.expiresAt - Date.now() > SAFETY_WINDOW_MS) {
        setState({ url: cached.url, loading: false, error: null, mimeType: cached.mimeType, filename: cached.filename });
        scheduleRefresh(cached.expiresAt - Date.now() - SAFETY_WINDOW_MS);
        return;
      }
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await getUrl({
          data: {
            attachmentId,
            activeOrgId: getActiveOrgIdOrThrow(),
            download: !!opts?.download,
            transform: opts?.width || opts?.height ? { width: opts?.width, height: opts?.height } : undefined,
          },
        });
        if (cancelled) return;
        const expiresAt = Date.now() + res.expiresIn * 1000;
        urlCache.set(key, { url: res.signedUrl, expiresAt, mimeType: res.mimeType, filename: res.filename });
        setState({ url: res.signedUrl, loading: false, error: null, mimeType: res.mimeType, filename: res.filename });
        scheduleRefresh(res.expiresIn * 1000 - SAFETY_WINDOW_MS);
      } catch (err) {
        if (cancelled) return;
        setState({ url: null, loading: false, error: err instanceof Error ? err.message : String(err) });
      }
    }

    function scheduleRefresh(ms: number) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        urlCache.delete(key);
        load();
      }, Math.max(5_000, ms));
    }

    load();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachmentId, opts?.download, opts?.width, opts?.height, opts?.enabled]);

  return state;
}

/** Human-readable byte size. */
export function formatBytes(n: number | null | undefined): string {
  if (!n && n !== 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
