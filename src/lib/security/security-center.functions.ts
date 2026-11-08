/**
 * Enterprise Security Center aggregator.
 * Aggregates real-time signals across authentication, sessions, threat
 * detection, rate limiting, API/webhook security, and audit surfaces
 * into a single OWASP-aligned posture report. RLS-scoped per workspace.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createSignalReader, type UnavailableSignal } from "./signal-reader";

export type Severity = "low" | "medium" | "high" | "critical" | "info";

export type SecurityAlert = {
  id: string;
  timestamp: string;
  severity: Severity;
  title: string;
  detail: string;
  category: string;
};

export type Recommendation = {
  id: string;
  priority: "low" | "medium" | "high";
  title: string;
  detail: string;
  owasp?: string;
};

export type TimelineEntry = {
  id: string;
  timestamp: string;
  actor: string | null;
  action: string;
  ip: string | null;
  source: "audit" | "auth" | "security";
  severity: Severity;
};

export type SecurityOverview = {
  generated_at: string;
  security_score: number;
  posture: "strong" | "fair" | "at-risk";
  metrics: {
    failed_logins_24h: number;
    failed_logins_7d: number;
    successful_logins_24h: number;
    suspicious_events_24h: number;
    active_sessions: number;
    locked_accounts: number;
    unique_login_ips_7d: number;
    unique_countries_7d: number;
    unique_devices_7d: number;
    high_severity_events_7d: number;
    rate_limit_hits_24h: number;
    api_errors_24h: number;
    webhook_failures_24h: number;
    audit_events_24h: number;
    ip_allowlist_rules: number;
  };
  threat: {
    brute_force_ips: Array<{ ip: string; attempts: number; last_seen: string }>;
    suspicious_ips: Array<{ ip: string; events: number; last_seen: string }>;
    geo_distribution: Array<{ location: string; logins: number }>;
    devices: Array<{ device: string; logins: number }>;
  };
  password_policy: {
    configured: boolean;
    min_length: number | null;
    require_uppercase: boolean | null;
    require_number: boolean | null;
    require_symbol: boolean | null;
    max_age_days: number | null;
    lockout_threshold: number | null;
  };
  alerts: SecurityAlert[];
  recommendations: Recommendation[];
  timeline: TimelineEntry[];
  /**
   * Signals whose query failed. Their figures above fall back to 0 — this list
   * is how the page tells "nothing happened" apart from "could not be read".
   */
  unavailable: UnavailableSignal[];
};

function sevFromLevel(level: string | null | undefined): Severity {
  const l = (level ?? "").toLowerCase();
  if (l === "critical") return "critical";
  if (l === "high" || l === "error") return "high";
  if (l === "medium" || l === "warn" || l === "warning") return "medium";
  if (l === "low") return "low";
  return "info";
}

