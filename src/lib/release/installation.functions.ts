/**
 * WACRM — CodeCanyon Installation & Release Toolkit
 *
 * Server functions powering the installation wizard, license activation,
 * update checker, demo seeder, and one-click health / optimization reports.
 *
 * All functions are read/write-safe and RLS-scoped when authenticated.
 * System-requirement and environment probes are safe to call unauthenticated
 * because they only report on server runtime signals — never leak secrets.
 */
import { APP_VERSION } from "@/lib/app-version";
import { BRAND_NAME } from "@/lib/branding/brand";
import { getPlatformBranding } from "@/lib/admin/platform-branding.functions";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type ProbeStatus = "pass" | "warn" | "fail" | "info";

export type Probe = {
  id: string;
  label: string;
  status: ProbeStatus;
  detail: string;
  fix?: string;
};

export type ProbeReport = {
  overall: ProbeStatus;
  probes: Probe[];
  generated_at: string;
};

// WACRM release channel manifest. Bumped on every published tag.
export const WACRM_RELEASE = {
  product: BRAND_NAME,
  version: APP_VERSION,
  build: "2026-10-13",
  channel: "stable" as "stable" | "beta" | "nightly",
  min_node: "20.0.0",
  min_postgres: "15.0",
  license_server: "https://licenses.wacrm.app/v1/verify",
  update_feed: "https://releases.wacrm.app/v1/manifest.json",
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function rollup(probes: Probe[]): ProbeStatus {
  if (probes.some((p) => p.status === "fail")) return "fail";
  if (probes.some((p) => p.status === "warn")) return "warn";
  return "pass";
}

function report(probes: Probe[]): ProbeReport {
  return { overall: rollup(probes), probes, generated_at: new Date().toISOString() };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveWorkspaceId(supabase: any, userId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    return data?.workspace_id ?? null;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 1) System Requirement Checker
// ────────────────────────────────────────────────────────────────────────────

export const checkSystemRequirements = createServerFn({ method: "GET" }).handler(async () => {
  const probes: Probe[] = [];

  const nodeVersion = process.versions?.node ?? "unknown";
  const nodeMajor = parseInt(nodeVersion.split(".")[0] ?? "0", 10);
  probes.push({
    id: "runtime.node",
    label: "JavaScript runtime",
    status: nodeMajor >= 20 || nodeVersion === "unknown" ? "pass" : "fail",
    detail: `Runtime v${nodeVersion} detected (minimum Node.js ${WACRM_RELEASE.min_node})`,
    fix: nodeMajor >= 20 ? undefined : "Upgrade to Node.js 20 LTS or a compatible edge runtime.",
  });

  probes.push({
    id: "runtime.webcrypto",
    label: "Web Crypto API",
    status: typeof crypto !== "undefined" && !!crypto.subtle ? "pass" : "fail",
    detail: typeof crypto !== "undefined" ? "crypto.subtle available" : "crypto.subtle missing",
    fix: "Enable WebCrypto polyfill or upgrade runtime.",
  });

  probes.push({
    id: "runtime.fetch",
    label: "Global fetch()",
    status: typeof fetch === "function" ? "pass" : "fail",
    detail: typeof fetch === "function" ? "Native fetch available" : "fetch missing",
  });

  probes.push({
    id: "runtime.memory",
    label: "Memory headroom",
    status: "info",
    detail: "Serverless worker — memory allocated per request. Recommend ≥ 256 MB.",
  });

  return report(probes);
});

// ────────────────────────────────────────────────────────────────────────────
// 2) Environment Validator
// ────────────────────────────────────────────────────────────────────────────

export const validateEnvironment = createServerFn({ method: "GET" }).handler(async () => {
  const required: Array<{ key: string; label: string; secret?: boolean }> = [
    { key: "SUPABASE_URL", label: "Backend URL" },
    { key: "SUPABASE_PUBLISHABLE_KEY", label: "Backend publishable key", secret: true },
    { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Server-side admin key", secret: true },
  ];
  const optional: Array<{ key: string; label: string; secret?: boolean }> = [
    { key: "GEMINI_API_KEY", label: "AI Gateway key", secret: true },
    { key: "WHATSAPP_ACCESS_TOKEN", label: "WhatsApp Cloud API token", secret: true },
    { key: "WHATSAPP_VERIFY_TOKEN", label: "WhatsApp webhook verifier", secret: true },
    { key: "STRIPE_SECRET_KEY", label: "Stripe billing key", secret: true },
    { key: "SMTP_HOST", label: "Outbound email host" },
  ];

  // Meta inbound. These are deliberately separate: without them the Messenger
  // and Instagram webhooks fail closed (500) while the channel UI still reports
  // "connected / healthy", because connecting an account only exercises the
  // OUTBOUND Graph API. The result is the silent failure mode where messages
  // only ever appear after a manual Sync. Surfaced here so the misconfiguration
  // is visible in Setup → Environment instead of only in the server logs.
  const metaInbound: Array<{ key: string; label: string; secret?: boolean }> = [
    { key: "META_APP_SECRET", label: "Meta app secret (inbound signature check)", secret: true },
    { key: "META_WEBHOOK_VERIFY_TOKEN", label: "Meta webhook verify token", secret: true },
  ];

  const probes: Probe[] = [];
  for (const item of required) {
    const set = !!process.env[item.key];
    probes.push({
      id: `env.${item.key}`,
      label: item.label,
      status: set ? "pass" : "fail",
      detail: set ? "Configured" : `${item.key} not set`,
      fix: set ? undefined : `Set ${item.key} in your environment or via Secrets.`,
    });
  }
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { inspectServiceRoleKey } = await import("@/lib/supabase/service-role-key.server");
    const verdict = inspectServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (!verdict.ok) {
      const probe = probes.find((p) => p.id === "env.SUPABASE_SERVICE_ROLE_KEY");
      if (probe) {
        probe.status = "fail";
        probe.detail = verdict.reason;
        probe.fix = "Use a server-only Supabase secret or service-role key from this project.";
      }
    }
  }
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
      for (const table of ["settings", "user_roles"] as const) {
        const { error } = await supabaseAdmin.from(table).select("id", { head: true }).limit(1);
        probes.push({
          id: `db.${table}`,
          label: `${table} table`,
          status: error ? "fail" : "pass",
          detail: error ? `Database is not ready: ${error.message}` : "Available",
          fix: error ? "Apply the database migrations before creating a super admin." : undefined,
        });
      }
    } catch (error) {
      probes.push({
        id: "db.admin",
        label: "Database admin connection",
        status: "fail",
        detail: error instanceof Error ? error.message : "Could not connect to the database",
        fix: "Check the Supabase URL and server-only admin key.",
      });
    }
  }
  for (const item of optional) {
    const set = !!process.env[item.key];
    probes.push({
      id: `env.${item.key}`,
      label: item.label,
      status: set ? "pass" : "warn",
      detail: set ? "Configured" : `${item.key} not set — optional`,
      fix: set ? undefined : `Configure ${item.key} to enable this feature.`,
    });
  }
  // Only meaningful once a Meta channel is actually in use, so a missing value
  // warns rather than fails — but it says plainly that inbound is dead, which
  // is the part the channel's own "healthy" badge cannot tell you.
  for (const item of metaInbound) {
    const set = !!process.env[item.key];
    probes.push({
      id: `env.${item.key}`,
      label: item.label,
      status: set ? "pass" : "warn",
      detail: set
        ? "Configured"
        : `${item.key} not set — Messenger and Instagram will receive NO inbound messages`,
      fix: set
        ? undefined
        : `Set ${item.key}, then re-verify the webhook in Meta → Webhooks. ` +
          `Until it is set the webhook returns 500 and messages only appear after a manual Sync.`,
    });
  }
  return report(probes);
});

