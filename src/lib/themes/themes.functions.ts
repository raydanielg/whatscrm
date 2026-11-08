/**
 * Theme engine — server functions and token application helper.
 *
 * Themes ship a `tokens` object of CSS custom properties (e.g. `--primary`).
 * `applyThemeTokens` injects them into `:root` at runtime, so a workspace's
 * active theme + overrides re-skins the app without a rebuild.
 */
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

function publicClient() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: any, init: any) => {
        const h = new Headers(init?.headers);
        if (key.startsWith('sb_') && h.get('Authorization') === `Bearer ${key}`) h.delete('Authorization');
        h.set('apikey', key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

async function activeWorkspaceId(supabase: any, userId: string, requested?: string | null): Promise<string> {
  let query = supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId);
  if (requested) query = query.eq('workspace_id', requested);
  const { data, error } = await query
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (requested && !data?.workspace_id) throw new Error('You do not have access to this workspace');
  if (!data?.workspace_id) throw new Error('No workspace for user');
  return data.workspace_id as string;
}

const WorkspaceSchema = z.object({ workspaceId: z.string().uuid().optional().nullable() });

export const listPublicThemes = createServerFn({ method: 'GET' }).handler(async () => {
  const client = publicClient();
  const { data, error } = await client
    .from('themes')
    .select('*')
    .eq('is_public', true)
    .order('is_featured', { ascending: false })
    .order('install_count', { ascending: false })
    .limit(60);
  if (error) throw error;
  return { themes: data ?? [] };
});

export const activateTheme = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: { themeId: string; workspaceId?: string | null; overrides?: Record<string, string> }) =>
    z.object({ themeId: z.string().uuid(), workspaceId: z.string().uuid().optional().nullable(), overrides: z.record(z.string()).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await activeWorkspaceId(context.supabase, context.userId, data.workspaceId);
    const { data: isAdmin, error: adminError } = await context.supabase.rpc('is_workspace_admin', {
      _workspace_id: workspaceId,
      _user_id: context.userId,
    });
    if (adminError) throw adminError;
    if (!isAdmin) throw new Error('Only workspace admins can activate themes');
    const { data: publicTheme, error: themeError } = await context.supabase
      .from('themes')
      .select('id')
      .eq('id', data.themeId)
      .eq('is_public', true)
      .maybeSingle();
    if (themeError) throw themeError;
    if (!publicTheme) throw new Error('This theme is unavailable');
    const { error: deactivateError } = await context.supabase
      .from('theme_installations')
      .update({ is_active: false })
      .eq('workspace_id', workspaceId);
    if (deactivateError) throw deactivateError;
    const { error } = await context.supabase
      .from('theme_installations')
      .upsert(
        {
          workspace_id: workspaceId,
          theme_id: data.themeId,
          overrides: data.overrides ?? {},
          is_active: true,
          installed_by: context.userId,
        },
        { onConflict: 'workspace_id,theme_id' },
      );
    if (error) throw error;
    return { ok: true };
  });

export const getActiveTheme = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => WorkspaceSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const workspaceId = await activeWorkspaceId(context.supabase, context.userId, data.workspaceId);
    const { data: installation, error } = await context.supabase
      .from('theme_installations')
      .select('*, themes(*)')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw error;
    return { installation: installation ?? null, workspaceId };
  });

/**
 * Reset the workspace back to the default look: no marketplace theme active.
 * Accent + appearance mode are reset by their own owners on the client.
 */
export const resetWorkspaceTheme = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => WorkspaceSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const workspaceId = await activeWorkspaceId(context.supabase, context.userId, data.workspaceId);
    const { data: isAdmin, error: adminError } = await context.supabase.rpc('is_workspace_admin', {
      _workspace_id: workspaceId,
      _user_id: context.userId,
    });
    if (adminError) throw adminError;
    if (!isAdmin) throw new Error('Only workspace admins can reset themes');
    const { error } = await context.supabase
      .from('theme_installations')
      .update({ is_active: false })
      .eq('workspace_id', workspaceId);
    if (error) throw error;
    return { ok: true };
  });
