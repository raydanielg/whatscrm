import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  Shield,
  KeyRound,
  Smartphone,
  Globe,
  History,
  AlertTriangle,
  MailCheck,
  Bell,
  Lock,
  Copy,
  RefreshCw,
  Check,
  X,
  Plus,
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Slider } from "@/components/ui/slider";

import { useMyProfile, useMySessions, useRevokeSession } from "@/hooks/use-profile";
import { useActiveOrganization } from "@/hooks/use-organization";
import {
  useLoginHistory,
  usePersonalAccessTokens,
  useCreatePAT,
  useRevokePAT,
  useDeletePAT,
  useMy2FA,
  useEnable2FA,
  useConfirm2FA,
  useDisable2FA,
  useRegenerateRecoveryCodes,
  useMyLockout,
  usePasswordPolicy,
  useSavePasswordPolicy,
  useRevokeOtherSessions,
} from "@/hooks/use-security";
import { supabase } from "@/integrations/supabase/client";
import { EnterpriseSecurityPanel } from "@/components/app/security/enterprise-security-panel";
import { AppTopbar } from "@/components/app/app-topbar";

export const Route = createFileRoute("/_authenticated/security")({
  component: SecurityPage,
});

function SecurityPage() {
  return (
    <>
      <AppTopbar
        title="Security Center"
        subtitle="Manage account security, sessions, tokens, and enterprise policies"
      />
      <main className="container mx-auto max-w-6xl p-6 space-y-6">
        <OverviewCards />

        <Tabs defaultValue="account" className="space-y-4">
          <TabsList className="grid grid-cols-3 md:grid-cols-7">
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="tokens">Tokens</TabsTrigger>
            <TabsTrigger value="notifications">Alerts</TabsTrigger>
            <TabsTrigger value="policy">Policy</TabsTrigger>
            <TabsTrigger value="enterprise">Enterprise</TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="space-y-4">
            <TwoFactorCard />
            <EmailVerificationCard />
            <PasswordCard />
            <LockoutCard />
          </TabsContent>
          <TabsContent value="sessions">
            <SessionsCard />
          </TabsContent>
          <TabsContent value="activity">
            <ActivityCard />
          </TabsContent>
          <TabsContent value="tokens">
            <TokensCard />
          </TabsContent>
          <TabsContent value="notifications">
            <NotificationsCard />
          </TabsContent>
          <TabsContent value="policy">
            <PolicyCard />
          </TabsContent>
          <TabsContent value="enterprise">
            <EnterpriseSecurityPanel />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}

/* --- Overview --- */
function OverviewCards() {
  const { data: twoFa } = useMy2FA();
  const { data: sessions } = useMySessions();
  const { data: history } = useLoginHistory(50);
  const { data: profile } = useMyProfile();
  const activeSessions = (sessions ?? []).filter((s) => !s.revoked_at).length;
  const failedRecent = (history ?? []).filter(
    (h) => h.event === "failed" && Date.now() - new Date(h.created_at).getTime() < 30 * 86400_000,
  ).length;

  const score = useMemo(() => {
    let s = 0;
    if (twoFa?.enabled) s += 40;
    if (profile?.email) s += 20;
    if (activeSessions <= 3) s += 20;
    if (failedRecent === 0) s += 20;
    return s;
  }, [twoFa, profile, activeSessions, failedRecent]);

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <MetricCard
        label="Security score"
        value={`${score}/100`}
        icon={Shield}
        tone={score >= 80 ? "good" : score >= 40 ? "warn" : "bad"}
      />
      <MetricCard
        label="Two-factor auth"
        value={twoFa?.enabled ? "On" : "Off"}
        icon={Smartphone}
        tone={twoFa?.enabled ? "good" : "warn"}
      />
      <MetricCard label="Active sessions" value={activeSessions} icon={Globe} tone="neutral" />
      <MetricCard
        label="Failed logins (30d)"
        value={failedRecent}
        icon={AlertTriangle}
        tone={failedRecent === 0 ? "good" : "warn"}
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: typeof Shield;
  tone: "good" | "warn" | "bad" | "neutral";
}) {
  const cls = {
    good: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    bad: "text-destructive",
    neutral: "text-primary",
  }[tone];
  return (
    <Card>
      <CardContent className="p-4 flex items-start justify-between">
        <div>
          <p className="text-xs uppercase text-muted-foreground">{label}</p>
          <p className={`text-2xl font-semibold ${cls}`}>{value}</p>
        </div>
        <Icon className={`h-5 w-5 ${cls}`} />
      </CardContent>
    </Card>
  );
}