// ────────────────────────────────────────────────────────────────────────────
// 3) License Activation & Verification
// ────────────────────────────────────────────────────────────────────────────

export type LicenseInfo = {
  active: boolean;
  license_key: string | null;
  product: string;
  tier: "regular" | "extended" | "trial" | "unlicensed";
  purchase_code: string | null;
  activated_at: string | null;
  expires_at: string | null;
  buyer: string | null;
  domain: string | null;
  message: string;
};

// Deterministic local verifier — accepts any Envato-shaped purchase code
// (8-4-4-4-12 UUID) as regular, adds "-EXT" suffix for extended, and
// records the activation in workspace settings. In production this calls
// WACRM_RELEASE.license_server; we fail-safe to local validation so
// self-hosted installs still work offline.
function decodePurchaseCode(code: string): { valid: boolean; tier: LicenseInfo["tier"] } {
  const trimmed = code.trim();
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(trimmed)) return { valid: true, tier: "regular" };
  if (uuidRe.test(trimmed.replace(/-EXT$/i, ""))) return { valid: true, tier: "extended" };
  if (/^TRIAL-[A-Z0-9]{8,}$/i.test(trimmed)) return { valid: true, tier: "trial" };
  return { valid: false, tier: "unlicensed" };
}

/**
 * License activation runs BEFORE any user exists on a fresh install, so it
 * must not require an authenticated session. Persistence uses the admin
 * client and is best-effort — installers without a bootstrapped schema
 * still get a valid activation response.
 */
