/**
 * Marketplace Operations — analytics, moderation, security scans, compatibility checks.
 * All actions require the `superadmin` role and are enforced by RLS on the underlying tables.
 */
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { sbAny } from "@/lib/supabase/untyped";

async function assertSuperadmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await sbAny(ctx.supabase).rpc('has_role', {
    _user_id: ctx.userId,
    _role: 'superadmin',
  });
  if (error || !data) throw new Error('Forbidden: superadmin required');
}

/* ------------------------------------------------------------------ Analytics */

export const getMarketplaceAnalytics = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context);
    const { supabaseAdmin: supabase } = await import('@/lib/demo/admin-write-guard.server');
    const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();

    const [
      pluginsAgg,
      themesAgg,
      downloads30,
      installsTotal,
      installs30,
      reviewsAll,
      purchases30,
      pendingPlugins,
      pendingThemes,
      pendingReviews,
      topPluginsByInstalls,
      topPluginsByRating,
      topThemes,
      recentPurchases,
    ] = await Promise.all([
      sbAny(supabase).from('plugins').select('id, status', { count: 'exact', head: false }),
      sbAny(supabase).from('themes').select('id, status', { count: 'exact', head: false }),
      sbAny(supabase).from('plugin_downloads').select('id', { count: 'exact', head: true }).gte('occurred_at', since30),
      sbAny(supabase).from('plugin_installations').select('id', { count: 'exact', head: true }),
      sbAny(supabase).from('plugin_installations').select('id', { count: 'exact', head: true }).gte('installed_at', since30),
      sbAny(supabase).from('plugin_reviews').select('rating'),
      supabase
        .from('plugin_purchases')
        .select('amount_cents, fee_cents, net_cents, currency, status, purchased_at')
        .gte('purchased_at', since30),
      sbAny(supabase).from('plugins').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
      sbAny(supabase).from('themes').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase
        .from('plugin_reviews')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since30),
      supabase
        .from('plugins')
        .select('id, name, slug, install_count, rating_avg, rating_count, status')
        .order('install_count', { ascending: false })
        .limit(10),
      supabase
        .from('plugins')
        .select('id, name, slug, rating_avg, rating_count, install_count')
        .gte('rating_count', 1)
        .order('rating_avg', { ascending: false })
        .limit(10),
      supabase
        .from('themes')
        .select('id, name, slug, install_count, is_featured, status')
        .order('install_count', { ascending: false })
        .limit(10),
      supabase
        .from('plugin_purchases')
        .select('id, plugin_id, amount_cents, currency, status, purchased_at, plugins(name, slug)')
        .order('purchased_at', { ascending: false })
        .limit(10),
    ]);

    const ratings = (reviewsAll.data ?? []) as Array<{ rating: number }>;
    const avgRating = ratings.length
      ? ratings.reduce((s, r) => s + (r.rating ?? 0), 0) / ratings.length
      : 0;

    const paidPurchases = (purchases30.data ?? []).filter(
      (p: any) => p.status === 'paid' || p.status === 'succeeded' || p.status === 'completed',
    );
    const revenueCents = paidPurchases.reduce((s: number, p: any) => s + (p.amount_cents ?? 0), 0);
    const netCents = paidPurchases.reduce((s: number, p: any) => s + (p.net_cents ?? 0), 0);

    const pluginRows = (pluginsAgg.data ?? []) as Array<{ status: string }>;
    const themeRows = (themesAgg.data ?? []) as Array<{ status: string }>;
    const countBy = (rows: Array<{ status: string }>, s: string) =>
      rows.filter((r) => r.status === s).length;

    return {
      counts: {
        pluginsTotal: pluginRows.length,
        pluginsApproved: countBy(pluginRows, 'approved') + countBy(pluginRows, 'published'),
        pluginsPending: countBy(pluginRows, 'pending') + countBy(pluginRows, 'submitted'),
        pluginsRejected: countBy(pluginRows, 'rejected'),
        themesTotal: themeRows.length,
        themesApproved: countBy(themeRows, 'approved') + countBy(themeRows, 'published'),
        themesPending: countBy(themeRows, 'pending'),
      },
      metrics30d: {
        downloads: downloads30.count ?? 0,
        installs: installs30.count ?? 0,
        installsTotal: installsTotal.count ?? 0,
        reviews: pendingReviews.count ?? 0,
        revenueCents,
        netCents,
        purchases: paidPurchases.length,
      },
      ratings: {
        total: ratings.length,
        average: Number(avgRating.toFixed(2)),
      },
      queues: {
        pendingPlugins: pendingPlugins.count ?? 0,
        pendingThemes: pendingThemes.count ?? 0,
      },
      topPluginsByInstalls: topPluginsByInstalls.data ?? [],
      topPluginsByRating: topPluginsByRating.data ?? [],
      topThemes: topThemes.data ?? [],
      recentPurchases: recentPurchases.data ?? [],
    };
  });

