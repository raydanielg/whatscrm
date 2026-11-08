/**
 * Plugin Management server functions — settings, logs, health, backup, rollback.
 * All operations are workspace-scoped through RLS.
 */
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { sbAny } from "@/lib/supabase/untyped";

async function activeWorkspaceId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data?.workspace_id) throw new Error('No workspace for user');
  return data.workspace_id as string;
}

/* ------------------------------------------------------------------ Settings */

export const getPluginSettings = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((i: { installationId: string }) => z.object({ installationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row } = await sbAny(context.supabase)
      .from('plugin_installations')
      .select('id, config, storage, granted_permissions, status, plugins(name, slug), plugin_versions(version, permissions)')
      .eq('id', data.installationId)
      .maybeSingle();
    if (!row) throw new Error('Installation not found');
    return { installation: row };
  });

export const updatePluginSettings = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({
      installationId: z.string().uuid(),
      config: z.record(z.unknown()).optional(),
      grantedPermissions: z.array(z.string()).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const patch: any = {};
    if (data.config !== undefined) patch.config = data.config;
    if (data.grantedPermissions !== undefined) patch.granted_permissions = data.grantedPermissions;
    const { data: row, error } = await sbAny(context.supabase)
      .from('plugin_installations')
      .update(patch)
      .eq('id', data.installationId)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return { installation: row };
  });

/* --------------------------------------------------------------------- Logs */

export const logPluginEvent = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({
      pluginId: z.string().uuid(),
      installationId: z.string().uuid().optional(),
      level: z.enum(['debug', 'info', 'warn', 'error']),
      event: z.string().max(120),
      message: z.string().max(2000).optional(),
      context: z.record(z.unknown()).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const workspace_id = await activeWorkspaceId(sbAny(context.supabase), context.userId);
    const { error } = await sbAny(context.supabase).from('plugin_logs').insert({
      workspace_id,
      plugin_id: data.pluginId,
      installation_id: data.installationId,
      level: data.level,
      event: data.event,
      message: data.message,
      context: (data.context ?? {}) as any,
    });
    if (error) throw error;
    return { ok: true };
  });

export const listPluginLogs = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({
      pluginId: z.string().uuid().optional(),
      installationId: z.string().uuid().optional(),
      levels: z.array(z.enum(['debug', 'info', 'warn', 'error'])).optional(),
      limit: z.number().int().min(1).max(500).default(200),
    }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const workspace_id = await activeWorkspaceId(sbAny(context.supabase), context.userId);
    let q = sbAny(context.supabase)
      .from('plugin_logs')
      .select('*')
      .eq('workspace_id', workspace_id)
      .order('created_at', { ascending: false })
      .limit(data.limit);
    if (data.pluginId) q = q.eq('plugin_id', data.pluginId);
    if (data.installationId) q = q.eq('installation_id', data.installationId);
    if (data.levels?.length) q = q.in('level', data.levels);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { logs: rows ?? [] };
  });

/* ------------------------------------------------------------------- Health */

export const recordPluginHealth = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({
      installationId: z.string().uuid(),
      status: z.enum(['healthy', 'degraded', 'failing', 'unknown']),
      latencyMs: z.number().int().min(0).optional(),
      errorRate: z.number().min(0).max(100).optional(),
      cpuUsage: z.number().min(0).max(100).optional(),
      memoryMb: z.number().int().min(0).optional(),
      details: z.record(z.unknown()).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const workspace_id = await activeWorkspaceId(sbAny(context.supabase), context.userId);
    const [{ error: e1 }] = await Promise.all([
      sbAny(context.supabase).from('plugin_health_checks').insert({
        workspace_id,
        installation_id: data.installationId,
        status: data.status,
        latency_ms: data.latencyMs,
        error_rate: data.errorRate,
        cpu_usage: data.cpuUsage,
        memory_mb: data.memoryMb,
        details: (data.details ?? {}) as any,
      }),
      sbAny(context.supabase)
        .from('plugin_installations')
        .update({ last_health_status: data.status, last_health_at: new Date().toISOString() })
        .eq('id', data.installationId),
    ]);
    if (e1) throw e1;
    return { ok: true };
  });

