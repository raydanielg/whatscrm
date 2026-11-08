/**
 * Action tools for the AI Conversation Engine.
 *
 * Every tool follows a common contract:
 *   - a Zod `inputSchema` (no min/max/format constraints — see ai-sdk-agent-patterns)
 *   - an `execute()` that returns a plain, serialisable object
 *   - runs against the RLS-scoped `ctx.supabase` client (no service role)
 *   - is audit-logged to `ai_tool_executions`
 *
 * To add a new action:
 *   1. Add it to `buildActionTools()` below with a clear description.
 *   2. Add a catalog entry to `ACTION_TOOL_CATALOG`.
 *   3. That's it — it is auto-registered, auto-audited, auto-toggleable.
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { ToolContext } from "./tools.server";
import { sbAny } from "@/lib/supabase/untyped";
import { resolveWorkspaceCurrency } from "@/lib/currency/resolve.server";

/** Wrap an executor with audit logging + uniform error handling. */
function auditable<Args, Out>(
  ctx: ToolContext,
  name: string,
  fn: (args: Args) => Promise<Out>,
) {
  return async (args: Args) => {
    const started = Date.now();
    let output: unknown = null;
    let success = true;
    let error: string | null = null;
    try {
      const result = await fn(args);
      output = result;
      return result;
    } catch (e) {
      success = false;
      error = e instanceof Error ? e.message : String(e);
      output = { error };
      return { error } as Out;
    } finally {
      try {
        await sbAny(ctx.supabase).from("ai_tool_executions" as never).insert({
          workspace_id: ctx.workspaceId,
          conversation_id: ctx.conversationId,
          user_id: ctx.userId,
          tool_name: name,
          input: args as never,
          output: output as never,
          success,
          error,
          duration_ms: Date.now() - started,
        } as never);
      } catch {
        /* never fail the tool because auditing failed */
      }
    }
  };
}

const nn = <T extends z.ZodTypeAny>(s: T) => s.nullable();

