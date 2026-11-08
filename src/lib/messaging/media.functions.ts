/**
 * Enterprise media management server functions.
 *
 * Flow:
 *   1. `createMediaUploadUrl` — issues a signed PUT URL directly to Supabase
 *      Storage so the client can upload large files without going through
 *      the server function (avoids 10 MB request bodies + supports resume).
 *   2. Client uploads bytes with the signed URL.
 *   3. `finalizeMediaUpload` — records the row in `message_attachments`,
 *      sets expiration, visibility, sha256, variants.
 *   4. `getMediaSignedUrl` — issues short-lived signed download URLs and
 *      bumps analytics via `mark_media_accessed`.
 *   5. `deleteMediaAttachment` — soft-deletes + removes the storage object.
 *   6. `getMediaStats` — workspace-wide storage analytics.
 *   7. `cleanupExpiredMedia` — admin/cron: removes past-expiry objects.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getCallerOrgId } from "@/lib/developer/api-keys.functions";
import { sbAny } from "@/lib/supabase/untyped";

const BUCKET = "attachments";
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB per file
const SIGNED_URL_TTL_SECONDS = 60 * 10; // 10 minutes for downloads
const UPLOAD_URL_TTL_SECONDS = 60 * 30; // 30 minutes for uploads

/**
 * Resolve the organization id that owns a workspace, under the caller's RLS.
 * Returns `null` when the caller cannot see the workspace or when the
 * workspace has no `organization_id`.
 */
async function resolveWorkspaceOrgId(
  supabase: any,
  workspaceId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("workspaces")
    .select("organization_id")
    .eq("id", workspaceId)
    .maybeSingle();
  return (data as { organization_id: string | null } | null)?.organization_id ?? null;
}

/**
 * Cross-tenant guard for media operations. Every signed URL request MUST
 * declare the caller's active organization. We verify the caller belongs to
 * that org AND that the workspace which owns the attachment resolves to the
 * same org — so a signed URL request minted while active-org = B for an
 * org-A attachment is rejected, and a stolen/shared org-A URL cannot be
 * re-minted inside an org-B session.
 */
async function assertActiveOrgOwnsWorkspace(
  supabase: any,
  userId: string,
  workspaceId: string,
  activeOrgId: string,
): Promise<string> {
  const verifiedOrgId = await getCallerOrgId(supabase, userId, activeOrgId);
  const workspaceOrgId = await resolveWorkspaceOrgId(supabase, workspaceId);
  if (!workspaceOrgId || workspaceOrgId !== verifiedOrgId) {
    throw new Error(
      "Forbidden: attachment does not belong to the active organization",
    );
  }
  return verifiedOrgId;
}

const CreateUploadSchema = z.object({
  workspaceId: z.string().uuid(),
  activeOrgId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(200),
  sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
});

