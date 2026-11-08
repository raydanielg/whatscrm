import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  invalidateContactCaches,
  resolveDisplayName,
  resolveInitials,
} from "@/lib/crm/contact-identity";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";

export type PhoneEntry = { label?: string; number: string; is_primary?: boolean };
export type EmailEntry = { label?: string; email: string; is_primary?: boolean };
export type ContactAddress = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
};

export type ContactRow = {
  id: string;
  workspace_id: string;
  organization_id: string | null;
  company_id: string | null;
  owner_id: string | null;
  assigned_agent_id: string | null;
  avatar_url: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  name: string | null;
  job_title: string | null;
  department: string | null;
  email: string | null;
  emails: EmailEntry[];
  phone: string | null;
  phones: PhoneEntry[];
  whatsapp: string | null;
  birthday: string | null;
  website: string | null;
  address: ContactAddress;
  tags: string[];
  notes: string | null;
  lifecycle_stage: string;
  status: string;
  lead_status: string | null;
  customer_status: string | null;
  source: string | null;
  do_not_contact: boolean;
  is_favorite: boolean;
  is_archived: boolean;
  timezone: string | null;
  locale: string | null;
  custom_fields: Record<string, unknown>;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ContactFilters = {
  search?: string;
  favorite?: boolean;
  archived?: boolean;
  tags?: string[];
  ownerId?: string;
  agentId?: string;
  leadStatus?: string;
  customerStatus?: string;
  companyId?: string;
  lifecycleStage?: string;
  showDeleted?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = (t: string) => sbAny(supabase).from(t as any) as any;

function displayFor(c: Partial<ContactRow>): string {
  return resolveDisplayName(c as never, "Unnamed contact");
}

export function contactDisplayName(c: Partial<ContactRow>): string {
  return displayFor(c);
}

export function contactInitials(c: Partial<ContactRow>): string {
  return resolveInitials(c as never, "Unnamed contact");
}

export function primaryPhone(c: Partial<ContactRow>): string | null {
  const p = (c.phones ?? []).find((x) => x.is_primary) ?? (c.phones ?? [])[0];
  return p?.number ?? c.phone ?? null;
}

export function primaryEmail(c: Partial<ContactRow>): string | null {
  const e = (c.emails ?? []).find((x) => x.is_primary) ?? (c.emails ?? [])[0];
  return e?.email ?? c.email ?? null;
}

/* ------------------------------ Validation ------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Permissive phone: digits, spaces, +, -, (), min 5 digits after stripping.
export function isValidEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim());
}
export function isValidPhone(v: string): boolean {
  const digits = v.replace(/\D/g, "");
  return digits.length >= 5 && digits.length <= 20;
}

/* ------------------------------ Queries ------------------------------ */

/**
 * Turn raw Postgres/PostgREST errors into messages an administrator can act on.
 * The contacts table enforces one active contact per phone number per
 * workspace, which otherwise surfaces as an opaque "duplicate key" error.
 */
export function contactErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  const e = error as { code?: string; message?: string; details?: string } | null;
  if (!e) return fallback;
  const text = `${e.message ?? ""} ${e.details ?? ""}`;
  if (e.code === "23505" || /duplicate key value/i.test(text)) {
    if (/phone/i.test(text))
      return "A contact with this phone number already exists in this workspace.";
    if (/email/i.test(text))
      return "A contact with this email address already exists in this workspace.";
    return "This contact already exists in this workspace.";
  }
  if (e.code === "23503") return "A linked record (company or owner) no longer exists.";
  if (e.code === "42501" || /row-level security/i.test(text)) {
    return "You do not have permission to change this contact.";
  }
  return e.message || fallback;
}

function throwContactError(error: unknown, fallback?: string): never {
  throw new Error(contactErrorMessage(error, fallback));
}

const DEFAULT_LIMIT = 500;

export function useContacts(filters: ContactFilters = {}, limit: number = DEFAULT_LIMIT) {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  return useQuery({
    queryKey: ["contacts", workspaceId, filters, limit],
    enabled: !!workspaceId,
    queryFn: async (): Promise<ContactRow[]> => {
      let q = anyFrom("contacts").select("*").eq("workspace_id", workspaceId);
      if (filters.showDeleted === true) {
        q = q.not("deleted_at", "is", null);
      } else {
        q = q.is("deleted_at", null);
      }
      if (filters.archived === true) q = q.eq("is_archived", true);
      else if (filters.archived === false) q = q.eq("is_archived", false);
      if (filters.favorite === true) q = q.eq("is_favorite", true);
      if (filters.ownerId) q = q.eq("owner_id", filters.ownerId);
      if (filters.agentId) q = q.eq("assigned_agent_id", filters.agentId);
      if (filters.leadStatus) q = q.eq("lead_status", filters.leadStatus);
      if (filters.customerStatus) q = q.eq("customer_status", filters.customerStatus);
      if (filters.companyId) q = q.eq("company_id", filters.companyId);
      if (filters.lifecycleStage) q = q.eq("lifecycle_stage", filters.lifecycleStage);
      if (filters.tags && filters.tags.length) q = q.overlaps("tags", filters.tags);
      if (filters.search && filters.search.trim()) {
        const s = filters.search.trim().replace(/[%,]/g, " ");
        q = q.or(
          [
            `display_name.ilike.%${sanitizeSearchTerm(s)}%`,
            `first_name.ilike.%${sanitizeSearchTerm(s)}%`,
            `last_name.ilike.%${sanitizeSearchTerm(s)}%`,
            `name.ilike.%${sanitizeSearchTerm(s)}%`,
            `email.ilike.%${sanitizeSearchTerm(s)}%`,
            `phone.ilike.%${sanitizeSearchTerm(s)}%`,
            `whatsapp.ilike.%${sanitizeSearchTerm(s)}%`,
          ].join(","),
        );
      }
      const { data, error } = await q.order("updated_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []) as ContactRow[];
    },
  });
}

export function useContact(contactId: string | undefined) {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  return useQuery({
    // workspaceId is part of the key so a cached row from a previous
    // workspace can never leak into the detail view after switching tenants.
    queryKey: ["contact", contactId, workspaceId],
    enabled: !!contactId && !!workspaceId,
    queryFn: async (): Promise<ContactRow | null> => {
      const { data, error } = await anyFrom("contacts")
        .select("*")
        .eq("id", contactId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ContactRow | null;
    },
  });
}

/* ------------------------------ Mutations ------------------------------ */

export type ContactInput = Partial<
  Omit<ContactRow, "id" | "workspace_id" | "created_at" | "updated_at" | "deleted_at">
>;

function buildContactPayload(
  input: ContactInput,
  workspaceId: string,
  organizationId: string | null,
  ownerFallback: string | null,
): Record<string, unknown> {
  return {
    workspace_id: workspaceId,
    organization_id: organizationId,
    owner_id: input.owner_id ?? ownerFallback,
    assigned_agent_id: input.assigned_agent_id ?? null,
    first_name: input.first_name ?? null,
    last_name: input.last_name ?? null,
    display_name: input.display_name ?? null,
    name: input.name ?? ([input.first_name, input.last_name].filter(Boolean).join(" ") || null),
    avatar_url: input.avatar_url ?? null,
    job_title: input.job_title ?? null,
    department: input.department ?? null,
    company_id: input.company_id ?? null,
    email: primaryEmail({ emails: input.emails ?? [] }) ?? input.email ?? null,
    emails: input.emails ?? [],
    phone: primaryPhone({ phones: input.phones ?? [] }) ?? input.phone ?? null,
    phones: input.phones ?? [],
    whatsapp: input.whatsapp ?? null,
    birthday: input.birthday ?? null,
    website: input.website ?? null,
    address: input.address ?? {},
    tags: input.tags ?? [],
    notes: input.notes ?? null,
    lifecycle_stage: input.lifecycle_stage ?? "lead",
    status: input.status ?? "active",
    lead_status: input.lead_status ?? null,
    customer_status: input.customer_status ?? null,
    source: input.source ?? "manual",
    do_not_contact: input.do_not_contact ?? false,
    is_favorite: input.is_favorite ?? false,
    is_archived: input.is_archived ?? false,
    timezone: input.timezone ?? null,
    locale: input.locale ?? null,
    custom_fields: input.custom_fields ?? {},
  };
}

export function useCreateContact() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  return useMutation({
    mutationFn: async (input: ContactInput): Promise<ContactRow> => {
      if (!workspaceId) throw new Error("No workspace selected");
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      const payload = buildContactPayload(input, workspaceId, active?.organization_id ?? null, uid);
      const { data, error } = await anyFrom("contacts").insert(payload).select().single();
      if (error) throwContactError(error);
      return data as ContactRow;
    },
    onSuccess: () => invalidateContactCaches(qc),
  });
}

export function useBulkCreateContacts() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  return useMutation({
    mutationFn: async (
      inputs: ContactInput[],
    ): Promise<{ inserted: number; failed: number; errors: string[] }> => {
      if (!workspaceId) throw new Error("No workspace selected");
      if (!inputs.length) return { inserted: 0, failed: 0, errors: [] };
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      const payloads = inputs.map((i) =>
        buildContactPayload(i, workspaceId, active?.organization_id ?? null, uid),
      );
      // Chunk to keep single requests small.
      const CHUNK = 200;
      let inserted = 0;
      let failed = 0;
      const errors: string[] = [];
      for (let i = 0; i < payloads.length; i += CHUNK) {
        const slice = payloads.slice(i, i + CHUNK);
        const { data, error } = await anyFrom("contacts").insert(slice).select("id");
        if (error) {
          failed += slice.length;
          errors.push(contactErrorMessage(error));
        } else {
          inserted += (data as unknown[] | null)?.length ?? slice.length;
        }
      }
      return { inserted, failed, errors };
    },
    onSuccess: () => invalidateContactCaches(qc),
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ContactInput }) => {
      const p = { ...patch } as Record<string, unknown>;
      if (patch.emails) p.email = primaryEmail({ emails: patch.emails });
      if (patch.phones) p.phone = primaryPhone({ phones: patch.phones });
      if (patch.first_name !== undefined || patch.last_name !== undefined) {
        p.name =
          [patch.first_name, patch.last_name].filter(Boolean).join(" ") ||
          patch.display_name ||
          null;
      }
      const { error } = await anyFrom("contacts").update(p).eq("id", id);
      if (error) throwContactError(error);
    },
    onSuccess: (_r, v) => {
      invalidateContactCaches(qc, v.id);
    },
  });
}

