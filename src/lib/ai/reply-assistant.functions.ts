/**
 * AI Reply Assistant — generates suggested replies, rewrites, translations,
 * and grammar fixes with full conversation + CRM context awareness.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { runChat, resolveDefaultModel } from "./complete.functions";
import { AIError } from "./errors";
import { PROVIDER_CREDITS_MESSAGE } from "./reply-error";
import type { AIMessage, ChatRequest } from "./types";
import { sbAny } from "@/lib/supabase/untyped";
import { readBusinessContextValue } from "./settings.functions";

export type ReplyAction =
  | "generate"
  | "tone_professional"
  | "tone_friendly"
  | "tone_formal"
  | "tone_casual"
  | "shorten"
  | "expand"
  | "rewrite"
  | "grammar"
  | "improve"
  | "translate"
  | "continue"
  | "custom";

const input = z.object({
  conversationId: z.string().uuid(),
  action: z.enum([
    "generate",
    "tone_professional",
    "tone_friendly",
    "tone_formal",
    "tone_casual",
    "shorten",
    "expand",
    "rewrite",
    "grammar",
    "improve",
    "translate",
    "continue",
    "custom",
  ]),
  draft: z.string().optional().default(""),
  customPrompt: z.string().optional(),
  targetLanguage: z.string().optional(),
  regenerate: z.boolean().optional().default(false),
});

function actionInstruction(
  action: ReplyAction,
  opts: { targetLanguage?: string; customPrompt?: string },
): string {
  switch (action) {
    case "generate":
      return "Draft the ideal next reply from the AGENT to the customer. It should directly address the customer's latest message and move the conversation forward.";
    case "tone_professional":
      return "Rewrite the AGENT DRAFT in a professional, polished tone. Preserve intent and facts.";
    case "tone_friendly":
      return "Rewrite the AGENT DRAFT in a warm, friendly, human tone. Preserve intent and facts.";
    case "tone_formal":
      return "Rewrite the AGENT DRAFT in a formal, courteous tone suitable for business communication.";
    case "tone_casual":
      return "Rewrite the AGENT DRAFT in a casual, conversational tone. Keep it natural, not slangy.";
    case "shorten":
      return "Rewrite the AGENT DRAFT as a much shorter reply (1-2 sentences max) while preserving the core message.";
    case "expand":
      return "Rewrite the AGENT DRAFT as a more detailed, thorough reply. Add helpful context but stay on point.";
    case "rewrite":
      return "Rewrite the AGENT DRAFT so it reads more naturally and clearly. Do not change the intent.";
    case "grammar":
      return "Correct grammar, spelling, and punctuation in the AGENT DRAFT. Return the corrected text only — do not change wording or tone otherwise.";
    case "improve":
      return "Improve the AGENT DRAFT: clearer wording, better flow, stronger phrasing. Keep the meaning and voice.";
    case "translate":
      return `Translate the AGENT DRAFT to ${opts.targetLanguage || "English"}. Keep tone and intent. Return only the translated text.`;
    case "continue":
      return "Continue writing the AGENT DRAFT naturally where it stops. Return the full completed message.";
    case "custom":
      return `Follow this instruction from the agent: "${(opts.customPrompt || "").slice(0, 500)}". Apply it to the AGENT DRAFT or, if empty, produce a new reply based on the conversation.`;
  }
}

interface ContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  job_title: string | null;
  timezone: string | null;
  language: string | null;
  tags: string[] | null;
  notes: string | null;
  lifetime_value: number | null;
  lead_status: string | null;
  customer_status: string | null;
}

interface ConversationRow {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  channel: string | null;
  status: string | null;
  subject: string | null;
}

interface MessageContextRow {
  direction: "inbound" | "outbound";
  body: string | null;
  message_type: string;
  created_at: string;
}

interface WorkspaceRow {
  id: string;
  name: string | null;
  ai_business_context: string | null;
}

export interface ReplyAssistantResult {
  reply: string;
  model: string;
  providerKind: string;
  tokens: number;
  action: ReplyAction;
}

export const aiReplyAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => input.parse(v))
  .handler(async ({ data, context }): Promise<ReplyAssistantResult> => {
    const { supabase, userId } = context;

    // 1. Conversation
    const { data: convRaw, error: convErr } = await supabase
      .from("conversations")
      .select("id, workspace_id, contact_id, channel, status, subject")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convErr) throw new Error(convErr.message);
    if (!convRaw) throw new Error("Conversation not found");
    const conv = convRaw as ConversationRow;

    // 2. Contact / CRM data
    let contact: ContactRow | null = null;
    if (conv.contact_id) {
      const { data: c } = await supabase
        .from("contacts")
        .select(
          "id, first_name, last_name, phone, email, company, job_title, timezone, language, tags, notes, lifetime_value, lead_status, customer_status",
        )
        .eq("id", conv.contact_id)
        .maybeSingle();
      contact = (c ?? null) as ContactRow | null;
    }

    // 3. Recent messages (last 20)
    const { data: msgsRaw } = await supabase
      .from("messages")
      .select("direction, body, message_type, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: false })
      .limit(20);
    const messages = ((msgsRaw ?? []) as unknown as MessageContextRow[]).reverse();

    // 4. Workspace business context (best-effort — column may not exist)
    let workspaceCtx = "";
    let workspaceName = "";
    try {
      const { data: ws } = await supabase
        .from("workspaces")
        .select("id, name")
        .eq("id", conv.workspace_id)
        .maybeSingle();
      workspaceName = (ws as WorkspaceRow | null)?.name ?? "";
      const { data: settings } = await supabase
        .from("settings")
        .select("value")
        .eq("scope", "workspace")
        .eq("workspace_id", conv.workspace_id)
        .is("user_id", null)
        .eq("key", "ai_business_context")
        .limit(1)
        .maybeSingle();
      // settings.value is jsonb: the AI Settings page writes { text }; a plain
      // string or { value } is also accepted.
      workspaceCtx = readBusinessContextValue(
        (settings as { value?: unknown } | null)?.value,
      ).trim();
    } catch {
      /* ignore optional */
    }

    // 5. Build the system prompt
    const contactName = contact
      ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
        contact.phone ||
        "Customer"
      : "Customer";

    const crmLines: string[] = [];
    if (contact) {
      if (contact.company) crmLines.push(`Company: ${contact.company}`);
      if (contact.job_title) crmLines.push(`Job title: ${contact.job_title}`);
      if (contact.email) crmLines.push(`Email: ${contact.email}`);
      if (contact.language) crmLines.push(`Preferred language: ${contact.language}`);
      if (contact.timezone) crmLines.push(`Timezone: ${contact.timezone}`);
      if (contact.lifetime_value) crmLines.push(`Lifetime value: ${contact.lifetime_value}`);
      if (contact.lead_status) crmLines.push(`Lead status: ${contact.lead_status}`);
      if (contact.customer_status) crmLines.push(`Customer status: ${contact.customer_status}`);
      if (contact.tags?.length) crmLines.push(`Tags: ${contact.tags.join(", ")}`);
      if (contact.notes) crmLines.push(`Internal notes: ${contact.notes.slice(0, 400)}`);
    }

    const transcript = messages
      .filter((m) => (m.body ?? "").trim())
      .map((m) => `${m.direction === "inbound" ? contactName : "Agent"}: ${m.body}`)
      .join("\n");

    // 4b. Retrieve grounding excerpts from the AI Knowledge Base (RAG).
    let kbBlock = "";
    try {
      const lastInbound = [...messages]
        .reverse()
        .find((m) => m.direction === "inbound" && (m.body ?? "").trim());
      const kbQuery =
        (data.draft && data.draft.trim()) || lastInbound?.body || transcript.slice(-800);
      if (kbQuery && kbQuery.trim()) {
        const { embedOne, toVectorLiteral } = await import("../kb/embed.server");
        const vec = await embedOne(kbQuery.slice(0, 2000));
        const { data: kbRows } = await sbAny(supabase).rpc(
          "match_kb_chunks" as never,
          {
            p_workspace_id: conv.workspace_id,
            p_query_embedding: toVectorLiteral(vec),
            p_match_count: 4,
            p_min_similarity: 0.28,
            p_only_published: true,
          } as never,
        );
        const hits = (kbRows ?? []) as unknown as Array<{
          title: string;
          content: string;
          article_id: string;
        }>;
        if (hits.length) {
          kbBlock = hits.map((h, i) => `[KB${i + 1}] ${h.title}\n${h.content}`).join("\n---\n");
          // fire-and-forget analytics: mark KB articles as "suggested" for this conversation.
          try {
            const seen = new Set<string>();
            const rows = hits
              .filter((h) => !seen.has(h.article_id) && seen.add(h.article_id))
              .map((h) => ({
                article_id: h.article_id,
                workspace_id: conv.workspace_id,
                event_type: "suggested",
                user_id: userId,
                conversation_id: data.conversationId,
                metadata: {} as Record<string, unknown>,
              }));
            if (rows.length) {
              await sbAny(supabase)
                .from("kb_article_events" as never)
                .insert(rows as never);
            }
          } catch {
            /* non-fatal */
          }
        }
      }
    } catch {
      /* KB grounding is optional */
    }

    const systemPrompt = [
      `You are an AI reply assistant helping a support/sales agent at ${workspaceName || "the company"} respond to a customer on ${conv.channel || "chat"}.`,
      `Write ONLY the reply the agent should send. No preface, no explanations, no quotes, no markdown fences.`,
      `Match the customer's language when replying (they wrote in it).`,
      `Be natural, personalized, and helpful. Never invent facts, prices, or policies.`,
      `Prefer information from KNOWLEDGE BASE excerpts when relevant, but rephrase naturally — do not quote them verbatim or include the [KBn] markers in the reply.`,
      workspaceCtx ? `\nBusiness context:\n${workspaceCtx}` : "",
      crmLines.length ? `\nCustomer CRM data:\n${crmLines.join("\n")}` : "",
      kbBlock ? `\nKnowledge base excerpts:\n${kbBlock}` : "",
      transcript ? `\nRecent conversation (oldest to newest):\n${transcript}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const instruction = actionInstruction(data.action as ReplyAction, {
      targetLanguage: data.targetLanguage,
      customPrompt: data.customPrompt,
    });

    const userMsg = [
      instruction,
      data.draft ? `\nAGENT DRAFT:\n"""\n${data.draft}\n"""` : "",
      data.regenerate ? "\nProduce a different variation than any prior suggestion." : "",
    ]
      .filter(Boolean)
      .join("");

    const aiMessages: AIMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMsg },
    ];

    const req: ChatRequest = {
      model: await resolveDefaultModel(conv.workspace_id),
      messages: aiMessages,
      temperature: data.regenerate ? 0.9 : 0.6,
      max_tokens: data.action === "expand" ? 800 : 400,
    };

    let res: Awaited<ReturnType<typeof runChat>>;
    try {
      res = await runChat({
        workspaceId: conv.workspace_id,
        userId,
        feature: "reply_assistant",
        request: req,
      });
    } catch (error) {
      if (error instanceof AIError && error.type === "billing") {
        throw new Error(PROVIDER_CREDITS_MESSAGE);
      }
      throw error;
    }

    const reply = (res.content || "").trim().replace(/^"+|"+$/g, "");

    return {
      reply,
      model: res.model,
      providerKind: res.providerKind,
      tokens: res.usage?.total_tokens ?? 0,
      action: data.action as ReplyAction,
    };
  });
