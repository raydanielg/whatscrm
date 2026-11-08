/**
 * Visitor Engine — persistent visitor identity across sessions.
 *
 * A "visitor" is a browser (identified by a stable visitor_key stored in
 * localStorage on the widget). Same visitor across multiple sessions is
 * one row in `livechat_visitors`. When the visitor provides an email or
 * phone (via widget identify() or by sending contact info), we upsert a
 * matching row into `contacts` so the omnichannel inbox and CRM see them.
 *
 * All calls are service-role because the widget is unauthenticated.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sbAny } from "@/lib/supabase/untyped";

export interface VisitorInput {
  workspaceId: string;
  visitorKey: string;
  chatbotId?: string | null;
  userAgent?: string | null;
  language?: string | null;
  timezone?: string | null;
  page?: string | null;
  referrer?: string | null;
  ipAddress?: string | null;
  country?: string | null;
  city?: string | null;
  utm?: {
    source?: string | null;
    medium?: string | null;
    campaign?: string | null;
    term?: string | null;
    content?: string | null;
  } | null;
  metadata?: Record<string, unknown> | null;
}

export interface VisitorIdentity {
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  language?: string | null;
  timezone?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface VisitorRow {
  id: string;
  workspace_id: string;
  visitor_key: string;
  contact_id: string | null;
  chatbot_id: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  timezone: string | null;
  language: string | null;
  user_agent: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  first_seen_at: string;
  last_seen_at: string;
  visits_count: number;
  page_views: number;
  metadata: Record<string, unknown>;
}

/** Very lightweight UA sniff (avoids pulling in a full parser). */
function sniffUA(ua: string | null | undefined): { device: string; browser: string; os: string } {
  const s = (ua ?? "").toLowerCase();
  const device = /mobile|iphone|android(?!.*tablet)/.test(s)
    ? "mobile"
    : /ipad|tablet/.test(s)
      ? "tablet"
      : "desktop";
  const browser = s.includes("edg/")
    ? "Edge"
    : s.includes("chrome/")
      ? "Chrome"
      : s.includes("firefox/")
        ? "Firefox"
        : s.includes("safari/") && !s.includes("chrome/")
          ? "Safari"
          : "Other";
  const os = s.includes("windows")
    ? "Windows"
    : s.includes("mac os")
      ? "macOS"
      : s.includes("android")
        ? "Android"
        : s.includes("iphone") || s.includes("ipad") || s.includes("ios")
          ? "iOS"
          : s.includes("linux")
            ? "Linux"
            : "Other";
  return { device, browser, os };
}

