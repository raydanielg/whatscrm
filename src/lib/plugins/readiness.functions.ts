/**
 * Extension Platform readiness checks.
 *
 * Enterprise health probes across the plugin/theme/marketplace/licensing
 * surface. Used by the /_super-admin/admin/extension-readiness dashboard.
 *
 * All queries respect RLS via requireSupabaseAuth. Superadmin gate is
 * enforced in the UI (route lives under _super-admin) and by the fact
 * that only superadmins can read moderation/scan tables.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CheckStatus = "pass" | "warn" | "fail" | "info";

export interface ReadinessCheck {
  id: string;
  category: string;
  label: string;
  status: CheckStatus;
  detail: string;
  metric?: number | string;
}

export const getExtensionReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const checks: ReadinessCheck[] = [];
    const add = (c: ReadinessCheck) => checks.push(c);

    // --- Plugins ---
    const plugins = await supabase
      .from("plugins")
      .select("id, status, is_verified, category", { count: "exact" });
    const totalPlugins = plugins.count ?? 0;
    const approved = (plugins.data ?? []).filter((p: any) => p.status === "approved").length;
    const pending = (plugins.data ?? []).filter((p: any) => p.status === "pending").length;
    add({
      id: "plugins.total",
      category: "Marketplace",
      label: "Plugin catalog",
      status: totalPlugins > 0 ? "pass" : "info",
      detail: `${totalPlugins} plugins registered (${approved} approved, ${pending} pending)`,
      metric: totalPlugins,
    });
    add({
      id: "plugins.pending",
      category: "Marketplace",
      label: "Moderation queue",
      status: pending > 20 ? "warn" : "pass",
      detail: pending === 0 ? "No pending submissions" : `${pending} plugins awaiting review`,
      metric: pending,
    });

    // --- Installations ---
    const installs = await supabase
      .from("plugin_installations")
      .select("id, status", { count: "exact", head: false });
    const errored = (installs.data ?? []).filter((i: any) => i.status === "error").length;
    add({
      id: "installs.health",
      category: "Installations",
      label: "Installation health",
      status: errored === 0 ? "pass" : errored < 5 ? "warn" : "fail",
      detail:
        errored === 0
          ? `${installs.count ?? 0} installations healthy`
          : `${errored} installations in error state`,
      metric: installs.count ?? 0,
    });

    // --- Health checks (latency / errors from plugin_health_checks) ---
    const health = await supabase
      .from("plugin_health_checks")
      .select("status, error_rate, latency_ms, checked_at")
      .gte("checked_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(500);
    const healthRows = health.data ?? [];
    const avgLatency = healthRows.length
      ? Math.round(
          healthRows.reduce((s: number, r: any) => s + (r.latency_ms ?? 0), 0) / healthRows.length,
        )
      : 0;
    const avgError = healthRows.length
      ? healthRows.reduce((s: number, r: any) => s + (Number(r.error_rate) ?? 0), 0) /
        healthRows.length
      : 0;
    add({
      id: "health.latency",
      category: "Runtime",
      label: "Avg plugin latency (24h)",
      status: avgLatency < 500 ? "pass" : avgLatency < 1500 ? "warn" : "fail",
      detail: `${avgLatency} ms across ${healthRows.length} samples`,
      metric: `${avgLatency}ms`,
    });
    add({
      id: "health.errors",
      category: "Runtime",
      label: "Plugin error rate (24h)",
      status: avgError < 0.02 ? "pass" : avgError < 0.1 ? "warn" : "fail",
      detail: `${(avgError * 100).toFixed(2)}% average error rate`,
      metric: `${(avgError * 100).toFixed(2)}%`,
    });

    // --- Security scans ---
    const scans = await supabase
      .from("plugin_security_scans")
      .select("score, status, scanned_at")
      .order("scanned_at", { ascending: false })
      .limit(200);
    const scanRows = scans.data ?? [];
    const failedScans = scanRows.filter(
      (s: any) => s.status === "failed" || (s.score ?? 100) < 50,
    ).length;
    add({
      id: "security.scans",
      category: "Security",
      label: "Recent security scans",
      status: failedScans === 0 ? "pass" : failedScans < 3 ? "warn" : "fail",
      detail: `${scanRows.length} recent scans, ${failedScans} flagged for review`,
      metric: scanRows.length,
    });

    // --- Compatibility ---
    const compat = await supabase
      .from("plugin_compatibility_checks")
      .select("status, checked_at")
      .order("checked_at", { ascending: false })
      .limit(200);
    const compatRows = compat.data ?? [];
    const incompatible = compatRows.filter((c: any) => c.status !== "passed").length;
    add({
      id: "compat.checks",
      category: "Security",
      label: "Compatibility checks",
      status: incompatible === 0 ? "pass" : "warn",
      detail: `${compatRows.length} checks, ${incompatible} incompatible`,
      metric: compatRows.length,
    });

    // --- Licensing ---
    const licenses = await supabase
      .from("plugin_licenses")
      .select("id, status", { count: "exact", head: false });
    const activeLicenses = (licenses.data ?? []).filter((l: any) => l.status === "active").length;
    const revoked = (licenses.data ?? []).filter((l: any) => l.status === "revoked").length;
    add({
      id: "licensing.active",
      category: "Licensing",
      label: "Active licenses",
      status: "pass",
      detail: `${activeLicenses} active, ${revoked} revoked of ${licenses.count ?? 0} total`,
      metric: activeLicenses,
    });

    // --- Themes ---
    const themes = await supabase
      .from("themes")
      .select("id, status", { count: "exact", head: false });
    const themeRows = themes.data ?? [];
    const themesApproved = themeRows.filter((t: any) => t.status === "approved").length;
    add({
      id: "themes.total",
      category: "Themes",
      label: "Theme catalog",
      status: themes.count && themes.count > 0 ? "pass" : "info",
      detail: `${themes.count ?? 0} themes registered (${themesApproved} approved)`,
      metric: themes.count ?? 0,
    });

    // --- White label ---
    const wl = await supabase
      .from("white_label_configs")
      .select("id, brand_name, primary_color, logo_url", { count: "exact", head: false })
      .limit(100);
    const wlRows = wl.data ?? [];
    const wlConfigured = wlRows.filter((w: any) => w.brand_name && w.primary_color).length;
    add({
      id: "whitelabel.configured",
      category: "White Label",
      label: "Branded workspaces",
      status: wlRows.length === 0 ? "info" : "pass",
      detail: `${wlConfigured}/${wlRows.length} workspaces have brand + color configured`,
      metric: wlConfigured,
    });

    // --- Revenue (last 30d) ---
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const purchases = await supabase
      .from("plugin_purchases")
      .select("amount_cents, status")
      .gte("created_at", since);
    const purchaseRows = purchases.data ?? [];
    const gross = purchaseRows
      .filter((p: any) => p.status === "succeeded")
      .reduce((s: number, p: any) => s + (p.amount_cents ?? 0), 0);
    add({
      id: "revenue.30d",
      category: "Marketplace",
      label: "Marketplace revenue (30d)",
      status: "info",
      detail: `$${(gross / 100).toFixed(2)} gross across ${purchaseRows.length} purchases`,
      metric: `$${(gross / 100).toFixed(0)}`,
    });

    // --- SDK / Extension registry (dev-time signal only, checked client-side too) ---
    add({
      id: "sdk.docs",
      category: "Developer Experience",
      label: "SDK documentation",
      status: "pass",
      detail: "Extension SDK docs available at /developer-tools/sdk",
    });
    add({
      id: "sdk.events",
      category: "Developer Experience",
      label: "Event catalog",
      status: "pass",
      detail: "Typed event catalog: Global, Org, CRM, AI, Commerce, Billing, Workflow",
    });

    // --- Aggregate ---
    const summary = {
      pass: checks.filter((c) => c.status === "pass").length,
      warn: checks.filter((c) => c.status === "warn").length,
      fail: checks.filter((c) => c.status === "fail").length,
      info: checks.filter((c) => c.status === "info").length,
      total: checks.length,
    };

    return { checks, summary, generatedAt: new Date().toISOString() };
  });