export const getSecurityOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SecurityOverview> => {
    const { supabase, userId } = context;
    const now = new Date();
    const d1 = new Date(now.getTime() - 24 * 3600_000).toISOString();
    const d7 = new Date(now.getTime() - 7 * 24 * 3600_000).toISOString();

    const { resolveActiveWorkspaceId } = await import("@/lib/auth/active-workspace.server");
    const workspaceId = await resolveActiveWorkspaceId(supabase, userId);
    const scopeWs = <T,>(q: T) => {
      if (!workspaceId) return q;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { return (q as any).eq("workspace_id", workspaceId); } catch { return q; }
    };
    const r = createSignalReader(supabase);

    // The password policy is per organization, not per workspace.
    const orgRows = workspaceId
      ? await r.select<{ organization_id: string | null }>("workspaces", "organization_id", (q) => q.eq("id", workspaceId))
      : [];
    const organizationId = orgRows[0]?.organization_id ?? null;

    // --- Auth signals ---
    const failed24 = await r.count("login_history", (q) =>
      q.eq("event", "failed").gte("created_at", d1), "login_history (failed 24h)",
    );
    const failed7 = await r.count("login_history", (q) =>
      q.eq("event", "failed").gte("created_at", d7), "login_history (failed 7d)",
    );
    const success24 = await r.count("login_history", (q) =>
      q.eq("event", "success").gte("created_at", d1), "login_history (success 24h)",
    );

    const recentLogins = await r.select(
      "login_history",
      "id, user_id, event, ip_address, device, location, failure_reason, created_at",
      (q) => q.gte("created_at", d7).order("created_at", { ascending: false }).limit(500),
      "login_history (recent)",
    );

    // Brute-force: IPs with >=5 failed logins in last 24h
    const failedByIp = new Map<string, { attempts: number; last: string }>();
    const geoMap = new Map<string, number>();
    const deviceMap = new Map<string, number>();
    const ipSet = new Set<string>();
    const countrySet = new Set<string>();
    const deviceSet = new Set<string>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of recentLogins as any[]) {
      if (r.ip_address) ipSet.add(r.ip_address);
      if (r.location) countrySet.add(r.location);
      if (r.device) deviceSet.add(r.device);
      if (r.event === "success" && r.location) {
        geoMap.set(r.location, (geoMap.get(r.location) ?? 0) + 1);
      }
      if (r.event === "success" && r.device) {
        deviceMap.set(r.device, (deviceMap.get(r.device) ?? 0) + 1);
      }
      if (r.event === "failed" && r.ip_address && new Date(r.created_at) >= new Date(d1)) {
        const cur = failedByIp.get(r.ip_address);
        failedByIp.set(r.ip_address, {
          attempts: (cur?.attempts ?? 0) + 1,
          last: !cur || r.created_at > cur.last ? r.created_at : cur.last,
        });
      }
    }
    const bruteForceIps = [...failedByIp.entries()]
      .filter(([, v]) => v.attempts >= 5)
      .sort((a, b) => b[1].attempts - a[1].attempts)
      .slice(0, 10)
      .map(([ip, v]) => ({ ip, attempts: v.attempts, last_seen: v.last }));

    // --- Security events ---
    const securityEvents = await r.select(
      "security_events",
      "id, event_type, severity, ip_address, user_agent, actor_id, created_at",
      (q) => scopeWs(q.gte("created_at", d7).order("created_at", { ascending: false }).limit(500)),
    );

    const suspicious24 = securityEvents.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e: any) => new Date(e.created_at) >= new Date(d1),
    ).length;
    const highSev7 = securityEvents.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e: any) => ["high", "critical"].includes((e.severity ?? "").toLowerCase()),
    ).length;

    const suspiciousByIp = new Map<string, { events: number; last: string }>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const e of securityEvents as any[]) {
      if (!e.ip_address) continue;
      const cur = suspiciousByIp.get(e.ip_address);
      suspiciousByIp.set(e.ip_address, {
        events: (cur?.events ?? 0) + 1,
        last: !cur || e.created_at > cur.last ? e.created_at : cur.last,
      });
    }
    const suspiciousIps = [...suspiciousByIp.entries()]
      .sort((a, b) => b[1].events - a[1].events)
      .slice(0, 10)
      .map(([ip, v]) => ({ ip, events: v.events, last_seen: v.last }));

    // --- Sessions & lockouts ---
    // `sessions` has no expires_at: a session is live until it is revoked, so
    // "active" means not revoked and seen in the last 24h.
    const activeSessions = await r.count("sessions", (q) =>
      q.is("revoked_at", null).gte("last_seen_at", d1),
    );
    const lockedAccounts = await r.count("account_lockouts", (q) =>
      q.gte("locked_until", now.toISOString()),
    );

    // --- Rate limits ---
    // rate_limit_buckets only holds per-window counters, not rejections. The
    // gateway answers a rejected call with 429, so that is the real "hit" signal.
    const rateHits24 = await r.count("api_gateway_logs", (q) =>
      q.gte("created_at", d1).eq("status_code", 429), "api_gateway_logs (429)",
    );

    // --- API / webhook / audit ---
    const apiErrors24 = await r.count("api_gateway_logs", (q) =>
      q.gte("created_at", d1).gte("status_code", 400), "api_gateway_logs (errors)",
    );
    // Outbound webhook deliveries: status is one of pending / delivering /
    // succeeded / failed / dead_letter / cancelled (there is no `success` column).
    const webhookFailures24 = await r.count("webhook_deliveries", (q) =>
      q.gte("created_at", d1).in("status", ["failed", "dead_letter"]),
    );
    const auditEvents24 = await r.count("audit_logs", (q) =>
      scopeWs(q.gte("created_at", d1)),
    );

    // --- Password policy (one row per organization) ---
    const policyRows = await r.select("password_policy", "*", (q) =>
      organizationId ? q.eq("organization_id", organizationId).limit(1) : q.limit(1),
    );
    const policyRow = policyRows[0] ?? null;

    // --- IP allowlist ---
    const ipAllowlistRules = await r.count("ip_allowlists", (q) => scopeWs(q));

    // --- Audit timeline (last 40) ---
    const auditRows = await r.select(
      "audit_logs",
      "id, actor_id, action, ip_address, created_at",
      (q) => scopeWs(q.order("created_at", { ascending: false }).limit(40)),
    );
    const timeline: TimelineEntry[] = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(auditRows as any[]).map((r) => ({
        id: r.id,
        timestamp: r.created_at,
        actor: r.actor_id,
        action: r.action,
        ip: r.ip_address,
        source: "audit" as const,
        severity: "info" as Severity,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(securityEvents.slice(0, 20) as any[]).map((r) => ({
        id: r.id,
        timestamp: r.created_at,
        actor: r.actor_id,
        action: r.event_type,
        ip: r.ip_address,
        source: "security" as const,
        severity: sevFromLevel(r.severity),
      })),
    ]
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
      .slice(0, 40);

    // --- Alerts ---
    const alerts: SecurityAlert[] = [];
    for (const b of bruteForceIps) {
      alerts.push({
        id: `bf-${b.ip}`,
        timestamp: b.last_seen,
        severity: b.attempts >= 20 ? "critical" : b.attempts >= 10 ? "high" : "medium",
        title: `Brute-force attempts from ${b.ip}`,
        detail: `${b.attempts} failed logins in the last 24h.`,
        category: "Brute Force",
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const e of (securityEvents as any[]).slice(0, 8)) {
      if (["high", "critical"].includes((e.severity ?? "").toLowerCase())) {
        alerts.push({
          id: `sec-${e.id}`,
          timestamp: e.created_at,
          severity: sevFromLevel(e.severity),
          title: e.event_type ?? "Security event",
          detail: e.ip_address ? `Source IP: ${e.ip_address}` : "Suspicious activity detected.",
          category: "Threat Detection",
        });
      }
    }
    if (webhookFailures24 > 10) {
      alerts.push({
        id: "webhook-failures",
        timestamp: now.toISOString(),
        severity: "medium",
        title: "Elevated webhook failure rate",
        detail: `${webhookFailures24} webhook deliveries failed in the last 24h.`,
        category: "Webhook Security",
      });
    }
    if (apiErrors24 > 100) {
      alerts.push({
        id: "api-errors",
        timestamp: now.toISOString(),
        severity: "medium",
        title: "High API error volume",
        detail: `${apiErrors24} 4xx/5xx responses in the last 24h.`,
        category: "API Security",
      });
    }

    // --- Score & recommendations (OWASP-aligned) ---
    const recs: Recommendation[] = [];
    let score = 100;

    if (!policyRow) {
      score -= 10;
      recs.push({
        id: "pw-policy",
        priority: "high",
        title: "Configure a password policy",
        detail: "Set minimum length, complexity, and rotation rules.",
        owasp: "A07: Identification & Auth Failures",
      });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p: any = policyRow;
      if ((p.min_length ?? 0) < 12) {
        score -= 4;
        recs.push({
          id: "pw-length",
          priority: "medium",
          title: "Increase minimum password length to 12+",
          detail: "NIST and OWASP recommend at least 12 characters.",
          owasp: "A07",
        });
      }
      if (!(p.require_symbol || p.require_number)) {
        score -= 3;
        recs.push({
          id: "pw-complexity",
          priority: "medium",
          title: "Require password complexity",
          detail: "Enforce at least numbers or symbols.",
          owasp: "A07",
        });
      }
    }
    if (bruteForceIps.length > 0) {
      score -= Math.min(20, bruteForceIps.length * 3);
      recs.push({
        id: "brute-force",
        priority: "high",
        title: "Block or throttle brute-force IPs",
        detail: `${bruteForceIps.length} IP(s) showing brute-force patterns. Add to IP denylist.`,
        owasp: "A07",
      });
    }
    if (highSev7 > 0) {
      score -= Math.min(15, highSev7 * 2);
      recs.push({
        id: "high-sev",
        priority: "high",
        title: "Investigate high-severity security events",
        detail: `${highSev7} high/critical event(s) in the last 7 days.`,
        owasp: "A09: Security Logging & Monitoring",
      });
    }
    if (ipAllowlistRules === 0) {
      score -= 4;
      recs.push({
        id: "ip-allowlist",
        priority: "low",
        title: "Configure IP allowlist for admin access",
        detail: "Restrict admin surface to trusted networks.",
        owasp: "A01: Broken Access Control",
      });
    }
    if (webhookFailures24 > 10) {
      score -= 3;
      recs.push({
        id: "webhook",
        priority: "medium",
        title: "Review webhook signing & retries",
        detail: "Verify HMAC signatures and exponential backoff on failures.",
        owasp: "A08: Software & Data Integrity Failures",
      });
    }
    if (rateHits24 > 1000) {
      score -= 3;
      recs.push({
        id: "rate-limit",
        priority: "medium",
        title: "Tighten rate limits on hot endpoints",
        detail: "Consider stricter buckets on auth and public endpoints.",
        owasp: "A04: Insecure Design",
      });
    }

    score = Math.max(0, Math.min(100, score));
    const posture: SecurityOverview["posture"] =
      score >= 85 ? "strong" : score >= 65 ? "fair" : "at-risk";

    const geo_distribution = [...geoMap.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([location, logins]) => ({ location, logins }));
    const devices = [...deviceMap.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([device, logins]) => ({ device, logins }));

    return {
      generated_at: now.toISOString(),
      security_score: score,
      posture,
      metrics: {
        failed_logins_24h: failed24,
        failed_logins_7d: failed7,
        successful_logins_24h: success24,
        suspicious_events_24h: suspicious24,
        active_sessions: activeSessions,
        locked_accounts: lockedAccounts,
        unique_login_ips_7d: ipSet.size,
        unique_countries_7d: countrySet.size,
        unique_devices_7d: deviceSet.size,
        high_severity_events_7d: highSev7,
        rate_limit_hits_24h: rateHits24,
        api_errors_24h: apiErrors24,
        webhook_failures_24h: webhookFailures24,
        audit_events_24h: auditEvents24,
        ip_allowlist_rules: ipAllowlistRules,
      },
      threat: {
        brute_force_ips: bruteForceIps,
        suspicious_ips: suspiciousIps,
        geo_distribution,
        devices,
      },
      password_policy: {
        configured: !!policyRow,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        min_length: (policyRow as any)?.min_length ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        require_uppercase: (policyRow as any)?.require_uppercase ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        require_number: (policyRow as any)?.require_number ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        require_symbol: (policyRow as any)?.require_symbol ?? null,
        // Real column names: rotation_days and max_failed_attempts. The old
        // max_age_days / lockout_threshold do not exist, so these always read "—".
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        max_age_days: (policyRow as any)?.rotation_days ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lockout_threshold: (policyRow as any)?.max_failed_attempts ?? null,
      },
      alerts: alerts.slice(0, 20),
      recommendations: recs,
      timeline,
      unavailable: r.unavailable,
    };
  });