/** Issue a signed upload URL for a client-side direct upload to Storage. */
export const createMediaUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => CreateUploadSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Confirm caller belongs to the workspace (RLS-safe check).
    const { data: mem } = await context.supabase
      .from("workspace_members" as never)
      .select("role")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .eq("status", "active")
      .maybeSingle();
    if (!mem) throw new Error("Not a member of this workspace");

    // Enforce active-org scoping — workspace must belong to the active org
    // the client claims, and the caller must be a verified member of that org.
    const orgId = await assertActiveOrgOwnsWorkspace(
      context.supabase,
      context.userId,
      data.workspaceId,
      data.activeOrgId,
    );

    const safeName = data.filename.replace(/[^\w.\-]/g, "_").slice(-120);
    // Prefix the object path with the org id so storage layout is naturally
    // partitioned per-tenant. Downstream storage RLS can `starts_with` on
    // `<orgId>/` to enforce tenant boundaries.
    const objectPath = `${orgId}/${data.workspaceId}/uploads/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

    // Admin client is required because Storage signed uploads use the service key.
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: signed, error } = await supabaseAdmin
      .storage.from(BUCKET)
      .createSignedUploadUrl(objectPath);
    if (error || !signed) throw new Error(error?.message ?? "Failed to sign upload");

    return {
      bucket: BUCKET,
      path: objectPath,
      token: signed.token,
      signedUrl: signed.signedUrl,
      expiresIn: UPLOAD_URL_TTL_SECONDS,
    };
  });

const FinalizeSchema = z.object({
  workspaceId: z.string().uuid(),
  messageId: z.string().uuid().optional(),
  storagePath: z.string().min(1),
  filename: z.string().max(255),
  mimeType: z.string().max(200),
  sizeBytes: z.number().int().min(0),
  sha256: z.string().max(128).optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  durationSeconds: z.number().optional(),
  variants: z.record(z.string(), z.unknown()).optional(),
  expiresAt: z.string().datetime().optional(),
  visibility: z.enum(["workspace", "internal", "public"]).default("workspace"),
});

/** Record an uploaded object in `message_attachments`. */
export const finalizeMediaUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => FinalizeSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (data.sizeBytes > MAX_UPLOAD_BYTES) throw new Error("File exceeds 100 MB limit");

    const { data: row, error } = await context.supabase
      .from("message_attachments" as never)
      .insert({
        workspace_id: data.workspaceId,
        message_id: data.messageId ?? null,
        storage_bucket: BUCKET,
        storage_path: data.storagePath,
        file_name: data.filename,
        mime_type: data.mimeType,
        size_bytes: data.sizeBytes,
        sha256: data.sha256 ?? null,
        width: data.width ?? null,
        height: data.height ?? null,
        duration_seconds: data.durationSeconds ?? null,
        variants: data.variants ?? {},
        visibility: data.visibility,
        expires_at: data.expiresAt ?? null,
        virus_scan_status: "pending",
        uploaded_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await sbAny(context.supabase).rpc("mark_media_accessed" as never, {
      _attachment_id: (row as { id: string }).id,
      _action: "upload",
    } as never);

    return row as { id: string };
  });

const SignedUrlSchema = z.object({
  attachmentId: z.string().uuid(),
  activeOrgId: z.string().uuid(),
  download: z.boolean().default(false),
  transform: z.object({
    width: z.number().int().min(16).max(4096).optional(),
    height: z.number().int().min(16).max(4096).optional(),
    quality: z.number().int().min(20).max(100).optional(),
    resize: z.enum(["cover", "contain", "fill"]).optional(),
  }).optional(),
});

/** Issue a short-lived signed URL for viewing/downloading media. */
export const getMediaSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => SignedUrlSchema.parse(input))
  .handler(async ({ data, context }) => {
    // RLS on message_attachments limits this to workspace members. We select
    // `workspace_id` so we can additionally cross-check active-org ownership
    // — RLS alone doesn't stop a user who is a member of BOTH org-A and
    // org-B from minting an org-A URL while operating inside org-B.
    const { data: att, error: aErr } = await context.supabase
      .from("message_attachments" as never)
      .select("workspace_id, storage_bucket, storage_path, file_name, mime_type, expires_at, is_deleted, visibility, size_bytes")
      .eq("id", data.attachmentId)
      .maybeSingle();
    if (aErr || !att) throw new Error("Attachment not found");
    const a = att as unknown as {
      workspace_id: string;
      storage_bucket: string; storage_path: string | null; file_name: string | null;
      mime_type: string | null; expires_at: string | null; is_deleted: boolean;
      visibility: string; size_bytes: number | null;
    };

    // Cross-tenant guard — mint the URL ONLY when the caller's active org
    // owns the attachment's workspace. Blocks org-A downloads from org-B.
    await assertActiveOrgOwnsWorkspace(
      context.supabase,
      context.userId,
      a.workspace_id,
      data.activeOrgId,
    );
    if (a.is_deleted) throw new Error("Attachment has been deleted");
    if (a.expires_at && new Date(a.expires_at) < new Date()) throw new Error("Attachment has expired");
    if (!a.storage_path) throw new Error("Attachment has no storage path");

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const options: { download?: string; transform?: Record<string, unknown> } = {};
    if (data.download) options.download = a.file_name ?? "download";
    if (data.transform && (a.mime_type ?? "").startsWith("image/")) {
      options.transform = {
        width: data.transform.width,
        height: data.transform.height,
        quality: data.transform.quality ?? 80,
        resize: data.transform.resize ?? "contain",
      };
    }
    const { data: signed, error } = await supabaseAdmin
      .storage.from(a.storage_bucket)
      .createSignedUrl(a.storage_path, SIGNED_URL_TTL_SECONDS, options);
    if (error || !signed) throw new Error(error?.message ?? "Failed to sign URL");

    await sbAny(context.supabase).rpc("mark_media_accessed" as never, {
      _attachment_id: data.attachmentId,
      _action: data.download ? "download" : "view",
    } as never);

    return {
      signedUrl: signed.signedUrl,
      expiresIn: SIGNED_URL_TTL_SECONDS,
      mimeType: a.mime_type,
      filename: a.file_name,
      sizeBytes: a.size_bytes,
    };
  });

/** Soft-delete an attachment and remove the underlying storage object. */
export const deleteMediaAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ attachmentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: att } = await context.supabase
      .from("message_attachments" as never)
      .select("id, workspace_id, storage_bucket, storage_path, uploaded_by")
      .eq("id", data.attachmentId)
      .maybeSingle();
    const a = att as { id: string; workspace_id: string; storage_bucket: string; storage_path: string | null; uploaded_by: string | null } | null;
    if (!a) throw new Error("Attachment not found");

    // Allow uploader OR workspace admin/owner.
    const { data: role } = await context.supabase
      .from("workspace_members" as never)
      .select("role")
      .eq("workspace_id", a.workspace_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    const r = (role as { role: string } | null)?.role;
    const canDelete = a.uploaded_by === context.userId || r === "owner" || r === "admin";
    if (!canDelete) throw new Error("Forbidden");

    const { error: uErr } = await context.supabase
      .from("message_attachments" as never)
      .update({ is_deleted: true } as never)
      .eq("id", a.id);
    if (uErr) throw new Error(uErr.message);

    if (a.storage_path) {
      const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
      await supabaseAdmin.storage.from(a.storage_bucket).remove([a.storage_path]);
    }
    await sbAny(context.supabase).rpc("mark_media_accessed" as never, {
      _attachment_id: a.id,
      _action: "delete",
    } as never);
    return { ok: true };
  });

/** Workspace-wide media stats + top recent uploads. */
export const getMediaStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: stats, error } = await context.supabase
      .rpc("workspace_media_stats" as never, { _workspace_id: data.workspaceId } as never)
      .single();
    if (error) throw new Error(error.message);
    const { data: recent } = await context.supabase
      .from("message_attachments" as never)
      .select("id, file_name, mime_type, size_bytes, uploaded_at, expires_at, download_count, uploaded_by")
      .eq("workspace_id", data.workspaceId)
      .eq("is_deleted", false)
      .order("uploaded_at", { ascending: false })
      .limit(25);
    return {
      stats: stats as {
        total_files: number; total_bytes: number;
        image_bytes: number; video_bytes: number; audio_bytes: number; document_bytes: number;
        expiring_soon: number;
      },
      recent: (recent ?? []) as Array<{
        id: string; file_name: string | null; mime_type: string | null; size_bytes: number | null;
        uploaded_at: string; expires_at: string | null; download_count: number; uploaded_by: string | null;
      }>,
    };
  });

/** Admin/cron: hard-delete storage objects for expired attachments. */
export const cleanupExpiredMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ batch: z.number().int().min(1).max(500).default(100) }).parse(input))
  .handler(async ({ data, context }) => {
    // Admin gate: any workspace admin OR superadmin can trigger.
    const { data: admin } = await context.supabase
      .from("workspace_members" as never)
      .select("workspace_id")
      .eq("user_id", context.userId)
      .in("role", ["owner", "admin"])
      .limit(1)
      .maybeSingle();
    if (!admin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: rows, error } = await sbAny(supabaseAdmin).rpc(
      "claim_expired_media" as never,
      { _limit: data.batch } as never,
    );
    if (error) throw new Error(error.message);
    const claimed = (rows ?? []) as Array<{ id: string; storage_bucket: string; storage_path: string }>;

    // Group by bucket and delete in batches.
    const byBucket = new Map<string, string[]>();
    for (const r of claimed) {
      if (!r.storage_path) continue;
      byBucket.set(r.storage_bucket, [...(byBucket.get(r.storage_bucket) ?? []), r.storage_path]);
    }
    for (const [bucket, paths] of byBucket) {
      if (paths.length === 0) continue;
      await supabaseAdmin.storage.from(bucket).remove(paths);
    }
    return { removed: claimed.length };
  });
