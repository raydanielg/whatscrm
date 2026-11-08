/**
 * Realtime channel for the visitor-facing live chat widget.
 *
 * The database broadcasts a tiny `widget_update` payload (kind + session id,
 * no conversation content) on the private topic `widget:<sessionId>` whenever
 * a message is written or the handoff/assignment state changes. The widget
 * listens and re-fetches through its signed public endpoints, so realtime
 * never becomes a data-leak surface — it is only a "something changed" ping.
 *
 * Falls back gracefully: if the channel cannot connect, `connected` stays
 * false and the widget keeps its slow polling safety net.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type WidgetUpdateKind = "message" | "status" | "typing";

export function useWidgetRealtime(
  sessionId: string | null | undefined,
  visitorToken: string | null | undefined,
  onUpdate: (kind: WidgetUpdateKind) => void,
): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onUpdate);
  handlerRef.current = onUpdate;

  // The visitor id is the secret half of the signed visitor token; including
  // it in the topic binds channel authorization to this visitor rather than
  // to knowledge of the (guessable/shareable) session UUID alone.
  const visitorId = visitorToken ? visitorToken.split(".")[0] : "";

  useEffect(() => {
    if (!sessionId || !visitorId) {
      setConnected(false);
      return;
    }

    const channel = supabase
      .channel(`widget:${sessionId}:${visitorId}`, { config: { private: true } })
      .on("broadcast", { event: "widget_update" }, (payload) => {
        const kind = (payload?.payload as { kind?: WidgetUpdateKind } | undefined)?.kind;
        handlerRef.current(
          kind === "status" || kind === "typing" ? kind : "message",
        );
      })

      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => {
      setConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [sessionId, visitorId]);

  return { connected };
}
