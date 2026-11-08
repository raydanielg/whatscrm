import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Rocket,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  UserPlus,
  Palette,
  Settings2,
  Server,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  validateEnvironment,
  bootstrapSuperAdmin,
  type Probe,
  type ProbeStatus,
} from "@/lib/release/installation.functions";
import {
  getSetupStatus,
  saveSetupBranding,
  saveSetupSystemConfig,
  saveSetupSaas,
  completeSetup,
} from "@/lib/setup/setup.functions";

export const Route = createFileRoute("/setup")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Setup Wizard" },
      {
        name: "description",
        content:
          `Initialize your ${BRAND_NAME} installation: create the first administrator, brand the app, and configure system defaults.`,
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async () => {
    let status: Awaited<ReturnType<typeof getSetupStatus>>;
    try {
      status = await getSetupStatus();
    } catch (error) {
      return {
        existingSuperAdmin: false,
        setupStatusError: error instanceof Error ? error.message : "Could not check setup status",
      };
    }
    if (status.setupComplete) throw redirect({ to: "/auth" });
    if (status.superAdminExists) {
      const { data: sessionResult } = await supabase.auth.getSession();
      const user = sessionResult.session?.user;
      if (!user) throw redirect({ to: "/auth", search: { next: "/setup" } });
      const { data: isAdmin, error } = await supabase.rpc("is_super_admin", { _user_id: user.id });
      if (error || !isAdmin) {
        throw redirect({
          to: "/403",
          search: { scope: "platform", required: "superadmin", from: "/setup" },
        });
      }
    }
    return { existingSuperAdmin: status.superAdminExists, setupStatusError: null };
  },
  component: SetupWizard,
});

type StepKey = "environment" | "admin" | "branding" | "system" | "saas" | "confirm";
const STEPS: { key: StepKey; label: string; icon: typeof Rocket }[] = [
  { key: "environment", label: "Environment", icon: ShieldCheck },
  { key: "admin", label: "Administrator", icon: UserPlus },
  { key: "branding", label: "Branding", icon: Palette },
  { key: "system", label: "System", icon: Settings2 },
  { key: "saas", label: "SaaS", icon: Server },
  { key: "confirm", label: "Launch", icon: Rocket },
];

const statusIcon = (s: ProbeStatus) => {
  if (s === "pass") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (s === "warn") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (s === "fail") return <XCircle className="h-4 w-4 text-rose-500" />;
  return <Info className="h-4 w-4 text-sky-500" />;
};