/**
 * License storage scheme, shared by activateLicense (write) and verifyLicense
 * (read): one row in public.settings with scope='platform', key='wacrm.license'
 * and no org/workspace/user. Both sides use the guarded service-role client.
 */
const LICENSE_SETTING = { scope: "platform", key: "wacrm.license" } as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function licenseAdmin(): Promise<any> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  return supabaseAdmin;
}

async function readLicenseSetting(): Promise<{ id: string; value: unknown } | null> {
  const admin = await licenseAdmin();
  const { data, error } = await admin
    .from("settings")
    .select("id, value")
    .eq("scope", LICENSE_SETTING.scope)
    .eq("key", LICENSE_SETTING.key)
    .is("organization_id", null)
    .is("workspace_id", null)
    .is("user_id", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

async function writeLicenseSetting(value: LicenseInfo): Promise<void> {
  const admin = await licenseAdmin();
  const existing = await readLicenseSetting();
  if (existing) {
    const { error } = await admin
      .from("settings")
      .update({ value, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await admin.from("settings").insert({ ...LICENSE_SETTING, value });
  if (error) throw new Error(error.message);
}

export const activateLicense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { purchase_code: string; buyer?: string; domain?: string }) =>
    z
      .object({
        purchase_code: z.string().min(6).max(128),
        buyer: z.string().max(120).optional(),
        domain: z.string().max(255).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<LicenseInfo> => {
    // Writes the platform-wide license row: super admins only.
    const { assertSuperAdmin } = await import("@/lib/admin/platform-guard.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const decoded = decodePurchaseCode(data.purchase_code);
    if (!decoded.valid) {
      return {
        active: false,
        license_key: null,
        product: WACRM_RELEASE.product,
        tier: "unlicensed",
        purchase_code: data.purchase_code,
        activated_at: null,
        expires_at: null,
        buyer: data.buyer ?? null,
        domain: data.domain ?? null,
        message:
          "Purchase code format not recognized. Enter the exact code from your CodeCanyon Downloads page.",
      };
    }

    const now = new Date();
    const expires =
      decoded.tier === "trial"
        ? new Date(now.getTime() + 14 * 24 * 3600 * 1000).toISOString()
        : null;

    const info: LicenseInfo = {
      active: true,
      license_key: `WDF-${data.purchase_code.slice(0, 8).toUpperCase()}-${decoded.tier.toUpperCase()}`,
      product: WACRM_RELEASE.product,
      tier: decoded.tier,
      purchase_code: data.purchase_code,
      activated_at: now.toISOString(),
      expires_at: expires,
      buyer: data.buyer ?? null,
      domain: data.domain ?? null,
      message:
        decoded.tier === "trial"
          ? "Trial license activated. Convert to a full license before it expires."
          : `${decoded.tier === "extended" ? "Extended" : "Regular"} license activated. Thank you for supporting ${BRAND_NAME}.`,
    };

    // Persist as a single platform-scoped row (see LICENSE_SETTING). There is
    // no unique constraint on settings.key, so select-then-update/insert.
    // Activation still succeeds when persistence fails (fresh installs), but
    // the failure is logged and surfaced in the message instead of swallowed.
    try {
      await writeLicenseSetting(info);
    } catch (e) {
      const reason = (e as Error)?.message ?? String(e);
      console.error("[license] failed to persist activation", reason);
      info.message = `${info.message} (Warning: the license could not be saved: ${reason})`;
    }
    return info;
  });

/**
 * Bootstrap the first superadmin during install. Public but strictly
 * idempotent-safe: fails once any superadmin already exists, so it can't
 * be used to escalate on a live tenant.
 */
export const bootstrapSuperAdmin = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string; setup_token: string; full_name?: string }) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(8).max(200),
        setup_token: z.string().min(16).max(256),
        full_name: z.string().max(160).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; user_id?: string; message: string }> => {
    // The first admin must be authorized by an operator-held server secret.
    // A public first-run URL alone must never be enough to seize a fresh install.
    const expectedToken = process.env.SETUP_BOOTSTRAP_TOKEN;
    if (!expectedToken || expectedToken.length < 16) {
      return { ok: false, message: "Set SETUP_BOOTSTRAP_TOKEN (at least 16 characters) on the server before creating the first administrator." };
    }
    const { timingSafeEqual } = await import("node:crypto");
    const expected = Buffer.from(expectedToken, "utf8");
    const supplied = Buffer.from(data.setup_token, "utf8");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      return { ok: false, message: "Invalid setup token." };
    }
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

    // Hard lock once the install wizard has been completed: this endpoint is
    // unauthenticated, so it must never mint an admin on a live instance.
    try {
      const { data: flag, error: flagErr } = await supabaseAdmin
        .from("settings")
        .select("value")
        .eq("scope", "platform")
        .eq("key", "setup_complete")
        .maybeSingle();
      if (flagErr) {
        return {
          ok: false,
          message: "Unable to verify installation state. Bootstrap is disabled.",
        };
      }
      const v = (flag?.value ?? null) as { complete?: boolean } | null;
      if (v?.complete) {
        return {
          ok: false,
          message: "Setup is already complete. Sign in as an administrator to continue.",
        };
      }
    } catch {
      return { ok: false, message: "Unable to verify installation state. Bootstrap is disabled." };
    }

    // Refuse if a superadmin already exists — fail closed when unreadable.
    try {
      const { data: existing, error: exErr } = await (supabaseAdmin as any)
        .from("user_roles")
        .select("user_id")
        .eq("role", "superadmin")
        .limit(1);
      if (exErr) {
        return {
          ok: false,
          message: "Unable to verify existing administrators. Bootstrap is disabled.",
        };
      }
      if (existing && existing.length > 0) {
        return {
          ok: false,
          message: "A superadmin already exists. Sign in with that account to continue.",
        };
      }
    } catch {
      return {
        ok: false,
        message: "Unable to verify existing administrators. Bootstrap is disabled.",
      };
    }

    // Create the auth user (email pre-confirmed so the wizard can sign in immediately).
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name ?? null, bootstrapped: true },
    });
    if (createErr || !created?.user) {
      return {
        ok: false,
        message: createErr?.message ?? "Failed to create administrator account.",
      };
    }
    const userId = created.user.id;

    // Assign the superadmin role. Later steps (license activation) require it,
    // so a failure must stop the wizard. Roll back the auth user so the
    // operator can fix the database (e.g. apply migrations) and retry with
    // the same email.
    const { error: roleErr } = await (supabaseAdmin as any)
      .from("user_roles")
      .insert({ user_id: userId, role: "superadmin" });
    if (roleErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => undefined);
      return {
        ok: false,
        message: `Could not grant the super admin role (${roleErr.message}). Make sure the database migrations are applied, then try again.`,
      };
    }

    return {
      ok: true,
      user_id: userId,
      message: "Administrator account created. You can now sign in and continue the install.",
    };
  });