/**
 * Uploads a contact's avatar into the (private) `attachments` bucket under
 * `${workspaceId}/contacts/...` — storage RLS on that bucket keys off the
 * first path segment being a workspace the uploader belongs to, the same
 * pattern used for message attachments. Returns a long-lived signed URL;
 * the caller writes it onto the contact's `avatar_url` (works for both a
 * brand-new, not-yet-saved contact and an existing one — the upload itself
 * doesn't need a contact id, only a workspace to scope the path under).
 */
export function useUploadContactAvatar() {
  return useMutation({
    mutationFn: async ({ workspaceId, file }: { workspaceId: string; file: File | Blob }) => {
      const type = (file as File).type || "image/jpeg";
      const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
      const path = `${workspaceId}/contacts/avatar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("attachments")
        .upload(path, file, { upsert: true, contentType: type });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from("attachments")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (sErr) throw sErr;
      return signed.signedUrl;
    },
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, hard = false }: { id: string; hard?: boolean }) => {
      if (hard) {
        const { error } = await anyFrom("contacts").delete().eq("id", id);
        if (error) throwContactError(error);
      } else {
        const { error } = await anyFrom("contacts")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throwContactError(error);
      }
    },
    onSuccess: () => invalidateContactCaches(qc),
  });
}

export function useRestoreContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await anyFrom("contacts").update({ deleted_at: null }).eq("id", id);
      if (error) throwContactError(error);
    },
    onSuccess: () => invalidateContactCaches(qc),
  });
}

export function useBulkRestoreContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await anyFrom("contacts").update({ deleted_at: null }).in("id", ids);
      if (error) throwContactError(error);
    },
    onSuccess: () => invalidateContactCaches(qc),
  });
}

export function useBulkUpdateContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: ContactInput }) => {
      if (!ids.length) return;
      const { error } = await anyFrom("contacts").update(patch).in("id", ids);
      if (error) throwContactError(error);
    },
    onSuccess: () => invalidateContactCaches(qc),
  });
}

export function useBulkDeleteContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, hard = false }: { ids: string[]; hard?: boolean }) => {
      if (!ids.length) return;
      if (hard) {
        const { error } = await anyFrom("contacts").delete().in("id", ids);
        if (error) throwContactError(error);
      } else {
        const { error } = await anyFrom("contacts")
          .update({ deleted_at: new Date().toISOString() })
          .in("id", ids);
        if (error) throwContactError(error);
      }
    },
    onSuccess: () => invalidateContactCaches(qc),
  });
}

export function useMergeContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      primaryId,
      duplicateIds,
    }: {
      primaryId: string;
      duplicateIds: string[];
    }) => {
      const ids = [primaryId, ...duplicateIds];
      const { data, error } = await anyFrom("contacts").select("*").in("id", ids);
      if (error) throwContactError(error);
      const rows = (data ?? []) as ContactRow[];
      const primary = rows.find((r) => r.id === primaryId);
      const dupes = rows.filter((r) => r.id !== primaryId);
      if (!primary) throw new Error("Primary contact not found");

      const mergedPhones: PhoneEntry[] = [...(primary.phones ?? [])];
      const mergedEmails: EmailEntry[] = [...(primary.emails ?? [])];
      const mergedTags = new Set<string>(primary.tags ?? []);
      const custom: Record<string, unknown> = { ...(primary.custom_fields ?? {}) };
      const notes: string[] = primary.notes ? [primary.notes] : [];

      for (const d of dupes) {
        for (const p of d.phones ?? [])
          if (!mergedPhones.some((x) => x.number === p.number))
            mergedPhones.push({ ...p, is_primary: false });
        if (d.phone && !mergedPhones.some((x) => x.number === d.phone))
          mergedPhones.push({ number: d.phone });
        for (const e of d.emails ?? [])
          if (!mergedEmails.some((x) => x.email === e.email))
            mergedEmails.push({ ...e, is_primary: false });
        if (d.email && !mergedEmails.some((x) => x.email === d.email))
          mergedEmails.push({ email: d.email });
        for (const t of d.tags ?? []) mergedTags.add(t);
        Object.assign(custom, d.custom_fields ?? {});
        if (d.notes) notes.push(d.notes);
      }

      const patch: Record<string, unknown> = {
        phones: mergedPhones,
        emails: mergedEmails,
        tags: Array.from(mergedTags),
        custom_fields: custom,
        notes: notes.join("\n\n---\n\n") || null,
        first_name: primary.first_name ?? dupes.find((d) => d.first_name)?.first_name ?? null,
        last_name: primary.last_name ?? dupes.find((d) => d.last_name)?.last_name ?? null,
        display_name:
          primary.display_name ?? dupes.find((d) => d.display_name)?.display_name ?? null,
        avatar_url: primary.avatar_url ?? dupes.find((d) => d.avatar_url)?.avatar_url ?? null,
        job_title: primary.job_title ?? dupes.find((d) => d.job_title)?.job_title ?? null,
        website: primary.website ?? dupes.find((d) => d.website)?.website ?? null,
        birthday: primary.birthday ?? dupes.find((d) => d.birthday)?.birthday ?? null,
        whatsapp: primary.whatsapp ?? dupes.find((d) => d.whatsapp)?.whatsapp ?? null,
        company_id: primary.company_id ?? dupes.find((d) => d.company_id)?.company_id ?? null,
        phone: mergedPhones[0]?.number ?? primary.phone ?? null,
        email: mergedEmails[0]?.email ?? primary.email ?? null,
      };
      const { error: uErr } = await anyFrom("contacts").update(patch).eq("id", primaryId);
      if (uErr) throwContactError(uErr);
      const dupIds = dupes.map((d) => d.id);
      if (dupIds.length) {
        const { error: dErr } = await anyFrom("contacts")
          .update({ deleted_at: new Date().toISOString(), notes: `Merged into ${primaryId}` })
          .in("id", dupIds);
        if (dErr) throwContactError(dErr);
      }
    },
    onSuccess: () => invalidateContactCaches(qc),
  });
}

/* ------------------------------ Realtime ------------------------------ */

export function useContactsRealtime() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  useEffect(() => {
    if (!workspaceId || typeof window === "undefined") return;

    // Bulk operations (import, bulk delete, merge) emit one event per row.
    // Coalesce them into a single refetch so the table doesn't thrash.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        invalidateContactCaches(qc);
      }, 400);
    };

    const channel = supabase
      .channel(`contacts:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contacts",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        scheduleRefresh,
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [workspaceId, qc]);
}

/* ------------------------------ CSV import/export ------------------------------ */

export function contactsToCsv(rows: ContactRow[]): string {
  const headers = [
    "first_name",
    "last_name",
    "display_name",
    "email",
    "phone",
    "whatsapp",
    "job_title",
    "department",
    "website",
    "birthday",
    "lead_status",
    "customer_status",
    "lifecycle_stage",
    "tags",
    "notes",
    "address_line1",
    "address_city",
    "address_country",
  ];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.first_name,
        r.last_name,
        r.display_name,
        primaryEmail(r),
        primaryPhone(r),
        r.whatsapp,
        r.job_title,
        r.department,
        r.website,
        r.birthday,
        r.lead_status,
        r.customer_status,
        r.lifecycle_stage,
        (r.tags ?? []).join("|"),
        r.notes,
        r.address?.line1,
        r.address?.city,
        r.address?.country,
      ]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        cur.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        cur.push(field);
        field = "";
        if (cur.some((x) => x !== "")) rows.push(cur);
        cur = [];
      } else field += c;
    }
  }
  if (field !== "" || cur.length) {
    cur.push(field);
    if (cur.some((x) => x !== "")) rows.push(cur);
  }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, idx) => (o[h] = (r[idx] ?? "").trim()));
    return o;
  });
}

export function csvRowToContactInput(r: Record<string, string>): ContactInput {
  const phone = r.phone || r.mobile || r.phone_number || "";
  const email = r.email || r.email_address || "";
  return {
    first_name: r.first_name || r.firstname || null,
    last_name: r.last_name || r.lastname || null,
    display_name: r.display_name || r.name || null,
    email: email || null,
    emails: email ? [{ email, is_primary: true }] : [],
    phone: phone || null,
    phones: phone ? [{ number: phone, is_primary: true }] : [],
    whatsapp: r.whatsapp || null,
    job_title: r.job_title || r.title || null,
    department: r.department || null,
    website: r.website || r.url || null,
    birthday: r.birthday || null,
    lead_status: r.lead_status || null,
    customer_status: r.customer_status || null,
    lifecycle_stage: r.lifecycle_stage || "lead",
    tags: r.tags
      ? r.tags
          .split(/[|,;]/)
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
    notes: r.notes || null,
    address: {
      line1: r.address_line1 || r.address || undefined,
      city: r.address_city || r.city || undefined,
      country: r.address_country || r.country || undefined,
    },
  };
}