/* ------------------------------------------------------------------ Moderation queues */

export const getModerationQueue = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context);
    const { supabaseAdmin: supabase } = await import('@/lib/demo/admin-write-guard.server');

    const [plugins, themes, reviews, latestScans] = await Promise.all([
      supabase
        .from('plugins')
        .select('id, name, slug, publisher_name, status, category, pricing_model, created_at')
        .eq('status', 'pending_review')
        .order('created_at', { ascending: true }),
      supabase
        .from('themes')
        .select('id, name, slug, publisher_name, status, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      supabase
        .from('plugin_reviews')
        .select('id, plugin_id, rating, title, body, created_at, plugins(name, slug)')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('plugin_security_scans')
        .select('plugin_id, status, severity, scanned_at')
        .order('scanned_at', { ascending: false })
        .limit(200),
    ]);

    return {
      plugins: plugins.data ?? [],
      themes: themes.data ?? [],
      reviews: reviews.data ?? [],
      latestScans: latestScans.data ?? [],
    };
  });

/* ------------------------------------------------------------------ Approve / reject */

const decisionInput = z.object({
  entityType: z.enum(['plugin', 'theme']),
  entityId: z.string().uuid(),
  action: z.enum(['approve', 'reject', 'takedown', 'feature', 'unfeature', 'verify', 'unverify']),
  reason: z.string().max(2000).optional(),
});

export const moderateEntity = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((i: z.input<typeof decisionInput>) => decisionInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const { supabaseAdmin: supabase } = await import('@/lib/demo/admin-write-guard.server');
    const table = data.entityType === 'plugin' ? 'plugins' : 'themes';

    const patch: Record<string, any> = {
      moderated_at: new Date().toISOString(),
      moderated_by: context.userId,
    };
    switch (data.action) {
      case 'approve':
        patch.status = data.entityType === 'plugin' ? 'published' : 'approved';
        patch.is_public = true;
        patch.rejection_reason = null;
        break;
      case 'reject':
        patch.status = 'rejected';
        patch.is_public = false;
        patch.rejection_reason = data.reason ?? 'Rejected by moderator';
        break;
      case 'takedown':
        patch.status = data.entityType === 'plugin' ? 'archived' : 'suspended';
        patch.is_public = false;
        patch.rejection_reason = data.reason ?? 'Taken down by moderator';
        break;
      case 'feature':
        patch.is_featured = true;
        break;
      case 'unfeature':
        patch.is_featured = false;
        break;
      case 'verify':
        patch.is_verified = true;
        break;
      case 'unverify':
        patch.is_verified = false;
        break;
    }

    const { data: moderated, error } = await sbAny(supabase).from(table).update(patch as any).eq('id', data.entityId).select('id').maybeSingle();
    if (error || !moderated) throw error ?? new Error('Plugin or theme not found');

    await sbAny(supabase).from('marketplace_moderation_log').insert({
      entity_type: data.entityType,
      entity_id: data.entityId,
      action: data.action,
      reason: data.reason ?? null,
      moderator_id: context.userId,
    });

    return { ok: true };
  });

/* ------------------------------------------------------------------ Reviews moderation */

