/**
 * AI for Omnichannel — one AI brain that reasons across a customer's ENTIRE
 * cross-channel history (WhatsApp, Instagram, Messenger, Telegram, Email, SMS,
 * Live Chat, Calls, Notes, Deals, Invoices, Payments, Campaigns, Workflows).
 *
 * Every feature below is powered by the same unified timeline so the AI sees
 * exactly what a human agent would see when they open the Timeline tab.
 *
 * Features:
 *  - Conversation Summary
 *  - Sentiment
 *  - Intent
 *  - Priority
 *  - Language Detection
 *  - Translation
 *  - Suggested Replies (3 variants)
 *  - Suggested Next Action
 *  - Customer Journey Summary
 *  - Lead Qualification (BANT-style)
 *  - Customer Health (0-100)
 *  - Risk Detection (churn / escalation / dispute)
 *  - Opportunity Detection (upsell / cross-sell / expansion)
 *  - Generate CRM Notes
 *  - AI Search (semantic search over the timeline)
 *  - AI Timeline Summary (period rollup)
 */

import { BRAND_NAME } from "@/lib/branding/brand";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { runChat, resolveDefaultModel } from "./complete.functions";
import type { AIMessage } from "./types";

// ------------------------------------------------------------------
// Timeline gathering (server-side, RLS-scoped via context.supabase)
// ------------------------------------------------------------------

interface TinyEvent {
  at: string;
  kind: string;
  channel: string;
  direction?: "in" | "out" | null;
  title: string;
  text: string;
}

