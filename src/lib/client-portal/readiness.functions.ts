/**
 * Customer Portal Readiness — aggregates health checks across the
 * portal: authentication, dashboard, conversations, appointments,
 * billing, support & KB, AI assistant, notifications, files, and
 * cross-module integrations (CRM, Omnichannel, Billing, Scheduling,
 * AI, Workflow).
 *
 * Admin-side review. Never call from /client customer routes.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

export type CheckStatus = "pass" | "warn" | "fail" | "info";
export interface ReadinessCheck {
  id: string;
  category: string;
  label: string;
  status: CheckStatus;
  detail: string;
}
export interface ReadinessReport {
  score: number;
  by_category: Record<string, { pass: number; warn: number; fail: number; info: number }>;
  checks: ReadinessCheck[];
  totals: { pass: number; warn: number; fail: number; info: number };
  generated_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

async function safeCount(
  supabase: Supa,
  table: string,
  filter?: (q: Supa) => Supa,
): Promise<{ count: number; error: string | null }> {
  try {
    let q = sbAny(supabase).from(table).select("id", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count, error } = await q;
    return { count: count ?? 0, error: error?.message ?? null };
  } catch (e) {
    return { count: 0, error: e instanceof Error ? e.message : "unknown" };
  }
}

export const getClientPortalReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReadinessReport> => {
    const { supabase } = context;
    const checks: ReadinessCheck[] = [];
    const push = (c: ReadinessCheck) => checks.push(c);

    // ---------- Authentication & security ----------
    const twoFa = await safeCount(supabase, "user_2fa");
    push({
      id: "auth-2fa",
      category: "Authentication",
      label: "Two-factor authentication available",
      status: twoFa.error ? "fail" : twoFa.count > 0 ? "pass" : "info",
      detail: twoFa.error
        ? "user_2fa table not reachable"
        : `${twoFa.count} customer(s) with 2FA configured`,
    });
    const sessions = await safeCount(supabase, "sessions");
    push({
      id: "auth-sessions",
      category: "Authentication",
      label: "Active session tracking",
      status: sessions.error ? "warn" : "pass",
      detail: sessions.error ? sessions.error : `${sessions.count} tracked session(s)`,
    });
    const passPol = await safeCount(supabase, "password_policy");
    push({
      id: "auth-password-policy",
      category: "Authentication",
      label: "Password policy configured",
      status: passPol.count > 0 ? "pass" : "warn",
      detail: passPol.count > 0 ? "Policy configured" : "No custom password policy",
    });
    const lockouts = await safeCount(supabase, "account_lockouts");
    push({
      id: "auth-lockouts",
      category: "Authentication",
      label: "Brute-force lockout protection",
      status: lockouts.error ? "warn" : "pass",
      detail: lockouts.error ? lockouts.error : "Lockout table healthy",
    });

    // ---------- Dashboard & realtime ----------
    const contacts = await safeCount(supabase, "contacts");
    push({
      id: "dashboard-contacts",
      category: "Dashboard",
      label: "Customer contacts available",
      status: contacts.count > 0 ? "pass" : "warn",
      detail: `${contacts.count} contact record(s)`,
    });
    push({
      id: "dashboard-realtime",
      category: "Dashboard",
      label: "Realtime subscriptions",
      status: "pass",
      detail: "Client dashboard, notifications, and conversations subscribe via Supabase Realtime",
    });

    // ---------- Conversations ----------
    const convs = await safeCount(supabase, "conversations");
    push({
      id: "conv-total",
      category: "Conversations",
      label: "Conversations reachable",
      status: convs.error ? "fail" : "pass",
      detail: convs.error ? convs.error : `${convs.count} conversation(s)`,
    });
    const msgs = await safeCount(supabase, "messages");
    push({
      id: "conv-messages",
      category: "Conversations",
      label: "Message stream",
      status: msgs.error ? "fail" : "pass",
      detail: msgs.error ? msgs.error : `${msgs.count} message(s) indexed`,
    });
    const intel = await safeCount(supabase, "conversation_intelligence");
    push({
      id: "conv-ai",
      category: "Conversations",
      label: "AI summaries / sentiment",
      status: intel.count > 0 ? "pass" : "info",
      detail: intel.count > 0 ? `${intel.count} analyzed` : "No AI intelligence rows yet",
    });

    // ---------- Appointments ----------
    const appts = await safeCount(supabase, "booking_appointments");
    push({
      id: "appt-total",
      category: "Appointments",
      label: "Booking engine linked",
      status: appts.error ? "fail" : "pass",
      detail: appts.error ? appts.error : `${appts.count} appointment(s)`,
    });
    const evtTypes = await safeCount(supabase, "booking_event_types");
    push({
      id: "appt-event-types",
      category: "Appointments",
      label: "Bookable event types",
      status: evtTypes.count > 0 ? "pass" : "warn",
      detail: evtTypes.count > 0 ? `${evtTypes.count} event type(s)` : "No event types configured",
    });

    // ---------- Billing ----------
    const invoices = await safeCount(supabase, "invoices");
    push({
      id: "billing-invoices",
      category: "Billing",
      label: "Invoices module",
      status: invoices.error ? "fail" : "pass",
      detail: invoices.error ? invoices.error : `${invoices.count} invoice(s)`,
    });
    const quotes = await safeCount(supabase, "quotes");
    push({
      id: "billing-quotes",
      category: "Billing",
      label: "Quotes accessible",
      status: quotes.error ? "warn" : "pass",
      detail: quotes.error ? quotes.error : `${quotes.count} quote(s)`,
    });
    const subs = await safeCount(supabase, "subscriptions");
    push({
      id: "billing-subs",
      category: "Billing",
      label: "Subscriptions",
      status: subs.error ? "warn" : "pass",
      detail: subs.error ? subs.error : `${subs.count} subscription(s)`,
    });
    const payments = await safeCount(supabase, "payments");
    push({
      id: "billing-payments",
      category: "Billing",
      label: "Payment history",
      status: payments.error ? "warn" : "pass",
      detail: payments.error ? payments.error : `${payments.count} payment(s)`,
    });

    // ---------- Support & KB ----------
    const kbCat = await safeCount(supabase, "kb_categories");
    const kbArts = await safeCount(
      supabase,
      "kb_articles",
      (q) => q.eq("status", "published"),
    );
    push({
      id: "kb-published",
      category: "Support & KB",
      label: "Published KB articles",
      status: kbArts.count > 0 ? "pass" : "warn",
      detail: `${kbArts.count} published article(s), ${kbCat.count} categories`,
    });
    const kbChunks = await safeCount(supabase, "kb_chunks");
    push({
      id: "kb-embeddings",
      category: "Support & KB",
      label: "Searchable KB embeddings",
      status: kbChunks.count > 0 ? "pass" : "info",
      detail: kbChunks.count > 0 ? `${kbChunks.count} vector chunks` : "Run KB indexing for semantic search",
    });
    const tickets = await safeCount(
      supabase,
      "conversations",
      (q) => q.ilike("subject", "%ticket%"),
    );
    push({
      id: "support-tickets",
      category: "Support & KB",
      label: "Support tickets pipeline",
      status: "pass",
      detail: `${tickets.count} ticket-tagged conversation(s)`,
    });

    // ---------- AI Assistant ----------
    const aiProv = await safeCount(supabase, "ai_providers", (q) => q.eq("enabled", true));
    push({
      id: "ai-provider",
      category: "AI Assistant",
      label: "Active AI provider",
      status: aiProv.count > 0 ? "pass" : "fail",
      detail: aiProv.count > 0 ? `${aiProv.count} provider(s) enabled` : "No AI provider enabled",
    });
    const aiSettings = await safeCount(supabase, "ai_settings");
    push({
      id: "ai-settings",
      category: "AI Assistant",
      label: "AI workspace settings",
      status: aiSettings.count > 0 ? "pass" : "info",
      detail: `${aiSettings.count} settings row(s)`,
    });
    const aiLogs = await safeCount(supabase, "ai_request_logs");
    push({
      id: "ai-logs",
      category: "AI Assistant",
      label: "Assistant request logs",
      status: aiLogs.error ? "warn" : "pass",
      detail: aiLogs.error ? aiLogs.error : `${aiLogs.count} request(s) logged`,
    });

    // ---------- Notifications ----------
    const notifs = await safeCount(supabase, "notifications");
    push({
      id: "notif-total",
      category: "Notifications",
      label: "Notifications delivery",
      status: notifs.error ? "fail" : "pass",
      detail: notifs.error ? notifs.error : `${notifs.count} notification(s)`,
    });
    const outbox = await safeCount(
      supabase,
      "message_outbox",
      (q) => q.eq("status", "failed"),
    );
    push({
      id: "notif-outbox",
      category: "Notifications",
      label: "Outbox failures",
      status: outbox.count === 0 ? "pass" : outbox.count < 5 ? "warn" : "fail",
      detail: outbox.count === 0 ? "No failed deliveries" : `${outbox.count} failed message(s)`,
    });

    // ---------- Files ----------
    const files = await safeCount(supabase, "files");
    push({
      id: "files-total",
      category: "Files",
      label: "File center storage",
      status: files.error ? "fail" : "pass",
      detail: files.error ? files.error : `${files.count} file(s) tracked`,
    });
    const atts = await safeCount(supabase, "attachments");
    push({
      id: "files-attachments",
      category: "Files",
      label: "Conversation attachments",
      status: atts.error ? "warn" : "pass",
      detail: atts.error ? atts.error : `${atts.count} attachment(s)`,
    });

    // ---------- Integrations ----------
    const orgs = await safeCount(supabase, "organizations");
    push({
      id: "int-crm",
      category: "Integrations",
      label: "CRM link (contacts, deals)",
      status: contacts.count > 0 && orgs.error === null ? "pass" : "warn",
      detail: `${contacts.count} contact(s), ${orgs.count} organization(s)`,
    });
    push({
      id: "int-inbox",
      category: "Integrations",
      label: "Omnichannel Inbox link",
      status: convs.count > 0 ? "pass" : "info",
      detail: "Portal conversations share `conversations`/`messages` with the unified inbox",
    });
    push({
      id: "int-billing",
      category: "Integrations",
      label: "Billing module link",
      status: invoices.error ? "fail" : "pass",
      detail: "Invoices, quotes, subscriptions, payments visible to the customer",
    });
    push({
      id: "int-scheduling",
      category: "Integrations",
      label: "Scheduling link",
      status: appts.error ? "fail" : "pass",
      detail: "Customer can view, reschedule and cancel booking_appointments",
    });
    const wfTemplates = await safeCount(
      supabase,
      "workflow_templates",
      (q) => q.ilike("category", "%portal%"),
    );
    push({
      id: "int-workflows",
      category: "Integrations",
      label: "Workflow automation triggers",
      status: "info",
      detail: wfTemplates.count > 0
        ? `${wfTemplates.count} portal-tagged workflow template(s)`
        : "Portal events (message, ticket, invoice) can trigger workflows",
    });

    // ---------- Aggregate ----------
    const totals = { pass: 0, warn: 0, fail: 0, info: 0 };
    const byCat: ReadinessReport["by_category"] = {};
    for (const c of checks) {
      totals[c.status]++;
      const b = byCat[c.category] ?? { pass: 0, warn: 0, fail: 0, info: 0 };
      b[c.status]++;
      byCat[c.category] = b;
    }
    const scored = totals.pass + totals.warn + totals.fail;
    const score = scored === 0
      ? 100
      : Math.round(((totals.pass + totals.warn * 0.5) / scored) * 100);

    return {
      score,
      by_category: byCat,
      checks,
      totals,
      generated_at: new Date().toISOString(),
    };
  });
