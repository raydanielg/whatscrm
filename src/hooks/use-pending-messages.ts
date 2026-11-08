import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { sendPortalMessage } from "@/lib/client-portal/portal.functions";

export type PendingAttachment = {
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  preview_url?: string;
  width?: number;
  height?: number;
};

export type PendingMessage = {
  tempId: string;
  body: string;
  attachments: PendingAttachment[];
  status: "sending" | "failed";
  error?: string;
  createdAt: number;
};

/**
 * Tracks optimistic outbound messages for a conversation with sending/failed
 * states and retry support. Attachments are already-uploaded storage refs.
 */
export function usePendingMessages(
  conversationId: string | null,
  invalidateKeys: readonly (readonly unknown[])[] = [],
) {
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const qc = useQueryClient();
  const sendFn = useServerFn(sendPortalMessage);

  const runSend = useCallback(
    async (tempId: string, body: string, attachments: PendingAttachment[]) => {
      if (!conversationId) return;
      try {
        await sendFn({
          data: {
            conversation_id: conversationId,
            body,
            attachments: attachments.map((a) => ({
              storage_path: a.storage_path,
              file_name: a.file_name,
              mime_type: a.mime_type,
              size_bytes: a.size_bytes,
              width: a.width,
              height: a.height,
            })),
          },
        });
        setPending((prev) => prev.filter((p) => p.tempId !== tempId));
        for (const key of invalidateKeys) {
          qc.invalidateQueries({ queryKey: key as unknown[] });
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to send";
        setPending((prev) =>
          prev.map((p) => (p.tempId === tempId ? { ...p, status: "failed", error: message } : p)),
        );
      }
    },
    [conversationId, sendFn, qc, invalidateKeys],
  );

  const send = useCallback(
    (body: string, attachments: PendingAttachment[] = []) => {
      if (!conversationId) return;
      if (!body.trim() && attachments.length === 0) return;
      const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setPending((prev) => [
        ...prev,
        { tempId, body, attachments, status: "sending", createdAt: Date.now() },
      ]);
      void runSend(tempId, body, attachments);
    },
    [conversationId, runSend],
  );

  const retry = useCallback(
    (tempId: string) => {
      const target = pending.find((p) => p.tempId === tempId);
      if (!target) return;
      setPending((prev) =>
        prev.map((p) => (p.tempId === tempId ? { ...p, status: "sending", error: undefined } : p)),
      );
      void runSend(tempId, target.body, target.attachments);
    },
    [pending, runSend],
  );

  const discard = useCallback((tempId: string) => {
    setPending((prev) => prev.filter((p) => p.tempId !== tempId));
  }, []);

  const isSending = pending.some((p) => p.status === "sending");

  return { pending, send, retry, discard, isSending };
}

