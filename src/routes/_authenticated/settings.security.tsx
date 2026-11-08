import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppTopbar } from "@/components/app/app-topbar";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getIdleMinutes, setIdleMinutes } from "@/hooks/use-idle-logout";
import { sbAny } from "@/lib/supabase/untyped";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/settings/security")({
  component: SecuritySettings,
  head: () => ({
    meta: [
      { title: "Security — Account Settings" },
      {
        name: "description",
        content: "Change your password, manage two-factor authentication, and active sessions.",
      },
    ],
  }),
});

const pwSchema = z
  .object({
    password: z.string().min(8, "At least 8 characters"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = (t: string) => sbAny(supabase).from(t as any) as any;

function useMy2FA() {
  return useQuery({
    queryKey: ["user_2fa", "me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await anyFrom("user_2fa")
        .select("enabled, method, verified_at")
        .eq("user_id", u.user.id)
        .maybeSingle();
      return (data ?? { enabled: false, method: "totp", verified_at: null }) as {
        enabled: boolean;
        method: string;
        verified_at: string | null;
      };
    },
  });
}

function useMySessions() {
  return useQuery({
    queryKey: ["sessions", "me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data } = await anyFrom("sessions")
        .select(
          "id, device, user_agent, ip_address, location, last_seen_at, created_at, revoked_at",
        )
        .eq("user_id", u.user.id)
        .order("last_seen_at", { ascending: false });
      return (data ?? []) as Array<{
        id: string;
        device: string | null;
        user_agent: string | null;
        ip_address: string | null;
        location: string | null;
        last_seen_at: string;
        created_at: string;
        revoked_at: string | null;
      }>;
    },
  });
}

function SecuritySettings() {
  const qc = useQueryClient();
  const twofa = useMy2FA();
  const sessions = useMySessions();
  const formatZoned = useZonedDateFormatter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [idle, setIdle] = useState<number>(getIdleMinutes());
  const [signOutAll, setSignOutAll] = useState(false);

  useEffect(() => {
    setIdleMinutes(idle);
  }, [idle]);

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    const parsed = pwSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated");
      setPassword("");
      setConfirm("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggle2FA(next: boolean) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    try {
      const { error } = await anyFrom("user_2fa").upsert({
        user_id: u.user.id,
        enabled: next,
        method: "totp",
        verified_at: next ? new Date().toISOString() : null,
      });
      if (error) throw error;
      toast.success(next ? "Two-factor enabled" : "Two-factor disabled");
      qc.invalidateQueries({ queryKey: ["user_2fa", "me"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    }
  }

  async function revokeSession(id: string) {
    try {
      const { error } = await anyFrom("sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success("Session revoked");
      qc.invalidateQueries({ queryKey: ["sessions", "me"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revoke failed");
    }
  }

  async function signOutEverywhere() {
    setSignOutAll(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw error;
      toast.success("Signed out on all devices");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-out failed");
    } finally {
      setSignOutAll(false);
    }
  }

  return (
    <>
      <AppTopbar title="Security" subtitle="Password, 2FA, and active sessions" />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>Use at least 8 characters.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onChangePassword} className="grid gap-3 max-w-md">
              <div className="grid gap-2">
                <Label htmlFor="pw">New password</Label>
                <Input
                  id="pw"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pw2">Confirm password</Label>
                <Input
                  id="pw2"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <Button type="submit" disabled={saving} className="w-fit">
                {saving ? "Updating" : "Update password"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Two-factor authentication</CardTitle>
            <CardDescription>Require a second factor when signing in.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-control border p-3">
              <div>
                <div className="text-sm font-medium">TOTP authenticator app</div>
                <div className="text-xs text-muted-foreground">
                  {twofa.data?.enabled ? (
                    <Badge variant="default">Enabled</Badge>
                  ) : (
                    <Badge variant="outline">Disabled</Badge>
                  )}
                  {twofa.data?.verified_at && (
                    <span className="ml-2">
                      Verified{" "}
                      {formatZoned(new Date(twofa.data.verified_at), { dateStyle: "short" })}
                    </span>
                  )}
                </div>
              </div>
              <Switch checked={twofa.data?.enabled ?? false} onCheckedChange={toggle2FA} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session</CardTitle>
            <CardDescription>Auto sign-out after inactivity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 max-w-xs">
              <Label htmlFor="idle">Idle timeout (minutes)</Label>
              <Input
                id="idle"
                type="number"
                min={5}
                max={480}
                value={idle}
                onChange={(e) => setIdle(Number(e.target.value) || 30)}
              />
            </div>
            <Button variant="outline" onClick={signOutEverywhere} disabled={signOutAll}>
              {signOutAll ? "Signing out" : "Sign out on all devices"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {sessions.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading</p>
            ) : (sessions.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions tracked.</p>
            ) : (
              <ul className="divide-y">
                {sessions.data!.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {s.device ?? s.user_agent ?? "Unknown device"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {s.location ?? s.ip_address ?? ""} · Last seen{" "}
                        {formatZoned(new Date(s.last_seen_at), {
                          dateStyle: "short",
                          timeStyle: "medium",
                        })}
                        {s.revoked_at && <span className="ml-2 text-destructive">Revoked</span>}
                      </div>
                    </div>
                    {!s.revoked_at && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => revokeSession(s.id)}
                      >
                        Revoke
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