/* --- 2FA --- */
function TwoFactorCard() {
  const { data: state } = useMy2FA();
  const enable = useEnable2FA();
  const confirm = useConfirm2FA();
  const disable = useDisable2FA();
  const regen = useRegenerateRecoveryCodes();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);

  const start = async () => {
    const r = await enable.mutateAsync();
    setSetup(r);
  };
  const finish = async () => {
    if (code.length < 6) return toast.error("Enter the 6-digit code");
    await confirm.mutateAsync(code);
    const c = await regen.mutateAsync();
    setCodes(c);
    setSetup(null);
    setCode("");
    toast.success("Two-factor authentication enabled");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-5 w-5" /> Two-Factor Authentication
        </CardTitle>
        <CardDescription>
          Require a time-based one-time password from an authenticator app on sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant={state?.enabled ? "default" : "secondary"}>
              {state?.enabled ? "Enabled" : "Disabled"}
            </Badge>
            {state?.verified_at && (
              <span className="text-sm text-muted-foreground">
                Verified {formatDistanceToNow(new Date(state.verified_at), { addSuffix: true })}
              </span>
            )}
          </div>
          {state?.enabled ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  const c = await regen.mutateAsync();
                  setCodes(c);
                  toast.success("New recovery codes generated");
                }}
              >
                <RefreshCw className="h-4 w-4" /> New recovery codes
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">Disable</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disable two-factor authentication?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove the requirement to enter a one-time code when signing in.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => disable.mutate()}>
                      Disable 2FA
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : (
            <Dialog open={!!setup} onOpenChange={(o) => !o && setSetup(null)}>
              <Button onClick={start} disabled={enable.isPending}>
                Enable 2FA
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Set up authenticator</DialogTitle>
                  <DialogDescription>
                    Scan the QR code in your authenticator app, or enter the secret manually.
                  </DialogDescription>
                </DialogHeader>
                {setup && (
                  <div className="space-y-4">
                    <div className="rounded-control border p-4 bg-muted/40">
                      <p className="text-xs uppercase text-muted-foreground mb-1">Secret key</p>
                      <div className="flex items-center justify-between gap-2">
                        <code className="text-sm break-all">{setup.secret}</code>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(setup.secret);
                            toast.success("Copied");
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="otp">Enter 6-digit code</Label>
                      <Input
                        id="otp"
                        inputMode="numeric"
                        maxLength={6}
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                        placeholder="123456"
                      />
                    </div>
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSetup(null)}>
                    Cancel
                  </Button>
                  <Button onClick={finish} disabled={confirm.isPending}>
                    Verify & Enable
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {codes && (
          <Alert>
            <AlertTitle>Save your recovery codes</AlertTitle>
            <AlertDescription>
              <p className="mb-2">
                Each code can be used once if you lose access to your authenticator. Store them
                safely.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-sm">
                {codes.map((c) => (
                  <div key={c} className="rounded border bg-background px-2 py-1">
                    {c}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(codes.join("\n"));
                    toast.success("Copied all codes");
                  }}
                >
                  <Copy className="h-4 w-4" /> Copy all
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCodes(null)}>
                  I've saved them
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

/* --- Email verification --- */
function EmailVerificationCard() {
  const { data: profile } = useMyProfile();
  const [sending, setSending] = useState(false);
  const email = profile?.email ?? "";

  const resend = async () => {
    if (!email) return;
    setSending(true);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setSending(false);
    if (error) toast.error(error.message);
    else toast.success("Verification email sent");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailCheck className="h-5 w-5" /> Email Verification
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="font-medium">{email || "No email on file"}</p>
          <p className="text-sm text-muted-foreground">
            Sign-in notifications and password resets are sent to this address.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="default" className="gap-1">
            <Check className="h-3 w-3" /> Verified
          </Badge>
          <Button variant="outline" onClick={resend} disabled={sending || !email}>
            Resend confirmation
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* --- Password --- */
function PasswordCard() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (pw.length < 12) return toast.error("Password must be at least 12 characters");
    if (pw !== pw2) return toast.error("Passwords don't match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Password updated");
      setPw("");
      setPw2("");
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5" /> Password
        </CardTitle>
        <CardDescription>
          Use a strong, unique password (12+ chars, mixed case, symbols).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>New password</Label>
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <div>
            <Label>Confirm password</Label>
            <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </div>
        </div>
        <Button onClick={submit} disabled={busy}>
          Update password
        </Button>
      </CardContent>
    </Card>
  );
}

/* --- Lockout --- */
function LockoutCard() {
  const { data: lockout } = useMyLockout();
  const formatZoned = useZonedDateFormatter();
  const locked = lockout?.locked_until && new Date(lockout.locked_until) > new Date();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" /> Account Lockout
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="text-sm">
            Failed attempts: <span className="font-semibold">{lockout?.failed_attempts ?? 0}</span>
          </p>
          {locked && lockout?.locked_until && (
            <p className="text-sm text-destructive">
              Locked until{" "}
              {formatZoned(new Date(lockout.locked_until), {
                dateStyle: "short",
                timeStyle: "medium",
              })}
            </p>
          )}
          {!locked && <p className="text-sm text-muted-foreground">Account is in good standing.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/* --- Sessions & devices --- */
function SessionsCard() {
  const { data: sessions } = useMySessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" /> Sessions & Devices
          </CardTitle>
          <CardDescription>
            Active sign-ins across devices. Revoke anything you don't recognise.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          onClick={async () => {
            const n = await revokeOthers.mutateAsync(undefined);
            toast.success(`Revoked ${n} session(s)`);
          }}
        >
          Sign out other devices
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Last active</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(sessions ?? []).map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="font-medium">{s.device ?? "Unknown"}</div>
                  <div className="text-xs text-muted-foreground truncate max-w-[280px]">
                    {s.user_agent}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">{s.ip_address ?? "—"}</TableCell>
                <TableCell className="text-sm">
                  {formatDistanceToNow(new Date(s.last_seen_at), { addSuffix: true })}
                </TableCell>
                <TableCell>
                  {s.revoked_at ? (
                    <Badge variant="secondary">Revoked</Badge>
                  ) : (
                    <Badge variant="default" className="gap-1">
                      <Check className="h-3 w-3" /> Active
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {!s.revoked_at && (
                    <Button size="sm" variant="ghost" onClick={() => revoke.mutate(s.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {(sessions ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No sessions recorded yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* --- Login activity --- */
function ActivityCard() {
  const { data: history } = useLoginHistory(200);
  const ips = useMemo(() => {
    const seen = new Map<string, { count: number; last: string }>();
    (history ?? []).forEach((h) => {
      if (!h.ip_address) return;
      const cur = seen.get(h.ip_address);
      if (cur) {
        cur.count++;
        if (h.created_at > cur.last) cur.last = h.created_at;
      } else seen.set(h.ip_address, { count: 1, last: h.created_at });
    });
    return Array.from(seen.entries()).map(([ip, v]) => ({ ip, ...v }));
  }, [history]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" /> Login History
          </CardTitle>
          <CardDescription>Recent successful and failed sign-in attempts.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(history ?? []).map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    <EventBadge event={h.event} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{h.ip_address ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {h.device ?? h.user_agent?.slice(0, 40) ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {h.failure_reason ?? ""}
                  </TableCell>
                </TableRow>
              ))}
              {(history ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No login events yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>IP Address History</CardTitle>
          <CardDescription>Unique IPs seen on your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IP</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ips.map((r) => (
                <TableRow key={r.ip}>
                  <TableCell className="font-mono">{r.ip}</TableCell>
                  <TableCell>{r.count}</TableCell>
                  <TableCell>
                    {formatDistanceToNow(new Date(r.last), { addSuffix: true })}
                  </TableCell>
                </TableRow>
              ))}
              {ips.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                    No IP data yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function EventBadge({ event }: { event: string }) {
  const map: Record<
    string,
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    success: { label: "Success", variant: "default" },
    failed: { label: "Failed", variant: "destructive" },
    logout: { label: "Sign out", variant: "secondary" },
    locked: { label: "Locked", variant: "destructive" },
    password_reset: { label: "Password reset", variant: "outline" },
    mfa_challenge: { label: "MFA prompt", variant: "outline" },
    mfa_success: { label: "MFA success", variant: "default" },
    mfa_failed: { label: "MFA failed", variant: "destructive" },
  };
  const cfg = map[event] ?? { label: event, variant: "outline" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

/* --- Tokens --- */
function TokensCard() {
  const { data: tokens } = usePersonalAccessTokens();
  const formatZoned = useZonedDateFormatter();
  const create = useCreatePAT();
  const revoke = useRevokePAT();
  const del = useDeletePAT();
  const [name, setName] = useState("");
  const [days, setDays] = useState<number | "">(90);
  const [scopes, setScopes] = useState<string[]>(["read"]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const submit = async () => {
    if (!name.trim()) return toast.error("Give the token a name");
    const r = await create.mutateAsync({
      name: name.trim(),
      scopes,
      expiresInDays: days === "" ? null : Number(days),
    });
    setNewToken(r.token);
    setName("");
  };

  const toggleScope = (s: string) => {
    setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> Personal Access Tokens
          </CardTitle>
          <CardDescription>
            API tokens scoped to your user. Treat them like passwords.
          </CardDescription>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setNewToken(null);
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> New token
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create personal access token</DialogTitle>
            </DialogHeader>
            {newToken ? (
              <Alert>
                <AlertTitle>Copy your token now</AlertTitle>
                <AlertDescription>
                  This is the only time you'll see the full token. Store it in a secret manager.
                  <div className="mt-3 flex items-center gap-2 rounded border bg-background p-2">
                    <code className="text-xs break-all flex-1">{newToken}</code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(newToken);
                        toast.success("Copied");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label>Token name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="CI pipeline"
                  />
                </div>
                <div>
                  <Label>Expires in (days, blank = never)</Label>
                  <Input
                    type="number"
                    value={days}
                    onChange={(e) => setDays(e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Scopes</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {["read", "write", "delete", "admin"].map((s) => (
                      <Button
                        key={s}
                        type="button"
                        size="sm"
                        variant={scopes.includes(s) ? "default" : "outline"}
                        onClick={() => toggleScope(s)}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              {newToken ? (
                <Button
                  onClick={() => {
                    setNewToken(null);
                    setOpen(false);
                  }}
                >
                  Done
                </Button>
              ) : (
                <Button onClick={submit} disabled={create.isPending}>
                  Create token
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Prefix</TableHead>
              <TableHead>Scopes</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(tokens ?? []).map((t) => {
              const expired = t.expires_at && new Date(t.expires_at) < new Date();
              const status = t.revoked_at ? "revoked" : expired ? "expired" : "active";
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="font-mono text-xs">{t.prefix}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {t.scopes.map((s) => (
                        <Badge key={s} variant="outline">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {t.last_used_at
                      ? formatDistanceToNow(new Date(t.last_used_at), { addSuffix: true })
                      : "Never"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {t.expires_at
                      ? formatZoned(new Date(t.expires_at), { dateStyle: "short" })
                      : "Never"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        status === "active"
                          ? "default"
                          : status === "revoked"
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {status === "active" ? (
                      <Button size="sm" variant="ghost" onClick={() => revoke.mutate(t.id)}>
                        Revoke
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => del.mutate(t.id)}>
                        Delete
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {(tokens ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No tokens yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* --- Notifications --- */
function NotificationsCard() {
  const { data: profile } = useMyProfile();
  const prefs = profile?.notification_preferences;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" /> Security Notifications
        </CardTitle>
        <CardDescription>
          You'll be emailed about new sign-ins, changes to 2FA, new tokens, and suspicious activity.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {[
          { key: "new_signin", label: "Sign-in from a new device or location" },
          { key: "failed_signin", label: "Repeated failed sign-in attempts" },
          { key: "password_changed", label: "Password or email changed" },
          { key: "2fa_changed", label: "2FA enabled or disabled" },
          { key: "token_created", label: "New personal access token created" },
          { key: "recovery_used", label: "Recovery code used" },
        ].map((row) => (
          <div
            key={row.key}
            className="flex items-center justify-between rounded-control border px-3 py-2"
          >
            <span className="text-sm">{row.label}</span>
            <Switch defaultChecked={prefs?.email_security ?? true} />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Manage delivery channels in your{" "}
          <a href="/profile" className="underline">
            profile preferences
          </a>
          .
        </p>
      </CardContent>
    </Card>
  );
}

/* --- Password policy (org-level) --- */
function PolicyCard() {
  const { active } = useActiveOrganization();
  const orgId = active?.id;
  const { data: policy } = usePasswordPolicy(orgId);
  const save = useSavePasswordPolicy();
  const [draft, setDraft] = useState<Partial<import("@/hooks/use-security").PasswordPolicy>>({});
  const val = { ...defaultsPolicy(orgId), ...policy, ...draft };

  const submit = async () => {
    if (!orgId) return;
    await save.mutateAsync({ ...val, organization_id: orgId });
    toast.success("Password policy saved");
    setDraft({});
  };

  if (!orgId)
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Select an organization to configure policy.
        </CardContent>
      </Card>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" /> Organization Security Policy
        </CardTitle>
        <CardDescription>
          Enterprise-wide password, session, and lockout rules enforced on all members.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <h3 className="font-medium text-sm">Password requirements</h3>
          <div>
            <Label>Minimum length: {val.min_length}</Label>
            <Slider
              min={8}
              max={64}
              step={1}
              value={[val.min_length ?? 12]}
              onValueChange={(v) => setDraft((d) => ({ ...d, min_length: v[0] }))}
            />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <SwitchRow
              label="Require uppercase"
              value={!!val.require_uppercase}
              onChange={(v) => setDraft((d) => ({ ...d, require_uppercase: v }))}
            />
            <SwitchRow
              label="Require lowercase"
              value={!!val.require_lowercase}
              onChange={(v) => setDraft((d) => ({ ...d, require_lowercase: v }))}
            />
            <SwitchRow
              label="Require number"
              value={!!val.require_number}
              onChange={(v) => setDraft((d) => ({ ...d, require_number: v }))}
            />
            <SwitchRow
              label="Require symbol"
              value={!!val.require_symbol}
              onChange={(v) => setDraft((d) => ({ ...d, require_symbol: v }))}
            />
            <SwitchRow
              label="Disallow common passwords"
              value={!!val.disallow_common}
              onChange={(v) => setDraft((d) => ({ ...d, disallow_common: v }))}
            />
            <SwitchRow
              label="Require 2FA for all members"
              value={!!val.require_2fa}
              onChange={(v) => setDraft((d) => ({ ...d, require_2fa: v }))}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <NumberRow
              label="Rotation (days)"
              value={val.rotation_days ?? 90}
              onChange={(v) => setDraft((d) => ({ ...d, rotation_days: v }))}
            />
            <NumberRow
              label="Password history remembered"
              value={val.history_count ?? 5}
              onChange={(v) => setDraft((d) => ({ ...d, history_count: v }))}
            />
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <h3 className="font-medium text-sm">Account lockout</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <NumberRow
              label="Max failed attempts"
              value={val.max_failed_attempts ?? 5}
              onChange={(v) => setDraft((d) => ({ ...d, max_failed_attempts: v }))}
            />
            <NumberRow
              label="Lockout duration (min)"
              value={val.lockout_minutes ?? 15}
              onChange={(v) => setDraft((d) => ({ ...d, lockout_minutes: v }))}
            />
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <h3 className="font-medium text-sm">Session limits</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <NumberRow
              label="Idle timeout (min)"
              value={val.session_idle_minutes ?? 30}
              onChange={(v) => setDraft((d) => ({ ...d, session_idle_minutes: v }))}
            />
            <NumberRow
              label="Absolute session (hours)"
              value={val.session_absolute_hours ?? 168}
              onChange={(v) => setDraft((d) => ({ ...d, session_absolute_hours: v }))}
            />
          </div>
        </section>

        <div className="flex justify-end">
          <Button onClick={submit} disabled={save.isPending}>
            Save policy
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SwitchRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-control border px-3 py-2">
      <span className="text-sm">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
function NumberRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
function defaultsPolicy(orgId: string | undefined) {
  return {
    organization_id: orgId ?? "",
    min_length: 12,
    require_uppercase: true,
    require_lowercase: true,
    require_number: true,
    require_symbol: true,
    disallow_common: true,
    rotation_days: 90,
    history_count: 5,
    max_failed_attempts: 5,
    lockout_minutes: 15,
    session_idle_minutes: 30,
    session_absolute_hours: 168,
    require_2fa: false,
  };
}