function ProbeList({ probes }: { probes: Probe[] }) {
  return (
    <ul className="space-y-2">
      {probes.map((p) => (
        <li key={p.id} className="flex items-start gap-3 rounded-control border bg-card/50 p-3">
          <div className="mt-0.5">{statusIcon(p.status)}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{p.label}</span>
              <span className="rounded border px-1.5 py-0.5 text-[11px] uppercase text-muted-foreground">
                {p.status}
              </span>
            </div>
            <p className="break-words text-sm text-muted-foreground">{p.detail}</p>
            {p.fix && <p className="mt-1 text-xs text-amber-600">→ {p.fix}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Oslo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];
const CURRENCIES = ["USD", "EUR", "GBP", "NOK", "SEK", "INR", "AED", "SGD", "JPY", "AUD", "CAD"];
const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "nb", label: "Norsk (Bokmål)" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
];

function passwordStrength(pw: string): { score: number; label: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong", "Excellent"];
  return { score: s, label: labels[s] };
}

function SetupWizard() {
  const navigate = useNavigate();
  const { existingSuperAdmin, setupStatusError } = Route.useRouteContext();
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx].key;

  const envFn = useServerFn(validateEnvironment);
  const bootstrapFn = useServerFn(bootstrapSuperAdmin);
  const brandingFn = useServerFn(saveSetupBranding);
  const systemFn = useServerFn(saveSetupSystemConfig);
  const saasFn = useServerFn(saveSetupSaas);
  const completeFn = useServerFn(completeSetup);

  const env = useQuery({
    queryKey: ["setup.env"],
    queryFn: () => envFn(),
    enabled: step === "environment",
  });

  // Admin
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPassword2, setAdminPassword2] = useState("");
  const [adminName, setAdminName] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [adminMsg, setAdminMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [createdAdmin, setCreatedAdmin] = useState(false);
  const adminReady = existingSuperAdmin || createdAdmin;
  const strength = useMemo(() => passwordStrength(adminPassword), [adminPassword]);
  const passwordsMatch = adminPassword.length > 0 && adminPassword === adminPassword2;
  const passwordValid = strength.score >= 3 && passwordsMatch;

  const bootstrapMut = useMutation({
    mutationFn: async () => {
      const r = await bootstrapFn({
        data: { email: adminEmail, password: adminPassword, setup_token: setupToken, full_name: adminName || undefined },
      });
      if (r.ok) {
        const { error } = await supabase.auth.signInWithPassword({
          email: adminEmail,
          password: adminPassword,
        });
        if (error) throw new Error(`Admin created but sign-in failed: ${error.message}`);
      }
      return r;
    },
    onSuccess: (r) => {
      setAdminMsg({ ok: r.ok, msg: r.message });
      if (r.ok) {
        setCreatedAdmin(true);
        setAdminPassword("");
        setAdminPassword2("");
        setSetupToken("");
      }
    },
    onError: (e: Error) => setAdminMsg({ ok: false, msg: e.message }),
  });

  // Branding
  const [appName, setAppName] = useState(`${BRAND_NAME}`);
  const [tagline, setTagline] = useState("The AI-powered WhatsApp CRM");
  const [primaryColor, setPrimaryColor] = useState("#B91C1C");
  const [logoUrl, setLogoUrl] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");
  const brandingMut = useMutation({
    mutationFn: () =>
      brandingFn({
        data: {
          app_name: appName.trim(),
          tagline: tagline.trim() || null,
          primary_color: primaryColor.trim() || null,
          logo_url: logoUrl.trim() || null,
          favicon_url: faviconUrl.trim() || null,
        },
      }),
  });

  // System
  const [timezone, setTimezone] = useState(
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" : "UTC",
  );
  const [currency, setCurrency] = useState("USD");
  const [dateFormat, setDateFormat] = useState<"MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD">(
    "YYYY-MM-DD",
  );
  const [language, setLanguage] = useState("en");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState<number | "">(587);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpFromEmail, setSmtpFromEmail] = useState("");
  const [smtpFromName, setSmtpFromName] = useState("");
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyInApp, setNotifyInApp] = useState(true);
  const smtpEmailValid =
    smtpFromEmail.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(smtpFromEmail);
  const systemMut = useMutation({
    mutationFn: () =>
      systemFn({
        data: {
          timezone,
          currency,
          date_format: dateFormat,
          language,
          smtp: {
            host: smtpHost.trim() || null,
            port: smtpPort === "" ? null : Number(smtpPort),
            username: smtpUser.trim() || null,
            from_email: smtpFromEmail.trim() || null,
            from_name: smtpFromName.trim() || null,
            secure: smtpSecure,
          },
          notifications: { email_enabled: notifyEmail, in_app_enabled: notifyInApp },
        },
      }),
  });

  // SaaS
  const [saasEnabled, setSaasEnabled] = useState(false);
  const [subsEnabled, setSubsEnabled] = useState(false);
  const [multiTenant, setMultiTenant] = useState(false);
  const [defaultPlan, setDefaultPlan] = useState("starter");
  const saasMut = useMutation({
    mutationFn: () =>
      saasFn({
        data: {
          saas_enabled: saasEnabled,
          subscriptions_enabled: subsEnabled,
          default_plan: defaultPlan || null,
          multi_tenant: multiTenant,
        },
      }),
  });

  // Finalize
  const finalizeMut = useMutation({
    mutationFn: async () => {
      const r = await completeFn();
      return r;
    },
    onSuccess: () => {
      setTimeout(() => navigate({ to: "/dashboard" as string as never }), 800);
    },
  });

  const canProceed = (() => {
    switch (step) {
      case "environment":
        return !setupStatusError && !!env.data && env.data.overall !== "fail";
      case "admin":
        return adminReady;
      case "branding":
        return brandingMut.data?.ok || false;
      case "system":
        return systemMut.data?.ok || false;
      case "saas":
        return saasMut.data?.ok || false;
      case "confirm":
        return false;
    }
  })();

  return (
    <div className="min-h-dvh bg-gradient-to-b from-background via-background to-muted/30">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-6 text-center sm:mb-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-control bg-gradient-to-br from-primary to-primary/60 shadow-lg">
            <Rocket className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Setup Wizard</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Step {stepIdx + 1} of {STEPS.length} · {STEPS[stepIdx].label}
          </p>
        </div>

        <div className="mb-6">
          <Progress value={((stepIdx + 1) / STEPS.length) * 100} />
          <div className="mt-3 hidden justify-between text-xs text-muted-foreground sm:flex">
            {STEPS.map((s, i) => (
              <span
                key={s.key}
                className={i === stepIdx ? "font-medium text-foreground" : ""}
              >
                {s.label}
              </span>
            ))}
          </div>
        </div>

        <Card>
          {step === "environment" && (
            <>
              <CardHeader>
                <CardTitle>Environment Validation</CardTitle>
                <CardDescription>
                  Verifying database, storage, and required environment variables.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {setupStatusError && (
                  <p className="mb-4 rounded-control border border-rose-500/40 bg-rose-500/10 p-3 text-sm">{setupStatusError}</p>
                )}
                {env.isLoading && (
                  <p className="text-sm text-muted-foreground">Scanning environment</p>
                )}
                {env.isError && <p className="text-sm text-rose-500">{(env.error as Error).message}</p>}
                {env.data && <ProbeList probes={env.data.probes} />}
                {env.data?.overall === "fail" && (
                  <div className="mt-4 rounded-control border border-rose-500/40 bg-rose-500/10 p-3 text-sm">
                    One or more critical checks failed. Fix the items above before continuing.
                  </div>
                )}
              </CardContent>
            </>
          )}

          {step === "admin" && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-primary" /> Create Super Administrator
                </CardTitle>
                <CardDescription>
                  This account has full control over your installation. Use a strong, unique password.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {existingSuperAdmin ? (
                  <div className="flex items-start gap-2 rounded-control border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span>You are signed in as the existing super administrator. Continue to configure this installation.</span>
                  </div>
                ) : (
                <>
                <div className="grid gap-2">
                  <Label htmlFor="admin-name">Full name</Label>
                  <Input
                    id="admin-name"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="Jane Doe"
                    disabled={adminReady}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="admin-email">Email</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    autoComplete="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={adminReady}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="admin-password">Password</Label>
                  <Input
                    id="admin-password"
                    type="password"
                    autoComplete="new-password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    disabled={adminReady}
                  />
                  {adminPassword.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Progress value={(strength.score / 5) * 100} className="h-1.5 flex-1" />
                      <span className="w-20 text-right text-xs text-muted-foreground">
                        {strength.label}
                      </span>
                    </div>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="admin-password2">Confirm password</Label>
                  <Input
                    id="admin-password2"
                    type="password"
                    autoComplete="new-password"
                    value={adminPassword2}
                    onChange={(e) => setAdminPassword2(e.target.value)}
                    disabled={adminReady}
                  />
                  {adminPassword2.length > 0 && !passwordsMatch && (
                    <p className="text-xs text-rose-500">Passwords do not match.</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="setup-token">Setup token</Label>
                  <Input id="setup-token" type="password" autoComplete="off" value={setupToken}
                    onChange={(e) => setSetupToken(e.target.value)} disabled={adminReady} />
                  <p className="text-xs text-muted-foreground">Enter the server's SETUP_BOOTSTRAP_TOKEN to authorize the first administrator.</p>
                </div>
                <Button
                  onClick={() => bootstrapMut.mutate()}
                  disabled={
                    bootstrapMut.isPending ||
                    !adminEmail ||
                    !passwordValid ||
                    setupToken.length < 16 ||
                    adminReady
                  }
                >
                  {adminReady
                    ? "Administrator ready"
                    : bootstrapMut.isPending
                      ? "Creating"
                      : "Create administrator"}
                </Button>
                {adminMsg && (
                  <div
                    className={`flex items-start gap-2 rounded-control border p-3 text-sm ${
                      adminMsg.ok
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-rose-500/40 bg-rose-500/10"
                    }`}
                  >
                    {adminMsg.ok ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                    )}
                    <span className="break-words">{adminMsg.msg}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Already created a Supabase Auth user? Assign that user the superadmin role in the database, then sign in and reopen /setup. Creating a user alone does not grant platform access.
                </p>
                </>
                )}
              </CardContent>
            </>
          )}

          {step === "branding" && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5 text-primary" /> App Identity & Branding
                </CardTitle>
                <CardDescription>
                  These settings appear across the app, emails, and PWA install prompts.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="app-name">App name *</Label>
                    <Input
                      id="app-name"
                      value={appName}
                      onChange={(e) => setAppName(e.target.value)}
                      maxLength={80}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="primary-color">Primary color</Label>
                    <div className="flex gap-2">
                      <Input
                        id="primary-color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        placeholder="#B91C1C"
                        className="font-mono"
                      />
                      <input
                        type="color"
                        aria-label="Pick color"
                        value={/^#[0-9a-fA-F]{6}$/.test(primaryColor) ? primaryColor : "#B91C1C"}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="h-10 w-12 shrink-0 cursor-pointer rounded border bg-background"
                      />
                    </div>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tagline">Tagline (optional)</Label>
                  <Input
                    id="tagline"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    maxLength={200}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="logo-url">Logo URL (optional)</Label>
                    <Input
                      id="logo-url"
                      type="url"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      placeholder="https:///logo.png"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="favicon-url">Favicon URL (optional)</Label>
                    <Input
                      id="favicon-url"
                      type="url"
                      value={faviconUrl}
                      onChange={(e) => setFaviconUrl(e.target.value)}
                      placeholder="https:///favicon.png"
                    />
                  </div>
                </div>
                <Button
                  onClick={() => brandingMut.mutate()}
                  disabled={brandingMut.isPending || !appName.trim()}
                >
                  {brandingMut.data?.ok
                    ? "Branding saved ✓"
                    : brandingMut.isPending
                      ? "Saving"
                      : "Save branding"}
                </Button>
                {brandingMut.isError && (
                  <p className="text-sm text-rose-500 break-words">
                    {(brandingMut.error as Error).message}
                  </p>
                )}
              </CardContent>
            </>
          )}

          {step === "system" && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-primary" /> System Configuration
                </CardTitle>
                <CardDescription>
                  Localization and messaging defaults for your workspace.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Timezone</Label>
                    <Select value={timezone} onValueChange={setTimezone}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Currency</Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Date format</Label>
                    <Select
                      value={dateFormat}
                      onValueChange={(v) => setDateFormat(v as typeof dateFormat)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="YYYY-MM-DD">2026-07-27 (ISO)</SelectItem>
                        <SelectItem value="MM/DD/YYYY">07/27/2026 (US)</SelectItem>
                        <SelectItem value="DD/MM/YYYY">27/07/2026 (EU)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Default language</Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LANGUAGES.map((l) => (
                          <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="rounded-control border p-4">
                  <p className="mb-3 text-sm font-medium">Email (SMTP) — optional</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2 sm:col-span-2">
                      <Label htmlFor="smtp-host">Host</Label>
                      <Input
                        id="smtp-host"
                        value={smtpHost}
                        onChange={(e) => setSmtpHost(e.target.value)}
                        placeholder="smtp.example.com"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="smtp-port">Port</Label>
                      <Input
                        id="smtp-port"
                        type="number"
                        min={1}
                        max={65535}
                        value={smtpPort}
                        onChange={(e) =>
                          setSmtpPort(e.target.value === "" ? "" : Number(e.target.value))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="smtp-user">Username</Label>
                      <Input
                        id="smtp-user"
                        value={smtpUser}
                        onChange={(e) => setSmtpUser(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="smtp-from-email">From email</Label>
                      <Input
                        id="smtp-from-email"
                        type="email"
                        value={smtpFromEmail}
                        onChange={(e) => setSmtpFromEmail(e.target.value)}
                        placeholder="noreply@example.com"
                      />
                      {!smtpEmailValid && (
                        <p className="text-xs text-rose-500">Invalid email address.</p>
                      )}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="smtp-from-name">From name</Label>
                      <Input
                        id="smtp-from-name"
                        value={smtpFromName}
                        onChange={(e) => setSmtpFromName(e.target.value)}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <Switch checked={smtpSecure} onCheckedChange={setSmtpSecure} />
                      Use TLS/SSL
                    </label>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Passwords are stored via encrypted secrets, not this wizard. Add the SMTP
                    password later in Super Admin → Settings.
                  </p>
                </div>

                <div className="rounded-control border p-4">
                  <p className="mb-3 text-sm font-medium">Notifications</p>
                  <div className="space-y-2">
                    <label className="flex items-center justify-between text-sm">
                      <span>Email notifications</span>
                      <Switch checked={notifyEmail} onCheckedChange={setNotifyEmail} />
                    </label>
                    <label className="flex items-center justify-between text-sm">
                      <span>In-app notifications</span>
                      <Switch checked={notifyInApp} onCheckedChange={setNotifyInApp} />
                    </label>
                  </div>
                </div>

                <Button
                  onClick={() => systemMut.mutate()}
                  disabled={systemMut.isPending || !smtpEmailValid}
                >
                  {systemMut.data?.ok
                    ? "System settings saved ✓"
                    : systemMut.isPending
                      ? "Saving"
                      : "Save system configuration"}
                </Button>
                {systemMut.isError && (
                  <p className="text-sm text-rose-500 break-words">
                    {(systemMut.error as Error).message}
                  </p>
                )}
              </CardContent>
            </>
          )}

          {step === "saas" && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5 text-primary" /> SaaS Settings
                </CardTitle>
                <CardDescription>
                  Enable multi-tenant SaaS features. You can change these later in Super Admin.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="flex items-center justify-between rounded-control border p-3 text-sm">
                  <div>
                    <p className="font-medium">Enable SaaS mode</p>
                    <p className="text-xs text-muted-foreground">
                      Public sign-ups, plans, billing surfaces.
                    </p>
                  </div>
                  <Switch checked={saasEnabled} onCheckedChange={setSaasEnabled} />
                </label>
                <label className="flex items-center justify-between rounded-control border p-3 text-sm">
                  <div>
                    <p className="font-medium">Subscriptions</p>
                    <p className="text-xs text-muted-foreground">Enable Stripe subscription billing.</p>
                  </div>
                  <Switch checked={subsEnabled} onCheckedChange={setSubsEnabled} />
                </label>
                <label className="flex items-center justify-between rounded-control border p-3 text-sm">
                  <div>
                    <p className="font-medium">Multi-tenant workspaces</p>
                    <p className="text-xs text-muted-foreground">
                      Isolate data per organization / workspace.
                    </p>
                  </div>
                  <Switch checked={multiTenant} onCheckedChange={setMultiTenant} />
                </label>
                {saasEnabled && (
                  <div className="grid gap-2">
                    <Label htmlFor="default-plan">Default plan</Label>
                    <Input
                      id="default-plan"
                      value={defaultPlan}
                      onChange={(e) => setDefaultPlan(e.target.value)}
                      placeholder="starter"
                    />
                  </div>
                )}
                <Button onClick={() => saasMut.mutate()} disabled={saasMut.isPending}>
                  {saasMut.data?.ok
                    ? "SaaS settings saved ✓"
                    : saasMut.isPending
                      ? "Saving"
                      : "Save SaaS settings"}
                </Button>
                {saasMut.isError && (
                  <p className="text-sm text-rose-500 break-words">
                    {(saasMut.error as Error).message}
                  </p>
                )}
              </CardContent>
            </>
          )}

          {step === "confirm" && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Rocket className="h-5 w-5 text-primary" /> Confirm & Launch
                </CardTitle>
                <CardDescription>
                  Review your settings, then launch your installation.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-control border">
                  <SummaryRow label="Administrator" value={existingSuperAdmin ? "Existing super administrator" : adminEmail} />
                  <SummaryRow label="App name" value={appName} />
                  <SummaryRow
                    label="Primary color"
                    value={
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-block h-4 w-4 rounded border"
                          style={{ backgroundColor: primaryColor }}
                        />
                        <span className="font-mono text-xs">{primaryColor}</span>
                      </span>
                    }
                  />
                  <SummaryRow label="Timezone" value={timezone} />
                  <SummaryRow label="Currency" value={currency} />
                  <SummaryRow label="Date format" value={dateFormat} />
                  <SummaryRow label="Language" value={language} />
                  <SummaryRow label="SMTP host" value={smtpHost || "—"} />
                  <SummaryRow label="SaaS mode" value={saasEnabled ? "Enabled" : "Disabled"} />
                  <SummaryRow
                    label="Multi-tenant"
                    value={multiTenant ? "Enabled" : "Disabled"}
                  />
                </div>
                <div className="rounded-control border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <p className="font-medium">Setup will be locked after launch.</p>
                  <p className="text-muted-foreground">
                    The /setup route becomes inaccessible. Manage these settings from Super Admin.
                  </p>
                </div>
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => finalizeMut.mutate()}
                  disabled={finalizeMut.isPending || finalizeMut.data?.ok}
                >
                  {finalizeMut.data?.ok
                    ? "Launching"
                    : finalizeMut.isPending
                      ? "Finalizing"
                      : "Launch application"}
                </Button>
                {finalizeMut.isError && (
                  <p className="text-sm text-rose-500 break-words">
                    {(finalizeMut.error as Error).message}
                  </p>
                )}
              </CardContent>
            </>
          )}
        </Card>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button
            variant="outline"
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
            disabled={stepIdx === 0 || finalizeMut.data?.ok}
            className="w-full sm:w-auto"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          {step !== "confirm" && (
            <Button
              onClick={() => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))}
              disabled={!canProceed}
              className="w-full sm:w-auto"
            >
              Next <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b p-3 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium">{value}</span>
    </div>
  );
}
