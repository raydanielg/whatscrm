/**
 * Mobile text-to-speech endpoint.
 * POST /api/mobile/ai-tts  { text, voice? }
 *
 * Gemini's OpenAI-compatible API has no speech endpoint, so this returns 501
 * until a speech provider is configured. Auth is still enforced first.
 */
import { createFileRoute } from '@tanstack/react-router';
import { authenticateMobileRequest } from '@/lib/api/mobile-auth.server';

export const Route = createFileRoute('/api/mobile/ai-tts')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authed = await authenticateMobileRequest(request);
        if ('response' in authed) return authed.response;
        return Response.json(
          { error: 'Text-to-speech is not configured for this server.' },
          { status: 501 },
        );
      },
    },
  },
});