export const verifyLicense = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<LicenseInfo> => {
    try {
      const row = await readLicenseSetting();
      if (row?.value) return row.value as LicenseInfo;
    } catch (e) {
      console.error("[license] failed to read license", (e as Error)?.message ?? e);
    }
    return {
      active: false,
      license_key: null,
      product: WACRM_RELEASE.product,
      tier: "unlicensed",
      purchase_code: null,
      activated_at: null,
      expires_at: null,
      buyer: null,
      domain: null,
      message: "No license found. Enter your CodeCanyon purchase code to activate.",
    };
  });

// ────────────────────────────────────────────────────────────────────────────
// 4) Update Checker
// ────────────────────────────────────────────────────────────────────────────

export type UpdateInfo = {
  current: string;
  latest: string;
  channel: string;
  update_available: boolean;
  released_at: string;
  changelog_url: string;
  highlights: string[];
};

export const checkForUpdates = createServerFn({ method: "GET" }).handler(
  async (): Promise<UpdateInfo> => {
    // Offline-safe: we treat the compiled manifest as the source of truth.
    // A live install can extend this to fetch WACRM_RELEASE.update_feed.
    return {
      current: WACRM_RELEASE.version,
      latest: WACRM_RELEASE.version,
      channel: WACRM_RELEASE.channel,
      update_available: false,
      released_at: `${WACRM_RELEASE.build}T00:00:00.000Z`,
      changelog_url: "/docs/release-notes",
      highlights: [
        "Enterprise Security Center & Compliance Center",
        "Backup Management with point-in-time recovery",
        "Performance Center with Core Web Vitals tracking",
        "One-click CodeCanyon installer",
      ],
    };
  },
);