// Explicit `ToolSet` return type: without it TypeScript infers a giant
// structural type for every tool schema/executor, which dominates typecheck
// time here and again at each `streamText` call site.
export function buildActionTools(ctx: ToolContext): ToolSet {
  const wsFilter = { workspace_id: ctx.workspaceId };

  return {
    // ─── Contacts ─────────────────────────────────────────────────────────
    create_contact: tool({
      description: "Create a new contact in the CRM.",
      inputSchema: z.object({
        name: z.string(),
        email: nn(z.string()),
        phone: nn(z.string()),
        company: nn(z.string()),
        tags: nn(z.array(z.string())),
        notes: nn(z.string()),
      }),
      execute: auditable(ctx, "create_contact", async (a) => {
        const { data, error } = await ctx.supabase
          .from("contacts" as never)
          .insert({
            ...wsFilter,
            name: a.name,
            email: a.email,
            phone: a.phone,
            tags: a.tags ?? [],
            notes: a.notes,
          } as never)
          .select("id,name,email,phone")
          .single();
        if (error) throw new Error(error.message);
        return { contact: data };
      }),
    }),

    update_contact: tool({
      description: "Update an existing contact by id. Only provided fields are changed.",
      inputSchema: z.object({
        contact_id: z.string(),
        name: nn(z.string()),
        email: nn(z.string()),
        phone: nn(z.string()),
        tags: nn(z.array(z.string())),
        notes: nn(z.string()),
      }),
      execute: auditable(ctx, "update_contact", async (a) => {
        const patch: Record<string, unknown> = {};
        for (const k of ["name", "email", "phone", "tags", "notes"] as const) {
          if (a[k] !== null && a[k] !== undefined) patch[k] = a[k];
        }
        const { data, error } = await ctx.supabase
          .from("contacts" as never)
          .update(patch as never)
          .eq("id", a.contact_id)
          .eq("workspace_id", ctx.workspaceId)
          .select("id,name,email,phone")
          .single();
        if (error) throw new Error(error.message);
        return { contact: data };
      }),
    }),

    // ─── Leads / Deals ────────────────────────────────────────────────────
    create_lead: tool({
      description: "Create a new sales lead.",
      inputSchema: z.object({
        first_name: nn(z.string()),
        last_name: nn(z.string()),
        email: nn(z.string()),
        phone: nn(z.string()),
        company_name: nn(z.string()),
        source: nn(z.string()),
        notes: nn(z.string()),
      }),
      execute: auditable(ctx, "create_lead", async (a) => {
        const { data, error } = await ctx.supabase
          .from("leads" as never)
          .insert({ ...wsFilter, ...a, created_by: ctx.userId } as never)
          .select("id,first_name,last_name,email,status")
          .single();
        if (error) throw new Error(error.message);
        return { lead: data };
      }),
    }),

    create_deal: tool({
      description: "Create a new deal in the sales pipeline.",
      inputSchema: z.object({
        title: z.string(),
        amount: nn(z.number()),
        currency: nn(z.string()),
        contact_id: nn(z.string()),
        company_id: nn(z.string()),
        pipeline_id: nn(z.string()),
        stage_id: nn(z.string()),
        expected_close_date: nn(z.string()),
        priority: nn(z.string()),
        description: nn(z.string()),
      }),
      execute: auditable(ctx, "create_deal", async (a) => {
        const { data, error } = await ctx.supabase
          .from("deals" as never)
          .insert({
            ...wsFilter,
            title: a.title,
            amount: a.amount ?? 0,
            // The assistant creates a real deal row; a hardcoded "USD" here
            // wrote dollars into the tenant's pipeline on every AI action.
            currency: a.currency ?? (await resolveWorkspaceCurrency(ctx.workspaceId)),
            contact_id: a.contact_id,
            company_id: a.company_id,
            pipeline_id: a.pipeline_id,
            stage_id: a.stage_id,
            expected_close_date: a.expected_close_date,
            priority: a.priority ?? "normal",
            description: a.description,
            owner_id: ctx.userId,
            created_by: ctx.userId,
          } as never)
          .select("id,title,amount,currency,status")
          .single();
        if (error) throw new Error(error.message);
        return { deal: data };
      }),
    }),

    // ─── Tasks / Notes / Appointments ─────────────────────────────────────
    create_task: tool({
      description: "Create a task for an agent or the assigned owner.",
      inputSchema: z.object({
        title: z.string(),
        description: nn(z.string()),
        due_at: nn(z.string()),
        priority: nn(z.string()),
        assigned_to: nn(z.string()),
        entity_type: nn(z.string()),
        entity_id: nn(z.string()),
      }),
      execute: auditable(ctx, "create_task", async (a) => {
        const { data, error } = await ctx.supabase
          .from("tasks" as never)
          .insert({
            ...wsFilter,
            title: a.title,
            description: a.description,
            due_at: a.due_at,
            priority: a.priority ?? "normal",
            assigned_to: a.assigned_to,
            entity_type: a.entity_type,
            entity_id: a.entity_id,
            owner_id: ctx.userId,
            created_by: ctx.userId,
          } as never)
          .select("id,title,status,due_at")
          .single();
        if (error) throw new Error(error.message);
        return { task: data };
      }),
    }),

    create_note: tool({
      description: "Attach an internal note to a contact/company/lead/deal/task.",
      inputSchema: z.object({
        entity_type: z.enum(["contact", "company", "lead", "deal", "task"]),
        entity_id: z.string(),
        body: z.string(),
        is_pinned: nn(z.boolean()),
      }),
      execute: auditable(ctx, "create_note", async (a) => {
        const { data, error } = await ctx.supabase
          .from("notes" as never)
          .insert({
            ...wsFilter,
            entity_type: a.entity_type,
            entity_id: a.entity_id,
            body: a.body,
            is_pinned: a.is_pinned ?? false,
            author_id: ctx.userId,
          } as never)
          .select("id,entity_type,entity_id,is_pinned")
          .single();
        if (error) throw new Error(error.message);
        return { note: data };
      }),
    }),

    book_appointment: tool({
      description: "Book an appointment / meeting. Stored as a scheduled task with priority=meeting.",
      inputSchema: z.object({
        title: z.string(),
        start_at: z.string(),
        duration_minutes: nn(z.number()),
        contact_id: nn(z.string()),
        assigned_to: nn(z.string()),
        location: nn(z.string()),
        notes: nn(z.string()),
      }),
      execute: auditable(ctx, "book_appointment", async (a) => {
        const description = [a.location && `Location: ${a.location}`, a.notes]
          .filter(Boolean)
          .join("\n");
        const { data, error } = await ctx.supabase
          .from("tasks" as never)
          .insert({
            ...wsFilter,
            title: a.title,
            description,
            due_at: a.start_at,
            priority: "meeting",
            assigned_to: a.assigned_to,
            entity_type: a.contact_id ? "contact" : null,
            entity_id: a.contact_id,
            custom_fields: {
              kind: "appointment",
              duration_minutes: a.duration_minutes ?? 30,
              location: a.location,
            },
            owner_id: ctx.userId,
            created_by: ctx.userId,
          } as never)
          .select("id,title,due_at")
          .single();
        if (error) throw new Error(error.message);
        return { appointment: data };
      }),
    }),

    list_meeting_slots: tool({
      description:
        "List the next available meeting slots for a booking event type. Use this before proposing times to a customer.",
      inputSchema: z.object({
        event_type_slug: z.string(),
        from_date: nn(z.string()),
        days: nn(z.number()),
      }),
      execute: auditable(ctx, "list_meeting_slots", async (a) => {
        const { data: et } = await ctx.supabase
          .from("booking_event_types" as never)
          .select("id, duration_minutes, min_notice_minutes, buffer_before_minutes, buffer_after_minutes, is_active")
          .eq("slug", a.event_type_slug)
          .maybeSingle();
        const et2 = et as { id: string; duration_minutes: number; is_active: boolean } | null;
        if (!et2 || !et2.is_active) throw new Error("event_type_not_found");
        const from = a.from_date ? new Date(a.from_date) : new Date();
        const days = Math.min(Math.max(a.days ?? 7, 1), 30);
        const to = new Date(from.getTime() + days * 24 * 3600 * 1000);
        const { data: appts } = await ctx.supabase
          .from("booking_appointments" as never)
          .select("start_at, end_at, host_id")
          .eq("event_type_id", et2.id)
          .in("status", ["pending", "confirmed"])
          .gte("start_at", from.toISOString())
          .lte("start_at", to.toISOString());
        return {
          event_type_id: et2.id,
          duration_minutes: et2.duration_minutes,
          window: { from: from.toISOString(), to: to.toISOString() },
          existing_bookings: appts ?? [],
        };
      }),
    }),

    book_meeting: tool({
      description:
        "Book a real appointment against a booking event type. Prefer this over `book_appointment` when scheduling for a customer.",
      inputSchema: z.object({
        event_type_id: z.string(),
        start_at: z.string(),
        end_at: z.string(),
        customer_name: z.string(),
        customer_email: nn(z.string()),
        customer_phone: nn(z.string()),
        customer_timezone: nn(z.string()),
        answers: nn(z.record(z.any())),
        source_channel: nn(z.string()),
      }),
      execute: auditable(ctx, "book_meeting", async (a) => {
        // Pick a host that isn't busy
        const { data: hostRows } = await ctx.supabase
          .from("booking_event_type_hosts" as never)
          .select("host_id, priority, strategy, created_at")
          .eq("event_type_id", a.event_type_id);
        const rows = (hostRows ?? []) as Array<{ host_id: string; priority: number | null; strategy: string; created_at: string }>;
        if (!rows.length) throw new Error("no_host_configured");
        const { data: conflicts } = await ctx.supabase
          .from("booking_appointments" as never)
          .select("host_id")
          .in("host_id", rows.map((h) => h.host_id))
          .lt("start_at", a.end_at)
          .gt("end_at", a.start_at)
          .in("status", ["pending", "confirmed"]);
        const busy = new Set(((conflicts ?? []) as Array<{ host_id: string }>).map((c) => c.host_id));
        const free = rows.filter((h) => !busy.has(h.host_id));
        if (!free.length) throw new Error("slot_taken");
        const host = free[0];

        const { data, error } = await ctx.supabase
          .from("booking_appointments" as never)
          .insert({
            ...wsFilter,
            event_type_id: a.event_type_id,
            host_id: host.host_id,
            customer_name: a.customer_name,
            customer_email: a.customer_email,
            customer_phone: a.customer_phone,
            customer_timezone: a.customer_timezone ?? "UTC",
            start_at: a.start_at,
            end_at: a.end_at,
            answers: a.answers ?? {},
            source_channel: a.source_channel ?? "ai_assistant",
            status: "confirmed",
          } as never)
          .select("id, host_id, start_at, end_at, manage_token, join_url")
          .single();
        if (error) throw new Error(error.message);
        return { appointment: data };
      }),
    }),

    cancel_meeting: tool({
      description: "Cancel an existing booking appointment.",
      inputSchema: z.object({
        appointment_id: z.string(),
        reason: nn(z.string()),
      }),
      execute: auditable(ctx, "cancel_meeting", async (a) => {
        const { data, error } = await ctx.supabase
          .from("booking_appointments" as never)
          .update({ status: "cancelled", cancellation_reason: a.reason ?? null } as never)
          .eq("id", a.appointment_id)
          .select("id, status")
          .single();
        if (error) throw new Error(error.message);
        return { appointment: data };
      }),
    }),

    // ─── Messaging ────────────────────────────────────────────────────────
    send_whatsapp: tool({
      description: "Queue an outbound WhatsApp message via the messaging outbox.",
      inputSchema: z.object({
        channel_account_id: z.string(),
        to: z.string(),
        body: z.string(),
        conversation_id: nn(z.string()),
      }),
      execute: auditable(ctx, "send_whatsapp", async (a) => {
        const { data, error } = await ctx.supabase
          .from("message_outbox" as never)
          .insert({
            ...wsFilter,
            channel_account_id: a.channel_account_id,
            conversation_id: a.conversation_id ?? ctx.conversationId,
            provider: "whatsapp_cloud",
            to_address: a.to,
            payload: { type: "text", text: { body: a.body } },
          } as never)
          .select("id,status")
          .single();
        if (error) throw new Error(error.message);
        return { queued: data };
      }),
    }),

    send_email: tool({
      description: "Queue an outbound email.",
      inputSchema: z.object({
        channel_account_id: z.string(),
        to: z.string(),
        subject: z.string(),
        body: z.string(),
        html: nn(z.boolean()),
      }),
      execute: auditable(ctx, "send_email", async (a) => {
        const { data, error } = await ctx.supabase
          .from("message_outbox" as never)
          .insert({
            ...wsFilter,
            channel_account_id: a.channel_account_id,
            provider: "email",
            to_address: a.to,
            payload: {
              subject: a.subject,
              [a.html ? "html" : "text"]: a.body,
            },
          } as never)
          .select("id,status")
          .single();
        if (error) throw new Error(error.message);
        return { queued: data };
      }),
    }),

    // ─── Commerce ─────────────────────────────────────────────────────────
    generate_invoice: tool({
      description: "Create a draft invoice. Add line items separately if needed.",
      inputSchema: z.object({
        contact_id: nn(z.string()),
        company_id: nn(z.string()),
        currency: nn(z.string()),
        subtotal: z.number(),
        tax_total: nn(z.number()),
        due_date: nn(z.string()),
        notes: nn(z.string()),
      }),
      execute: auditable(ctx, "generate_invoice", async (a) => {
        const number = `INV-${Date.now().toString(36).toUpperCase()}`;
        const total = a.subtotal + (a.tax_total ?? 0);
        const { data, error } = await ctx.supabase
          .from("invoices" as never)
          .insert({
            ...wsFilter,
            invoice_number: number,
            contact_id: a.contact_id,
            company_id: a.company_id,
            // Same for invoices the assistant raises.
            currency: a.currency ?? (await resolveWorkspaceCurrency(ctx.workspaceId)),
            subtotal: a.subtotal,
            tax_total: a.tax_total ?? 0,
            total,
            amount_due: total,
            due_date: a.due_date,
            notes: a.notes,
            owner_id: ctx.userId,
            status: "draft",
          } as never)
          .select("id,invoice_number,total,status")
          .single();
        if (error) throw new Error(error.message);
        return { invoice: data };
      }),
    }),

    check_order: tool({
      description: "Look up an order / invoice by invoice number or id and return its status and balance.",
      inputSchema: z.object({
        reference: z.string(),
      }),
      execute: auditable(ctx, "check_order", async (a) => {
        const q = a.reference.trim();
        const { data, error } = await ctx.supabase
          .from("invoices" as never)
          .select("id,invoice_number,status,total,amount_paid,amount_due,currency,due_date")
          .eq("workspace_id", ctx.workspaceId)
          .or(`id.eq.${q},invoice_number.eq.${q}`)
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return { found: false };
        return { found: true, order: data };
      }),
    }),

    // ─── Generic CRM update ───────────────────────────────────────────────
    update_crm: tool({
      description:
        "Generic patch for a CRM record. `entity` is one of contact, lead, deal, task. `fields` are the columns to update.",
      inputSchema: z.object({
        entity: z.enum(["contact", "lead", "deal", "task"]),
        id: z.string(),
        fields: z.record(z.string(), z.unknown()),
      }),
      execute: auditable(ctx, "update_crm", async (a) => {
        const table = ({
          contact: "contacts",
          lead: "leads",
          deal: "deals",
          task: "tasks",
        } as const)[a.entity];
        const { data, error } = await ctx.supabase
          .from(table as never)
          .update(a.fields as never)
          .eq("id", a.id)
          .eq("workspace_id", ctx.workspaceId)
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        return { updated: data };
      }),
    }),

    // ─── Automation ───────────────────────────────────────────────────────
    run_workflow: tool({
      description: "Enqueue a saved workflow / automation to run with a JSON input payload.",
      inputSchema: z.object({
        automation_id: z.string(),
        input: nn(z.record(z.string(), z.unknown())),
        priority: nn(z.number()),
      }),
      execute: auditable(ctx, "run_workflow", async (a) => {
        const { data, error } = await ctx.supabase
          .from("workflow_queue" as never)
          .insert({
            ...wsFilter,
            automation_id: a.automation_id,
            trigger_source: "ai_tool",
            input: a.input ?? {},
            priority: a.priority ?? 5,
          } as never)
          .select("id,status,run_at")
          .single();
        if (error) throw new Error(error.message);
        return { queued: data };
      }),
    }),

    // ─── External I/O ─────────────────────────────────────────────────────
    webhook_call: tool({
      description:
        "Fire a JSON POST to an outbound webhook URL. Use for notifying an external system.",
      inputSchema: z.object({
        url: z.string(),
        body: z.record(z.string(), z.unknown()),
        headers: nn(z.record(z.string(), z.string())),
      }),
      execute: auditable(ctx, "webhook_call", async (a) => {
        await assertPublicUrl(a.url);

        const res = await fetch(a.url, {
          method: "POST",
          headers: { "content-type": "application/json", ...(a.headers ?? {}) },
          body: JSON.stringify(a.body),
          signal: AbortSignal.timeout(15_000),
        });
        return { status: res.status, ok: res.ok };
      }),
    }),

    http_request: tool({
      description: "Perform a generic HTTP request and return the response.",
      inputSchema: z.object({
        url: z.string(),
        method: nn(z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"])),
        headers: nn(z.record(z.string(), z.string())),
        body: nn(z.string()),
      }),
      execute: auditable(ctx, "http_request", async (a) => {
        await assertPublicUrl(a.url);

        const res = await fetch(a.url, {
          method: a.method ?? "GET",
          headers: a.headers ?? undefined,
          body: a.body ?? undefined,
          signal: AbortSignal.timeout(15_000),
        });
        const text = await res.text();
        return {
          status: res.status,
          ok: res.ok,
          body: text.slice(0, 8_000),
          truncated: text.length > 8_000,
        };
      }),
    }),
  } as const;
}

/** Block localhost / private IP ranges so tool-calls can't SSRF the internal network. */
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h.endsWith(".local")) return true;
  // IPv6 loopback / link-local / unique local
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  // IPv4 loopback + RFC1918 + link-local + CGNAT
  return /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h) ||
    /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./.test(h);
}

