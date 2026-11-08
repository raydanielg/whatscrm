import { supabaseAdmin } from "@/lib/demo/admin-write-guard.server";
import { generateLicenseKey, DEFAULT_PUBLISHER_SHARE_BPS, splitRevenue } from "../license";
import { sbAny } from "@/lib/supabase/untyped";

export async function adminIssueLicense(data: any) {
  const { data: plugin } = await sbAny(supabaseAdmin).from('plugins').select('id, publisher_id').eq('id', data.pluginId).maybeSingle();
  if (!plugin) throw new Error('Plugin not found');

  const key = generateLicenseKey();
  const { data: license, error } = await sbAny(supabaseAdmin).from('plugin_licenses').insert({
    license_key: key,
    plugin_id: data.pluginId,
    publisher_id: plugin.publisher_id,
    customer_user_id: data.customerUserId ?? null,
    customer_workspace_id: data.customerWorkspaceId ?? null,
    license_type: data.licenseType,
    seats: data.seats,
    price_cents: data.priceCents,
    currency: data.currency,
    expires_at: data.expiresAt ?? null,
    status: 'active',
  }).select('*').single();
  if (error) throw error;
  return license;
}

export async function adminPurchasePlugin(data: any, userId: string) {
  const { data: plugin } = await sbAny(supabaseAdmin).from('plugins').select('id, publisher_id').eq('id', data.pluginId).maybeSingle();
  if (!plugin) throw new Error('Plugin not found');

  const licenseKey = generateLicenseKey();
  const { data: license, error: lErr } = await sbAny(supabaseAdmin).from('plugin_licenses').insert({
    license_key: licenseKey,
    plugin_id: data.pluginId,
    publisher_id: plugin.publisher_id,
    customer_user_id: userId,
    customer_workspace_id: data.workspaceId,
    license_type: data.licenseType,
    seats: data.seats,
    price_cents: data.amountCents,
    currency: data.currency,
    status: 'active',
  }).select('*').single();
  if (lErr) throw lErr;

  const { publisherShareCents, platformFeeCents } = splitRevenue(data.amountCents);
  const { data: purchase, error: pErr } = await sbAny(supabaseAdmin).from('plugin_purchases').insert({
    plugin_id: data.pluginId,
    license_id: license.id,
    buyer_user_id: userId,
    buyer_workspace_id: data.workspaceId,
    publisher_id: plugin.publisher_id,
    amount_cents: data.amountCents,
    currency: data.currency,
    fee_cents: platformFeeCents,
    net_cents: publisherShareCents,
    gateway: data.gateway,
    gateway_reference: data.gatewayReference ?? null,
    status: data.amountCents === 0 ? 'paid' : 'pending',
  }).select('*').single();
  if (pErr) throw pErr;

  await sbAny(supabaseAdmin).from('plugin_revenue_shares').insert({
    purchase_id: purchase.id,
    plugin_id: data.pluginId,
    publisher_id: plugin.publisher_id,
    gross_cents: data.amountCents,
    platform_fee_cents: platformFeeCents,
    publisher_share_cents: publisherShareCents,
    share_bps: DEFAULT_PUBLISHER_SHARE_BPS,
    currency: data.currency,
    status: data.amountCents === 0 ? 'paid' : 'pending',
  });

  return { license, purchase };
}

export async function adminStartTrial(data: any, userId: string) {
  const existing = await sbAny(supabaseAdmin).from('plugin_trials')
    .select('id, status').eq('plugin_id', data.pluginId).eq('workspace_id', data.workspaceId).maybeSingle();
  if (existing.data) throw new Error('Trial already used for this workspace');

  const { data: plugin } = await sbAny(supabaseAdmin).from('plugins').select('id, publisher_id').eq('id', data.pluginId).maybeSingle();
  if (!plugin) throw new Error('Plugin not found');

  const trialEnd = new Date(Date.now() + data.trialDays * 86_400_000).toISOString();
  const key = generateLicenseKey();
  const { data: license } = await sbAny(supabaseAdmin).from('plugin_licenses').insert({
    license_key: key,
    plugin_id: data.pluginId,
    publisher_id: plugin.publisher_id,
    customer_user_id: userId,
    customer_workspace_id: data.workspaceId,
    license_type: 'trial',
    seats: 1,
    status: 'active',
    expires_at: trialEnd,
  }).select('*').single();

  const { data: trial, error } = await sbAny(supabaseAdmin).from('plugin_trials').insert({
    plugin_id: data.pluginId,
    workspace_id: data.workspaceId,
    user_id: userId,
    trial_end: trialEnd,
    status: 'active',
    converted_license_id: license?.id ?? null,
  }).select('*').single();
  if (error) throw error;
  return { trial, license };
}
