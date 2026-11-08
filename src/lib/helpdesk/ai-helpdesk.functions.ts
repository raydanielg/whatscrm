/**
 * AI-Powered Helpdesk — Phase 21.
 *
 * Every AI call routes through the shared AI Provider Engine (`runChat`
 * from `@/lib/ai/complete.functions`) so provider/model/fallback/rate-limit/
 * logging/cost tracking are consistent across the app.
 *
 * Features:
 *  - analyzeTicket        (classification + priority + sentiment + intent + tags + summary in one JSON call)
 *  - detectPriority       (returns priority only — applies patch if `apply`)
 *  - analyzeSentiment
 *  - detectIntent
 *  - suggestReply         (tone-aware customer-facing draft)
 *  - suggestKnowledge     (KB article suggestions via textSearch — RAG-lite)
 *  - summarizeConversation (rolling transcript summary for agents)
 *  - summarizeTicket      (structured ticket brief: problem, actions, next steps)
 *  - suggestTags          (list of short tag strings)
 *  - suggestAssignment    (recommends best agent from active agents pool)
 *  - detectDuplicates     (finds similar open tickets via text-search)
 *  - suggestEscalation    (recommend / don't with reason and target level)
 *  - suggestResolution    (step-by-step resolution plan)
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { runChat, resolveDefaultModel } from "@/lib/ai/complete.functions";
import { sbAny } from "@/lib/supabase/untyped";

// ============= helpers =============

async function getWorkspaceId(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data } = await sbAny(supabaseAdmin)
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("No workspace found");
  return (data as { workspace_id: string }).workspace_id;
}

interface Ticket {
  id: string;
  subject: string | null;
  description: string | null;
  priority: string;
  status: string;
  channel: string | null;
  ai_summary: string | null;
  last_message_preview: string | null;
  tags: string[] | null;
  ticket_category_id: string | null;
  assigned_to: string | null;
  workspace_id: string;
}

async function loadTicket(
  userId: string,
  ticketId: string,
): Promise<{ ticket: Ticket; workspaceId: string }> {
  const workspaceId = await getWorkspaceId(userId);
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data } = await sbAny(supabaseAdmin)
    .from("conversations" as never)
    .select(
      "id, subject, description, priority, status, channel, ai_summary, last_message_preview, tags, ticket_category_id, assigned_to, workspace_id",
    )
    .eq("id", ticketId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data) throw new Error("Ticket not found");
  return { ticket: data as unknown as Ticket, workspaceId };
}

async function loadTranscript(ticketId: string, limit = 20): Promise<string> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data } = await sbAny(supabaseAdmin)
    .from("messages")
    .select("body, direction, is_internal, created_at")
    .eq("conversation_id", ticketId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as Array<{ body: string | null; direction: string; is_internal: boolean }>)
    .filter((m) => !m.is_internal && m.body)
    .reverse()
    .map((m) => `${m.direction === "outbound" ? "Agent" : "Customer"}: ${m.body}`)
    .join("\n");
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    const trimmed = raw
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    return JSON.parse(trimmed) as T;
  } catch {
    return fallback;
  }
}

async function callAI(opts: {
  workspaceId: string;
  userId: string;
  feature: string;
  system: string;
  user: string;
  json?: boolean;
  temperature?: number;
}): Promise<string> {
  const res = await runChat({
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    feature: opts.feature,
    request: {
      model: await resolveDefaultModel(opts.workspaceId),
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      temperature: opts.temperature ?? 0.2,
      response_format: opts.json ? "json_object" : undefined,
    },
  });
  return res.content ?? "";
}

// ============= 1. Full analyze (classification + priority + sentiment + intent + tags + summary) =============

export const analyzeTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z
      .object({
        ticketId: z.string().uuid(),
        apply: z.boolean().default(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { ticket, workspaceId } = await loadTicket(context.userId, data.ticketId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: cats } = await sbAny(supabaseAdmin)
      .from("ticket_categories" as never)
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true);
    const categoryList =
      ((cats ?? []) as Array<{ id: string; name: string }>)
        .map((c) => `- ${c.id}: ${c.name}`)
        .join("\n") || "(none)";
    const transcript = await loadTranscript(data.ticketId, 12);

    const raw = await callAI({
      workspaceId,
      userId: context.userId,
      feature: "helpdesk.analyze",
      json: true,
      system:
        "You are an enterprise support triage classifier. Output STRICT JSON only. Never invent categories not listed.",
      user: `Analyze this support ticket and return JSON with these fields:
{
  "category_id": "<uuid from available list, or null>",
  "priority": "urgent|high|normal|low",
  "sentiment": "positive|neutral|negative",
  "sentiment_score": <-1..1>,
  "intent": "question|complaint|feature_request|bug_report|billing|cancellation|refund|feedback|other",
  "tags": ["short","lowercase","kebab-case"],
  "summary": "one-sentence agent-facing summary"
}

Subject: ${ticket.subject ?? ""}
Description: ${ticket.description ?? ticket.last_message_preview ?? ""}
Channel: ${ticket.channel ?? "email"}

Available categories:
${categoryList}

Recent transcript:
${transcript || "(no messages yet)"}`,
    });

    const parsed = safeJson<{
      category_id?: string | null;
      priority?: string;
      sentiment?: string;
      sentiment_score?: number;
      intent?: string;
      tags?: string[];
      summary?: string;
    }>(raw, {});

    if (data.apply) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (parsed.summary) patch.ai_summary = parsed.summary;
      if (parsed.priority && ["urgent", "high", "normal", "low"].includes(parsed.priority))
        patch.priority = parsed.priority;
      if (parsed.category_id) patch.ticket_category_id = parsed.category_id;
      if (parsed.tags?.length) {
        const merged = Array.from(new Set([...(ticket.tags ?? []), ...parsed.tags])).slice(0, 20);
        patch.tags = merged;
      }
      await (
        sbAny(supabaseAdmin).from("conversations" as never) as unknown as {
          update: (v: unknown) => {
            eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<unknown> };
          };
        }
      )
        .update(patch)
        .eq("id", data.ticketId)
        .eq("workspace_id", workspaceId);
    }

    return parsed;
  });

// ============= 2. Priority Detection =============

export const detectPriority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({ ticketId: z.string().uuid(), apply: z.boolean().default(false) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { ticket, workspaceId } = await loadTicket(context.userId, data.ticketId);
    const transcript = await loadTranscript(data.ticketId, 8);
    const raw = await callAI({
      workspaceId,
      userId: context.userId,
      feature: "helpdesk.priority",
      json: true,
      system: "You classify support ticket priority. Output JSON only.",
      user: `Return {"priority":"urgent|high|normal|low","reason":"..."}.\nUrgent = outage/data loss/security/paying VIP blocked. High = major feature broken. Normal = general question. Low = FYI.\n\nSubject: ${ticket.subject}\nDescription: ${ticket.description ?? ticket.last_message_preview ?? ""}\n\n${transcript}`,
    });
    const parsed = safeJson<{ priority?: string; reason?: string }>(raw, {});
    if (
      data.apply &&
      parsed.priority &&
      ["urgent", "high", "normal", "low"].includes(parsed.priority)
    ) {
      const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
      await (
        sbAny(supabaseAdmin).from("conversations" as never) as unknown as {
          update: (v: unknown) => {
            eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<unknown> };
          };
        }
      )
        .update({ priority: parsed.priority, updated_at: new Date().toISOString() })
        .eq("id", data.ticketId)
        .eq("workspace_id", workspaceId);
    }
    return parsed;
  });

// ============= 3. Sentiment =============

export const analyzeSentiment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ ticketId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { workspaceId } = await loadTicket(context.userId, data.ticketId);
    const transcript = await loadTranscript(data.ticketId, 20);
    const raw = await callAI({
      workspaceId,
      userId: context.userId,
      feature: "helpdesk.sentiment",
      json: true,
      system: "You analyze customer sentiment across a support conversation. JSON only.",
      user: `Return {"sentiment":"positive|neutral|negative","score":<-1..1>,"emotion":"angry|frustrated|confused|satisfied|neutral","trend":"improving|stable|worsening","reason":"..."}.\n\nTranscript:\n${transcript || "(no customer messages yet)"}`,
    });
    return safeJson<{
      sentiment?: string;
      score?: number;
      emotion?: string;
      trend?: string;
      reason?: string;
    }>(raw, {});
  });

// ============= 4. Intent =============

export const detectIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ ticketId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { ticket, workspaceId } = await loadTicket(context.userId, data.ticketId);
    const transcript = await loadTranscript(data.ticketId, 10);
    const raw = await callAI({
      workspaceId,
      userId: context.userId,
      feature: "helpdesk.intent",
      json: true,
      system: "You identify a support ticket's primary intent. JSON only.",
      user: `Return {"intent":"question|complaint|feature_request|bug_report|billing|cancellation|refund|feedback|onboarding|integration|other","confidence":<0..1>,"sub_topic":"..."}.\n\nSubject: ${ticket.subject}\nMessage: ${ticket.last_message_preview}\n${transcript}`,
    });
    return safeJson<{ intent?: string; confidence?: number; sub_topic?: string }>(raw, {});
  });

// ============= 5. Suggested Reply =============

export const suggestReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z
      .object({
        ticketId: z.string().uuid(),
        tone: z
          .enum(["friendly", "formal", "empathetic", "concise", "apologetic"])
          .default("friendly"),
        goal: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { ticket, workspaceId } = await loadTicket(context.userId, data.ticketId);
    const transcript = await loadTranscript(data.ticketId, 15);
    const content = await callAI({
      workspaceId,
      userId: context.userId,
      feature: "helpdesk.reply",
      system:
        "You draft concise, actionable helpdesk replies. Do not invent facts. Match the requested tone. Never promise timelines you can't confirm. Sign as the agent.",
      user: `Draft a ${data.tone} reply to the customer.${data.goal ? ` Goal: ${data.goal}.` : ""}\nTicket subject: ${ticket.subject}\nContext summary: ${ticket.ai_summary ?? "n/a"}\n\nTranscript:\n${transcript}\n\nReply:`,
      temperature: 0.5,
    });
    return { suggestion: content };
  });

// ============= 6. Knowledge suggestions =============

export const suggestKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ ticketId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { ticket, workspaceId } = await loadTicket(context.userId, data.ticketId);
    const q = [ticket.subject, ticket.ai_summary, ticket.description, ticket.last_message_preview]
      .filter(Boolean)
      .join(" ")
      .slice(0, 300);
    if (!q) return [];
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const terms = q
      .split(/\s+/)
      .filter((t) => t.length > 2)
      .slice(0, 8)
      .join(" | ");
    const { data: articles } = await (
      sbAny(supabaseAdmin).from("kb_articles" as never) as unknown as {
        select: (s: string) => {
          eq: (
            c: string,
            v: string,
          ) => {
            eq: (
              c: string,
              v: string,
            ) => {
              textSearch: (
                c: string,
                q: string,
                o: unknown,
              ) => {
                limit: (n: number) => Promise<{
                  data: Array<{
                    id: string;
                    title: string;
                    slug: string;
                    summary: string | null;
                  }> | null;
                }>;
              };
            };
          };
        };
      }
    )
      .select("id, title, slug, summary, status")
      .eq("workspace_id", workspaceId)
      .eq("status", "published")
      .textSearch("title", terms, { type: "websearch", config: "english" })
      .limit(5);
    return articles ?? [];
  });

// ============= 7. Conversation summary =============

export const summarizeConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({ ticketId: z.string().uuid(), apply: z.boolean().default(true) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { workspaceId } = await loadTicket(context.userId, data.ticketId);
    const transcript = await loadTranscript(data.ticketId, 50);
    if (!transcript) return { summary: "" };
    const content = await callAI({
      workspaceId,
      userId: context.userId,
      feature: "helpdesk.conv_summary",
      system: "You write concise agent-facing summaries of support conversations.",
      user: `Summarize this conversation in 2-3 sentences. Include: main issue, actions taken, current state.\n\n${transcript}`,
    });
    if (data.apply && content) {
      const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
      await (
        sbAny(supabaseAdmin).from("conversations" as never) as unknown as {
          update: (v: unknown) => {
            eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<unknown> };
          };
        }
      )
        .update({ ai_summary: content, updated_at: new Date().toISOString() })
        .eq("id", data.ticketId)
        .eq("workspace_id", workspaceId);
    }
    return { summary: content };
  });

// ============= 8. Ticket summary (structured brief) =============

export const summarizeTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ ticketId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { ticket, workspaceId } = await loadTicket(context.userId, data.ticketId);
    const transcript = await loadTranscript(data.ticketId, 30);
    const raw = await callAI({
      workspaceId,
      userId: context.userId,
      feature: "helpdesk.ticket_summary",
      json: true,
      system: "You produce structured agent handoff briefs. JSON only.",
      user: `Return {"problem":"...","actions_taken":["..."],"pending":["..."],"next_steps":["..."],"customer_ask":"..."}.\n\nSubject: ${ticket.subject}\n${transcript}`,
    });
    return safeJson<{
      problem?: string;
      actions_taken?: string[];
      pending?: string[];
      next_steps?: string[];
      customer_ask?: string;
    }>(raw, {});
  });

// ============= 9. Auto tags =============

export const suggestTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({ ticketId: z.string().uuid(), apply: z.boolean().default(false) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { ticket, workspaceId } = await loadTicket(context.userId, data.ticketId);
    const transcript = await loadTranscript(data.ticketId, 8);
    const raw = await callAI({
      workspaceId,
      userId: context.userId,
      feature: "helpdesk.tags",
      json: true,
      system: "You produce concise ticket tags. JSON only.",
      user: `Return {"tags":["short","lowercase","kebab-case"]} — max 6 tags, each 1-3 words.\n\nSubject: ${ticket.subject}\nMessage: ${ticket.last_message_preview}\n${transcript}`,
    });
    const parsed = safeJson<{ tags?: string[] }>(raw, {});
    const tags = (parsed.tags ?? []).map((t) => t.toLowerCase().replace(/\s+/g, "-")).slice(0, 6);
    if (data.apply && tags.length) {
      const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
      const merged = Array.from(new Set([...(ticket.tags ?? []), ...tags])).slice(0, 20);
      await (
        sbAny(supabaseAdmin).from("conversations" as never) as unknown as {
          update: (v: unknown) => {
            eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<unknown> };
          };
        }
      )
        .update({ tags: merged, updated_at: new Date().toISOString() })
        .eq("id", data.ticketId)
        .eq("workspace_id", workspaceId);
    }
    return { tags };
  });

// ============= 10. Auto Assignment =============

export const suggestAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({ ticketId: z.string().uuid(), apply: z.boolean().default(false) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { ticket, workspaceId } = await loadTicket(context.userId, data.ticketId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    // Pull agents + their skills
    const { data: agents } = await sbAny(supabaseAdmin)
      .from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", workspaceId);
    const agentIds = ((agents ?? []) as Array<{ user_id: string; role: string }>)
      .filter((a) => ["agent", "admin", "owner"].includes(a.role))
      .map((a) => a.user_id);
    if (agentIds.length === 0) return { agentId: null, reason: "No agents available" };
    const { data: skills } = await sbAny(supabaseAdmin)
      .from("agent_skills" as never)
      .select("user_id, skills, languages, is_vip, current_load, is_available")
      .in("user_id", agentIds);
    const { data: profiles } = await sbAny(supabaseAdmin)
      .from("profiles" as never)
      .select("id, full_name, email")
      .in("id", agentIds);
    const profileMap = new Map<string, string>();
    for (const p of (profiles ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
    }>) {
      profileMap.set(p.id, p.full_name || p.email || "Agent");
    }
    const roster =
      (
        (skills ?? []) as Array<{
          user_id: string;
          skills: string[] | null;
          languages: string[] | null;
          is_vip: boolean | null;
          current_load: number | null;
          is_available: boolean | null;
        }>
      )
        .filter((a) => a.is_available !== false)
        .map(
          (a) =>
            `- ${a.user_id} (${profileMap.get(a.user_id) ?? "Agent"}): load=${a.current_load ?? 0}, skills=[${(a.skills ?? []).join(",")}], languages=[${(a.languages ?? []).join(",")}], vip=${a.is_vip ?? false}`,
        )
        .join("\n") ||
      agentIds.map((id) => `- ${id} (${profileMap.get(id) ?? "Agent"})`).join("\n");

    const raw = await callAI({
      workspaceId,
      userId: context.userId,
      feature: "helpdesk.assign",
      json: true,
      system:
        "You recommend the best support agent for a ticket. Prefer lowest load matching skill/language. JSON only.",
      user: `Return {"agent_id":"<uuid from roster>","reason":"..."}.\n\nSubject: ${ticket.subject}\nPriority: ${ticket.priority}\nSummary: ${ticket.ai_summary ?? "n/a"}\nMessage: ${ticket.last_message_preview}\n\nAgents:\n${roster}`,
    });
    const parsed = safeJson<{ agent_id?: string; reason?: string }>(raw, {});
    const chosen = parsed.agent_id && agentIds.includes(parsed.agent_id) ? parsed.agent_id : null;
    if (data.apply && chosen) {
      await (
        sbAny(supabaseAdmin).from("conversations" as never) as unknown as {
          update: (v: unknown) => {
            eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<unknown> };
          };
        }
      )
        .update({ assigned_to: chosen, updated_at: new Date().toISOString() })
        .eq("id", data.ticketId)
        .eq("workspace_id", workspaceId);
    }
    return {
      agentId: chosen,
      agentName: chosen ? (profileMap.get(chosen) ?? null) : null,
      reason: parsed.reason ?? "",
    };
  });

// ============= 11. Duplicate detection =============

export const detectDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ ticketId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { ticket, workspaceId } = await loadTicket(context.userId, data.ticketId);
    const query = [ticket.subject, ticket.ai_summary, ticket.last_message_preview]
      .filter(Boolean)
      .join(" ")
      .slice(0, 200);
    if (!query) return [];
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    // Candidate pool: same workspace, open/pending, exclude self, recent 60d
    const cutoff = new Date(Date.now() - 60 * 24 * 3600_000).toISOString();
    const { data: candidates } = await sbAny(supabaseAdmin)
      .from("conversations" as never)
      .select("id, subject, ai_summary, last_message_preview, status, ticket_number, created_at")
      .eq("workspace_id", workspaceId)
      .in("status", ["open", "pending"] as unknown as never)
      .neq("id", data.ticketId)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(50);
    const pool = (candidates ?? []) as Array<{
      id: string;
      subject: string | null;
      ai_summary: string | null;
      last_message_preview: string | null;
      ticket_number: number;
    }>;
    if (pool.length === 0) return [];
    const roster = pool
      .map(
        (c) =>
          `- ${c.id} #${c.ticket_number}: ${(c.subject ?? "").slice(0, 80)} | ${(c.ai_summary ?? c.last_message_preview ?? "").slice(0, 120)}`,
      )
      .join("\n");
    const raw = await callAI({
      workspaceId,
      userId: context.userId,
      feature: "helpdesk.duplicates",
      json: true,
      system:
        "You detect duplicate/near-duplicate support tickets. Only return items describing the SAME underlying issue. JSON only.",
      user: `Return {"duplicates":[{"ticket_id":"<uuid>","confidence":<0..1>,"reason":"..."}]} — empty array if none.\n\nCurrent ticket:\nSubject: ${ticket.subject}\nDetails: ${ticket.ai_summary ?? ticket.last_message_preview}\n\nCandidates:\n${roster}`,
    });
    const parsed = safeJson<{
      duplicates?: Array<{ ticket_id: string; confidence: number; reason: string }>;
    }>(raw, {});
    const valid = (parsed.duplicates ?? []).filter((d) => pool.some((p) => p.id === d.ticket_id));
    return valid.map((d) => {
      const p = pool.find((x) => x.id === d.ticket_id)!;
      return {
        ticketId: d.ticket_id,
        ticketNumber: p.ticket_number,
        subject: p.subject,
        confidence: d.confidence,
        reason: d.reason,
      };
    });
  });

// ============= 12. Escalation recommendation =============

export const suggestEscalation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ ticketId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { ticket, workspaceId } = await loadTicket(context.userId, data.ticketId);
    const transcript = await loadTranscript(data.ticketId, 15);
    // Load SLA state
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: sla } = await sbAny(supabaseAdmin)
      .from("ticket_sla_tracking" as never)
      .select(
        "first_response_due_at, resolution_due_at, first_response_breached, resolution_breached",
      )
      .eq("ticket_id", data.ticketId)
      .maybeSingle();
    const s = (sla ?? {}) as {
      first_response_due_at?: string;
      resolution_due_at?: string;
      first_response_breached?: boolean;
      resolution_breached?: boolean;
    };
    const raw = await callAI({
      workspaceId,
      userId: context.userId,
      feature: "helpdesk.escalation",
      json: true,
      system:
        "You recommend whether a ticket should be escalated. JSON only. Be conservative — only recommend when there's clear risk (SLA breach imminent/breached, VIP frustration, unresolved critical bug, angry customer, repeated re-open).",
      user: `Return {"recommend":true|false,"level":1|2|3,"reason":"...","target":"supervisor|senior_agent|engineering|management"}.\n\nTicket:\nSubject: ${ticket.subject}\nPriority: ${ticket.priority}\nStatus: ${ticket.status}\nSummary: ${ticket.ai_summary ?? "n/a"}\nSLA first-response due: ${s.first_response_due_at ?? "n/a"} (breached=${!!s.first_response_breached})\nSLA resolution due: ${s.resolution_due_at ?? "n/a"} (breached=${!!s.resolution_breached})\n\nTranscript:\n${transcript}`,
    });
    return safeJson<{ recommend?: boolean; level?: number; reason?: string; target?: string }>(
      raw,
      {},
    );
  });

// ============= 13. AI Resolution suggestions =============

export const suggestResolution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ ticketId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { ticket, workspaceId } = await loadTicket(context.userId, data.ticketId);
    const transcript = await loadTranscript(data.ticketId, 20);
    const raw = await callAI({
      workspaceId,
      userId: context.userId,
      feature: "helpdesk.resolution",
      json: true,
      system:
        "You produce step-by-step resolution plans for support agents. Cite what you don't know. JSON only.",
      user: `Return {"steps":[{"title":"...","detail":"..."}],"risks":["..."],"customer_message":"...","estimated_effort":"low|medium|high"}.\n\nSubject: ${ticket.subject}\nSummary: ${ticket.ai_summary ?? "n/a"}\n\nTranscript:\n${transcript}`,
    });
    return safeJson<{
      steps?: Array<{ title: string; detail: string }>;
      risks?: string[];
      customer_message?: string;
      estimated_effort?: string;
    }>(raw, {});
  });
