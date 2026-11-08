/**
 * Runs the Live Chat → Inbox backfill once per workspace, the first time an
 * agent opens the Inbox after deployment. Guarded by localStorage so it is a
 * single request per browser/workspace; the server function itself is
 * idempotent, so a repeat run is harmless.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { backfillLivechatInbox } from "@/lib/livechat/backfill.functions";
import { useCurrentWorkspace } from "@/hooks/use-workspace";

const VERSION = "v1";
const storageKey = (workspaceId: string) => `livechat-inbox-backfill:${VERSION}:${workspaceId}`;

export function useLivechatBackfill() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id ?? null;
  const run = useServerFn(backfillLivechatInbox);
  const startedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!workspaceId || typeof window === "undefined") return;
    if (startedRef.current === workspaceId) return;
    const key = storageKey(workspaceId);
    if (window.localStorage.getItem(key)) return;
    startedRef.current = workspaceId;

    let cancelled = false;
    void (async () => {
      try {
        const res = await run({ data: { workspaceId } });
        if (cancelled) return;
        window.localStorage.setItem(key, new Date().toISOString());
        if (res?.linked) {
          qc.invalidateQueries({ queryKey: ["conversations"] });
          qc.invalidateQueries({ queryKey: ["conversation-counts"] });
          qc.invalidateQueries({ queryKey: ["conversation-channel-unread"] });
        }
      } catch (err) {
        // Never block the Inbox on a backfill failure; allow a later retry.
        startedRef.current = null;
        console.warn("[livechat-backfill] failed", (err as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, run, qc]);
}