async function gatherTimeline(
  sb: import("@supabase/supabase-js").SupabaseClient,
  workspaceId: string,
  contactId: string,
  limit = 200,
): Promise<TinyEvent[]> {
  const events: TinyEvent[] = [];

  // Conversations owned by contact
  const { data: convos } = await sb
    .from("conversations")
    .select("id, channel")
    .eq("workspace_id", workspaceId)
    .eq("contact_id", contactId);
  const convoIds = (convos ?? []).map((c) => c.id as string);
  const convoChannel = new Map<string, string>(
    (convos ?? []).map((c) => [c.id as string, (c.channel as string) ?? "system"]),
  );

  if (convoIds.length) {
    const { data: msgs } = await sb
      .from("messages")
      .select("id, conversation_id, body, direction, created_at, message_type")
      .in("conversation_id", convoIds)
      .order("created_at", { ascending: false })
      .limit(limit);
    for (const m of msgs ?? []) {
      events.push({
        at: m.created_at as string,
        kind: "message",
        channel: convoChannel.get(m.conversation_id as string) ?? "system",
        direction: (m.direction as string) === "outbound" ? "out" : "in",
        title: (m.direction as string) === "outbound" ? "Agent" : "Customer",
        text: ((m.body as string) ?? "").slice(0, 800),
      });
    }
  }

  const { data: comms } = await sb
    .from("communications")
    .select("channel, direction, subject, summary, body, created_at")
    .eq("workspace_id", workspaceId)
    .eq("entity_type", "contact")
    .eq("entity_id", contactId)
    .order("created_at", { ascending: false })
    .limit(80);
  for (const c of comms ?? []) {
    events.push({
      at: c.created_at as string,
      kind: "communication",
      channel: (c.channel as string) ?? "system",
      direction: (c.direction as string) === "outbound" ? "out" : "in",
      title: (c.subject as string) ?? (c.channel as string) ?? "Communication",
      text: ((c.summary as string) ?? (c.body as string) ?? "").slice(0, 600),
    });
  }

  const { data: deals } = await sb
    .from("deals")
    .select("title, value, currency, stage_id, status, created_at")
    .eq("workspace_id", workspaceId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(20);
  for (const d of deals ?? []) {
    events.push({
      at: d.created_at as string,
      kind: "deal",
      channel: "crm",
      title: `Deal: ${(d.title as string) ?? "-"}`,
      text: `Value ${(d.value as number) ?? 0} ${(d.currency as string) ?? ""} · status ${(d.status as string) ?? ""}`,
    });
  }

  const { data: invs } = await sb
    .from("invoices")
    .select("number, total, currency, status, created_at")
    .eq("workspace_id", workspaceId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(20);
  for (const i of invs ?? []) {
    events.push({
      at: i.created_at as string,
      kind: "invoice",
      channel: "crm",
      title: `Invoice ${(i.number as string) ?? ""}`.trim(),
      text: `${(i.total as number) ?? 0} ${(i.currency as string) ?? ""} — ${(i.status as string) ?? ""}`,
    });
  }

  const { data: pays } = await sb
    .from("payments")
    .select("amount, currency, status, created_at")
    .eq("workspace_id", workspaceId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(20);
  for (const p of pays ?? []) {
    events.push({
      at: p.created_at as string,
      kind: "payment",
      channel: "crm",
      title: `Payment ${(p.status as string) ?? ""}`,
      text: `${(p.amount as number) ?? 0} ${(p.currency as string) ?? ""}`,
    });
  }

  if (convoIds.length) {
    const { data: notes } = await sb
      .from("conversation_notes")
      .select("body, created_at")
      .in("conversation_id", convoIds)
      .order("created_at", { ascending: false })
      .limit(40);
    for (const n of notes ?? []) {
      events.push({
        at: n.created_at as string,
        kind: "note",
        channel: "internal",
        title: "Internal note",
        text: ((n.body as string) ?? "").slice(0, 400),
      });
    }
  }

  events.sort((a, b) => (a.at < b.at ? 1 : -1));
  return events.slice(0, limit);
}

function formatTimelineForAI(events: TinyEvent[]): string {
  return events
    .map((e) => {
      const when = new Date(e.at).toISOString().replace("T", " ").slice(0, 16);
      const dir = e.direction ? ` (${e.direction})` : "";
      return `[${when}] ${e.channel}/${e.kind}${dir} — ${e.title}: ${e.text}`;
    })
    .join("\n");
}

async function contactContext(
  sb: import("@supabase/supabase-js").SupabaseClient,
  workspaceId: string,
  contactId: string,
): Promise<string> {
  const { data } = await sb
    .from("contacts")
    .select(
      "first_name, last_name, email, phone, company, job_title, city, country, tags, lifecycle_stage",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", contactId)
    .maybeSingle();
  if (!data) return "Contact: (unknown)";
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || "-";
  return [
    `Contact: ${name}`,
    data.company ? `Company: ${data.company}` : null,
    data.job_title ? `Job: ${data.job_title}` : null,
    data.email ? `Email: ${data.email}` : null,
    data.phone ? `Phone: ${data.phone}` : null,
    [data.city, data.country].filter(Boolean).length
      ? `Location: ${[data.city, data.country].filter(Boolean).join(", ")}`
      : null,
    data.lifecycle_stage ? `Stage: ${data.lifecycle_stage}` : null,
    Array.isArray(data.tags) && data.tags.length
      ? `Tags: ${(data.tags as unknown[]).join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// ------------------------------------------------------------------
// AI helper
// ------------------------------------------------------------------

async function ask(
  workspaceId: string,
  userId: string,
  feature: string,
  system: string,
  user: string,
  json = false,
): Promise<string> {
  const messages: AIMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  const res = await runChat({
    workspaceId,
    userId,
    feature,
    request: {
      model: await resolveDefaultModel(workspaceId),
      messages,
      temperature: 0.3,
      max_tokens: 1200,
      response_format: json ? "json_object" : "text",
    },
  });
  return res.content;
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    const m = raw.match(/\{[\s\S]*\}$/);
    return JSON.parse(m ? m[0] : raw) as T;
  } catch {
    return fallback;
  }
}

// ------------------------------------------------------------------
// Public server functions
// ------------------------------------------------------------------

const BaseInput = z.object({
  workspaceId: z.string().uuid(),
  contactId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  limit: z.number().int().min(20).max(500).default(200),
});

export interface OmnichannelInsight {
  summary: string;
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  sentimentScore: number;
  intent: string;
  priority: "low" | "medium" | "high" | "urgent";
  language: string;
  health: number;
  healthLabel: "excellent" | "good" | "at_risk" | "critical";
  risks: { label: string; severity: "low" | "medium" | "high"; reason: string }[];
  opportunities: { label: string; value: string; reason: string }[];
  journey: string;
  qualification: {
    stage: "cold" | "warm" | "hot" | "qualified" | "unqualified";
    budget: "unknown" | "low" | "medium" | "high";
    authority: "unknown" | "influencer" | "decision_maker";
    need: "unknown" | "weak" | "clear" | "urgent";
    timeline: "unknown" | "long" | "medium" | "short";
    score: number;
    reasoning: string;
  };
  nextAction: { action: string; channel: string; when: string; reason: string };
  suggestedReplies: { channel: string; text: string; tone: string }[];
  crmNote: string;
  channelsUsed: string[];
  eventsAnalyzed: number;
  model: string;
}

/** Deep omnichannel insight — every feature in one call. */
export const analyzeOmnichannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => BaseInput.parse(v))
  .handler(async ({ data, context }): Promise<OmnichannelInsight> => {
    const sb = context.supabase;
    const events = await gatherTimeline(sb, data.workspaceId, data.contactId, data.limit);
    const contactCtx = await contactContext(sb, data.workspaceId, data.contactId);
    const timeline = formatTimelineForAI(events);
    const channels = Array.from(new Set(events.map((e) => e.channel)));

    const system = `You are ${BRAND_NAME} Omnichannel AI. You analyze the ENTIRE cross-channel history of a customer (WhatsApp, Instagram, Messenger, Telegram, Email, SMS, Live Chat, Calls, CRM events) and produce concise, honest, high-signal insights for a support/sales agent. Return STRICT JSON only. No prose outside JSON.`;

    const schema = `{
  "summary": string (3-5 sentence executive summary of the current situation across ALL channels),
  "sentiment": "positive"|"neutral"|"negative"|"mixed",
  "sentimentScore": number (-1..1),
  "intent": string (short label like "billing dispute", "renewal", "product question"),
  "priority": "low"|"medium"|"high"|"urgent",
  "language": string (ISO-639-1 code of the customer's dominant language),
  "health": number (0..100),
  "healthLabel": "excellent"|"good"|"at_risk"|"critical",
  "risks": [ { "label": string, "severity": "low"|"medium"|"high", "reason": string } ],
  "opportunities": [ { "label": string, "value": string, "reason": string } ],
  "journey": string (2-4 sentence narrative of the customer journey so far),
  "qualification": {
    "stage": "cold"|"warm"|"hot"|"qualified"|"unqualified",
    "budget": "unknown"|"low"|"medium"|"high",
    "authority": "unknown"|"influencer"|"decision_maker",
    "need": "unknown"|"weak"|"clear"|"urgent",
    "timeline": "unknown"|"long"|"medium"|"short",
    "score": number (0..100),
    "reasoning": string
  },
  "nextAction": { "action": string, "channel": string, "when": string, "reason": string },
  "suggestedReplies": [ { "channel": string, "text": string, "tone": string } ] (exactly 3 replies, matched to the last inbound channel, written in the customer's language),
  "crmNote": string (a clean CRM note an agent could paste directly)
}`;

    const user = `${contactCtx}\n\nCHANNELS SEEN: ${channels.join(", ") || "none"}\n\nOMNICHANNEL TIMELINE (most recent first):\n${timeline || "(no history yet)"}\n\nReturn JSON matching this shape:\n${schema}`;

    const raw = await ask(
      data.workspaceId,
      context.userId,
      "omnichannel_analyze",
      system,
      user,
      true,
    );
    const parsed = safeJson<Partial<OmnichannelInsight>>(raw, {});

    return {
      summary: parsed.summary ?? "",
      sentiment: (parsed.sentiment as OmnichannelInsight["sentiment"]) ?? "neutral",
      sentimentScore: typeof parsed.sentimentScore === "number" ? parsed.sentimentScore : 0,
      intent: parsed.intent ?? "unknown",
      priority: (parsed.priority as OmnichannelInsight["priority"]) ?? "medium",
      language: parsed.language ?? "en",
      health: typeof parsed.health === "number" ? parsed.health : 60,
      healthLabel: (parsed.healthLabel as OmnichannelInsight["healthLabel"]) ?? "good",
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities : [],
      journey: parsed.journey ?? "",
      qualification: parsed.qualification ?? {
        stage: "cold",
        budget: "unknown",
        authority: "unknown",
        need: "unknown",
        timeline: "unknown",
        score: 0,
        reasoning: "",
      },
      nextAction: parsed.nextAction ?? { action: "", channel: "", when: "", reason: "" },
      suggestedReplies: Array.isArray(parsed.suggestedReplies) ? parsed.suggestedReplies : [],
      crmNote: parsed.crmNote ?? "",
      channelsUsed: channels,
      eventsAnalyzed: events.length,
      model: await resolveDefaultModel(data.workspaceId),
    };
  });

/** Translate any snippet from/to a target language, aware of prior omnichannel tone. */
export const translateText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        text: z.string().min(1).max(6000),
        targetLanguage: z.string().min(2).max(20),
        sourceLanguage: z.string().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<{ text: string; sourceLanguage: string }> => {
    const system = `You are a professional translator. Preserve tone, formatting and business intent. Return JSON: { "text": string, "sourceLanguage": ISO code }`;
    const user = `Translate to ${data.targetLanguage}${data.sourceLanguage ? ` from ${data.sourceLanguage}` : ""}. Text:\n\n${data.text}`;
    const raw = await ask(
      data.workspaceId,
      context.userId,
      "omnichannel_translate",
      system,
      user,
      true,
    );
    const parsed = safeJson<{ text?: string; sourceLanguage?: string }>(raw, {});
    return {
      text: parsed.text ?? data.text,
      sourceLanguage: parsed.sourceLanguage ?? data.sourceLanguage ?? "auto",
    };
  });

/** AI Timeline Summary — a period rollup across all channels. */
export const summarizeTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    BaseInput.extend({
      period: z.enum(["week", "month", "quarter", "all"]).default("month"),
    }).parse(v),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ summary: string; highlights: string[]; channels: string[]; events: number }> => {
      const sb = context.supabase;
      const events = await gatherTimeline(sb, data.workspaceId, data.contactId, data.limit);
      const now = Date.now();
      const cutoff =
        data.period === "week"
          ? now - 7 * 864e5
          : data.period === "month"
            ? now - 30 * 864e5
            : data.period === "quarter"
              ? now - 90 * 864e5
              : 0;
      const filtered = events.filter((e) => new Date(e.at).getTime() >= cutoff);
      const contactCtx = await contactContext(sb, data.workspaceId, data.contactId);

      const system = `You summarize omnichannel customer history for a busy agent. Be crisp and factual. Return JSON: { "summary": string (4-6 sentences), "highlights": string[] (5-8 concise bullets) }`;
      const user = `${contactCtx}\n\nPeriod: ${data.period}\n\nTIMELINE:\n${formatTimelineForAI(filtered) || "(no events)"}`;
      const raw = await ask(
        data.workspaceId,
        context.userId,
        "omnichannel_timeline_summary",
        system,
        user,
        true,
      );
      const parsed = safeJson<{ summary?: string; highlights?: string[] }>(raw, {});
      return {
        summary: parsed.summary ?? "",
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
        channels: Array.from(new Set(filtered.map((e) => e.channel))),
        events: filtered.length,
      };
    },
  );

/** AI Search — natural language query over one customer's omnichannel history. */
export const aiSearchTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => BaseInput.extend({ query: z.string().min(2).max(400) }).parse(v))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      answer: string;
      matches: { at: string; channel: string; excerpt: string }[];
    }> => {
      const sb = context.supabase;
      const events = await gatherTimeline(sb, data.workspaceId, data.contactId, data.limit);

      // Lightweight retrieval: keyword filter first, then AI grounds the answer.
      const q = data.query.toLowerCase();
      const words = q.split(/\s+/).filter((w) => w.length > 2);
      const scored = events
        .map((e) => {
          const hay = `${e.title} ${e.text}`.toLowerCase();
          const score = words.reduce((s, w) => (hay.includes(w) ? s + 1 : s), 0);
          return { e, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 30)
        .map(({ e }) => e);

      const system = `You are a search assistant grounded in a customer's cross-channel history. Only use the provided events. If unknown, say so. Return JSON: { "answer": string, "matches": [ { "at": ISO, "channel": string, "excerpt": string } ] } with up to 5 matches.`;
      const user = `Query: ${data.query}\n\nCANDIDATE EVENTS:\n${formatTimelineForAI(scored)}`;
      const raw = await ask(
        data.workspaceId,
        context.userId,
        "omnichannel_search",
        system,
        user,
        true,
      );
      const parsed = safeJson<{
        answer?: string;
        matches?: { at: string; channel: string; excerpt: string }[];
      }>(raw, {});
      return {
        answer: parsed.answer ?? "",
        matches: Array.isArray(parsed.matches) ? parsed.matches.slice(0, 5) : [],
      };
    },
  );

/** Save an AI-generated CRM note to the contact. */
export const saveCrmNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        contactId: z.string().uuid(),
        body: z.string().min(1).max(8000),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: row, error } = await context.supabase
      .from("notes")
      .insert({
        workspace_id: data.workspaceId,
        entity_type: "contact",
        entity_id: data.contactId,
        body: data.body,
        author_id: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });
