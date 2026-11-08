/**
 * Mirror social comments into the unified Inbox.
 *
 * One conversation per commenter per post (`socialThreadKey`). Comment ids are
 * stored as `messages.provider_message_id`, so webhook + polling replays are
 * idempotent. The connected account's own replies are mirrored as outbound
 * messages into the thread they answer.
 */
import { ensureInboxThread } from "@/lib/inbox/thread-dedup.server";
import { sbAny } from "@/lib/supabase/untyped";
import { socialThreadKey, type SocialComment } from "./normalize";
import type { Admin, SocialInboxAccount } from "./platforms.server";

export interface IngestResult {
  inserted: number;
  skipped: number;
  ownerMirrored: number;
  failed: number;
}

export async function resolveContact(
  admin: Admin,
  account: Pick<SocialInboxAccount, "workspaceId" | "platform">,
  comment: Pick<SocialComment, "authorId" | "authorName" | "authorAvatar">,
): Promise<string> {
  const { data: identity } = await admin
    .from("channel_identities")
    .select("id, contact_id, display_name")
    .eq("workspace_id", account.workspaceId)
    .eq("channel", account.platform)
    .eq("external_id", comment.authorId)
    .maybeSingle();
  const existing = identity as { id: string; contact_id: string | null; display_name: string | null } | null;
  const now = new Date().toISOString();

  if (existing?.contact_id) {
    const patch: Record<string, unknown> = { last_seen_at: now };
    if (comment.authorName && !existing.display_name) patch.display_name = comment.authorName;
    await admin.from("channel_identities").update(patch).eq("id", existing.id);
    return existing.contact_id;
  }

  const fallbackName = `${account.platform[0]!.toUpperCase()}${account.platform.slice(1)} user ${comment.authorId.slice(-6)}`;
  const { data: contact, error } = await admin
    .from("contacts")
    .insert({
      workspace_id: account.workspaceId,
      name: comment.authorName ?? fallbackName,
      display_name: comment.authorName,
      avatar_url: comment.authorAvatar,
      source: account.platform,
    })
    .select("id")
    .maybeSingle();
  if (error || !contact) throw new Error(error?.message ?? "Failed to create contact");
  const contactId = (contact as { id: string }).id;

  const row = {
    workspace_id: account.workspaceId,
    contact_id: contactId,
    channel: account.platform,
    external_id: comment.authorId,
    display_name: comment.authorName,
    last_seen_at: now,
    metadata: { avatar_url: comment.authorAvatar },
  };
  if (existing) await sbAny(admin).from("channel_identities").update(row).eq("id", existing.id);
  else await sbAny(admin).from("channel_identities").insert(row);
  return contactId;
}

async function findConversationId(admin: Admin, account: SocialInboxAccount, key: string) {
  const { data } = await admin
    .from("conversations")
    .select("id")
    .eq("workspace_id", account.workspaceId)
    .eq("channel", account.platform)
    .eq("external_conversation_id", key)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function hasMessage(admin: Admin, conversationId: string, providerId: string) {
  const { data } = await admin
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("provider_message_id", providerId)
    .maybeSingle();
  return !!data;
}

function messageMetadata(account: SocialInboxAccount, c: SocialComment) {
  return {
    source: "social_inbox",
    platform: c.platform,
    account_id: account.id,
    account_source: account.source,
    comment_id: c.commentId,
    parent_comment_id: c.parentCommentId,
    reply_target_id: c.replyTargetId,
    post_id: c.postId,
    permalink: c.permalink,
  };
}

async function insertMessage(admin: Admin, row: Record<string, unknown>): Promise<boolean> {
  const { error } = await sbAny(admin).from("messages").insert(row);
  if (!error) return true;
  if (String(error.message ?? "").toLowerCase().includes("duplicate")) return false;
  throw new Error(error.message);
}

/** Our own reply (made on the platform or echoed back by the sync). */
async function mirrorOwnerReply(admin: Admin, account: SocialInboxAccount, c: SocialComment) {
  const { data: parent } = await admin
    .from("messages")
    .select("conversation_id")
    .eq("workspace_id", account.workspaceId)
    .eq("provider_message_id", c.replyTargetId)
    .limit(1)
    .maybeSingle();
  const conversationId = (parent as { conversation_id?: string } | null)?.conversation_id;
  if (!conversationId || (await hasMessage(admin, conversationId, c.commentId))) return false;
  return insertMessage(admin, {
    workspace_id: account.workspaceId,
    conversation_id: conversationId,
    direction: "outbound",
    status: "sent",
    body: c.text,
    message_type: "text",
    provider_message_id: c.commentId,
    external_message_id: c.commentId,
    from_address: account.externalId,
    to_address: null,
    created_at: c.createdAt,
    metadata: messageMetadata(account, c),
  });
}

export async function ingestSocialComments(
  admin: Admin,
  account: SocialInboxAccount,
  comments: SocialComment[],
): Promise<IngestResult> {
  const result: IngestResult = { inserted: 0, skipped: 0, ownerMirrored: 0, failed: 0 };
  const accountKey = account.externalId ?? account.id;

  for (const c of comments) {
    try {
      if (c.fromOwner) {
        if (await mirrorOwnerReply(admin, account, c)) result.ownerMirrored++;
        else result.skipped++;
        continue;
      }

      const key = socialThreadKey(c.platform, accountKey, c.postId, c.authorId);
      const existingId = await findConversationId(admin, account, key);
      if (existingId && (await hasMessage(admin, existingId, c.commentId))) {
        result.skipped++;
        continue;
      }

      const contactId = await resolveContact(admin, account, c);
      const { conversationId } = await ensureInboxThread(admin, {
        workspaceId: account.workspaceId,
        channel: c.platform,
        externalConversationId: key,
        accountId: account.id,
        contactId,
        inbound: true,
        preview: c.text,
        metadata: {
          source: "social_inbox",
          platform: c.platform,
          account_source: account.source,
          account_external_id: accountKey,
          post_id: c.postId,
          post_text: c.postText ? c.postText.slice(0, 280) : null,
          permalink: c.permalink,
          author_id: c.authorId,
          author_name: c.authorName,
          chat_id: c.authorId,
          reply_target_id: c.replyTargetId,
        },
      });

      const inserted = await insertMessage(admin, {
        workspace_id: account.workspaceId,
        conversation_id: conversationId,
        direction: "inbound",
        status: "delivered",
        body: c.text,
        message_type: "text",
        provider_message_id: c.commentId,
        external_message_id: c.commentId,
        from_address: c.authorId,
        to_address: accountKey,
        created_at: c.createdAt,
        metadata: messageMetadata(account, c),
      });
      if (inserted) result.inserted++;
      else result.skipped++;
    } catch (err) {
      result.failed++;
      console.warn("[social-inbox] ingest failed:", c.platform, c.commentId, (err as Error).message);
    }
  }
  return result;
}
