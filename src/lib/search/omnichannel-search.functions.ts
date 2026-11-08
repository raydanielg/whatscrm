/**
 * Global Omnichannel Search — searches across every customer-facing entity
 * (messages, customers, phone numbers, emails, deals, invoices, tasks,
 * campaigns, KB, attachments, media, voice notes, documents) with rich
 * filters (channel, date range, agent, priority, tag, language, status).
 *
 * Optimised for "instant" latency: every entity query runs in parallel,
 * each capped at a small hit limit, and only lightweight columns are read.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { resolveWorkspaceCurrency } from "@/lib/currency/resolve.server";

// ==================== Types ====================

export type OmniCategory =
  | "messages"
  | "customers"
  | "phone_numbers"
  | "emails"
  | "deals"
  | "invoices"
  | "tasks"
  | "campaigns"
  | "knowledge"
  | "attachments"
  | "media"
  | "voice_notes"
  | "documents";

export interface OmniHit {
  id: string;
  category: OmniCategory;
  title: string;
  subtitle: string | null;
  extra: string | null;
  href: string;
  createdAt: string | null;
  meta: {
    channel?: string | null;
    status?: string | null;
    priority?: string | null;
    language?: string | null;
    agent?: string | null;
    tags?: string[] | null;
    mimeType?: string | null;
  };
}

export interface OmniSearchFilters {
  channel?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  agentId?: string | null;
  priority?: string | null;
  tag?: string | null;
  language?: string | null;
  status?: string | null;
}

export interface OmniSearchResult {
  query: string;
  totalHits: number;
  tookMs: number;
  groups: Record<OmniCategory, OmniHit[]>;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ==================== Helpers ====================

const HIT_LIMIT = 12;

function esc(v: string) {
  return v.replace(/[%_,]/g, (m) => `\\${m}`);
}

function emptyGroups(): Record<OmniCategory, OmniHit[]> {
  return {
    messages: [],
    customers: [],
    phone_numbers: [],
    emails: [],
    deals: [],
    invoices: [],
    tasks: [],
    campaigns: [],
    knowledge: [],
    attachments: [],
    media: [],
    voice_notes: [],
    documents: [],
  };
}

// mime helpers
const isImage = (m: string | null | undefined) => !!m && m.startsWith("image/");
const isVideo = (m: string | null | undefined) => !!m && m.startsWith("video/");
const isAudio = (m: string | null | undefined) => !!m && m.startsWith("audio/");
const isDoc = (m: string | null | undefined) =>
  !!m && (m.startsWith("application/") || m.startsWith("text/"));

// ==================== Server function ====================

const filtersSchema = z.object({
  channel: z.string().nullish(),
  dateFrom: z.string().nullish(),
  dateTo: z.string().nullish(),
  agentId: z.string().nullish(),
  priority: z.string().nullish(),
  tag: z.string().nullish(),
  language: z.string().nullish(),
  status: z.string().nullish(),
});

export const omnichannelSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        query: z.string().min(1).max(300),
        category: z.string().optional().default("all"),
        filters: filtersSchema.optional().default({}),
        page: z.number().int().min(1).optional().default(1),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<OmniSearchResult> => {
    const started = Date.now();
    const { supabase } = context;
    const ws = data.workspaceId;
    // Labels a deal that carries no currency of its own — see global-search.
    const fallbackCurrency = await resolveWorkspaceCurrency(ws);
    const q = data.query.trim();
    const like = `%${sanitizeSearchTerm(esc(q))}%`;
    const f = data.filters ?? {};
    const cat = data.category;
    const wants = (c: OmniCategory) => cat === "all" || cat === c;
    // Pagination only applies once a single category is selected — the "all"
    // overview mixes every category's top hits and isn't a page-able list.
    const paged = cat !== "all";
    const page = paged ? data.page : 1;
    const pageOffset = (page - 1) * HIT_LIMIT;
    // Fetches one extra row beyond the page when paged, so `hasMore` can be
    // derived from the raw count before the final HIT_LIMIT slice below.
    const rangeFor = (multiplier: number) => {
      const size = HIT_LIMIT * multiplier + (paged ? 1 : 0);
      const from = paged ? pageOffset : 0;
      const to = paged ? pageOffset + size - 1 : size - 1;
      return { from, to };
    };

    // ---------- Customers / phones / emails (all from `contacts`) ----------
    const contactsP =
      wants("customers") || wants("phone_numbers") || wants("emails")
        ? (() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let qb: any = supabase
              .from("contacts")
              .select("id, name, email, phone, tags, status, created_at, updated_at")
              .eq("workspace_id", ws)
              .or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
              .range(rangeFor(2).from, rangeFor(2).to);
            if (f.status) qb = qb.eq("status", f.status);
            if (f.tag) qb = qb.contains("tags", [f.tag]);
            if (f.dateFrom) qb = qb.gte("created_at", f.dateFrom);
            if (f.dateTo) qb = qb.lte("created_at", f.dateTo);
            return qb;
          })()
        : Promise.resolve({ data: [] });

    // ---------- Messages (join conversation for channel/agent) ----------
    const messagesP = wants("messages")
      ? (() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let qb: any = supabase
            .from("messages")
            .select(
              "id, body, status, created_at, conversation_id, media_type, conversations!inner(channel, priority, status, assigned_to, subject)",
            )
            .eq("workspace_id", ws)
            .ilike("body", like)
            .order("created_at", { ascending: false })
            .range(rangeFor(1).from, rangeFor(1).to);
          if (f.status) qb = qb.eq("status", f.status);
          if (f.dateFrom) qb = qb.gte("created_at", f.dateFrom);
          if (f.dateTo) qb = qb.lte("created_at", f.dateTo);
          if (f.channel) qb = qb.eq("conversations.channel", f.channel);
          if (f.priority) qb = qb.eq("conversations.priority", f.priority);
          if (f.agentId) qb = qb.eq("conversations.assigned_to", f.agentId);
          return qb;
        })()
      : Promise.resolve({ data: [] });

    // ---------- Deals (also serves as "orders") ----------
    const dealsP = wants("deals")
      ? (() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let qb: any = supabase
            .from("deals")
            .select("id, title, amount, currency, status, priority, tags, created_at")
            .eq("workspace_id", ws)
            .or(`title.ilike.${like},description.ilike.${like}`)
            .order("updated_at", { ascending: false })
            .range(rangeFor(1).from, rangeFor(1).to);
          if (f.status) qb = qb.eq("status", f.status);
          if (f.priority) qb = qb.eq("priority", f.priority);
          if (f.tag) qb = qb.contains("tags", [f.tag]);
          if (f.dateFrom) qb = qb.gte("created_at", f.dateFrom);
          if (f.dateTo) qb = qb.lte("created_at", f.dateTo);
          return qb;
        })()
      : Promise.resolve({ data: [] });

    // ---------- Invoices ----------
    const invoicesP = wants("invoices")
      ? (() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let qb: any = supabase
            .from("invoices")
            .select("id, invoice_number, status, currency, due_date, created_at")
            .eq("workspace_id", ws)
            .ilike("invoice_number", like)
            .order("created_at", { ascending: false })
            .range(rangeFor(1).from, rangeFor(1).to);
          if (f.status) qb = qb.eq("status", f.status);
          if (f.dateFrom) qb = qb.gte("created_at", f.dateFrom);
          if (f.dateTo) qb = qb.lte("created_at", f.dateTo);
          return qb;
        })()
      : Promise.resolve({ data: [] });

    // ---------- Tasks ----------
    const tasksP = wants("tasks")
      ? (() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let qb: any = supabase
            .from("tasks")
            .select(
              "id, title, description, status, priority, due_at, assigned_to, tags, created_at",
            )
            .eq("workspace_id", ws)
            .or(`title.ilike.${like},description.ilike.${like}`)
            .order("updated_at", { ascending: false })
            .range(rangeFor(1).from, rangeFor(1).to);
          if (f.status) qb = qb.eq("status", f.status);
          if (f.priority) qb = qb.eq("priority", f.priority);
          if (f.agentId) qb = qb.eq("assigned_to", f.agentId);
          if (f.tag) qb = qb.contains("tags", [f.tag]);
          if (f.dateFrom) qb = qb.gte("created_at", f.dateFrom);
          if (f.dateTo) qb = qb.lte("created_at", f.dateTo);
          return qb;
        })()
      : Promise.resolve({ data: [] });

    // ---------- Campaigns ----------
    const campaignsP = wants("campaigns")
      ? (() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let qb: any = supabase
            .from("campaigns")
            .select("id, name, description, status, type, channel, created_at")
            .eq("workspace_id", ws)
            .or(`name.ilike.${like},description.ilike.${like}`)
            .order("updated_at", { ascending: false })
            .range(rangeFor(1).from, rangeFor(1).to);
          if (f.status) qb = qb.eq("status", f.status);
          if (f.channel) qb = qb.eq("channel", f.channel);
          if (f.dateFrom) qb = qb.gte("created_at", f.dateFrom);
          if (f.dateTo) qb = qb.lte("created_at", f.dateTo);
          return qb;
        })()
      : Promise.resolve({ data: [] });

    // ---------- Knowledge Base ----------
    const kbP = wants("knowledge")
      ? (() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let qb: any = supabase
            .from("kb_articles")
            .select("id, title, summary, status, tags, language, created_at")
            .eq("workspace_id", ws)
            .or(`title.ilike.${like},summary.ilike.${like}`)
            .order("updated_at", { ascending: false })
            .range(rangeFor(1).from, rangeFor(1).to);
          if (f.status) qb = qb.eq("status", f.status);
          if (f.language) qb = qb.eq("language", f.language);
          if (f.tag) qb = qb.contains("tags", [f.tag]);
          if (f.dateFrom) qb = qb.gte("created_at", f.dateFrom);
          if (f.dateTo) qb = qb.lte("created_at", f.dateTo);
          return qb;
        })()
      : Promise.resolve({ data: [] });

    // ---------- Attachments / Media / Voice Notes / Documents ----------
    const attachP =
      wants("attachments") || wants("media") || wants("voice_notes") || wants("documents")
        ? (() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let qb: any = supabase
              .from("message_attachments")
              .select("id, file_name, mime_type, created_at")
              .eq("workspace_id", ws)
              .or(`file_name.ilike.${like},mime_type.ilike.${like}`)
              .order("created_at", { ascending: false })
              .range(rangeFor(3).from, rangeFor(3).to);
            if (f.dateFrom) qb = qb.gte("created_at", f.dateFrom);
            if (f.dateTo) qb = qb.lte("created_at", f.dateTo);
            return qb;
          })()
        : Promise.resolve({ data: [] });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [contacts, messages, deals, invoices, tasks, campaigns, kb, atts] = (await Promise.all([
      contactsP,
      messagesP,
      dealsP,
      invoicesP,
      tasksP,
      campaignsP,
      kbP,
      attachP,
    ])) as any;

    const groups = emptyGroups();

    // Customers / Phone / Email splits
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (contacts.data ?? []) as any[]) {
      const base = {
        id: r.id,
        title: r.name || r.email || r.phone || "Customer",
        createdAt: r.created_at ?? null,
        href: `/contacts/${r.id}`,
        meta: { status: r.status, tags: r.tags ?? null },
      };
      if (wants("customers")) {
        groups.customers.push({
          ...base,
          category: "customers",
          subtitle: r.email ?? null,
          extra: r.phone ?? null,
        });
      }
      if (
        wants("phone_numbers") &&
        r.phone &&
        String(r.phone).toLowerCase().includes(q.toLowerCase())
      ) {
        groups.phone_numbers.push({
          ...base,
          category: "phone_numbers",
          title: r.phone,
          subtitle: r.name ?? null,
          extra: r.email ?? null,
        });
      }
      if (wants("emails") && r.email && String(r.email).toLowerCase().includes(q.toLowerCase())) {
        groups.emails.push({
          ...base,
          category: "emails",
          title: r.email,
          subtitle: r.name ?? null,
          extra: r.phone ?? null,
        });
      }
    }

    // Messages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (messages.data ?? []) as any[]) {
      const c = r.conversations ?? {};
      groups.messages.push({
        id: r.id,
        category: "messages",
        title: (r.body ?? "").slice(0, 140) || "(no text)",
        subtitle: c.subject ?? null,
        extra: [c.channel, r.status].filter(Boolean).join(" · ") || null,
        createdAt: r.created_at ?? null,
        href: `/inbox?conversationId=${r.conversation_id}&message=${r.id}`,
        meta: {
          channel: c.channel ?? null,
          status: r.status ?? null,
          priority: c.priority ?? null,
          agent: c.assigned_to ?? null,
        },
      });
    }

    // Deals
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (deals.data ?? []) as any[]) {
      groups.deals.push({
        id: r.id,
        category: "deals",
        title: r.title,
        subtitle: `${r.currency ?? fallbackCurrency} ${Number(r.amount ?? 0).toLocaleString()}`,
        extra: [r.status, r.priority].filter(Boolean).join(" · ") || null,
        createdAt: r.created_at ?? null,
        href: `/deals`,
        meta: { status: r.status, priority: r.priority, tags: r.tags ?? null },
      });
    }

    // Invoices
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (invoices.data ?? []) as any[]) {
      groups.invoices.push({
        id: r.id,
        category: "invoices",
        title: r.invoice_number ?? "Invoice",
        subtitle: r.status ?? null,
        extra: r.due_date
          ? `Due ${new Date(r.due_date).toLocaleDateString()}`
          : (r.currency ?? null),
        createdAt: r.created_at ?? null,
        href: `/billing-documents`,
        meta: { status: r.status ?? null },
      });
    }

    // Tasks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (tasks.data ?? []) as any[]) {
      groups.tasks.push({
        id: r.id,
        category: "tasks",
        title: r.title,
        subtitle: (r.description ?? "").slice(0, 120) || null,
        extra: [r.status, r.priority].filter(Boolean).join(" · ") || null,
        createdAt: r.created_at ?? null,
        href: `/tasks`,
        meta: {
          status: r.status,
          priority: r.priority,
          agent: r.assigned_to ?? null,
          tags: r.tags ?? null,
        },
      });
    }

    // Campaigns
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (campaigns.data ?? []) as any[]) {
      groups.campaigns.push({
        id: r.id,
        category: "campaigns",
        title: r.name,
        subtitle: (r.description ?? "").slice(0, 120) || null,
        extra: [r.channel, r.type, r.status].filter(Boolean).join(" · ") || null,
        createdAt: r.created_at ?? null,
        href: `/campaigns`,
        meta: { channel: r.channel ?? null, status: r.status ?? null },
      });
    }

    // Knowledge
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (kb.data ?? []) as any[]) {
      groups.knowledge.push({
        id: r.id,
        category: "knowledge",
        title: r.title,
        subtitle: (r.summary ?? "").slice(0, 140) || null,
        extra: [r.language, r.status].filter(Boolean).join(" · ") || null,
        createdAt: r.created_at ?? null,
        href: `/knowledge?article=${r.id}`,
        meta: { language: r.language ?? null, status: r.status ?? null, tags: r.tags ?? null },
      });
    }

    // Attachments split
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (atts.data ?? []) as any[]) {
      const mime: string | null = r.mime_type ?? null;
      const hit: OmniHit = {
        id: r.id,
        category: "attachments",
        title: r.file_name ?? "Attachment",
        subtitle: mime,
        extra: null,
        createdAt: r.created_at ?? null,
        href: `/inbox`,
        meta: { mimeType: mime },
      };
      if (wants("attachments")) groups.attachments.push(hit);
      if (wants("media") && (isImage(mime) || isVideo(mime))) {
        groups.media.push({ ...hit, category: "media" });
      }
      if (wants("voice_notes") && isAudio(mime)) {
        groups.voice_notes.push({ ...hit, category: "voice_notes" });
      }
      if (wants("documents") && isDoc(mime) && !isImage(mime) && !isVideo(mime) && !isAudio(mime)) {
        groups.documents.push({ ...hit, category: "documents" });
      }
    }

    // A full page for the active category means there may be more beyond it.
    const hasMore = paged ? groups[cat as OmniCategory].length > HIT_LIMIT : false;

    // Cap every group to the hit limit
    (Object.keys(groups) as OmniCategory[]).forEach((k) => {
      groups[k] = groups[k].slice(0, HIT_LIMIT);
    });

    const totalHits = (Object.keys(groups) as OmniCategory[]).reduce(
      (n, k) => n + groups[k].length,
      0,
    );

    return {
      query: q,
      totalHits,
      tookMs: Date.now() - started,
      groups,
      page,
      pageSize: HIT_LIMIT,
      hasMore,
    };
  });