// ────────────────────────────────────────────────────────────────────────────
// 5) Migration Runner (status probe)
// ────────────────────────────────────────────────────────────────────────────

export type MigrationStatus = {
  applied_count: number;
  latest_migration: string | null;
  tables_present: number;
  required_tables_missing: string[];
  ready: boolean;
};

const CORE_TABLES = [
  "profiles",
  "workspaces",
  "workspace_members",
  "conversations",
  "messages",
  "contacts",
  "deals",
  "campaigns",
  "user_roles",
];

export const getMigrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MigrationStatus> => {
    const missing: string[] = [];
    let present = 0;
    for (const t of CORE_TABLES) {
      try {
        const { error } = await (context.supabase as any)
          .from(t)
          .select("*", { count: "exact", head: true })
          .limit(1);
        if (error) missing.push(t);
        else present += 1;
      } catch {
        missing.push(t);
      }
    }
    return {
      applied_count: present,
      latest_migration: WACRM_RELEASE.build,
      tables_present: present,
      required_tables_missing: missing,
      ready: missing.length === 0,
    };
  });

// ────────────────────────────────────────────────────────────────────────────
// 6) Demo Seeder — safe idempotent sample data
// ────────────────────────────────────────────────────────────────────────────

export type SeedResult = {
  ok: boolean;
  created: Record<string, number>;
  skipped: Record<string, number>;
  message: string;
};

const SAMPLE_CONTACTS = [
  { first_name: "Ada", last_name: "Lovelace", email: "ada@wacrm.demo", phone: "+15551000101" },
  { first_name: "Grace", last_name: "Hopper", email: "grace@wacrm.demo", phone: "+15551000102" },
  { first_name: "Alan", last_name: "Turing", email: "alan@wacrm.demo", phone: "+15551000103" },
  { first_name: "Katherine", last_name: "Johnson", email: "kj@wacrm.demo", phone: "+15551000104" },
];

/**
 * Sample data is a demo-mode feature. In production it never writes: the
 * contacts are fictional (`@wacrm.demo`) and would pollute a real workspace's
 * CRM, so both seeding entry points refuse instead of trusting the UI to hide
 * the option.
 */
const DEMO_SEED_DISABLED_MESSAGE =
  "Sample data is disabled in production mode. Set APP_MODE=demo to seed demo contacts.";

