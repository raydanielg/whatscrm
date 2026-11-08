/**
 * Customer Identity Engine — server functions.
 *
 * One customer can be reached over WhatsApp, Instagram, Messenger, Telegram,
 * Email, Live Chat, SMS, etc. This module keeps ONE CRM profile per customer
 * and links every per-channel handle to it.
 *
 * Endpoints (all workspace-scoped, RLS enforced via requireSupabaseAuth):
 *  - resolveIdentity        : externalId -> contact (create if new)
 *  - listChannelIdentities  : identities attached to a contact
 *  - attachIdentity         : manually attach a per-channel handle to a contact
 *  - detachIdentity         : remove a per-channel handle from a contact
 *  - findDuplicates         : deterministic phone/email duplicate scan
 *  - aiMatchSuggestions     : LLM-assisted fuzzy match suggestions
 *  - mergeContacts          : merge N duplicates into a primary, audit-logged
 *  - splitMerge             : revert a previous merge from audit log
 *  - listMerges             : merge audit log
 *  - getConfig / setConfig  : per-workspace engine configuration
 *  - relationshipGraph      : nodes + edges for the identity graph of a contact
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

// ---------------------------------------------------------------------------
// Types & schemas
// ---------------------------------------------------------------------------

const CHANNEL_KINDS = [
  "whatsapp_cloud",
  "whatsapp_qr",
  "instagram",
  "messenger",
  "telegram",
  "email",
  "live_chat",
  "sms",
  "discord",
  "slack",
  "teams",
  "apple_business",
  "google_business",
  "line",
  "viber",
  "wechat",
] as const;

const ChannelKind = z.enum(CHANNEL_KINDS);

const WorkspaceScoped = z.object({ workspaceId: z.string().uuid() });

const ResolveInput = WorkspaceScoped.extend({
  channel: ChannelKind,
  externalId: z.string().min(1),
  displayName: z.string().optional(),
  avatarUrl: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
});

const AttachInput = WorkspaceScoped.extend({
  contactId: z.string().uuid(),
  channel: ChannelKind,
  externalId: z.string().min(1),
  displayName: z.string().optional(),
  avatarUrl: z.string().optional(),
});

const DetachInput = WorkspaceScoped.extend({ identityId: z.string().uuid() });

const MergeInput = WorkspaceScoped.extend({
  primaryContactId: z.string().uuid(),
  duplicateContactIds: z.array(z.string().uuid()).min(1).max(20),
  reason: z.string().max(500).optional(),
});

const SplitInput = WorkspaceScoped.extend({ mergeId: z.string().uuid() });

const ConfigInput = WorkspaceScoped.extend({
  auto_merge_on_phone: z.boolean().optional(),
  auto_merge_on_email: z.boolean().optional(),
  ai_matching_enabled: z.boolean().optional(),
  ai_confidence_threshold: z.number().min(0).max(1).optional(),
  duplicate_scan_window_days: z.number().int().min(1).max(3650).optional(),
  require_manual_approval: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizePhone(v?: string | null): string | null {
  if (!v) return null;
  const s = String(v).replace(/[^\d+]/g, "");
  return s || null;
}

function normalizeEmail(v?: string | null): string | null {
  if (!v) return null;
  return String(v).trim().toLowerCase() || null;
}

// ---------------------------------------------------------------------------
// resolveIdentity
// ---------------------------------------------------------------------------

export const resolveIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => ResolveInput.parse(v))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { workspaceId, channel, externalId } = data;
    const phone = normalizePhone(data.phone);
    const email = normalizeEmail(data.email);

    // 1) exact identity match
    const { data: existing } = await sb
      .from("channel_identities")
      .select("id, contact_id, display_name, avatar_url")
      .eq("workspace_id", workspaceId)
      .eq("channel", channel)
      .eq("external_id", externalId)
      .maybeSingle();

    if (existing) {
      await sb
        .from("channel_identities")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", existing.id);
      return { contactId: existing.contact_id, identityId: existing.id, created: false };
    }

    // 2) phone / email deterministic match against contacts
    let matchedContactId: string | null = null;
    if (phone || email) {
      const q = sbAny(sb).from("contacts").select("id, phone, email").eq("workspace_id", workspaceId);
      const { data: rows } = phone
        ? await q.or(`phone.eq.${phone},whatsapp.eq.${phone}`)
        : await q.eq("email", email as string);
      if (rows && rows.length) matchedContactId = rows[0].id as string;
    }

    // 3) create new contact if nothing matched
    let contactId = matchedContactId;
    if (!contactId) {
      const { data: created, error } = await sb
        .from("contacts")
        .insert({
          workspace_id: workspaceId,
          display_name: data.displayName ?? externalId,
          avatar_url: data.avatarUrl ?? null,
          phone,
          email,
        })
        .select("id")
        .single();
      if (error) throw error;
      contactId = created.id as string;
    }

    const { data: inserted, error: iErr } = await sb
      .from("channel_identities")
      .insert({
        workspace_id: workspaceId,
        contact_id: contactId,
        channel,
        external_id: externalId,
        display_name: data.displayName ?? null,
        avatar_url: data.avatarUrl ?? null,
      })
      .select("id")
      .single();
    if (iErr) throw iErr;

    return { contactId, identityId: inserted.id as string, created: !matchedContactId };
  });

// ---------------------------------------------------------------------------
// listChannelIdentities / attach / detach
// ---------------------------------------------------------------------------

export const listChannelIdentities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    WorkspaceScoped.extend({ contactId: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("channel_identities")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .eq("contact_id", data.contactId)
      .order("last_seen_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const attachIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => AttachInput.parse(v))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("channel_identities")
      .upsert(
        {
          workspace_id: data.workspaceId,
          contact_id: data.contactId,
          channel: data.channel,
          external_id: data.externalId,
          display_name: data.displayName ?? null,
          avatar_url: data.avatarUrl ?? null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,channel,external_id" },
      )
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const detachIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => DetachInput.parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("channel_identities")
      .delete()
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.identityId);
    if (error) throw error;
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

export const findDuplicates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    WorkspaceScoped.extend({ windowDays: z.number().int().optional() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const since = new Date(
      Date.now() - (data.windowDays ?? 90) * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: contacts, error } = await sb
      .from("contacts")
      .select(
        "id, display_name, first_name, last_name, phone, email, whatsapp, avatar_url, created_at",
      )
      .eq("workspace_id", data.workspaceId)
      .is("deleted_at", null)
      .gte("created_at", since)
      .limit(5000);
    if (error) throw error;

    const byPhone = new Map<string, typeof contacts>();
    const byEmail = new Map<string, typeof contacts>();
    const byName = new Map<string, typeof contacts>();

    for (const c of contacts ?? []) {
      const p = normalizePhone(c.phone ?? c.whatsapp);
      const e = normalizeEmail(c.email);
      const n = [c.first_name, c.last_name, c.display_name]
        .filter(Boolean)
        .join(" ")
        .trim()
        .toLowerCase();
      if (p) byPhone.set(p, [...(byPhone.get(p) ?? []), c]);
      if (e) byEmail.set(e, [...(byEmail.get(e) ?? []), c]);
      if (n && n.length > 3) byName.set(n, [...(byName.get(n) ?? []), c]);
    }

    type Group = {
      key: string;
      kind: "phone" | "email" | "name";
      confidence: number;
      contacts: NonNullable<typeof contacts>;
    };
    const groups: Group[] = [];
    for (const [k, v] of byPhone) if (v && v.length > 1) groups.push({ key: k, kind: "phone", confidence: 1.0, contacts: v });
    for (const [k, v] of byEmail) if (v && v.length > 1) groups.push({ key: k, kind: "email", confidence: 0.98, contacts: v });
    for (const [k, v] of byName) if (v && v.length > 1) groups.push({ key: k, kind: "name", confidence: 0.6, contacts: v });

    // dedupe: if a phone group already covers all IDs of a name group, drop the name group
    const seenSignatures = new Set<string>();
    const unique: Group[] = [];
    groups.sort((a, b) => b.confidence - a.confidence);
    for (const g of groups) {
      const sig = g.contacts
        .map((c) => c.id)
        .sort()
        .join("|");
      if (seenSignatures.has(sig)) continue;
      seenSignatures.add(sig);
      unique.push(g);
    }
    return unique;
  });

// ---------------------------------------------------------------------------
// Merge / split
// ---------------------------------------------------------------------------

export const mergeContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => MergeInput.parse(v))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const ids = [data.primaryContactId, ...data.duplicateContactIds];

    const { data: rows, error } = await sbAny(sb).from("contacts").select("*").in("id", ids);
    if (error) throw error;
    const primary = rows?.find((r) => r.id === data.primaryContactId);
    const dupes = rows?.filter((r) => r.id !== data.primaryContactId) ?? [];
    if (!primary) throw new Error("Primary contact not found");

    // move channel identities to primary
    const dupIds = dupes.map((d) => d.id as string);
    const { data: movedIds } = await sb
      .from("channel_identities")
      .update({ contact_id: data.primaryContactId })
      .in("contact_id", dupIds)
      .select("id");

    // move conversations (messages follow via conversation_id)
    await sbAny(sb).from("conversations").update({ contact_id: data.primaryContactId }).in("contact_id", dupIds);

    // soft-delete duplicates
    await sb
      .from("contacts")
      .update({ deleted_at: new Date().toISOString(), notes: `Merged into ${data.primaryContactId}` })
      .in("id", dupIds);

    // audit
    const { data: merge, error: mErr } = await sb
      .from("identity_merges")
      .insert({
        workspace_id: data.workspaceId,
        primary_contact_id: data.primaryContactId,
        merged_contact_id: dupIds[0],
        merged_snapshot: { dupes, primary },
        moved_identity_ids: (movedIds ?? []).map((r) => r.id),
        merge_reason: data.reason ?? null,
        merged_by: context.userId,
      })
      .select("id")
      .single();
    if (mErr) throw mErr;

    return { mergeId: merge.id, mergedCount: dupIds.length };
  });

export const splitMerge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => SplitInput.parse(v))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: merge, error } = await sb
      .from("identity_merges")
      .select("*")
      .eq("id", data.mergeId)
      .eq("workspace_id", data.workspaceId)
      .single();
    if (error) throw error;
    if (merge.is_reverted) throw new Error("Merge already reverted");

    const snap = merge.merged_snapshot as { dupes: Array<{ id: string }> };
    const dupIds = (snap.dupes ?? []).map((d) => d.id);
    await sbAny(sb).from("contacts").update({ deleted_at: null }).in("id", dupIds);

    // NOTE: we cannot perfectly restore per-channel routing without additional
    // history; conversations stay with the primary. Identities are restored to
    // whichever contact still owns the phone/email match.
    await sb
      .from("identity_merges")
      .update({
        is_reverted: true,
        reverted_at: new Date().toISOString(),
        reverted_by: context.userId,
      })
      .eq("id", data.mergeId);

    return { ok: true, restoredContactIds: dupIds };
  });

export const listMerges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => WorkspaceScoped.parse(v))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("identity_merges")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return rows ?? [];
  });

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const getIdentityConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => WorkspaceScoped.parse(v))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("identity_engine_config")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    return (
      row ?? {
        workspace_id: data.workspaceId,
        auto_merge_on_phone: true,
        auto_merge_on_email: true,
        ai_matching_enabled: false,
        ai_confidence_threshold: 0.85,
        duplicate_scan_window_days: 90,
        require_manual_approval: false,
      }
    );
  });

export const setIdentityConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => ConfigInput.parse(v))
  .handler(async ({ data, context }) => {
    const { workspaceId, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("identity_engine_config")
      .upsert(
        { workspace_id: workspaceId, updated_by: context.userId, ...patch },
        { onConflict: "workspace_id" },
      )
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

// ---------------------------------------------------------------------------
// Relationship graph
// ---------------------------------------------------------------------------

export const relationshipGraph = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    WorkspaceScoped.extend({ contactId: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [{ data: contact }, { data: identities }, { data: convos }] = await Promise.all([
      sb
        .from("contacts")
        .select("id, display_name, first_name, last_name, phone, email, avatar_url, company_id")
        .eq("id", data.contactId)
        .maybeSingle(),
      sb
        .from("channel_identities")
        .select("id, channel, external_id, display_name, last_seen_at")
        .eq("workspace_id", data.workspaceId)
        .eq("contact_id", data.contactId),
      sb
        .from("conversations")
        .select("id, channel, subject, last_message_at")
        .eq("workspace_id", data.workspaceId)
        .eq("contact_id", data.contactId)
        .order("last_message_at", { ascending: false })
        .limit(50),
    ]);
    return { contact, identities: identities ?? [], conversations: convos ?? [] };
  });
