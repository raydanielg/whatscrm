/**
 * Mobile AI reply suggestion endpoint.
 * The mobile app POSTs { conversation_id }; the server loads recent messages,
 * runs the shared AI Provider Engine, and returns a suggested reply.
 * Bearer auth is required so RLS scopes the read to the current agent.
 */
import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { runChat } from '@/lib/ai/complete.functions';
import { getPlatformBranding } from '@/lib/admin/platform-branding.functions';

export const Route = createFileRoute('/api/mobile/ai-reply')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get('authorization') ?? request.headers.get('Authorization');
        if (!auth?.toLowerCase().startsWith('bearer ')) {
          return new Response('Unauthorized', { status: 401 });
        }
        const token = auth.slice(7);
        const body = (await request.json().catch(() => ({}))) as { conversation_id?: string };
        if (!body.conversation_id) return new Response('conversation_id required', { status: 400 });

        const supabase = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: `Bearer ${token}` } },
          },
        );

        const { data: convo, error: cErr } = await supabase
          .from('conversations')
          .select('id, workspace_id')
          .eq('id', body.conversation_id)
          .maybeSingle();
        if (cErr || !convo) return new Response('Conversation not found', { status: 404 });

        const { data: msgs } = await supabase
          .from('messages')
          .select('sender_type, body, created_at')
          .eq('conversation_id', body.conversation_id)
          .order('created_at', { ascending: false })
          .limit(15);

        const transcript = (msgs ?? [])
          .reverse()
          .map((m: any) => `${m.sender_type === 'agent' ? 'Agent' : 'Customer'}: ${m.body ?? ''}`)
          .join('\n');

        try {
          const { platformName } = await getPlatformBranding();
          const workspaceId = (convo as any).workspace_id as string;
          const res = await runChat({
            workspaceId,
            feature: 'mobile_reply_suggest',
            request: {
              model: 'auto',
              messages: [
                {
                  role: 'system',
                  content:
                    `You are a helpful support agent replying inside ${platformName}. Draft a concise, friendly reply. Never invent facts.`,
                },
                { role: 'user', content: `Conversation so far:\n${transcript}\n\nDraft the next agent reply.` },
              ],
            },
          });
          return Response.json({ suggestion: res.content ?? '' });
        } catch (e: any) {
          return new Response(e?.message ?? 'AI failed', { status: 500 });
        }
      },
    },
  },
});