async function assertPublicUrl(raw: string) {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Invalid URL"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  const host = u.hostname.toLowerCase();
  if (isPrivateHost(host)) {
    throw new Error("Private / loopback hosts are not allowed");
  }
  // DNS-rebind guard: resolve the hostname and verify every returned IP is public.
  // Skip when the host is already an IP literal (checked above).
  try {
    const dns = await import("dns/promises");
    const addrs = await dns.lookup(host, { all: true }).catch(() => []);
    for (const a of addrs) {
      if (isPrivateHost(a.address)) {
        throw new Error("Host resolves to a private / loopback address");
      }
    }
  } catch (e) {
    // If the error is our own rebind check, re-throw. Otherwise fail-open on
    // environments without dns (e.g. some edge runtimes) — the hostname
    // check above already blocks obvious cases.
    if ((e as Error).message?.includes("private")) throw e;
  }
}


/** Client-safe metadata for the tool picker / settings UI. */
export const ACTION_TOOL_CATALOG = [
  { name: "create_contact",    label: "Create Contact",    group: "CRM",        description: "Add a contact to the CRM." },
  { name: "update_contact",    label: "Update Contact",    group: "CRM",        description: "Patch an existing contact." },
  { name: "create_lead",       label: "Create Lead",       group: "Sales",      description: "Create a lead." },
  { name: "create_deal",       label: "Create Deal",       group: "Sales",      description: "Open a deal in the pipeline." },
  { name: "create_task",       label: "Create Task",       group: "Productivity", description: "Create a follow-up task." },
  { name: "create_note",       label: "Create Note",       group: "Productivity", description: "Attach an internal note to a record." },
  { name: "book_appointment",  label: "Book Appointment",  group: "Productivity", description: "Schedule a meeting." },
  { name: "send_whatsapp",     label: "Send WhatsApp",     group: "Messaging",  description: "Queue an outbound WhatsApp message." },
  { name: "send_email",        label: "Send Email",        group: "Messaging",  description: "Queue an outbound email." },
  { name: "generate_invoice",  label: "Generate Invoice",  group: "Commerce",   description: "Create a draft invoice." },
  { name: "check_order",       label: "Check Order",       group: "Commerce",   description: "Look up an order / invoice." },
  { name: "update_crm",        label: "Update CRM",        group: "CRM",        description: "Generic record patch." },
  { name: "run_workflow",      label: "Run Workflow",      group: "Automation", description: "Enqueue a saved automation." },
  { name: "webhook_call",      label: "Webhook Call",      group: "External",   description: "POST JSON to a webhook URL." },
  { name: "http_request",      label: "HTTP Request",      group: "External",   description: "Generic HTTP fetch." },
] as const;

export type ActionToolName = (typeof ACTION_TOOL_CATALOG)[number]["name"];
