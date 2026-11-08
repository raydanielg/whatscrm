/**
 * Public cron endpoint for the social post scheduler.
 *
 * Called by pg_cron every minute via `public._wa_cron_post`, which sends the
 * `x-cron-token` header matching INTERNAL_CRON_TOKEN. No user data is returned.
 */
import { createFileRoute } from '@tanstack/react-router';
import { guardCronRequest } from '@/lib/api/request-guards';

export const Route = createFileRoute('/api/public/hooks/scheduled-social')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardCronRequest(request);
        if (denied) return denied;
        try {
          const { processDueSocialPosts } = await import('@/lib/social/scheduler.server');
          const result = await processDueSocialPosts();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (err) {
          return new Response(JSON.stringify({ ok: false, error: String(err) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    },
  },
});
