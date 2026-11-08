import { Brand } from "@/components/brand";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { getIdleMinutes, setIdleMinutes } from "@/hooks/use-idle-logout";
import { Shield, KeyRound, LogOut } from "lucide-react";

const pwSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "Passwords do not match", path: ["confirm"] });

export function SecuritySection() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [idle, setIdle] = useState<number>(getIdleMinutes());
  const [signingOutAll, setSigningOutAll] = useState(false);

  useEffect(() => {
    setIdleMinutes(idle);
  }, [idle]);

  async function handleChangePassword(e: React.FormEvent) {
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
      toast.error(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOutEverywhere() {
    setSigningOutAll(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw error;
      toast.success("Signed out on all devices");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign out everywhere");
    } finally {
      setSigningOutAll(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-bold text-xl">Change password</h2>
        </div>
        <p className="text-sm text-muted-foreground">Use at least 8 characters. Passwords are hashed on our servers — we never see the raw value.</p>
        <form onSubmit={handleChangePassword} className="mt-4 grid gap-3 max-w-md">
          <div>
            <label className="text-xs font-medium text-muted-foreground">New password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              className="mt-1 w-full h-10 px-3 rounded-control border border-input bg-surface text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Confirm password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              required
              className="mt-1 w-full h-10 px-3 rounded-control border border-input bg-surface text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="justify-self-start px-4 h-10 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Updating" : "Update password"}
          </button>
        </form>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-bold text-xl">Auto sign-out</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Automatically end your session after a period of inactivity on this device.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { m: 0, label: "Off" },
            { m: 15, label: "15 min" },
            { m: 30, label: "30 min" },
            { m: 60, label: "1 hour" },
            { m: 240, label: "4 hours" },
          ].map((opt) => (
            <button
              key={opt.m}
              onClick={() => setIdle(opt.m)}
              className={`px-3 h-9 rounded-control text-sm border transition-colors ${
                idle === opt.m
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-input bg-surface text-foreground/80 hover:bg-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <LogOut className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-bold text-xl">Active sessions</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Sign out of <Brand /> on every device where you're currently signed in.
        </p>
        <button
          onClick={handleSignOutEverywhere}
          disabled={signingOutAll}
          className="mt-4 px-4 h-10 rounded-control border border-destructive/40 text-destructive text-sm font-medium hover:bg-destructive/10 disabled:opacity-50"
        >
          {signingOutAll ? "Signing out" : "Sign out on all devices"}
        </button>
      </div>
    </div>
  );
}
