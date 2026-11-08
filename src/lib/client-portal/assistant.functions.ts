/**
 * AI Customer Assistant — customer portal.
 *
 * Uses the shared AI Provider Engine (`runChat`) so the workspace's
 * configured provider + fallbacks + logging + cost tracking + rate limit
 * are all honored.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { runChat, resolveDefaultModel } from "@/lib/ai/complete.functions";
import type { AIMessage } from "@/lib/ai/types";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";

/* -------------------------------------------------------------------------- */
/* Contact resolution (mirrors portal.functions.ts)                           */
/* -------------------------------------------------------------------------- */

type Ctx = {
  contactId: string;
  workspaceId: string;
  email: string;
  name: string | null;
  userId: string;
};

async function requireContact(context: {
  userId: string;
  claims: { email?: string };
}): Promise<Ctx> {
  const email = context.claims?.email ?? "";
  if (!email) throw new Error("No email on session");
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("id, workspace_id, email, name, first_name, last_name")
    .ilike("email", email)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("No customer profile linked to this account.");
  const r = data as {
    id: string;
    workspace_id: string;
    email: string | null;
    name: string | null;
    first_name: string | null;
    last_name: string | null;
  };
  const name = r.name ?? [r.first_name, r.last_name].filter(Boolean).join(" ") ?? null;
  return {
    contactId: r.id,
    workspaceId: r.workspace_id,
    email: r.email ?? email,
    name: name || null,
    userId: context.userId,
  };
}

/* -------------------------------------------------------------------------- */
/* Context bundle — snapshot of the customer's account for grounding          */
/* -------------------------------------------------------------------------- */

type ContextBundle = {
  appointments: Array<{
    id: string;
    start_at: string;
    status: string;
    join_url: string | null;
    event_type: string | null;
  }>;
  orders: Array<{
    id: string;
    title: string;
    amount: number | null;
    currency: string | null;
    status: string;
    stage: string | null;
    created_at: string;
  }>;
  invoices: Array<{
    id: string;
    number: string | null;
    status: string;
    total: number;
    amount_due: number;
    currency: string | null;
    due_date: string | null;
    paid_at: string | null;
  }>;
  tickets: Array<{
    id: string;
    subject: string | null;
    status: string;
    priority: string;
    created_at: string;
    last_message_at: string | null;
  }>;
  conversations: Array<{
    id: string;
    channel: string;
    last_message_preview: string | null;
    last_message_at: string | null;
    unread: number;
  }>;
  kb: Array<{ id: string; slug: string; title: string; summary: string | null }>;
  products: Array<{
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    currency: string | null;
  }>;
};