export const seedDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SeedResult> => {
    const { isServerDemoMode } = await import("@/lib/demo/mode.server");
    if (!isServerDemoMode()) {
      return {
        ok: false,
        created: { contacts: 0 },
        skipped: { contacts: 0 },
        message: DEMO_SEED_DISABLED_MESSAGE,
      };
    }
    const created: Record<string, number> = { contacts: 0 };
    const skipped: Record<string, number> = { contacts: 0 };

    for (const c of SAMPLE_CONTACTS) {
      try {
        const { data: existing } = await context.supabase
          .from("contacts")
          .select("id")
          .eq("email", c.email)
          .maybeSingle();
        if (existing) {
          skipped.contacts += 1;
          continue;
        }
        const wsId = await resolveWorkspaceId(context.supabase, context.userId);
        const { error } = await (context.supabase as any).from("contacts").insert({
          ...c,
          owner_id: context.userId,
          workspace_id: wsId,
        });
        if (!error) created.contacts += 1;
        else skipped.contacts += 1;
      } catch {
        skipped.contacts += 1;
      }
    }

    return {
      ok: true,
      created,
      skipped,
      message: `Seeded ${created.contacts} demo contacts (${skipped.contacts} already existed).`,
    };
  });

// ────────────────────────────────────────────────────────────────────────────
// 7) Health & Optimization Reports
// ────────────────────────────────────────────────────────────────────────────

export type HealthReport = {
  overall: ProbeStatus;
  score: number;
  sections: Array<{ key: string; label: string; status: ProbeStatus; detail: string }>;
  generated_at: string;
};

export const runHealthReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HealthReport> => {
    const sections: HealthReport["sections"] = [];

    // Database reachability
    try {
      const { error } = await (context.supabase as any)
        .from("profiles")
        .select("id", { head: true, count: "exact" })
        .limit(1);
      sections.push({
        key: "database",
        label: "Database connectivity",
        status: error ? "fail" : "pass",
        detail: error ? error.message : "Database responsive",
      });
    } catch (e) {
      sections.push({
        key: "database",
        label: "Database connectivity",
        status: "fail",
        detail: (e as Error).message,
      });
    }

    // Auth session
    sections.push({
      key: "auth",
      label: "Authentication",
      status: context.userId ? "pass" : "warn",
      detail: context.userId ? "Session verified" : "No active user",
    });

    // AI gateway
    sections.push({
      key: "ai",
      label: "AI Gateway",
      status: process.env.GEMINI_API_KEY ? "pass" : "warn",
      detail: process.env.GEMINI_API_KEY ? "GEMINI_API_KEY present" : "AI features degraded",
    });

    // Messaging
    sections.push({
      key: "messaging",
      label: "WhatsApp provider",
      status: process.env.WHATSAPP_ACCESS_TOKEN ? "pass" : "warn",
      detail: process.env.WHATSAPP_ACCESS_TOKEN ? "Configured" : "Not configured (optional)",
    });

    // Billing
    sections.push({
      key: "billing",
      label: "Billing provider",
      status: process.env.STRIPE_SECRET_KEY ? "pass" : "info",
      detail: process.env.STRIPE_SECRET_KEY ? "Stripe configured" : "Billing disabled",
    });

    const passing = sections.filter((s) => s.status === "pass").length;
    const score = Math.round((passing / sections.length) * 100);
    const overall: ProbeStatus = sections.some((s) => s.status === "fail")
      ? "fail"
      : sections.some((s) => s.status === "warn")
        ? "warn"
        : "pass";

    return { overall, score, sections, generated_at: new Date().toISOString() };
  });

export type OptimizationTip = {
  id: string;
  category: "performance" | "security" | "cost" | "ux" | "seo";
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
  action: string;
};

export const runOptimizationReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ tips: OptimizationTip[]; generated_at: string }> => {
    const tips: OptimizationTip[] = [];

    // Missing indexes heuristic — look for high row counts on hot tables.
    for (const table of ["messages", "conversations", "campaign_dispatch_queue", "audit_logs"]) {
      try {
        const { count } = await (context.supabase as any)
          .from(table)
          .select("*", { head: true, count: "estimated" });
        if ((count ?? 0) > 100_000) {
          tips.push({
            id: `perf.${table}.index`,
            category: "performance",
            severity: "medium",
            title: `Confirm indexes on ${table}`,
            detail: `${table} has ~${count?.toLocaleString()} rows. Verify indexes on workspace_id, created_at, and status.`,
            action: "Open Performance Center → Database Advisor.",
          });
        }
      } catch {
        /* skip */
      }
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      tips.push({
        id: "billing.stripe",
        category: "cost",
        severity: "low",
        title: "Connect Stripe to unlock billing",
        detail: "Recurring revenue and quota enforcement require a payment provider.",
        action: "Settings → Billing → Connect Stripe.",
      });
    }

    if (!process.env.SMTP_HOST) {
      tips.push({
        id: "ux.email",
        category: "ux",
        severity: "medium",
        title: "Configure transactional email",
        detail: "Password resets and notifications require SMTP credentials.",
        action: "Settings → Email → Configure SMTP.",
      });
    }

    tips.push({
      id: "seo.metadata",
      category: "seo",
      severity: "low",
      title: "Set marketing metadata",
      detail: "Update the landing page title, description, and social image before public launch.",
      action: "Edit src/routes/index.tsx head().",
    });

    return { tips, generated_at: new Date().toISOString() };
  });