export const getPluginHealthHistory = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((i: { installationId: string; limit?: number }) =>
    z.object({ installationId: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await sbAny(context.supabase)
      .from('plugin_health_checks')
      .select('*')
      .eq('installation_id', data.installationId)
      .order('checked_at', { ascending: false })
      .limit(data.limit);
    if (error) throw error;
    return { history: rows ?? [] };
  });

/* --------------------------------------------------------- Backup & Rollback */

export const backupPlugin = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({ installationId: z.string().uuid(), reason: z.string().max(200).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const workspace_id = await activeWorkspaceId(sbAny(context.supabase), context.userId);
    const { data: install } = await sbAny(context.supabase)
      .from('plugin_installations')
      .select('id, plugin_id, version_id, config, storage, granted_permissions, plugin_versions(version)')
      .eq('id', data.installationId)
      .maybeSingle();
    if (!install) throw new Error('Installation not found');
    const { data: backup, error } = await sbAny(context.supabase)
      .from('plugin_backups')
      .insert({
        workspace_id,
        plugin_id: install.plugin_id,
        installation_id: install.id,
        version_id: install.version_id,
        version_string: (install as any).plugin_versions?.version ?? '0.0.0',
        config_snapshot: install.config,
        permissions_snapshot: install.granted_permissions,
        storage_snapshot: install.storage,
        reason: data.reason ?? 'manual',
        created_by: context.userId,
      })
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return { backup };
  });

export const listPluginBackups = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((i: { pluginId?: string; installationId?: string }) =>
    z.object({ pluginId: z.string().uuid().optional(), installationId: z.string().uuid().optional() }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const workspace_id = await activeWorkspaceId(sbAny(context.supabase), context.userId);
    let q = sbAny(context.supabase)
      .from('plugin_backups')
      .select('*, plugins(name, slug)')
      .eq('workspace_id', workspace_id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data.pluginId) q = q.eq('plugin_id', data.pluginId);
    if (data.installationId) q = q.eq('installation_id', data.installationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { backups: rows ?? [] };
  });

export const restorePluginBackup = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((i: { backupId: string }) => z.object({ backupId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: backup } = await sbAny(context.supabase)
      .from('plugin_backups')
      .select('*')
      .eq('id', data.backupId)
      .maybeSingle();
    if (!backup) throw new Error('Backup not found');
    if (!backup.installation_id) throw new Error('Backup has no installation to restore into');

    // Snapshot current state before overwriting.
    const { data: current } = await sbAny(context.supabase)
      .from('plugin_installations')
      .select('version_id')
      .eq('id', backup.installation_id)
      .maybeSingle();

    const { data: restored, error } = await sbAny(context.supabase)
      .from('plugin_installations')
      .update({
        version_id: backup.version_id,
        config: backup.config_snapshot,
        storage: backup.storage_snapshot,
        granted_permissions: backup.permissions_snapshot,
        previous_version_id: current?.version_id ?? null,
        status: 'active',
        last_error: null,
      })
      .eq('id', backup.installation_id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return { installation: restored };
  });

/** One-click rollback to the previous version stored on the installation. */
export const rollbackPlugin = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((i: { installationId: string }) => z.object({ installationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: install } = await sbAny(context.supabase)
      .from('plugin_installations')
      .select('id, version_id, previous_version_id, plugin_id')
      .eq('id', data.installationId)
      .maybeSingle();
    if (!install) throw new Error('Installation not found');
    if (!install.previous_version_id) throw new Error('No previous version to roll back to');
    const { data: restored, error } = await sbAny(context.supabase)
      .from('plugin_installations')
      .update({
        version_id: install.previous_version_id,
        previous_version_id: install.version_id,
        status: 'active',
        last_error: null,
      })
      .eq('id', install.id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return { installation: restored };
  });

/** Upgrade to a specific version (or latest stable). Stores previous for one-click rollback. */
export const upgradePluginVersion = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({ installationId: z.string().uuid(), versionId: z.string().uuid().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: install } = await sbAny(context.supabase)
      .from('plugin_installations')
      .select('id, plugin_id, version_id')
      .eq('id', data.installationId)
      .maybeSingle();
    if (!install) throw new Error('Installation not found');

    let versionId = data.versionId;
    if (!versionId) {
      const { data: latest } = await sbAny(context.supabase)
        .from('plugin_versions')
        .select('id')
        .eq('plugin_id', install.plugin_id)
        .eq('is_stable', true)
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      versionId = latest?.id;
    }
    if (!versionId) throw new Error('No target version available');
    const { data: updated, error } = await sbAny(context.supabase)
      .from('plugin_installations')
      .update({
        previous_version_id: install.version_id,
        version_id: versionId,
        status: 'active',
        last_error: null,
      })
      .eq('id', install.id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return { installation: updated };
  });

/* -------------------------------------------------------------- Status ops */

export const setPluginStatus = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({
      installationId: z.string().uuid(),
      status: z.enum(['active', 'disabled', 'error']),
      lastError: z.string().max(2000).nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase)
      .from('plugin_installations')
      .update({ status: data.status, last_error: data.lastError ?? null })
      .eq('id', data.installationId);
    if (error) throw error;
    return { ok: true };
  });

/* ---------------------------------------------------------- Storage (kv) */

export const putPluginStorage = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({
      installationId: z.string().uuid(),
      patch: z.record(z.unknown()),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: current } = await sbAny(context.supabase)
      .from('plugin_installations')
      .select('storage')
      .eq('id', data.installationId)
      .maybeSingle();
    const merged = { ...((current?.storage as any) ?? {}), ...data.patch };
    const { error } = await sbAny(context.supabase)
      .from('plugin_installations')
      .update({ storage: merged as any })
      .eq('id', data.installationId);
    if (error) throw error;
    return { storage: merged };
  });

/* ------------------------------------------------------------ Categories */

export const listPluginCategories = createServerFn({ method: 'GET' }).handler(async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const client = createClient(process.env.SUPABASE_URL!, key, {
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
  const { data, error } = await sbAny(client).from('plugin_categories').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return { categories: data ?? [] };
});

/* --------------------------------------------------- Full management view */

export const getPluginManagementView = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspace_id = await activeWorkspaceId(sbAny(context.supabase), context.userId);
    const { data: installations } = await sbAny(context.supabase)
      .from('plugin_installations')
      .select('*, plugins(id, slug, name, tagline, icon_url, category), plugin_versions(id, version, is_stable, permissions, published_at)')
      .eq('workspace_id', workspace_id)
      .neq('status', 'uninstalled')
      .order('installed_at', { ascending: false });
    return { installations: installations ?? [] };
  });