async function buildContextBundle(c: Ctx, keywords: string): Promise<ContextBundle> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const now = new Date().toISOString();
  const kw = sanitizeSearchTerm(keywords);
  const kwLike = kw ? `%${kw}%` : "%";

  const [appts, deals, invs, tickets, convs, kb, products] = await Promise.all([
    sbAny(supabaseAdmin)
      .from("booking_appointments")
      .select("id, start_at, status, join_url, booking_event_types(name)")
      .eq("workspace_id", c.workspaceId)
      .eq("customer_email", c.email)
      .gte("start_at", new Date(Date.now() - 90 * 86400_000).toISOString())
      .order("start_at", { ascending: false })
      .limit(8),
    sbAny(supabaseAdmin)
      .from("deals")
      .select(
        "id, title, amount, currency, status, expected_close_date, created_at, deal_stages(name)",
      )
      .eq("workspace_id", c.workspaceId)
      .eq("contact_id", c.contactId)
      .order("created_at", { ascending: false })
      .limit(10),
    sbAny(supabaseAdmin)
      .from("invoices")
      .select("id, invoice_number, status, total, amount_due, currency, due_date, paid_at")
      .eq("workspace_id", c.workspaceId)
      .eq("contact_id", c.contactId)
      .order("created_at", { ascending: false })
      .limit(10),
    sbAny(supabaseAdmin)
      .from("conversations")
      .select("id, subject, status, priority, created_at, last_message_at")
      .eq("workspace_id", c.workspaceId)
      .eq("contact_id", c.contactId)
      .not("subject", "is", null)
      .order("created_at", { ascending: false })
      .limit(6),
    sbAny(supabaseAdmin)
      .from("conversations")
      .select("id, channel, last_message_preview, last_message_at, unread_count")
      .eq("workspace_id", c.workspaceId)
      .eq("contact_id", c.contactId)
      .is("subject", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(5),
    kw
      ? sbAny(supabaseAdmin)
          .from("kb_articles")
          .select("id, slug, title, summary")
          .eq("workspace_id", c.workspaceId)
          .eq("status", "published")
          .or(`title.ilike.${kwLike},summary.ilike.${kwLike}`)
          .order("view_count", { ascending: false, nullsFirst: false })
          .limit(6)
      : sbAny(supabaseAdmin)
          .from("kb_articles")
          .select("id, slug, title, summary")
          .eq("workspace_id", c.workspaceId)
          .eq("status", "published")
          .order("view_count", { ascending: false, nullsFirst: false })
          .limit(4),
    kw
      ? sbAny(supabaseAdmin)
          .from("products")
          .select("id, name, description, price, currency")
          .eq("workspace_id", c.workspaceId)
          .eq("is_active", true)
          .or(`name.ilike.${kwLike},description.ilike.${kwLike}`)
          .limit(6)
      : sbAny(supabaseAdmin)
          .from("products")
          .select("id, name, description, price, currency")
          .eq("workspace_id", c.workspaceId)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(4),
  ]);
  void now;

  type A = {
    id: string;
    start_at: string;
    status: string;
    join_url: string | null;
    booking_event_types: { name: string | null } | null;
  };
  type D = {
    id: string;
    title: string;
    amount: number | null;
    currency: string | null;
    status: string;
    created_at: string;
    deal_stages: { name: string | null } | null;
  };
  type I = {
    id: string;
    invoice_number: string | null;
    status: string;
    total: number | string;
    amount_due: number | string;
    currency: string | null;
    due_date: string | null;
    paid_at: string | null;
  };
  type T = {
    id: string;
    subject: string | null;
    status: string;
    priority: string;
    created_at: string;
    last_message_at: string | null;
  };
  type C = {
    id: string;
    channel: string;
    last_message_preview: string | null;
    last_message_at: string | null;
    unread_count: number | null;
  };
  type K = { id: string; slug: string; title: string; summary: string | null };
  type P = {
    id: string;
    name: string;
    description: string | null;
    price: number | string | null;
    currency: string | null;
  };

  return {
    appointments: ((appts.data ?? []) as unknown as A[]).map((r) => ({
      id: r.id,
      start_at: r.start_at,
      status: r.status,
      join_url: r.join_url,
      event_type: r.booking_event_types?.name ?? null,
    })),
    orders: ((deals.data ?? []) as unknown as D[]).map((r) => ({
      id: r.id,
      title: r.title,
      amount: r.amount == null ? null : Number(r.amount),
      currency: r.currency,
      status: r.status,
      stage: r.deal_stages?.name ?? null,
      created_at: r.created_at,
    })),
    invoices: ((invs.data ?? []) as unknown as I[]).map((r) => ({
      id: r.id,
      number: r.invoice_number,
      status: r.status,
      total: Number(r.total ?? 0),
      amount_due: Number(r.amount_due ?? 0),
      currency: r.currency,
      due_date: r.due_date,
      paid_at: r.paid_at,
    })),
    tickets: ((tickets.data ?? []) as unknown as T[]).map((r) => ({
      id: r.id,
      subject: r.subject,
      status: r.status,
      priority: r.priority,
      created_at: r.created_at,
      last_message_at: r.last_message_at,
    })),
    conversations: ((convs.data ?? []) as unknown as C[]).map((r) => ({
      id: r.id,
      channel: r.channel,
      last_message_preview: r.last_message_preview,
      last_message_at: r.last_message_at,
      unread: r.unread_count ?? 0,
    })),
    kb: (kb.data ?? []) as unknown as K[],
    products: ((products.data ?? []) as unknown as P[]).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      price: r.price == null ? null : Number(r.price),
      currency: r.currency,
    })),
  };
}