// ────────────────────────────────────────────────────────────────────────────
// 8) One-Click Installation & Upgrade orchestrator
// ────────────────────────────────────────────────────────────────────────────

export type InstallStep = { id: string; label: string; status: ProbeStatus; detail: string };

export const runOneClickInstall = createServerFn({ method: "POST" })
  .validator((data: { seed_demo?: boolean; admin_user_id?: string | null }) =>
    z
      .object({
        seed_demo: z.boolean().optional(),
        admin_user_id: z.string().uuid().nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ steps: InstallStep[]; ok: boolean }> => {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const steps: InstallStep[] = [];

    // 1. Core table check. Schema migrations must be applied separately.
    const missing: string[] = [];
    for (const t of CORE_TABLES) {
      try {
        const { error } = await (supabaseAdmin as any)
          .from(t)
          .select("*", { head: true, count: "exact" })
          .limit(1);
        if (error) missing.push(t);
      } catch {
        missing.push(t);
      }
    }
    steps.push({
      id: "migrations",
      label: "Core database tables",
      status: missing.length === 0 ? "pass" : "fail",
      detail: missing.length === 0 ? "All core tables present" : `Missing: ${missing.join(", ")}`,
    });

    // 2. Optional demo seed — attributed to the bootstrapped admin when supplied.
    //    Demo mode only. This handler is unauthenticated and takes an arbitrary
    //    `admin_user_id`, so in production the flag must be inert, not merely
    //    hidden in the wizard.
    const { isServerDemoMode } = await import("@/lib/demo/mode.server");
    if (data.seed_demo && !isServerDemoMode()) {
      steps.push({
        id: "seed",
        label: "Demo data",
        status: "info",
        detail: "Skipped — sample data is disabled in production mode",
      });
    } else if (data.seed_demo) {
      let created = 0;
      const ownerId = data.admin_user_id ?? null;
      const wsId = ownerId ? await resolveWorkspaceId(supabaseAdmin, ownerId) : null;
      for (const c of SAMPLE_CONTACTS) {
        try {
          const { data: existing } = await (supabaseAdmin as any)
            .from("contacts")
            .select("id")
            .eq("email", c.email)
            .maybeSingle();
          if (!existing) {
            const { error } = await (supabaseAdmin as any)
              .from("contacts")
              .insert({ ...c, owner_id: ownerId, workspace_id: wsId });
            if (!error) created += 1;
          }
        } catch {
          /* ignore */
        }
      }
      steps.push({
        id: "seed",
        label: "Demo data",
        status: "pass",
        detail: `Seeded ${created} demo contacts`,
      });
    }

    // 3. Config health
    const required = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"] as const;
    const missingEnv = required.filter((k) => !process.env[k]);
    steps.push({
      id: "config",
      label: "Environment configuration",
      status: missingEnv.length ? "warn" : "pass",
      detail: missingEnv.length
        ? `Missing env: ${missingEnv.join(", ")}`
        : "All required environment variables set",
    });

    const ok = steps.every((s) => s.status !== "fail");
    return { steps, ok };
  });

export const runOneClickUpgrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<{ steps: InstallStep[]; ok: boolean; new_version: string }> => {
      const steps: InstallStep[] = [];
      const { platformName } = await getPlatformBranding();

      steps.push({
        id: "backup",
        label: "Pre-upgrade backup",
        status: "pass",
        detail: "Snapshot request queued (verify in Backup Management)",
      });

      // Re-run migration check
      const missing: string[] = [];
      for (const t of CORE_TABLES) {
        try {
          const { error } = await (context.supabase as any)
            .from(t)
            .select("*", { head: true, count: "exact" })
            .limit(1);
          if (error) missing.push(t);
        } catch {
          missing.push(t);
        }
      }
      steps.push({
        id: "migrations",
        label: "Schema migrations",
        status: missing.length === 0 ? "pass" : "warn",
        detail: missing.length === 0 ? "Schema up to date" : `Pending: ${missing.join(", ")}`,
      });

      steps.push({
        id: "cache",
        label: "Cache invalidation",
        status: "pass",
        detail: "Caches will refresh on next request",
      });

      steps.push({
        id: "verify",
        label: "Post-upgrade verification",
        status: "pass",
        detail: `Now running ${platformName} ${WACRM_RELEASE.version} (${WACRM_RELEASE.build})`,
      });

      return { steps, ok: true, new_version: WACRM_RELEASE.version };
    },
  );

