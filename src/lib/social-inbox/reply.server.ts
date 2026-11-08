/**
 * Deliver an Inbox reply on a social comment thread as a public comment reply.
 */
import { isSocialInboxPlatform, type SocialInboxPlatform } from "./normalize";
import { loadSocialInboxAccount, replyToSocialComment, type Admin, type FetchImpl } from "./platforms.server";

interface ConversationLike {
  id: string;
  workspace_id: string;
  channel: string;
  metadata: Record<string, unknown> | null;
}

interface MessageLike {
  body: string | null;
  reply_to_id: string | null;
}

type Meta = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Which comment the reply attaches to: the quoted one, else the latest inbound. */
export async function resolveReplyTarget(
  admin: Admin,
  conv: ConversationLike,
  msg: MessageLike,
): Promise<{ targetId: string; postId: string } | null> {
  const convMeta = (conv.metadata ?? {}) as Meta;
  const pick = (m: Meta | null | undefined) => {
    const targetId = s(m?.reply_target_id) ?? s(m?.comment_id);
    const postId = s(m?.post_id) ?? s(convMeta.post_id);
    return targetId && postId ? { targetId, postId } : null;
  };

  if (msg.reply_to_id) {
    const { data } = await admin
      .from("messages")
      .select("metadata, conversation_id")
      .eq("id", msg.reply_to_id)
      .maybeSingle();
    const quoted = data as { metadata?: Meta; conversation_id?: string } | null;
    if (quoted?.conversation_id === conv.id) {
      const target = pick(quoted.metadata);
      if (target) return target;
    }
  }

  const { data: latest } = await admin
    .from("messages")
    .select("metadata")
    .eq("conversation_id", conv.id)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return pick((latest as { metadata?: Meta } | null)?.metadata) ?? pick(convMeta);
}

export async function deliverSocialCommentReply(args: {
  admin: Admin;
  conv: ConversationLike;
  msg: MessageLike;
  fetchImpl?: FetchImpl;
}): Promise<{ providerMessageId: string | null; targetId: string; postId: string }> {
  const { admin, conv, msg } = args;
  if (!isSocialInboxPlatform(conv.channel)) throw new Error("Not a social comment conversation.");
  const platform = conv.channel as SocialInboxPlatform;
  const text = msg.body?.trim();
  if (!text) throw new Error("Message is empty.");

  const accountId = s((conv.metadata ?? {}).account_id);
  if (!accountId) throw new Error("This conversation is not linked to a connected account.");
  const account = await loadSocialInboxAccount(admin, {
    workspaceId: conv.workspace_id,
    accountId,
    platform,
  });
  if (!account) throw new Error("The connected account for this thread was not found or is disconnected. Reconnect it.");

  const target = await resolveReplyTarget(admin, conv, msg);
  if (!target) throw new Error("Could not find the comment this reply belongs to.");

  const providerMessageId = await replyToSocialComment({
    account,
    targetId: target.targetId,
    postId: target.postId,
    text,
    fetchImpl: args.fetchImpl,
  });
  return { providerMessageId, ...target };
}
