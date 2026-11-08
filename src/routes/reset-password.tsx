import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { PasswordInput } from "@/components/auth/password-input";
import { usePlatformBranding } from "@/hooks/use-platform-branding";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  // head() is not a React component — hooks must never run here.
  head: () => ({
    meta: [
      { title: "Set a new password" },
      { name: "description", content: "Choose a new password for your account." },
      { property: "og:title", content: "Set a new password" },
      { property: "og:description", content: "Choose a new password for your account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

const schema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

function ResetPasswordPage() {
  const brand = usePlatformBranding();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const search = typeof window !== "undefined" ? window.location.search : "";
    const isRecoveryLink =
      /(?:^|[#&?])type=recovery(?:&|$)/.test(hash) ||
      /(?:^|[?&])type=recovery(?:&|$)/.test(search);
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    if (isRecoveryLink) setReady(true);
    const timer = window.setTimeout(() => {
      setReady((r) => {
        if (!r) setInvalidLink(true);
        return r;
      });
    }, 4000);
    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ password, confirm });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated. Redirecting");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const initial = brand.platformName.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="w-full max-w-sm">
        <Link to="/" className="flex items-center gap-2 w-fit mb-8">
          <div className="w-9 h-9 bg-gradient-accent grid place-items-center shadow-glow overflow-hidden">
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt="" className="size-6" />
            ) : (
              <span className="font-display font-bold text-primary-foreground">{initial}</span>
            )}
          </div>
          <span className="font-bold text-xl">{brand.platformName}</span>
        </Link>

        <h1 className="font-display text-2xl font-semibold">Set a new password</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Choose a strong password you haven't used before.
        </p>

        {!ready ? (
          invalidLink ? (
            <div className="mt-6 rounded-control border border-border bg-surface p-4 text-sm space-y-3">
              <p className="text-foreground font-medium">Reset link is invalid or expired</p>
              <p className="text-muted-foreground">
                Password reset links can only be used once and expire after a short time. Request a new one to continue.
              </p>
              <div className="flex gap-3 pt-1">
                <Link to="/forgot-password" className="text-primary hover:underline">Request a new link</Link>
                <Link to="/auth" className="text-muted-foreground hover:underline">Back to sign in</Link>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-control border border-border bg-surface p-4 text-sm text-muted-foreground">
              Verifying reset link
            </div>
          )
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">New password</label>
              <div className="mt-1">
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Confirm password</label>
              <div className="mt-1">
                <PasswordInput
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  placeholder="Repeat your new password"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Updating" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
