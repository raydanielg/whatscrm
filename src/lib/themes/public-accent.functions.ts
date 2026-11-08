/**
 * Public accent lookup for shared Digital Cards (/v/:slug).
 *
 * Anonymous visitors can't read `white_label_configs`, so this server
 * function resolves the owning workspace's brand accent for a card that is
 * genuinely public (shared and not revoked) and returns nothing else. The
 * client polls it so a saved accent change lands on already-open cards
 * without a reload or cache clear.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

const SlugSchema = z.object({ slug: z.string().trim().regex(/^[a-z0-9-]{3,48}$/) });
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export const getPublicCardAccent = createServerFn({ method: 'GET' })
  .validator((input: unknown) => SlugSchema.parse(input))
  .handler(async ({ data }): Promise<{ accent: string | null }> => {
    const { supabaseAdmin } = await import('@/lib/demo/admin-write-guard.server');

    const { data: card } = await supabaseAdmin
      .from('vcards' as any)
      .select('workspace_id, is_public, revoked_at')
      .eq('slug', data.slug)
      .maybeSingle();

    const row = card as { workspace_id?: string; is_public?: boolean; revoked_at?: string | null } | null;
    // Never leak branding for cards that aren't publicly shared.
    if (!row?.workspace_id || !row.is_public || row.revoked_at) return { accent: null };

    const { data: config } = await supabaseAdmin
      .from('white_label_configs' as any)
      .select('accent_color, is_active')
      .eq('workspace_id', row.workspace_id)
      .maybeSingle();

    const cfg = config as { accent_color?: string | null; is_active?: boolean } | null;
    if (!cfg?.is_active) return { accent: null };
    const accent = typeof cfg.accent_color === 'string' ? cfg.accent_color.trim() : '';
    return { accent: HEX.test(accent) ? accent : null };
  });
