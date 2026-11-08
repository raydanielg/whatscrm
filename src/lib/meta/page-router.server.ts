/**
 * Single decision point for Meta `object: "page"` webhook events.
 *
 * Meta sends Messenger chats and Page-linked Instagram DMs under the same
 * `object: "page"` envelope, with the Facebook Page id in `entry.id`. The
 * difference is the event's `recipient.id`:
 *
 *   - recipient is the linked Instagram user id (`ig_user_id`) -> Instagram DM
 *   - recipient is the Page id                                 -> Messenger chat
 *
 * Routing is decided per event, not per entry, because one Page can receive
 * both kinds. Each event goes to exactly one pipeline, so a message is never
 * mirrored twice or answered twice by the chatbot.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

export type PageEntry = Record<string, unknown>;

type Attribution = { workspaceId: string | null };

interface IgLink {
  page_id: string;
  ig_user_id: string;
}

/** Instagram account links for these Pages. One query per call. */
async function loadInstagramLinks(admin: Admin, pageIds: string[]): Promise<IgLink[]> {
  if (pageIds.length === 0) return [];
  const { data, error } = await admin
    .from("instagram_accounts")
    .select("page_id, ig_user_id")
    .in("page_id", pageIds)
    .neq("status", "disconnected");
  if (error) throw new Error(`instagram_accounts lookup failed: ${error.message}`);
  return ((data ?? []) as IgLink[]).filter((r) => !!r.page_id && !!r.ig_user_id);
}

/**
 * Split one page entry's events into Instagram-bound and Messenger-bound.
 * An event is Instagram only when its recipient is a linked ig_user_id of this Page.
 */
export function splitEntryEvents(entry: PageEntry, links: IgLink[]) {
  const pageId = String(entry.id ?? "");
  const igIds = new Set(links.filter((l) => l.page_id === pageId).map((l) => l.ig_user_id));
  const isInstagram = (evt: Record<string, unknown>) =>
    igIds.has(String((evt.recipient as { id?: string } | undefined)?.id ?? ""));

  const pick = (list: Array<Record<string, unknown>> | undefined) => {
    const all = list ?? [];
    return {
      ig: all.filter((e) => isInstagram(e)),
      msg: all.filter((e) => !isInstagram(e)),
    };
  };
  const messaging = pick(entry.messaging as Array<Record<string, unknown>> | undefined);
  const standby = pick(entry.standby as Array<Record<string, unknown>> | undefined);

  const igEntry = { ...entry, messaging: messaging.ig, standby: standby.ig };
  const msgEntry = { ...entry, messaging: messaging.msg, standby: standby.msg };
  return {
    instagram: messaging.ig.length + standby.ig.length > 0 ? igEntry : null,
    messenger: messaging.msg.length + standby.msg.length > 0 ? msgEntry : null,
  };
}

/**
 * Route one `object: "page"` payload. Each pipeline receives only its own events.
 */
export async function routePageWebhook(
  admin: Admin,
  payload: unknown,
  attribution: Attribution,
  pipelines: {
    instagram: (payload: unknown, attribution: Attribution) => Promise<void>;
    messenger: (payload: unknown, attribution: Attribution) => Promise<void>;
    /** Page `feed` changes (comments) for the social Inbox. */
    facebookFeed?: (payload: unknown, attribution: Attribution) => Promise<void>;
  },
) {
  const root = payload as { object?: string; entry?: PageEntry[] };
  if (root?.object !== "page") return;

  const entries = root.entry ?? [];
  const pageIds = Array.from(new Set(entries.map((e) => String(e.id ?? "")).filter(Boolean)));
  const links = await loadInstagramLinks(admin, pageIds);

  const igEntries: PageEntry[] = [];
  const msgEntries: PageEntry[] = [];
  const feedEntries: PageEntry[] = [];
  for (const entry of entries) {
    const split = splitEntryEvents(entry, links);
    if (split.instagram) igEntries.push(split.instagram);
    if (split.messenger) msgEntries.push(split.messenger);
    const feed = ((entry.changes as Array<Record<string, unknown>> | undefined) ?? []).filter(
      (c) => c.field === "feed",
    );
    if (feed.length > 0) feedEntries.push({ id: entry.id, time: entry.time, changes: feed });
  }

  const failures: string[] = [];
  if (feedEntries.length > 0 && pipelines.facebookFeed) {
    try {
      await pipelines.facebookFeed({ object: "page", entry: feedEntries }, attribution);
    } catch (err) {
      failures.push(`facebook feed: ${(err as Error).message}`);
    }
  }
  if (igEntries.length > 0) {
    try {
      await pipelines.instagram({ object: "instagram", entry: igEntries }, attribution);
    } catch (err) {
      failures.push(`instagram: ${(err as Error).message}`);
    }
  }
  if (msgEntries.length > 0) {
    try {
      await pipelines.messenger({ object: "page", entry: msgEntries }, attribution);
    } catch (err) {
      failures.push(`messenger: ${(err as Error).message}`);
    }
  }

  if (failures.length > 0) throw new Error(failures.join("; "));
}
