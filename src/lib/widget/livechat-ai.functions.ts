/**
 * Authenticated Live Chat AI functions.
 *
 * Exposed to agents/admins from the inbox to view AI insights on a session
 * (summary, intent, sentiment, lead score, KB hits, suggested products) and
 * to translate messages between the visitor's language and the agent's.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface LiveChatSessionInsight {
  sessionId: string;
  language: string | null;
  sentiment: string | null;
  sentimentScore: number | null;
  intent: string | null;
  summary: string | null;
  topics: string[];
  leadScore: number | null;
  leadStage: string | null;
  recommendations: {
    products: string[];
    appointment: { reason: string | null } | null;
  };
  escalationReason: string | null;
  updatedAt: string | null;
}

export const getLiveChatSessionInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({ sessionId: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data, context }): Promise<LiveChatSessionInsight | null> => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("chatbot_sessions")
      .select(
        "id, ai_language, ai_sentiment, ai_sentiment_score, ai_intent, ai_summary, ai_topics, ai_lead_score, ai_lead_stage, ai_recommendations, ai_escalation_reason, ai_updated_at",
      )
      .eq("id", data.sessionId)
      .maybeSingle();
    if (error || !row) return null;
    const r = row as Record<string, unknown>;
    const rec = (r.ai_recommendations ?? {}) as {
      products?: unknown;
      appointment?: { reason?: string | null } | null;
    };
    return {
      sessionId: String(r.id),
      language: (r.ai_language as string | null) ?? null,
      sentiment: (r.ai_sentiment as string | null) ?? null,
      sentimentScore: (r.ai_sentiment_score as number | null) ?? null,
      intent: (r.ai_intent as string | null) ?? null,
      summary: (r.ai_summary as string | null) ?? null,
      topics: Array.isArray(r.ai_topics)
        ? (r.ai_topics as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
      leadScore: (r.ai_lead_score as number | null) ?? null,
      leadStage: (r.ai_lead_stage as string | null) ?? null,
      recommendations: {
        products: Array.isArray(rec.products)
          ? (rec.products as unknown[]).filter(
              (x): x is string => typeof x === "string",
            )
          : [],
        appointment: rec.appointment ? { reason: rec.appointment.reason ?? null } : null,
      },
      escalationReason: (r.ai_escalation_reason as string | null) ?? null,
      updatedAt: (r.ai_updated_at as string | null) ?? null,
    };
  });

export const summarizeLiveChatSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({ sessionId: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: sess } = await supabase
      .from("chatbot_sessions")
      .select("id, workspace_id, chatbot_id")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!sess) throw new Error("Session not found");
    const s = sess as { id: string; workspace_id: string; chatbot_id: string };

    const { data: msgs } = await supabase
      .from("chatbot_messages")
      .select("role, content, created_at")
      .eq("session_id", s.id)
      .order("created_at", { ascending: true })
      .limit(200);

    const transcript = ((msgs ?? []) as { role: string; content: string }[])
      .filter((m) => m.role !== "system")
      .map(
        (m) =>
          `${m.role === "user" ? "Visitor" : "Assistant"}: ${m.content.slice(0, 400)}`,
      )
      .join("\n");

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: bot } = await supabaseAdmin
      .from("chatbots")
      .select("provider_id, model")
      .eq("id", s.chatbot_id)
      .maybeSingle();
    const b = (bot ?? {}) as { provider_id?: string | null; model?: string | null };

    const { runChat } = await import("@/lib/ai/complete.functions");
    const res = await runChat({
      workspaceId: s.workspace_id,
      userId: context.userId,
      feature: "livechat-summary",
      primaryProviderId: b.provider_id ?? null,
      request: {
        messages: [
          {
            role: "system",
            content:
              "Summarize the following live-chat transcript for an agent taking over. Return a compact markdown with sections: **Summary**, **Key points** (3–5 bullets), **Next best action**. Be direct and specific.",
          },
          { role: "user", content: transcript },
        ],
        model: b.model || "google/gemini-2.5-flash",
        temperature: 0.2,
        max_tokens: 500,
      },
    });

    const summary = (res.content || "").trim();
    await supabaseAdmin
      .from("chatbot_sessions")
      .update({
        ai_summary: summary.slice(0, 4000),
        ai_updated_at: new Date().toISOString(),
      } as never)
      .eq("id", s.id);
    return { summary };
  });

export const translateLiveChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        text: z.string().min(1).max(4000),
        targetLanguage: z.string().min(2).max(10),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    const { translate } = await import("./livechat-ai.server");
    const out = await translate({
      workspaceId: data.workspaceId,
      providerId: null,
      text: data.text,
      targetLanguage: data.targetLanguage,
    });
    return { translation: out };
  });
