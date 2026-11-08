import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createPortalAttachmentUploadUrl } from "@/lib/client-portal/portal.functions";
import type { PendingAttachment } from "@/hooks/use-pending-messages";

export type StagedAttachment = {
  tempId: string;
  file: File;
  preview_url?: string;
  progress: number; // 0-100
  status: "uploading" | "ready" | "error";
  error?: string;
  storage_path?: string;
  width?: number;
  height?: number;
  xhr?: XMLHttpRequest;
};

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB per file
export const MAX_ATTACHMENTS = 10;

async function probeImageSize(file: File): Promise<{ width?: number; height?: number; preview: string }> {
  const preview = URL.createObjectURL(file);
  if (!file.type.startsWith("image/")) return { preview };
  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, preview });
    img.onerror = () => resolve({ preview });
    img.src = preview;
  });
}

/**
 * Manages staged file attachments for a portal conversation composer.
 * Uploads directly to Supabase Storage via a signed URL with XHR-based
 * progress. `ready()` returns metadata to hand to sendPortalMessage.
 */
export function usePortalAttachments(conversationId: string | null) {
  const [items, setItems] = useState<StagedAttachment[]>([]);
  const signFn = useServerFn(createPortalAttachmentUploadUrl);
  const conversationRef = useRef(conversationId);
  useEffect(() => { conversationRef.current = conversationId; }, [conversationId]);

  const update = useCallback((tempId: string, patch: Partial<StagedAttachment>) => {
    setItems((prev) => prev.map((i) => (i.tempId === tempId ? { ...i, ...patch } : i)));
  }, []);

  const uploadOne = useCallback(async (item: StagedAttachment) => {
    const convId = conversationRef.current;
    if (!convId) {
      update(item.tempId, { status: "error", error: "Chat not ready" });
      return;
    }
    try {
      const signed = await signFn({
        data: {
          conversation_id: convId,
          file_name: item.file.name,
          mime_type: item.file.type || "application/octet-stream",
          size_bytes: item.file.size,
        },
      });
      const xhr = new XMLHttpRequest();
      update(item.tempId, { xhr });
      await new Promise<void>((resolve, reject) => {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            update(item.tempId, { progress: Math.round((e.loaded / e.total) * 100) });
          }
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300)
          ? resolve()
          : reject(new Error(`Upload failed (${xhr.status})`));
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.onabort = () => reject(new Error("Upload cancelled"));
        xhr.open("PUT", signed.signedUrl);
        xhr.setRequestHeader("Content-Type", item.file.type || "application/octet-stream");
        xhr.setRequestHeader("x-upsert", "false");
        xhr.send(item.file);
      });
      update(item.tempId, { status: "ready", progress: 100, storage_path: signed.path, xhr: undefined });
    } catch (e) {
      update(item.tempId, {
        status: "error",
        error: e instanceof Error ? e.message : "Upload failed",
        xhr: undefined,
      });
    }
  }, [signFn, update]);

  const add = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    const staged: StagedAttachment[] = [];
    for (const file of list) {
      if (items.length + staged.length >= MAX_ATTACHMENTS) break;
      const tempId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      if (file.size > MAX_ATTACHMENT_BYTES) {
        staged.push({
          tempId, file, progress: 0, status: "error",
          error: `File too large (max ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB)`,
        });
        continue;
      }
      const meta = await probeImageSize(file);
      staged.push({
        tempId, file, progress: 0, status: "uploading",
        preview_url: meta.preview, width: meta.width, height: meta.height,
      });
    }
    if (!staged.length) return;
    setItems((prev) => [...prev, ...staged]);
    for (const s of staged) {
      if (s.status === "uploading") void uploadOne(s);
    }
  }, [items.length, uploadOne]);

  const remove = useCallback((tempId: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.tempId === tempId);
      if (target?.xhr) { try { target.xhr.abort(); } catch { /* ignore */ } }
      if (target?.preview_url) { try { URL.revokeObjectURL(target.preview_url); } catch { /* ignore */ } }
      return prev.filter((i) => i.tempId !== tempId);
    });
  }, []);

  const retry = useCallback((tempId: string) => {
    const target = items.find((i) => i.tempId === tempId);
    if (!target) return;
    update(tempId, { status: "uploading", progress: 0, error: undefined });
    void uploadOne({ ...target, status: "uploading", progress: 0, error: undefined });
  }, [items, update, uploadOne]);

  /** Snapshot ready attachments as PendingAttachment metadata, then clear all. */
  const consumeReady = useCallback((): PendingAttachment[] => {
    const ready = items.filter((i) => i.status === "ready" && i.storage_path);
    if (!ready.length && items.every((i) => i.status !== "ready")) return [];
    const out: PendingAttachment[] = ready.map((i) => ({
      storage_path: i.storage_path!,
      file_name: i.file.name,
      mime_type: i.file.type || "application/octet-stream",
      size_bytes: i.file.size,
      preview_url: i.preview_url,
      width: i.width,
      height: i.height,
    }));
    // Clear only the ready ones — keep uploading/error for user to resolve.
    setItems((prev) => prev.filter((i) => i.status !== "ready"));
    return out;
  }, [items]);

  const clear = useCallback(() => {
    setItems((prev) => {
      for (const i of prev) {
        if (i.xhr) { try { i.xhr.abort(); } catch { /* ignore */ } }
        if (i.preview_url) { try { URL.revokeObjectURL(i.preview_url); } catch { /* ignore */ } }
      }
      return [];
    });
  }, []);

  useEffect(() => () => {
    // Revoke object URLs on unmount.
    for (const i of items) {
      if (i.preview_url) { try { URL.revokeObjectURL(i.preview_url); } catch { /* ignore */ } }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anyUploading = items.some((i) => i.status === "uploading");
  const anyReady = items.some((i) => i.status === "ready");
  const canSend = !anyUploading && items.every((i) => i.status !== "error");

  return { items, add, remove, retry, clear, consumeReady, anyUploading, anyReady, canSend };
}
