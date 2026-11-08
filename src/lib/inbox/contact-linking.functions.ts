/**
 * Contact linking for conversations.
 *
 * Lets an agent search the workspace contact directory and re-link an
 * "Unknown contact" conversation (or reassign a mis-matched one) to the
 * correct CRM contact. Also supports creating a new contact inline from
 * whatever channel identifier the conversation was carrying.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { digitsOnly } from "@/lib/messaging/phone-matching";
import { sbAny } from "@/lib/supabase/untyped";

export type ContactSearchResult = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  name: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  avatar_url: string | null;
};

const SearchInput = z.object({
  workspaceId: z.string().uuid(),
  q: z.string().trim().max(120).default(""),
  limit: z.number().int().min(1).max(50).default(20),
});

export const searchWorkspaceContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => SearchInput.parse(v))
  .handler(async ({ data, context }) => {
    const q = data.q.trim();
    let query = context.supabase
      .from("contacts")
      .select(
        "id, first_name, last_name, display_name, name, phone, whatsapp, email, avatar_url",
      )
      .eq("workspace_id", data.workspaceId)
      .order("updated_at", { ascending: false })
      .limit(data.limit);

    if (q) {
      const digits = digitsOnly(q);
      const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
      const filters = [
        `first_name.ilike.${like}`,
        `last_name.ilike.${like}`,
        `display_name.ilike.${like}`,
        `name.ilike.${like}`,
        `email.ilike.${like}`,
      ];
      if (digits && digits.length >= 3) {
        const digitsLike = `%${digits}%`;
        filters.push(`phone.ilike.${digitsLike}`, `whatsapp.ilike.${digitsLike}`);
      }
      query = query.or(filters.join(","));
    }

    const { data: rows, error } = await query;
    if (error) throw error;
    return (rows ?? []) as ContactSearchResult[];
  });

const RelinkInput = z.object({
  workspaceId: z.string().uuid(),
  conversationId: z.string().uuid(),
  contactId: z.string().uuid(),
});

export const relinkConversationContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => RelinkInput.parse(v))
  .handler(async ({ data, context }) => {
    // Verify contact belongs to workspace (RLS also enforces, but fail fast).
    const { data: contact, error: cErr } = await context.supabase
      .from("contacts")
      .select("id, workspace_id")
      .eq("id", data.contactId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!contact) throw new Error("Contact not found in this workspace");

    const { data: prev, error: prevErr } = await context.supabase
      .from("conversations")
      .select("id, contact_id, workspace_id")
      .eq("id", data.conversationId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (prevErr) throw prevErr;
    if (!prev) throw new Error("Conversation not found");

    const { data: row, error } = await context.supabase
      .from("conversations")
      .update({ contact_id: data.contactId, updated_at: new Date().toISOString() })
      .eq("id", data.conversationId)
      .eq("workspace_id", data.workspaceId)
      .select("id, contact_id")
      .single();
    if (error) throw error;

    // Best-effort audit trail on conversation_activity if present.
    try {
      await sbAny(context.supabase).from("conversation_activity").insert({
        conversation_id: data.conversationId,
        workspace_id: data.workspaceId,
        actor_id: context.userId,
        activity_type: "contact_relinked",
        metadata: {
          previous_contact_id: prev.contact_id,
          new_contact_id: data.contactId,
        },
      } as never);
    } catch {
      /* activity table optional */
    }

    return row as { id: string; contact_id: string };
  });

const CreateAndLinkInput = z.object({
  workspaceId: z.string().uuid(),
  conversationId: z.string().uuid(),
  first_name: z.string().trim().max(80).nullable().optional(),
  last_name: z.string().trim().max(80).nullable().optional(),
  display_name: z.string().trim().max(160).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
});

export const createContactAndLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => CreateAndLinkInput.parse(v))
  .handler(async ({ data, context }) => {
    const payload = {
      workspace_id: data.workspaceId,
      first_name: data.first_name || null,
      last_name: data.last_name || null,
      display_name:
        data.display_name ||
        [data.first_name, data.last_name].filter(Boolean).join(" ").trim() ||
        null,
      phone: data.phone || null,
      whatsapp: data.phone || null,
      email: data.email || null,
      owner_id: context.userId,
    };
    const { data: contact, error } = await context.supabase
      .from("contacts")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;

    const { error: uErr } = await context.supabase
      .from("conversations")
      .update({ contact_id: contact.id, updated_at: new Date().toISOString() })
      .eq("id", data.conversationId)
      .eq("workspace_id", data.workspaceId);
    if (uErr) throw uErr;

    return { id: contact.id };
  });

const CreateContactInput = z.object({
  workspaceId: z.string().uuid(),
  first_name: z.string().trim().max(80).nullable().optional(),
  last_name: z.string().trim().max(80).nullable().optional(),
  display_name: z.string().trim().max(160).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
});

export const createWorkspaceContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => CreateContactInput.parse(v))
  .handler(async ({ data, context }) => {
    const displayName =
      data.display_name ||
      [data.first_name, data.last_name].filter(Boolean).join(" ").trim() ||
      null;
    const payload = {
      workspace_id: data.workspaceId,
      first_name: data.first_name || null,
      last_name: data.last_name || null,
      display_name: displayName,
      name: displayName,
      phone: data.phone || null,
      whatsapp: data.phone || null,
      email: data.email || null,
      owner_id: context.userId,
    };
    const { data: contact, error } = await context.supabase
      .from("contacts")
      .insert(payload)
      .select(
        "id, first_name, last_name, display_name, name, phone, whatsapp, email, avatar_url",
      )
      .single();
    if (error) throw error;
    return contact as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      display_name: string | null;
      name: string | null;
      phone: string | null;
      whatsapp: string | null;
      email: string | null;
      avatar_url: string | null;
    };
  });

const BulkRelinkInput = z.object({
  workspaceId: z.string().uuid(),
  conversationIds: z.array(z.string().uuid()).min(1).max(500),
  contactId: z.string().uuid(),
});

export const bulkRelinkConversationContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => BulkRelinkInput.parse(v))
  .handler(async ({ data, context }) => {
    // Verify contact belongs to workspace (RLS also enforces).
    const { data: contact, error: cErr } = await context.supabase
      .from("contacts")
      .select("id")
      .eq("id", data.contactId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!contact) throw new Error("Contact not found in this workspace");

    // Load previous contact_ids for audit trail (best-effort).
    const { data: prev } = await context.supabase
      .from("conversations")
      .select("id, contact_id")
      .in("id", data.conversationIds)
      .eq("workspace_id", data.workspaceId);

    const { data: updated, error } = await context.supabase
      .from("conversations")
      .update({ contact_id: data.contactId, updated_at: new Date().toISOString() })
      .in("id", data.conversationIds)
      .eq("workspace_id", data.workspaceId)
      .select("id");
    if (error) throw error;

    // Best-effort activity rows per conversation.
    try {
      const prevMap = new Map((prev ?? []).map((r) => [r.id, r.contact_id]));
      const rows = (updated ?? []).map((r) => ({
        conversation_id: r.id,
        workspace_id: data.workspaceId,
        actor_id: context.userId,
        activity_type: "contact_relinked",
        metadata: {
          previous_contact_id: prevMap.get(r.id) ?? null,
          new_contact_id: data.contactId,
          bulk: true,
        },
      }));
      if (rows.length) {
        await sbAny(context.supabase).from("conversation_activity").insert(rows as never);
      }
    } catch {
      /* optional */
    }

    return { count: updated?.length ?? 0 };
  });

