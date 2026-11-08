/**
 * AI reply suggestion — reuses the shared AI Gateway via a server route.
 * The mobile app POSTs the conversation ID to /api/mobile/ai-reply on the
 * web backend; the server function does the RAG + provider call.
 * See src/routes/api/mobile/ai-reply.ts on the web side.
 */
import { supabase } from '@/api/supabase';
import { env } from '@/lib/env';

export async function suggestReply(conversationId: string): Promise<string> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  const res = await fetch(`${env.API_BASE_URL}/api/mobile/ai-reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ conversation_id: conversationId }),
  });
  if (!res.ok) throw new Error(`AI reply failed (${res.status})`);
  const json = (await res.json()) as { suggestion?: string };
  return json.suggestion ?? '';
}