function contextToPrompt(bundle: ContextBundle): string {
  const money = (n: number | null, cur: string | null) =>
    n == null ? "n/a" : `${cur ?? ""} ${n.toFixed(2)}`.trim();
  const shortDate = (s: string | null) =>
    s ? new Date(s).toISOString().slice(0, 16).replace("T", " ") : "n/a";
  const lines: string[] = [];

  if (bundle.appointments.length) {
    lines.push("APPOINTMENTS:");
    bundle.appointments.forEach((a) =>
      lines.push(
        `- [${a.id.slice(0, 8)}] ${shortDate(a.start_at)} · ${a.event_type ?? "meeting"} · ${a.status}${a.join_url ? " · join available" : ""}`,
      ),
    );
  }
  if (bundle.orders.length) {
    lines.push("ORDERS / DEALS:");
    bundle.orders.forEach((o) =>
      lines.push(
        `- [${o.id.slice(0, 8)}] "${o.title}" · ${money(o.amount, o.currency)} · stage: ${o.stage ?? "n/a"} · ${o.status} · created ${shortDate(o.created_at)}`,
      ),
    );
  }
  if (bundle.invoices.length) {
    lines.push("INVOICES:");
    bundle.invoices.forEach((i) =>
      lines.push(
        `- [${i.id.slice(0, 8)}] #${i.number ?? "?"} · total ${money(i.total, i.currency)} · due ${money(i.amount_due, i.currency)} · ${i.status}${i.due_date ? ` · due ${i.due_date}` : ""}${i.paid_at ? ` · paid ${shortDate(i.paid_at)}` : ""}`,
      ),
    );
  }
  if (bundle.tickets.length) {
    lines.push("SUPPORT TICKETS:");
    bundle.tickets.forEach((t) =>
      lines.push(
        `- [${t.id.slice(0, 8)}] "${t.subject ?? "—"}" · ${t.status} · ${t.priority} · opened ${shortDate(t.created_at)}`,
      ),
    );
  }
  if (bundle.conversations.length) {
    lines.push("RECENT CONVERSATIONS:");
    bundle.conversations.forEach((c) =>
      lines.push(
        `- [${c.id.slice(0, 8)}] ${c.channel} · ${shortDate(c.last_message_at)} · ${(c.last_message_preview ?? "").slice(0, 80)}`,
      ),
    );
  }
  if (bundle.kb.length) {
    lines.push("HELP CENTER ARTICLES:");
    bundle.kb.forEach((k) => lines.push(`- [kb:${k.slug}] ${k.title} — ${k.summary ?? ""}`));
  }
  if (bundle.products.length) {
    lines.push("AVAILABLE PRODUCTS:");
    bundle.products.forEach((p) =>
      lines.push(
        `- [${p.id.slice(0, 8)}] ${p.name} · ${money(p.price, p.currency)}${p.description ? ` — ${p.description.slice(0, 100)}` : ""}`,
      ),
    );
  }
  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/* Chat                                                                       */
/* -------------------------------------------------------------------------- */

const chatInput = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(30),
  locale: z.string().trim().max(20).optional(),
});

