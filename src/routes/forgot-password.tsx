import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { usePlatformBranding } from "@/hooks/use-platform-branding";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  // head() is not a React component — hooks must never run here.
  head: () => ({
    meta: [
      { title: "Reset your password" },
      { name: "description", content: "Request a password reset link for your account." },
      { property: "og:title", content: "Reset your password" },
      { property: "og:description", content: "Request a password reset link for your account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForgotPasswordPage,
});

const schema = z.object({ email: z.string().email("Enter a valid email") });

function ForgotPasswordPage() {
  const brand = usePlatformBranding();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast.success("Check your email for the reset link.");
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

        <h1 className="font-display text-2xl font-semibold">Reset your password</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enter the email associated with your account and we'll send you a reset link.
        </p>

        {sent ? (
          <div className="mt-6 rounded-control border border-border bg-surface p-4 text-sm">
            <p className="font-medium">Email sent</p>
            <p className="text-muted-foreground mt-1">
              If an account exists for <span className="font-medium text-foreground">{email}</span>, you'll receive a reset link shortly.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                required
                className="mt-1 w-full h-10 px-3 rounded-control border border-input bg-surface text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Sending" : "Send reset link"}
            </button>
          </form>
        )}

        <p className="text-xs text-muted-foreground mt-6 text-center">
          Remembered it?{" "}
          <Link to="/auth" className="text-accent font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
