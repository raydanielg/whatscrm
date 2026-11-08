/**
 * Typing indicators via a broadcast channel scoped to a conversation.
 * No table required — pure ephemeral broadcast, same pattern as Slack/Intercom.
 */
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/api/supabase';

export function useTypingChannel(conversationId: string, meUserId?: string) {
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!conversationId) return;
    const ch = supabase.channel(`typing:${conversationId}`, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'typing' }, (payload) => {
      const uid = (payload.payload as any)?.user_id as string | undefined;
      if (!uid) return;
      setTypingUsers((prev) => ({ ...prev, [uid]: Date.now() }));
    }).subscribe();
    chRef.current = ch;

    const gc = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => {
        const next: typeof prev = {};
        for (const [k, v] of Object.entries(prev)) if (now - v < 4000) next[k] = v;
        return next;
      });
    }, 1500);

    return () => {
      clearInterval(gc);
      supabase.removeChannel(ch);
    };
  }, [conversationId]);

  const sendTyping = () => {
    if (!chRef.current || !meUserId) return;
    chRef.current.send({ type: 'broadcast', event: 'typing', payload: { user_id: meUserId, at: Date.now() } });
  };

  return { typingUserIds: Object.keys(typingUsers), sendTyping };
}
