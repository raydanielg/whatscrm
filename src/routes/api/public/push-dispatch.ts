/**
 * Push dispatch — called by a database trigger on public.notifications insert.
 * Fans out to every Expo push token registered for the target user, honoring
 * per-category preferences.
 *
 * Auth: bypasses gateway auth via `/api/public/*`, so the caller is verified
 * with the internal cron token (`x-cron-token`) the database trigger sends.
 * Fails closed when the token is missing or wrong.
 */
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { guardCronRequest } from '@/lib/api/request-guards';
import { sbAny } from "@/lib/supabase/untyped";


const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization',
} as const;

const BodySchema = z.object({ notification_id: z.string().uuid() });

type PushMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: 'default';
  priority: 'high';
  channelId: string;
  categoryId?: string;
  badge?: number;
  mutableContent?: boolean;
  _contentAvailable?: boolean;
};

async function sendExpoBatch(messages: PushMessage[]) {
  if (messages.length === 0) return { ok: 0, failed: 0, receipts: [] as unknown[] };
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    return { ok: 0, failed: messages.length, receipts: [], error: await res.text() };
  }
  const json = (await res.json()) as { data?: Array<{ status: string; message?: string; details?: { error?: string } }> };
  const receipts = json.data ?? [];
  const ok = receipts.filter((r) => r.status === 'ok').length;
  return { ok, failed: messages.length - ok, receipts };
}

export const Route = createFileRoute('/api/public/push-dispatch')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const denied = guardCronRequest(request);
        if (denied) return denied;
        try {
          const body = BodySchema.parse(await request.json());
          const { supabaseAdmin } = await import('@/lib/demo/admin-write-guard.server');

          const { data: n, error } = await supabaseAdmin
            .from('notifications')
            .select('id, user_id, title, body, category, action_url, data, channel, status')
            .eq('id', body.notification_id)
            .maybeSingle();
          if (error || !n || !n.user_id) {
            return Response.json({ ok: 0, failed: 0, reason: 'notification not found' }, { headers: CORS });
          }

          // Respect user preferences for this category.
          const category = (n.category ?? 'general').toLowerCase();
          const { data: pref } = await supabaseAdmin
            .from('notification_preferences')
            .select('push_enabled')
            .eq('user_id', n.user_id)
            .eq('category', category)
            .maybeSingle();
          if (pref && pref.push_enabled === false) {
            return Response.json({ ok: 0, failed: 0, reason: 'push disabled by preference' }, { headers: CORS });
          }

          const { data: tokens } = await supabaseAdmin
            .from('push_tokens')
            .select('token, platform')
            .eq('user_id', n.user_id)
            .eq('disabled', false);

          const list = (tokens ?? []).filter((t) => t.token?.startsWith('ExponentPushToken['));
          if (list.length === 0) {
            return Response.json({ ok: 0, failed: 0, reason: 'no active tokens' }, { headers: CORS });
          }

          const dataPayload = {
            ...(typeof n.data === 'object' && n.data ? (n.data as Record<string, unknown>) : {}),
            notificationId: n.id,
            category,
            actionUrl: n.action_url ?? undefined,
          };

          const messages: PushMessage[] = list.map((t) => ({
            to: t.token,
            title: n.title ?? 'Notification',
            body: n.body ?? '',
            data: dataPayload,
            sound: 'default',
            priority: 'high',
            channelId: category, // Android channel per category
            categoryId: category, // iOS rich action category
            mutableContent: true,
            _contentAvailable: true,
          }));

          // Expo caps batches at 100.
          const results = [] as Array<Awaited<ReturnType<typeof sendExpoBatch>>>;
          for (let i = 0; i < messages.length; i += 100) {
            results.push(await sendExpoBatch(messages.slice(i, i + 100)));
          }
          const ok = results.reduce((a, r) => a + r.ok, 0);
          const failed = results.reduce((a, r) => a + r.failed, 0);

          // Mark invalid tokens as disabled so we stop hitting them.
          const flat = results.flatMap((r) => r.receipts as Array<{ status: string; details?: { error?: string } }>);
          const invalid: string[] = [];
          flat.forEach((r, i) => {
            if (r.status !== 'ok' && r.details?.error === 'DeviceNotRegistered') {
              invalid.push(messages[i].to);
            }
          });
          if (invalid.length > 0) {
            await sbAny(supabaseAdmin).from('push_tokens').update({ disabled: true }).in('token', invalid);
          }

          return Response.json({ ok, failed }, { headers: CORS });
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : 'dispatch failed' },
            { status: 400, headers: CORS },
          );
        }
      },
    },
  },
});
