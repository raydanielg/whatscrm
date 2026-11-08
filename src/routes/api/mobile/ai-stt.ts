/**
 * Mobile speech-to-text proxy. Accepts multipart audio and forwards to the
 * speech-to-text provider. Gemini's OpenAI-compatible API has no transcription
 * endpoint, so this returns 501 until a speech provider is configured.
 * POST /api/mobile/ai-stt (multipart: file, model?)
 */
import { createFileRoute } from '@tanstack/react-router';
import { authenticateMobileRequest } from '@/lib/api/mobile-auth.server';

export const Route = createFileRoute('/api/mobile/ai-stt')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authed = await authenticateMobileRequest(request);
        if ('response' in authed) return authed.response;
        // Speech-to-text is not available on Gemini's OpenAI-compatible API yet.
        return Response.json(
          { error: 'Speech-to-text is not configured for this server.' },
          { status: 501 },
        );
      },
    },
  },
});
