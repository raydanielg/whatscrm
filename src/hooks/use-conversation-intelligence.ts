import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getConversationInsight,
  analyzeConversation,
  generateWorkspaceSummary,
  searchConversationInsights,
  type ConversationInsight,
  type WorkspaceAiSummary,
} from "@/lib/ai/intelligence.functions";
import { supabase } from "@/integrations/supabase/client";

export function useConversationIntelligence(conversationId: string | null | undefined) {
  const [insight, setInsight] = useState<ConversationInsight | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getFn = useServerFn(getConversationInsight);
  const analyzeFn = useServerFn(analyzeConversation);

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getFn({ data: { conversationId } });
      setInsight(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [conversationId, getFn]);

  const analyze = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!conversationId) return;
      setAnalyzing(true);
      setError(null);
      try {
        const res = await analyzeFn({ data: { conversationId, force: true } });
        setInsight(res);
        if (!opts?.silent) toast.success("Conversation analyzed");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        if (!opts?.silent) toast.error(msg);
      } finally {
        setAnalyzing(false);
      }
    },
    [conversationId, analyzeFn],
  );

  // Initial load + realtime subscription so the panel updates when a
  // background job (or another agent) refreshes the analysis.
  useEffect(() => {
    if (!conversationId) return;
    void load();
    const channel = supabase
      .channel(`conv-intel-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_intelligence",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, load]);

  // Auto-analyze when we have no insight yet or it's stale — but only once
  // per conversation switch, and never while another analysis is in flight.
  useEffect(() => {
    if (!conversationId || loading || analyzing) return;
    if (!insight) return; // wait for first load result
    const stale =
      insight.needsReanalysis ||
      !insight.analyzedAt ||
      (insight.lastMessageAt &&
        insight.analyzedAt &&
        new Date(insight.lastMessageAt).getTime() >
          new Date(insight.analyzedAt).getTime());
    if (stale && !insight.summary) {
      void analyze({ silent: true });
    }
  }, [conversationId, insight, loading, analyzing, analyze]);

  return { insight, loading, analyzing, error, analyze, refresh: load };
}

export function useWorkspaceAiSummary() {
  const [summary, setSummary] = useState<WorkspaceAiSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const generateFn = useServerFn(generateWorkspaceSummary);

  const generate = useCallback(
    async (workspaceId: string, period: "daily" | "weekly") => {
      setLoading(true);
      try {
        const res = await generateFn({ data: { workspaceId, period } });
        setSummary(res);
        toast.success(`${period === "daily" ? "Daily" : "Weekly"} summary ready`);
        return res;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [generateFn],
  );

  return { summary, loading, generate };
}

export function useSearchInsights() {
  const [results, setResults] = useState<ConversationInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const searchFn = useServerFn(searchConversationInsights);

  const search = useCallback(
    async (params: {
      workspaceId: string;
      query?: string;
      category?: string;
      urgency?: "low" | "medium" | "high" | "critical";
      sentiment?: "positive" | "neutral" | "negative" | "mixed";
      isSpam?: boolean;
    }) => {
      setLoading(true);
      try {
        const res = await searchFn({ data: { ...params, limit: 50 } });
        setResults(res);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [searchFn],
  );

  return { results, loading, search };
}