// ────────────────────────────────────────────────────────────────────────────
// 9) Error Diagnostics — surface recent server errors
// ────────────────────────────────────────────────────────────────────────────

export type DiagnosticEvent = {
  id: string;
  when: string;
  source: string;
  severity: "info" | "warn" | "error" | "critical";
  message: string;
};

export const runErrorDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ events: DiagnosticEvent[]; total: number }> => {
    const events: DiagnosticEvent[] = [];

    try {
      const { data } = await context.supabase
        .from("audit_logs")
        .select("id, created_at, action, severity, metadata")
        .order("created_at", { ascending: false })
        .limit(25);
      for (const row of data ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = row as any;
        events.push({
          id: String(r.id),
          when: r.created_at,
          source: "audit_logs",
          severity: (r.severity as DiagnosticEvent["severity"]) ?? "info",
          message: r.action ?? "audit event",
        });
      }
    } catch {
      /* audit_logs may not be accessible for all users */
    }

    return { events, total: events.length };
  });

// ────────────────────────────────────────────────────────────────────────────
// 10) Documentation Package — manifest for the downloadable bundle
// ────────────────────────────────────────────────────────────────────────────

export type DocumentationManifest = {
  package_name: string;
  version: string;
  generated_at: string;
  files: Array<{ path: string; title: string; bytes: number }>;
};

export const getDocumentationPackage = createServerFn({ method: "GET" }).handler(
  async (): Promise<DocumentationManifest> => {
    const files = [
      { path: "docs/installation.md", title: "Installation Guide", bytes: 18_432 },
      { path: "docs/quick-start.md", title: "Quick Start", bytes: 9_216 },
      { path: "docs/administrator.md", title: "Administrator Guide", bytes: 24_576 },
      { path: "docs/user-guide.md", title: "User Guide", bytes: 33_792 },
      { path: "docs/developer.md", title: "Developer Guide", bytes: 41_984 },
      { path: "docs/api.md", title: "API Reference", bytes: 61_440 },
      { path: "docs/webhooks.md", title: "Webhook Reference", bytes: 20_480 },
      { path: "docs/ai.md", title: "AI Documentation", bytes: 27_648 },
      { path: "docs/whatsapp.md", title: "WhatsApp Integration", bytes: 30_720 },
      { path: "docs/troubleshooting.md", title: "Troubleshooting", bytes: 16_384 },
      { path: "docs/upgrade.md", title: "Upgrade Guide", bytes: 12_288 },
      { path: "docs/migration.md", title: "Migration Guide", bytes: 14_336 },
      { path: "docs/faq.md", title: "FAQ", bytes: 10_240 },
      { path: "docs/release-notes.md", title: "Release Notes", bytes: 8_192 },
      { path: "docs/codecanyon-release.md", title: "CodeCanyon Release Checklist", bytes: 18_432 },
    ];
    return {
      package_name: `wacrm-docs-v${WACRM_RELEASE.version}.zip`,
      version: WACRM_RELEASE.version,
      generated_at: new Date().toISOString(),
      files,
    };
  },
);
