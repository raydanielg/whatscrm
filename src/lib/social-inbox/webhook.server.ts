/**
 * Facebook Page `feed` webhook → Inbox, in real time. Polling remains the
 * backstop for missed deliveries (same comment ids, so no duplicates).
 */
import { normalizeFacebookFeedChange, type SocialComment } from "./normalize";
import { ingestSocialComments } from "./ingest.server";
import { loadSocialInboxAccounts, type Admin } from "./platforms.server";

export async function processFacebookFeedEntries(
  admin: Admin,
  payload: unknown,
  attribution?: { workspaceId: string | null },
): Promise<void> {
  const entries = ((payload as { entry?: Array<Record<string, unknown>> })?.entry ?? []);
  const failures: string[] = [];

  for (const entry of entries) {
    const pageId = String(entry.id ?? "");
    if (!pageId) continue;
    const comments = ((entry.changes as unknown[]) ?? [])
      .map((change) => normalizeFacebookFeedChange(change, pageId))
      .filter((c): c is SocialComment => c !== null);
    if (comments.length === 0) continue;

    const accounts = await loadSocialInboxAccounts(admin, { facebookPageId: pageId });
    for (const account of accounts) {
      if (attribution && !attribution.workspaceId) attribution.workspaceId = account.workspaceId;
      const res = await ingestSocialComments(admin, account, comments);
      if (res.failed > 0) failures.push(`workspace ${account.workspaceId}: ${res.failed} comment(s) failed`);
    }
  }

  if (failures.length > 0) throw new Error(failures.join("; "));
}