export const assistantChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => chatInput.parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const lastUser = [...data.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const keywords = lastUser.slice(0, 200);

    const bundle = await buildContextBundle(c, keywords);
    const contextPrompt = contextToPrompt(bundle);

    const languageInstruction = data.locale
      ? `The user's browser locale is ${data.locale}. Detect the language of their message and reply in that same language.`
      : "Detect the language of the user's message and reply in the same language.";

    const system = [
      `You are the AI Customer Assistant for ${c.name ?? "the customer"} (${c.email}).`,
      `Help them with their account: appointments, orders, invoices, support tickets, products, and how to use the portal.`,
      ``,
      `RULES:`,
      `- Ground every factual answer in the CONTEXT block below. Never invent order IDs, amounts, dates, or statuses.`,
      `- If the answer is not in the context, say so plainly and offer to hand off to a human.`,
      `- Be concise. Use short paragraphs and bullet points. Use markdown.`,
      `- When referring to a specific item, cite its short id (e.g. "invoice 3f2a1b90" or "kb:reset-password").`,
      `- When suggesting a help article, format it as a markdown link: [Title](/client/knowledge/{slug}).`,
      `- When recommending products, format as: [Product name](/client/billing) · price.`,
      `- ${languageInstruction}`,
      `- If the user asks to speak to a human, or the topic is billing dispute, urgent bug, or complaint, end your reply with a single line: "HANDOFF_SUGGESTED: <one-sentence reason>".`,
      ``,
      `CONTEXT (current customer snapshot — trust this as ground truth):`,
      contextPrompt || "(no account data yet)",
    ].join("\n");

    const messages: AIMessage[] = data.messages.map((m) => ({ role: m.role, content: m.content }));

    const res = await runChat({
      workspaceId: c.workspaceId,
      userId: c.userId,
      feature: "portal_assistant",
      request: {
        model: await resolveDefaultModel(c.workspaceId),
        messages: [{ role: "system", content: system }, ...messages],
        temperature: 0.3,
        max_tokens: 900,
      },
    });

    // Parse handoff suggestion out of the reply.
    let reply = res.content ?? "";
    let handoffReason: string | null = null;
    const m = reply.match(/HANDOFF_SUGGESTED:\s*(.+)$/m);
    if (m) {
      handoffReason = m[1].trim();
      reply = reply.replace(/\n?HANDOFF_SUGGESTED:.*$/m, "").trim();
    }

    return {
      reply,
      handoffReason,
      contextSummary: {
        orders: bundle.orders.length,
        invoices: bundle.invoices.length,
        appointments: bundle.appointments.length,
        tickets: bundle.tickets.length,
      },
      providerKind: res.providerKind,
    };
  });

/* -------------------------------------------------------------------------- */
/* Human handoff — creates a ticket seeded with the conversation summary       */
/* -------------------------------------------------------------------------- */

export const assistantHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        reason: z.string().trim().min(3).max(400),
        transcript: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().min(1).max(4000),
            }),
          )
          .min(1)
          .max(30),
        priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

    const summary = data.transcript
      .map((m) => `${m.role === "user" ? "Customer" : "AI"}: ${m.content}`)
      .join("\n\n")
      .slice(0, 3800);
    const subject = `AI handoff: ${data.reason.slice(0, 120)}`;

    const { data: conv, error } = await sbAny(supabaseAdmin)
      .from("conversations")
      .insert({
        workspace_id: c.workspaceId,
        contact_id: c.contactId,
        subject,
        channel: "webchat",
        status: "open",
        priority: data.priority,
        last_message_at: new Date().toISOString(),
        last_message_preview: data.reason.slice(0, 160),
        metadata: { source: "ai_assistant_handoff", reason: data.reason },
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const conversationId = (conv as { id: string }).id;
    await sbAny(supabaseAdmin)
      .from("messages")
      .insert({
        conversation_id: conversationId,
        workspace_id: c.workspaceId,
        direction: "inbound",
        message_type: "text",
        body: `[AI assistant handoff]\n\nReason: ${data.reason}\n\n---\nConversation transcript:\n\n${summary}`,
        status: "delivered",
        is_internal: false,
      } as never);

    return { ticketId: conversationId };
  });