export const moderateReview = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((i: { reviewId: string; action: 'delete'; reason?: string }) =>
    z.object({
      reviewId: z.string().uuid(),
      action: z.enum(['delete']),
      reason: z.string().max(1000).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const supabase = context.supabase;
    const { error } = await sbAny(supabase).from('plugin_reviews').delete().eq('id', data.reviewId);
    if (error) throw error;
    await sbAny(supabase).from('marketplace_moderation_log').insert({
      entity_type: 'review',
      entity_id: data.reviewId,
      action: data.action,
      reason: data.reason ?? null,
      moderator_id: context.userId,
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------ Security scan */

const scanInput = z.object({
  pluginId: z.string().uuid(),
  versionId: z.string().uuid().optional(),
  scanner: z.string().default('internal'),
});

export const runSecurityScan = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((i: z.input<typeof scanInput>) => scanInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const supabase = context.supabase;

    // Heuristic scan against declared permissions / manifest content.
    const { data: plugin } = await supabase
      .from('plugins')
      .select('id, name, repo_url, homepage_url, plugin_versions(id, version, permissions, entry_url, manifest)')
      .eq('id', data.pluginId)
      .maybeSingle();

    const versions = (plugin?.plugin_versions ?? []) as Array<any>;
    const version = data.versionId
      ? versions.find((v) => v.id === data.versionId)
      : versions.sort((a, b) => (b.version ?? '').localeCompare(a.version ?? ''))[0];

    const issues: Array<{ code: string; severity: 'low' | 'medium' | 'high' | 'critical'; message: string }> = [];
    const perms = (version?.permissions ?? []) as string[];
    const critical = perms.filter((p) =>
      ['fs:write', 'network:*', 'db:admin', 'secrets:read'].includes(p),
    );
    if (critical.length) {
      issues.push({
        code: 'high_risk_permissions',
        severity: 'critical',
        message: `Requests high-risk permissions: ${critical.join(', ')}`,
      });
    }
    if (!version?.entry_url?.startsWith('https://')) {
      issues.push({
        code: 'insecure_entry_url',
        severity: 'high',
        message: 'Entry URL is not HTTPS',
      });
    }
    if (!plugin?.repo_url) {
      issues.push({
        code: 'no_repo',
        severity: 'low',
        message: 'No public source repository declared',
      });
    }
    const manifestStr = JSON.stringify(version?.manifest ?? {});
    if (/eval\(|new Function\(/.test(manifestStr)) {
      issues.push({
        code: 'dynamic_code',
        severity: 'high',
        message: 'Manifest references dynamic code execution',
      });
    }

    const worst = issues.reduce<'clean' | 'low' | 'medium' | 'high' | 'critical'>((acc, i) => {
      const rank = { clean: 0, low: 1, medium: 2, high: 3, critical: 4 } as const;
      return rank[i.severity] > rank[acc] ? i.severity : acc;
    }, 'clean');
    const score = Math.max(0, 100 - issues.length * 15 - (worst === 'critical' ? 30 : 0));

    const { data: row, error } = await supabase
      .from('plugin_security_scans')
      .insert({
        plugin_id: data.pluginId,
        version_id: version?.id ?? null,
        status: worst === 'clean' ? 'passed' : worst === 'critical' ? 'failed' : 'warnings',
        severity: worst,
        issues,
        score,
        scanner: data.scanner,
        scanned_by: context.userId,
      })
      .select()
      .maybeSingle();
    if (error) throw error;
    return { scan: row, issues, worst, score };
  });

export const listSecurityScans = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((i: { pluginId?: string; limit?: number }) =>
    z.object({ pluginId: z.string().uuid().optional(), limit: z.number().int().min(1).max(200).default(50) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    let q = context.supabase
      .from('plugin_security_scans')
      .select('id, plugin_id, version_id, status, severity, score, scanner, scanned_at, issues, plugins(name, slug)')
      .order('scanned_at', { ascending: false })
      .limit(data.limit);
    if (data.pluginId) q = q.eq('plugin_id', data.pluginId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { scans: rows ?? [] };
  });

/* ------------------------------------------------------------------ Compatibility check */

const compatInput = z.object({
  pluginId: z.string().uuid(),
  versionId: z.string().uuid().optional(),
  targetPlatform: z.string().default('wacrm'),
  targetVersion: z.string().optional(),
});

export const runCompatibilityCheck = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((i: z.input<typeof compatInput>) => compatInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const supabase = context.supabase;
    const { data: plugin } = await supabase
      .from('plugins')
      .select('id, plugin_versions(id, version, manifest, min_platform_version, max_platform_version)')
      .eq('id', data.pluginId)
      .maybeSingle();
    const versions = (plugin?.plugin_versions ?? []) as Array<any>;
    const version = data.versionId
      ? versions.find((v) => v.id === data.versionId)
      : versions[0];

    const results: Record<string, any> = {
      hasManifest: Boolean(version?.manifest),
      declaresPlatform: Boolean(version?.min_platform_version),
      minPlatform: version?.min_platform_version ?? null,
      maxPlatform: version?.max_platform_version ?? null,
      targetVersion: data.targetVersion ?? 'latest',
    };
    const ok = results.hasManifest && results.declaresPlatform !== false;
    const status = ok ? 'passed' : 'warnings';

    const { data: row, error } = await supabase
      .from('plugin_compatibility_checks')
      .insert({
        plugin_id: data.pluginId,
        version_id: version?.id ?? null,
        target_platform: data.targetPlatform,
        target_version: data.targetVersion ?? null,
        status,
        results,
        checked_by: context.userId,
      })
      .select()
      .maybeSingle();
    if (error) throw error;
    return { check: row, status, results };
  });

export const listCompatChecks = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((i: { pluginId?: string; limit?: number }) =>
    z.object({ pluginId: z.string().uuid().optional(), limit: z.number().int().min(1).max(200).default(50) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    let q = context.supabase
      .from('plugin_compatibility_checks')
      .select('id, plugin_id, target_platform, target_version, status, results, checked_at, plugins(name, slug)')
      .order('checked_at', { ascending: false })
      .limit(data.limit);
    if (data.pluginId) q = q.eq('plugin_id', data.pluginId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { checks: rows ?? [] };
  });

/* ------------------------------------------------------------------ Moderation log */

export const getModerationLog = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((i: { limit?: number }) =>
    z.object({ limit: z.number().int().min(1).max(500).default(100) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const { data: rows, error } = await context.supabase
      .from('marketplace_moderation_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(data.limit);
    if (error) throw error;
    return { log: rows ?? [] };
  });
