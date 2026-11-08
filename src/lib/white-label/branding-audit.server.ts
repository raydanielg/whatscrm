/**
 * Branding audit — records an `audit_logs` entry whenever a workspace saves
 * branding colours.
 *
 * The entry captures which colour fields changed, the *resolved* `--primary`
 * value (workspace primary → platform branding primary → accent, mirroring
 * `TenantAccentProvider`), and the exact list of CSS custom properties whose
 * values move as a result, so a colour change can be traced end to end.
 */
import {
  DEFAULT_ACCENT,
  accentTokens,
  accentForeground,
  isValidAccent,
} from '@/lib/themes/accent-color';
import { sbAny } from "@/lib/supabase/untyped";

/** Colour fields on `white_label_configs` that feed the runtime tokens. */
export const BRANDING_COLOR_FIELDS = [
  'primary_color',
  'secondary_color',
  'accent_color',
  'background_color',
  'sidebar_background',
  'sidebar_foreground',
  'sidebar_accent',
  'dashboard_background',
  'dashboard_accent',
  'dark_primary_color',
  'dark_background_color',
  'dark_accent_color',
] as const;

type Row = Record<string, unknown> | null | undefined;

function str(row: Row, key: string): string | null {
  const v = row?.[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Resolve the tokens a config produces, using the same precedence as the
 * runtime provider. `isDark` is false: audits record the light-mode values.
 */
export function resolveBrandingTokens(
  config: Row,
  platform: { primaryColor: string | null; accentColor: string | null },
): { primary: string; accent: string; tokens: Record<string, string> } {
  const active = Boolean(config?.['is_active']);
  const platformAccent = isValidAccent(platform.accentColor) ? platform.accentColor.trim() : null;
  const wlAccent = str(config, 'accent_color');
  const accent =
    (active && isValidAccent(wlAccent) ? wlAccent : null) ?? platformAccent ?? DEFAULT_ACCENT;

  const wlPrimary = str(config, 'primary_color');
  const platformPrimary = isValidAccent(platform.primaryColor) ? platform.primaryColor.trim() : null;
  const primaryOverride = (active && isValidAccent(wlPrimary) ? wlPrimary : null) ?? platformPrimary;

  const tokens = accentTokens(accent, false);
  if (primaryOverride) {
    tokens['--primary'] = primaryOverride;
    tokens['--primary-foreground'] = accentForeground(primaryOverride);
  }
  return { primary: tokens['--primary'] ?? accent, accent, tokens };
}

async function readPlatformColors(): Promise<{ primaryColor: string | null; accentColor: string | null }> {
  try {
    const { supabaseAdmin } = await import('@/lib/demo/admin-write-guard.server');
    const { data } = await supabaseAdmin
      .from('settings')
      .select('key, value')
      .eq('scope', 'platform')
      .eq('key', 'branding')
      .maybeSingle();
    const value = (data?.value ?? {}) as Record<string, unknown>;
    const primary = typeof value['primary_color'] === 'string' ? (value['primary_color'] as string) : null;
    const accent = typeof value['accent_color'] === 'string' ? (value['accent_color'] as string) : null;
    return { primaryColor: primary, accentColor: accent };
  } catch {
    return { primaryColor: null, accentColor: null };
  }
}

/**
 * Write the audit entry. Never throws — an audit failure must not roll back a
 * successful branding save.
 */
export async function auditBrandingColorChange(params: {
  workspaceId: string;
  actorId: string;
  before: Row;
  after: Row;
}): Promise<void> {
  const { workspaceId, actorId, before, after } = params;
  try {
    const changes: Record<string, { from: string | null; to: string | null }> = {};
    for (const field of BRANDING_COLOR_FIELDS) {
      const from = str(before, field);
      const to = str(after, field);
      if (from !== to) changes[field] = { from, to };
    }
    const activeBefore = Boolean(before?.['is_active']);
    const activeAfter = Boolean(after?.['is_active']);
    if (activeBefore !== activeAfter) {
      changes['is_active'] = { from: String(activeBefore), to: String(activeAfter) };
    }
    if (Object.keys(changes).length === 0) return;

    const platform = await readPlatformColors();
    const prevTokens = resolveBrandingTokens(before, platform);
    const nextTokens = resolveBrandingTokens(after, platform);

    const cssVariables = Object.keys(nextTokens.tokens)
      .filter((name) => nextTokens.tokens[name] !== prevTokens.tokens[name])
      .sort();

    // `audit_logs` has no INSERT policy (append-only, read by admins), so the
    // entry is written with the service client after the caller was already
    // authorised by the calling server function.
    const { supabaseAdmin } = await import('@/lib/demo/admin-write-guard.server');
    await sbAny(supabaseAdmin).from('audit_logs').insert({
      workspace_id: workspaceId,
      actor_id: actorId,
      action: 'update',
      resource_type: 'white_label_colors',
      resource_id: workspaceId,
      changes,
      metadata: {
        resolved_primary: nextTokens.primary,
        previous_resolved_primary: prevTokens.primary,
        resolved_accent: nextTokens.accent,
        css_variables_updated: cssVariables,
        css_variable_values: Object.fromEntries(cssVariables.map((n) => [n, nextTokens.tokens[n]])),
        platform_primary: platform.primaryColor,
        platform_accent: platform.accentColor,
      },
    });
  } catch {
    // Auditing is best-effort; the branding save already succeeded.
  }
}
