/**
 * Media service — downloads provider-hosted media once, deduplicates by
 * `external_media_id`, and uploads to the `attachments` storage bucket.
 *
 * Called by the webhook processor after an inbound media message is parsed.
 */

import { supabaseAdmin } from "@/lib/demo/admin-write-guard.server";
import { getProvider, loadCredentials } from "./registry.server";
import type { ChannelAccountRecord, ProviderName } from "./types";
import { log, makeCorrelationId } from "./logger.server";
import { sbAny } from "@/lib/supabase/untyped";

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface FetchAndCacheResult {
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  cached: boolean;
}

export async function fetchAndCacheMedia(
  provider: ProviderName,
  externalMediaId: string,
  account: ChannelAccountRecord,
): Promise<FetchAndCacheResult> {
  // 1) dedupe check
  const { data: existing } = await supabaseAdmin
    .from("provider_media_cache" as never)
    .select("*")
    .eq("provider", provider)
    .eq("external_media_id", externalMediaId)
    .maybeSingle();

  if (existing) {
    const e = existing as unknown as {
      status: string; storage_path: string | null; mime_type: string | null; size_bytes: number | null; sha256: string | null;
    };
    if (e.status === "ready" && e.storage_path) {
      return {
        storagePath: e.storage_path,
        mimeType: e.mime_type ?? "application/octet-stream",
        sizeBytes: Number(e.size_bytes ?? 0),
        sha256: e.sha256 ?? "",
        cached: true,
      };
    }
  }

  const impl = getProvider(provider);
  if (!impl.fetchMedia) throw new Error(`Provider ${provider} does not support fetchMedia`);
  const creds = loadCredentials(account);
  const correlationId = makeCorrelationId();

  const { bytes, mimeType, filename } = await impl.fetchMedia(externalMediaId, {
    account, credentials: creds, correlationId,
    log: (level, scope, message, data) => log({
      workspaceId: account.workspaceId, channelAccountId: account.id, provider,
      level, scope, message, data, correlationId,
    }),
  });

  const hash = await sha256Hex(bytes);
  const ext = filename?.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
  const storagePath = `${account.workspaceId}/wa-media/${externalMediaId}${ext}`;

  const up = await supabaseAdmin.storage.from("attachments").upload(storagePath, bytes, {
    contentType: mimeType,
    upsert: true,
  });
  if (up.error) throw new Error(`storage upload failed: ${up.error.message}`);

  await sbAny(supabaseAdmin).from("provider_media_cache" as never).upsert({
    provider,
    channel_account_id: account.id,
    external_media_id: externalMediaId,
    storage_bucket: "attachments",
    storage_path: storagePath,
    mime_type: mimeType,
    size_bytes: bytes.byteLength,
    sha256: hash,
    status: "ready",
    fetched_at: new Date().toISOString(),
  } as never, { onConflict: "provider,external_media_id" } as never);

  return { storagePath, mimeType, sizeBytes: bytes.byteLength, sha256: hash, cached: false };
}