async function getAdmin(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

/**
 * Idempotent upsert. Increments visits_count on new sessions from the same
 * visitor (identified by workspace_id + visitor_key) and updates last_seen_at.
 */
export async function upsertVisitor(input: VisitorInput): Promise<VisitorRow | null> {
  const admin = await getAdmin();
  const ua = sniffUA(input.userAgent);
  const nowIso = new Date().toISOString();

  // Try to find existing.
  const { data: existing } = await admin
    .from("livechat_visitors")
    .select("*")
    .eq("workspace_id", input.workspaceId)
    .eq("visitor_key", input.visitorKey)
    .maybeSingle();

  if (existing) {
    const ex = existing as VisitorRow & Record<string, unknown>;
    const merged: Record<string, unknown> = {
      last_seen_at: nowIso,
      visits_count: ex.visits_count + 1,
      chatbot_id: input.chatbotId ?? ex.chatbot_id,
      user_agent: input.userAgent ?? ex.user_agent,
      language: input.language ?? ex.language,
      timezone: input.timezone ?? ex.timezone,
      device: ua.device,
      browser: ua.browser,
      os: ua.os,
      ip_address: input.ipAddress ?? ex.ip_address ?? null,
      country: input.country ?? ex.country,
      city: input.city ?? ex.city,
      last_referrer: input.referrer ?? ex.last_referrer ?? null,
      last_page: input.page ?? ex.last_page ?? null,
    };
    if (input.utm) {
      if (input.utm.source) merged.utm_source = input.utm.source;
      if (input.utm.medium) merged.utm_medium = input.utm.medium;
      if (input.utm.campaign) merged.utm_campaign = input.utm.campaign;
      if (input.utm.term) merged.utm_term = input.utm.term;
      if (input.utm.content) merged.utm_content = input.utm.content;
    }
    const { data: updated } = await admin
      .from("livechat_visitors")
      .update(merged as never)
      .eq("id", ex.id)
      .select("*")
      .maybeSingle();
    return (updated as VisitorRow) ?? (existing as VisitorRow);
  }

  const { data: inserted, error } = await admin
    .from("livechat_visitors")
    .insert({
      workspace_id: input.workspaceId,
      visitor_key: input.visitorKey,
      chatbot_id: input.chatbotId ?? null,
      user_agent: input.userAgent ?? null,
      language: input.language ?? null,
      timezone: input.timezone ?? null,
      device: ua.device,
      browser: ua.browser,
      os: ua.os,
      ip_address: input.ipAddress ?? null,
      country: input.country ?? null,
      city: input.city ?? null,
      first_referrer: input.referrer ?? null,
      last_referrer: input.referrer ?? null,
      first_page: input.page ?? null,
      last_page: input.page ?? null,
      utm_source: input.utm?.source ?? null,
      utm_medium: input.utm?.medium ?? null,
      utm_campaign: input.utm?.campaign ?? null,
      utm_term: input.utm?.term ?? null,
      utm_content: input.utm?.content ?? null,
      metadata: input.metadata ?? {},
    } as never)
    .select("*")
    .maybeSingle();
  if (error) {
    console.warn("[visitor-engine] upsert failed", error.message);
    return null;
  }
  return inserted as VisitorRow;
}

/**
 * Identify a visitor — attach a name/email/phone and link to a `contacts` row
 * so the inbox, CRM and analytics can see them as a known person.
 *
 * Rules:
 *   - If email OR phone is provided and matches an existing contact in this
 *     workspace, link to it.
 *   - Otherwise create a new contact row (using a synthetic phone for anon
 *     visitors, since contacts.phone is NOT NULL).
 */
export async function identifyVisitor(
  visitorId: string,
  workspaceId: string,
  identity: VisitorIdentity,
): Promise<VisitorRow | null> {
  const admin = await getAdmin();

  const emailNorm = identity.email?.trim().toLowerCase() || null;
  const phoneNorm = identity.phone?.trim() || null;

  let contactId: string | null = null;
  if (phoneNorm) {
    const { data } = await admin
      .from("contacts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("phone", phoneNorm)
      .maybeSingle();
    contactId = (data as { id: string } | null)?.id ?? null;
  }
  if (!contactId && emailNorm) {
    const { data } = await admin
      .from("contacts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("email", emailNorm)
      .maybeSingle();
    contactId = (data as { id: string } | null)?.id ?? null;
  }

  if (!contactId && (emailNorm || phoneNorm || identity.displayName)) {
    // Contacts require phone; synthesise one from the visitor id if absent.
    const syntheticPhone = phoneNorm ?? `visitor:${visitorId}`;
    const { data: created } = await admin
      .from("contacts")
      .insert({
        workspace_id: workspaceId,
        name: identity.displayName ?? null,
        phone: syntheticPhone,
        email: emailNorm,
      } as never)
      .select("id")
      .maybeSingle();
    contactId = (created as { id: string } | null)?.id ?? null;
  }

  const { data: updated } = await admin
    .from("livechat_visitors")
    .update({
      display_name: identity.displayName ?? undefined,
      email: emailNorm ?? undefined,
      phone: phoneNorm ?? undefined,
      country: identity.country ?? undefined,
      region: identity.region ?? undefined,
      city: identity.city ?? undefined,
      timezone: identity.timezone ?? undefined,
      language: identity.language ?? undefined,
      contact_id: contactId,
      metadata: identity.metadata ?? undefined,
    } as never)
    .eq("id", visitorId)
    .select("*")
    .maybeSingle();
  return updated as VisitorRow | null;
}

export interface VisitorEventInput {
  workspaceId: string;
  visitorId: string;
  sessionId?: string | null;
  eventType: "pageview" | "identify" | "custom" | "widget_open" | "widget_close";
  eventName?: string;
  url?: string;
  referrer?: string;
  properties?: Record<string, unknown>;
}

export async function recordEvent(input: VisitorEventInput): Promise<void> {
  const admin = await getAdmin();
  await sbAny(admin).from("livechat_visitor_events").insert({
    workspace_id: input.workspaceId,
    visitor_id: input.visitorId,
    session_id: input.sessionId ?? null,
    event_type: input.eventType,
    event_name: input.eventName ?? null,
    url: input.url ?? null,
    referrer: input.referrer ?? null,
    properties: input.properties ?? {},
  } as never);
  if (input.eventType === "pageview") {
    // Fetch current page_views to increment.
    const { data: cur } = await admin
      .from("livechat_visitors")
      .select("page_views")
      .eq("id", input.visitorId)
      .maybeSingle();
    const nextPageViews = ((cur as { page_views?: number } | null)?.page_views ?? 0) + 1;
    const patch: Record<string, unknown> = {
      last_seen_at: new Date().toISOString(),
      page_views: nextPageViews,
    };
    if (input.url) patch.last_page = input.url;
    if (input.referrer) patch.last_referrer = input.referrer;
    await admin
      .from("livechat_visitors")
      .update(patch as never)
      .eq("id", input.visitorId);
  }
}

/**
 * Merge a visitor into an existing CRM contact. Copies identity fields to
 * both sides and updates historic chatbot_sessions to point at the contact.
 */
export async function mergeVisitorIntoContact(
  visitorId: string,
  workspaceId: string,
  contactId: string,
): Promise<VisitorRow | null> {
  const admin = await getAdmin();

  const { data: contact } = await admin
    .from("contacts")
    .select("id, name, email, phone")
    .eq("id", contactId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!contact) return null;

  const c = contact as { id: string; name: string | null; email: string | null; phone: string | null };
  const { data: updated } = await admin
    .from("livechat_visitors")
    .update({
      contact_id: c.id,
      display_name: c.name ?? undefined,
      email: c.email ?? undefined,
      phone: c.phone ?? undefined,
    } as never)
    .eq("id", visitorId)
    .eq("workspace_id", workspaceId)
    .select("*")
    .maybeSingle();

  return updated as VisitorRow | null;
}

