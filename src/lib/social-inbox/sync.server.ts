/**
 * Social comment sync: every connected Facebook Page, YouTube channel,
 * LinkedIn member and TikTok Business account → Inbox. Run by the
 * `wa-social-inbox-sync` cron (every 5 min) and the Inbox "Sync now" action.
 */
import { ingestSocialComments, type IngestResult } from "./ingest.server";
import {
  fetchRecentComments,
  loadSocialInboxAccounts,
  type Admin,
  type FetchImpl,
  type SocialInboxAccount,
} from "./platforms.server";

/** First sync only looks back this far so a busy page doesn't flood the Inbox. */
export const INITIAL_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
/** Re-read a small overlap each run; duplicates are dropped by comment id. */
const OVERLAP_MS = 10 * 60 * 1000;

export interface AccountSyncResult extends Partial<IngestResult> {
  accountId: string;
  platform: string;
  name: string;
  ok: boolean;
  error?: string;
}

async function readCursor(admin: Admin, account: SocialInboxAccount): Promise<string | null> {
  const { data } = await admin
    .from("social_inbox_sync_state")
    .select("last_success_at")
    .eq("account_source", account.source)
    .eq("account_id", account.id)
    .maybeSingle();
  return (data as { last_success_at?: string | null } | null)?.last_success_at ?? null;
}

async function writeState(
  admin: Admin,
  account: SocialInboxAccount,
  patch: { ok: boolean; error?: string; result?: Record<string, unknown>; startedAt: string },
) {
  const row: Record<string, unknown> = {
    account_source: account.source,
    account_id: account.id,
    workspace_id: account.workspaceId,
    platform: account.platform,
    last_synced_at: patch.startedAt,
    last_error: patch.ok ? null : (patch.error ?? "Sync failed").slice(0, 500),
    last_result: patch.result ?? {},
    updated_at: new Date().toISOString(),
  };
  if (patch.ok) row.last_success_at = patch.startedAt;
  await admin.from("social_inbox_sync_state").upsert(row, { onConflict: "account_source,account_id" });
}

export async function syncSocialAccount(
  admin: Admin,
  account: SocialInboxAccount,
  fetchImpl: FetchImpl = fetch,
): Promise<AccountSyncResult> {
  const startedAt = new Date().toISOString();
  const base = { accountId: account.id, platform: account.platform, name: account.name };
  try {
    const cursor = await readCursor(admin, account);
    const since = cursor
      ? new Date(new Date(cursor).getTime() - OVERLAP_MS)
      : new Date(Date.now() - INITIAL_LOOKBACK_MS);
    const { comments, externalId } = await fetchRecentComments(admin, account, fetchImpl);
    const fresh = comments.filter((c) => new Date(c.createdAt) >= since);
    const ingest = await ingestSocialComments(admin, { ...account, externalId }, fresh);
    await writeState(admin, account, {
      ok: true,
      startedAt,
      result: { fetched: comments.length, considered: fresh.length, ...ingest },
    });
    return { ...base, ok: true, ...ingest };
  } catch (err) {
    const error = (err as Error).message ?? "Sync failed";
    await writeState(admin, account, { ok: false, error, startedAt });
    return { ...base, ok: false, error };
  }
}

export async function syncSocialInbox(
  admin: Admin,
  opts: { workspaceId?: string; fetchImpl?: FetchImpl } = {},
): Promise<AccountSyncResult[]> {
  const accounts = await loadSocialInboxAccounts(admin, { workspaceId: opts.workspaceId });
  const results: AccountSyncResult[] = [];
  for (const account of accounts) {
    results.push(await syncSocialAccount(admin, account, opts.fetchImpl));
  }
  return results;
}
