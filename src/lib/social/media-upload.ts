/**
 * Uploads composer media (images / video) into the private `social-media`
 * bucket and returns a long-lived signed URL.
 *
 * Platform publish APIs (Meta, TikTok, YouTube, X) fetch the asset over plain
 * HTTPS, so the scheduler needs a URL that stays reachable until the post goes
 * out — a one-year signed URL covers any realistic schedule window while
 * keeping the bucket private to workspace members.
 */
import { supabase } from "@/integrations/supabase/client";
import { BUCKETS, BUCKET_CONFIG, safeExtension } from "@/lib/storage/buckets";

export const SOCIAL_MEDIA_BUCKET = BUCKETS.SOCIAL_MEDIA;
const SIGNED_URL_TTL = 60 * 60 * 24 * 365;
const MAX_BYTES = BUCKET_CONFIG[BUCKETS.SOCIAL_MEDIA].maxBytes ?? 200 * 1024 * 1024;

export interface UploadedMedia {
  url: string;
  path: string;
  kind: "image" | "video";
}

/**
 * A random name, not the user's. The extension is the only part worth keeping
 * — platforms sniff it — and a UUID removes any chance of one upload silently
 * overwriting another inside the same workspace and day.
 */
function safeName(name: string): string {
  return `${crypto.randomUUID()}.${safeExtension(name)}`;
}

/**
 * Turn a Storage failure into something the composer can act on. A missing
 * bucket and a rejected policy are different jobs for whoever reads the toast,
 * so they must not both surface as the raw driver string.
 */
function describeUploadError(message: string): string {
  if (/bucket not found/i.test(message)) {
    return `Storage bucket "${SOCIAL_MEDIA_BUCKET}" does not exist in this Supabase project. Run the database migrations, then retry.`;
  }
  if (/row-level security|not authorized|unauthorized|permission/i.test(message)) {
    return "You do not have permission to upload media for this workspace.";
  }
  return message;
}

export async function uploadSocialMedia(workspaceId: string, file: File): Promise<UploadedMedia> {
  if (!workspaceId) throw new Error("No active workspace");
  if (file.size > MAX_BYTES) throw new Error("File is larger than the 200MB limit");
  const isVideo = file.type.startsWith("video/");
  const isImage = file.type.startsWith("image/");
  if (!isVideo && !isImage) throw new Error("Only image and video files can be attached");

  // Workspace id first — `social_media_insert` authorises on
  // `(storage.foldername(name))[1]`, so nothing else is accepted.
  const path = `${workspaceId}/${new Date().toISOString().slice(0, 10)}/${safeName(file.name)}`;
  const { error } = await supabase.storage.from(SOCIAL_MEDIA_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw new Error(describeUploadError(error.message));

  const { data, error: signErr } = await supabase.storage
    .from(SOCIAL_MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (signErr || !data?.signedUrl) {
    throw new Error(signErr?.message ?? "Could not create a public link for the file");
  }

  return { url: data.signedUrl, path, kind: isVideo ? "video" : "image" };
}
