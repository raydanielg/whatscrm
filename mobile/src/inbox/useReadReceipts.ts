/**
 * Read receipts. When a message is displayed to the agent, upsert into
 * `message_read_receipts` (agent side). Same table used by the web platform.
 */
import { useEffect } from 'react';
import { supabase } from '@/api/supabase';

export function useMarkRead(messageIds: string[], userId?: string) {
  useEffect(() => {
    if (!userId || messageIds.length === 0) return;
    const rows = messageIds.map((mid) => ({ message_id: mid, user_id: userId, read_at: new Date().toISOString() }));
    supabase.from('message_read_receipts').upsert(rows, { onConflict: 'message_id,user_id' }).then(() => {});
  }, [userId, messageIds.join(',')]);
}
