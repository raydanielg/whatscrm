/**
 * Unified Conversation Timeline — server function.
 *
 * Aggregates every touchpoint for a single customer into ONE chronological
 * stream, regardless of the underlying channel or CRM surface.
 *
 * Sources merged:
 *   - messages           (WhatsApp / IG / Messenger / Telegram / SMS / Live chat / Email)
 *   - communications     (calls, outbound emails, SMS logged from CRM)
 *   - conversation_notes (internal + AI notes)
 *   - sales_activities   (calls, meetings, follow-ups)
 *   - tasks              (open + completed)
 *   - deals              (created / stage changes come in via activities feed)
 *   - invoices, payments
 *   - campaign_recipients (delivered / read / replied per contact)
 *   - workflow_runs      (via activities feed when linked to contact)
 *   - activities         (catch-all audit stream)
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { providerToChannel } from "@/lib/inbox/channel-capabilities";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const TIMELINE_KINDS = [
  "message",
  "call",
  "email",
  "sms",
  "note",
  "ai_note",
  "activity",
  "task",
  "deal",
  "invoice",
  "payment",
  "campaign",
  "workflow",
  "appointment",
] as const;

export type TimelineKind = (typeof TIMELINE_KINDS)[number];

export type TimelineChannel =
  | "whatsapp"
  | "instagram"
  | "messenger"
  | "telegram"
  | "email"
  | "sms"
  | "live_chat"
  | "voice"
  | "internal"
  | "crm"
  | "system";

export interface TimelineEvent {
  id: string;
  kind: TimelineKind;
  channel: TimelineChannel;
  at: string;               // ISO timestamp used for sorting
  title: string;
  preview?: string | null;
  direction?: "in" | "out" | null;
  status?: string | null;
  amount?: number | null;
  currency?: string | null;
  meta?: Record<string, string | number | boolean | null>;
}

const Input = z.object({
  workspaceId: z.string().uuid(),
  contactId: z.string().uuid(),
  channels: z.array(z.string()).optional(),
  kinds: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

function mapMessageChannel(ch: string | null | undefined): TimelineChannel {
  if (!ch) return "system";
  // Normalise through the shared inbox normaliser, then map onto the
  // timeline-specific union (webchat -> live_chat, unknown -> system).
  const normalized = providerToChannel(ch === "live_chat" ? "webchat" : ch);
  switch (normalized) {
    case "whatsapp":
    case "instagram":
    case "messenger":
    case "telegram":
    case "email":
    case "sms":
    case "voice":
      return normalized;
    case "webchat":
      return "live_chat";
    default:
      return "system";
  }
}

export const getUnifiedTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => Input.parse(v))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { workspaceId, contactId, limit } = data;

    // Conversations for this contact — needed to pull messages + notes.
    const { data: convos } = await sb
      .from("conversations")
      .select("id, channel")
      .eq("workspace_id", workspaceId)
      .eq("contact_id", contactId);

    const convoIds = (convos ?? []).map((c) => c.id as string);
    const convoChannel = new Map<string, string>(
      (convos ?? []).map((c) => [c.id as string, (c.channel as string) ?? "system"]),
    );

    const events: TimelineEvent[] = [];

    // -- messages -----------------------------------------------------------
    if (convoIds.length) {
      const { data: msgs } = await sb
        .from("messages")
        .select("id, conversation_id, body, status, direction, created_at, message_type")
        .in("conversation_id", convoIds)
        .order("created_at", { ascending: false })
        .limit(limit);
      for (const m of msgs ?? []) {
        const ch = convoChannel.get(m.conversation_id as string) ?? "system";
        events.push({
          id: `msg:${m.id}`,
          kind: "message",
          channel: mapMessageChannel(ch),
          at: m.created_at as string,
          title:
            (m.direction as string) === "outbound" ? "Outbound message" : "Inbound message",
          preview: (m.body as string) ?? null,
          direction: (m.direction as string) === "outbound" ? "out" : "in",
          status: (m.status as string) ?? null,
          meta: { conversationId: m.conversation_id, type: m.message_type },
        });
      }
    }

    // -- conversation notes (internal + AI) --------------------------------
    if (convoIds.length) {
      const { data: notes } = await sb
        .from("conversation_notes")
        .select("id, body, created_at, mentions")
        .in("conversation_id", convoIds)
        .order("created_at", { ascending: false })
        .limit(100);
      for (const n of notes ?? []) {
        const body = (n.body as string) ?? "";
        const ai = /^\s*(ai|assistant):/i.test(body) || body.includes("[ai]");
        events.push({
          id: `note:${n.id}`,
          kind: ai ? "ai_note" : "note",
          channel: "internal",
          at: n.created_at as string,
          title: ai ? "AI note" : "Internal note",
          preview: body,
        });
      }
    }

    // -- communications (calls, logged emails/sms) -------------------------
    const { data: comms } = await sb
      .from("communications")
      .select("id, channel, direction, subject, summary, body, status, created_at")
      .eq("workspace_id", workspaceId)
      .eq("entity_type", "contact")
      .eq("entity_id", contactId)
      .order("created_at", { ascending: false })
      .limit(100);
    for (const c of comms ?? []) {
      const ch = (c.channel as string) ?? "system";
      const kind: TimelineKind =
        ch === "call" || ch === "voice" ? "call" : ch === "email" ? "email" : ch === "sms" ? "sms" : "activity";
      events.push({
        id: `comm:${c.id}`,
        kind,
        channel: mapMessageChannel(ch),
        at: c.created_at as string,
        title: (c.subject as string) ?? (kind === "call" ? "Call" : "Communication"),
        preview: (c.summary as string) ?? (c.body as string) ?? null,
        direction: (c.direction as string) === "outbound" ? "out" : "in",
        status: (c.status as string) ?? null,
      });
    }

    // -- sales activities ---------------------------------------------------
    const { data: sales } = await sb
      .from("sales_activities")
      .select("id, type, title, status, created_at, completed_at, description")
      .eq("workspace_id", workspaceId)
      .eq("entity_type", "contact")
      .eq("entity_id", contactId)
      .order("created_at", { ascending: false })
      .limit(100);
    for (const s of sales ?? []) {
      events.push({
        id: `sa:${s.id}`,
        kind: "activity",
        channel: "crm",
        at: (s.completed_at as string) ?? (s.created_at as string),
        title: (s.title as string) ?? (s.type as string) ?? "Activity",
        preview: (s as { description?: string }).description ?? null,
        status: (s.status as string) ?? null,
        meta: { type: s.type },
      });
    }

    // -- tasks --------------------------------------------------------------
    const { data: tasks } = await sb
      .from("tasks")
      .select("id, title, status, created_at, completed_at, due_at")
      .eq("workspace_id", workspaceId)
      .eq("entity_type", "contact")
      .eq("entity_id", contactId)
      .order("created_at", { ascending: false })
      .limit(100);
    for (const t of tasks ?? []) {
      events.push({
        id: `task:${t.id}`,
        kind: "task",
        channel: "crm",
        at: (t.completed_at as string) ?? (t.created_at as string),
        title: (t.title as string) ?? "Task",
        status: (t.status as string) ?? null,
        meta: { dueAt: (t.due_at as string) ?? null },
      });
    }

    // -- deals --------------------------------------------------------------
    const { data: deals } = await sb
      .from("deals")
      .select("id, title, status, amount, currency, created_at, stage_id")
      .eq("workspace_id", workspaceId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(50);
    for (const d of deals ?? []) {
      events.push({
        id: `deal:${d.id}`,
        kind: "deal",
        channel: "crm",
        at: d.created_at as string,
        title: (d.title as string) ?? "Deal",
        amount: (d.amount as number) ?? null,
        currency: ((d as { currency?: string }).currency as string) ?? null,
        status: (d.status as string) ?? null,
      });
    }

    // -- invoices -----------------------------------------------------------
    const { data: invs } = await sb
      .from("invoices")
      .select("id, invoice_number, total, currency, status, created_at, due_date")
      .eq("workspace_id", workspaceId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(50);
    for (const i of invs ?? []) {
      events.push({
        id: `inv:${i.id}`,
        kind: "invoice",
        channel: "crm",
        at: i.created_at as string,
        title: `Invoice ${(i as { invoice_number?: string }).invoice_number ?? ""}`.trim(),
        amount: (i.total as number) ?? null,
        currency: ((i as { currency?: string }).currency as string) ?? null,
        status: (i.status as string) ?? null,
      });
    }

    // -- payments -----------------------------------------------------------
    const { data: pays } = await sb
      .from("payments")
      .select("id, amount, currency, status, created_at, method")
      .eq("workspace_id", workspaceId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(50);
    for (const p of pays ?? []) {
      events.push({
        id: `pay:${p.id}`,
        kind: "payment",
        channel: "crm",
        at: p.created_at as string,
        title: "Payment",
        amount: (p.amount as number) ?? null,
        currency: ((p as { currency?: string }).currency as string) ?? null,
        status: (p.status as string) ?? null,
        meta: { method: (p as { method?: string }).method ?? null },
      });
    }

    // -- campaign recipients (delivered / read / replied) ------------------
    const { data: crs } = await sb
      .from("campaign_recipients")
      .select(
        "id, campaign_id, status, sent_at, delivered_at, read_at, replied_at, failed_at",
      )
      .eq("contact_id", contactId)
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(50);
    if (crs?.length) {
      const ids = Array.from(new Set(crs.map((r) => r.campaign_id as string)));
      const { data: camps } = await sb
        .from("campaigns")
        .select("id, name, channel")
        .in("id", ids);
      const campName = new Map<string, { name: string; channel?: string }>(
        (camps ?? []).map((c) => [
          c.id as string,
          { name: (c.name as string) ?? "Campaign", channel: (c.channel as string) ?? undefined },
        ]),
      );
      for (const r of crs) {
        const at =
          (r.replied_at as string) ??
          (r.read_at as string) ??
          (r.delivered_at as string) ??
          (r.sent_at as string) ??
          (r.failed_at as string);
        if (!at) continue;
        const info = campName.get(r.campaign_id as string);
        events.push({
          id: `camp:${r.id}`,
          kind: "campaign",
          channel: mapMessageChannel(info?.channel),
          at,
          title: `Campaign: ${info?.name ?? ""}`.trim(),
          status: (r.status as string) ?? null,
          direction: "out",
        });
      }
    }

    // -- workflow runs & generic activities linked to contact --------------
    const { data: acts } = await sb
      .from("activities")
      .select("id, verb, summary, object_type, object_id, created_at, data")
      .eq("workspace_id", workspaceId)
      .or(
        `and(target_type.eq.contact,target_id.eq.${contactId}),and(object_type.eq.contact,object_id.eq.${contactId})`,
      )
      .order("created_at", { ascending: false })
      .limit(100);
    for (const a of acts ?? []) {
      const verb = (a.verb as string) ?? "";
      const kind: TimelineKind = verb.startsWith("workflow")
        ? "workflow"
        : verb.startsWith("appointment")
          ? "appointment"
          : "activity";
      events.push({
        id: `act:${a.id}`,
        kind,
        channel: "system",
        at: a.created_at as string,
        title: (a.summary as string) ?? verb ?? "Activity",
        meta: { verb },
      });
    }

    // -- final sort ---------------------------------------------------------
    events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return events.slice(0, limit);
  });
