import type { UntypedClient } from "@/lib/supabase/untyped";

/** Refresh private Storage URLs when a scheduled campaign is delivered. */
export async function campaignMediaForDelivery(
  admin: Pick<UntypedClient, "storage">,
  mediaUrl: string | null,
  workspaceId: string,
): Promise<string | null> {
  if (!mediaUrl) return null;
  const source = new URL(mediaUrl);
  const projectUrl = process.env["SUPABASE_URL"];
  if (!projectUrl || source.origin !== new URL(projectUrl).origin) return mediaUrl;
  const prefix = "/storage/v1/object/sign/campaign-media/";
  if (!source.pathname.startsWith(prefix)) return mediaUrl;
  const key = decodeURIComponent(source.pathname.slice(prefix.length));
  if (!key.startsWith(workspaceId + "/") || key.split("/").includes(".."))
    throw new Error("Campaign media belongs to another workspace");
  const bucket = admin.storage.from("campaign-media");
  const { data, error } = await bucket.createSignedUrl(key, 3600);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Could not refresh campaign media URL");
  return data.signedUrl;
}
