/**
 * useChatbotAnalytics — per-bot conversation analytics.
 *
 * Aggregates from chatbot_sessions + chatbot_messages under the caller's RLS
 * so each workspace only ever sees its own bots. Metrics:
 *   • reply_rate    — assistant messages / user messages (0–1)
 *   • handoff_count — sessions with status='handed_off'
 *   • last_active   — max(last_message_at) across sessions
 *   • sessions      — total sessions
 *   • messages      — total messages logged
 *
 * Callers pass a bot id list so we can bulk-fetch and render each row's KPIs
 * in the same view (e.g. Instagram chatbot cards) with a single round-trip.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ChatbotAnalytics {
  chatbotId: string;
  sessions: number;
  messages: number;
  userMessages: number;
  assistantMessages: number;
  replyRate: number | null;
  handoffCount: number;
  lastActiveAt: string | null;
}

const EMPTY = (chatbotId: string): ChatbotAnalytics => ({
  chatbotId,
  sessions: 0,
  messages: 0,
  userMessages: 0,
  assistantMessages: 0,
  replyRate: null,
  handoffCount: 0,
  lastActiveAt: null,
});

export async function fetchChatbotAnalytics(
  chatbotIds: string[],
): Promise<Record<string, ChatbotAnalytics>> {
  const out: Record<string, ChatbotAnalytics> = {};
  if (chatbotIds.length === 0) return out;
  for (const id of chatbotIds) out[id] = EMPTY(id);

  const [sessionsRes, messagesRes] = await Promise.all([
    supabase
      .from("chatbot_sessions")
      .select("chatbot_id,status,last_message_at")
      .in("chatbot_id", chatbotIds),
    supabase
      .from("chatbot_messages")
      .select("session_id,role,chatbot_sessions!inner(chatbot_id)")
      .in("chatbot_sessions.chatbot_id", chatbotIds),
  ]);

  if (sessionsRes.error) throw sessionsRes.error;
  if (messagesRes.error) throw messagesRes.error;

  for (const s of sessionsRes.data ?? []) {
    const row = out[s.chatbot_id as string];
    if (!row) continue;
    row.sessions += 1;
    if (s.status === "handed_off") row.handoffCount += 1;
    const lastAt = s.last_message_at as string | null;
    if (lastAt && (!row.lastActiveAt || lastAt > row.lastActiveAt)) {
      row.lastActiveAt = lastAt;
    }
  }

  for (const m of messagesRes.data ?? []) {
    // Supabase FK-embed returns nested obj or array depending on relation type.
    const rel = (m as { chatbot_sessions?: { chatbot_id?: string } | Array<{ chatbot_id?: string }> })
      .chatbot_sessions;
    const chatbotId = Array.isArray(rel) ? rel[0]?.chatbot_id : rel?.chatbot_id;
    if (!chatbotId) continue;
    const row = out[chatbotId];
    if (!row) continue;
    row.messages += 1;
    if (m.role === "user") row.userMessages += 1;
    else if (m.role === "assistant") row.assistantMessages += 1;
  }

  for (const row of Object.values(out)) {
    row.replyRate = row.userMessages > 0
      ? Math.min(1, row.assistantMessages / row.userMessages)
      : null;
  }
  return out;
}

export function useChatbotAnalytics(chatbotIds: string[]) {
  const key = [...chatbotIds].sort().join(",");
  return useQuery({
    queryKey: ["chatbot-analytics", key],
    queryFn: () => fetchChatbotAnalytics(chatbotIds),
    enabled: chatbotIds.length > 0,
    staleTime: 30_000,
  });
}

/** Format helpers reused across chatbot analytics surfaces. */
export function formatReplyRate(rate: number | null): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)}%`;
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
