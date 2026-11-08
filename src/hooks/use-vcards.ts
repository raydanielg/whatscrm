import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace, resolveWorkspaceId } from "@/hooks/use-workspace";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { sbAny } from "@/lib/supabase/untyped";

export type VCardTheme = {
  accent?: string;
  layout?: "classic" | "modern" | "minimal";
  dark?: boolean;
};

export type VCard = {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  slug: string;
  full_name: string;
  job_title: string | null;
  company: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  socials: Record<string, string>;
  theme: VCardTheme;
  is_public: boolean;
  view_count: number;
  version: number;
  revoked_at: string | null;
  revoked_reason: string | null;
  revoked_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VCardRevisionAction = "created" | "updated" | "revoked" | "restored";

export type VCardRevision = {
  id: string;
  vcard_id: string;
  workspace_id: string;
  version: number;
  action: VCardRevisionAction;
  changed_fields: string[];
  snapshot: VCard;
  note: string | null;
  changed_by: string | null;
  created_at: string;
};

/** Fields that are meaningful to show in the audit trail. */
export const VCARD_FIELD_LABELS: Record<string, string> = {
  full_name: "Full name",
  slug: "Share link",
  job_title: "Job title",
  company: "Company",
  phone: "Phone",
  whatsapp: "WhatsApp",
  email: "Email",
  website: "Website",
  address: "Address",
  bio: "Bio",
  avatar_url: "Profile photo",
  cover_url: "Cover image",
  socials: "Social links",
  theme: "Theme",
  is_public: "Visibility",
  contact_id: "Linked contact",
  revoked_at: "Revocation",
  revoked_reason: "Revocation reason",
  revoked_by: "Revoked by",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (t: string) => sbAny(supabase).from(t as any) as any;

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 48);
}

export function useVCards() {
  const { active } = useCurrentWorkspace();
  return useQuery<VCard[]>({
    queryKey: ["vcards", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      const { data, error } = await db("vcards")
        .select("*")
        .eq("workspace_id", active!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VCard[];
    },
  });
}

export function useVCardBySlug(slug?: string) {
  return useQuery<VCard | null>({
    queryKey: ["vcard-public", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await db("vcards").select("*").eq("slug", slug).maybeSingle();
      if (error) throw error;
      return (data ?? null) as VCard | null;
    },
  });
}

export type VCardInput = Partial<VCard> & { full_name: string; slug: string };

export function validateVCard(input: VCardInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.full_name?.trim()) errors.full_name = "Full name is required";
  if (!input.slug?.trim()) errors.slug = "Share link is required";
  else if (!/^[a-z0-9-]{3,48}$/.test(input.slug))
    errors.slug = "Use 3-48 lowercase letters, numbers or hyphens";
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) errors.email = "Enter a valid email";
  if (input.website && !/^https?:\/\/.+/i.test(input.website)) errors.website = "Website must start with http(s)://";
  if (!input.phone && !input.email && !input.whatsapp)
    errors.phone = "Add at least one contact method (phone, WhatsApp or email)";
  return errors;
}

export function useSaveVCard() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: VCardInput) => {
      const workspaceId = await resolveWorkspaceId(active?.id);
      if (!workspaceId)
        throw new Error("No workspace is available for your account yet. Create a workspace in Settings first.");
      const errors = validateVCard(input);
      const first = Object.values(errors)[0];
      if (first) throw new Error(first);
      const payload = {
        workspace_id: workspaceId,
        contact_id: input.contact_id ?? null,
        slug: input.slug,
        full_name: input.full_name.trim(),
        job_title: input.job_title || null,
        company: input.company || null,
        phone: input.phone || null,
        whatsapp: input.whatsapp || null,
        email: input.email || null,
        website: input.website || null,
        address: input.address || null,
        bio: input.bio || null,
        avatar_url: input.avatar_url || null,
        cover_url: input.cover_url || null,
        socials: input.socials ?? {},
        theme: input.theme ?? {},
        is_public: input.is_public ?? true,
      };
      if (input.id) {
        const { error } = await db("vcards").update(payload).eq("id", input.id);
        if (error) throw new Error(error.code === "23505" ? "That share link is already taken" : error.message);
        return input.id;
      }
      const { data, error } = await db("vcards").insert(payload).select("id").single();
      if (error) throw new Error(error.code === "23505" ? "That share link is already taken" : error.message);
      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["vcards"] });
      qc.invalidateQueries({ queryKey: ["vcard-revisions", id] });
    },
  });
}

export function useDeleteVCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db("vcards").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vcards"] }),
  });
}

export function buildVCardFile(card: VCard) {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${card.full_name}`,
    `N:${card.full_name};;;;`,
    card.company ? `ORG:${card.company}` : "",
    card.job_title ? `TITLE:${card.job_title}` : "",
    card.phone ? `TEL;TYPE=CELL:${card.phone}` : "",
    card.whatsapp ? `TEL;TYPE=WHATSAPP:${card.whatsapp}` : "",
    card.email ? `EMAIL;TYPE=INTERNET:${card.email}` : "",
    card.website ? `URL:${card.website}` : "",
    card.address ? `ADR;TYPE=WORK:;;${card.address};;;;` : "",
    card.bio ? `NOTE:${card.bio.replace(/\n/g, "\\n")}` : "",
    "END:VCARD",
  ].filter(Boolean);
  return lines.join("\r\n");
}

export function downloadVCardFile(card: VCard) {
  const blob = new Blob([buildVCardFile(card)], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${card.slug}.vcf`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function registerVCardView(vcardId: string) {
  try {
    await db("vcard_views").insert({
      vcard_id: vcardId,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
    });
  } catch {
    /* view tracking is best-effort */
  }
}

/* ------------------------------------------------------------------ */
/* Versioning, revocation and audit trail                              */
/* ------------------------------------------------------------------ */

export function useVCardRevisions(vcardId?: string) {
  return useQuery<VCardRevision[]>({
    queryKey: ["vcard-revisions", vcardId],
    enabled: !!vcardId,
    queryFn: async () => {
      const { data, error } = await db("vcard_revisions")
        .select("*")
        .eq("vcard_id", vcardId)
        .order("version", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VCardRevision[];
    },
  });
}

/**
 * Roles allowed to revoke, reactivate or roll back a card. Mirrors the
 * database guard (`public.can_manage_vcard_lifecycle`) so the UI hides what
 * the backend would reject anyway — the database stays the source of truth.
 */
export const VCARD_LIFECYCLE_ROLES = ["owner", "admin", "manager"] as const;

/** Can the signed-in user revoke / reactivate / roll back cards in this workspace? */
export function useCanManageVCardLifecycle() {
  const { active } = useCurrentWorkspace();
  const { role, isLoading } = useWorkspaceRole(active?.id ?? "");
  return {
    role,
    isLoading: !!active?.id && isLoading,
    canManage: !!role && (VCARD_LIFECYCLE_ROLES as readonly string[]).includes(role),
  };
}

/** Map the database role guard onto a message the user can act on. */
function asLifecycleError(error: { code?: string; message?: string } | null): Error | null {
  if (!error) return null;
  if (error.code === "42501" || /owners, admins and managers/i.test(error.message ?? ""))
    return new Error("You need workspace manager, admin or owner access to change a card's status.");
  if (error.code === "23505") return new Error("That share link is already taken");
  return new Error(error.message ?? "Something went wrong");
}

/** Revoke (kill the public link) or restore a card. History is written by the database. */
export function useSetVCardRevocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, revoked, reason }: { id: string; revoked: boolean; reason?: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const patch = revoked
        ? {
            revoked_at: new Date().toISOString(),
            revoked_reason: reason?.trim() || "Revoked by workspace admin",
            revoked_by: auth.user?.id ?? null,
          }
        : { revoked_at: null, revoked_reason: null, revoked_by: null };
      const { error } = await db("vcards").update(patch).eq("id", id);
      const mapped = asLifecycleError(error);
      if (mapped) throw mapped;
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["vcards"] });
      qc.invalidateQueries({ queryKey: ["vcard-revisions", vars.id] });
    },
  });
}

/**
 * Roll a card back to a previous revision. Runs through the
 * `restore_vcard_version` database function, which re-checks the caller's
 * workspace role before writing and records the rollback in the audit trail.
 */
export function useRestoreVCardVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (revision: VCardRevision) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("restore_vcard_version", {
        _revision_id: revision.id,
      });
      const mapped = asLifecycleError(error);
      if (mapped) throw mapped;
    },
    onSuccess: (_r, revision) => {
      qc.invalidateQueries({ queryKey: ["vcards"] });
      qc.invalidateQueries({ queryKey: ["vcard-revisions", revision.vcard_id] });
    },
  });
}

