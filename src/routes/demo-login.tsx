import { Brand, PlatformLogo } from "@/components/brand";
import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LazyDemoCredentials } from "@/components/auth/demo-credentials-lazy";

export const Route = createFileRoute("/demo-login")({
  head: () => ({
    meta: [
      { title: "Demo login" },
      {
        name: "description",
        content: `Instantly explore ${BRAND_NAME} with a one-click demo account for every role.`,
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  beforeLoad: async () => {
    const { DEMO_MODE_ENABLED } = await import("@/lib/demo/mode");
    if (!DEMO_MODE_ENABLED) throw redirect({ to: "/auth" });
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: DemoLoginPage,
});

function DemoLoginPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(true);

  useEffect(() => setReady(true), []);

  return (
    <div className="min-h-dvh bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between max-w-screen-lg mx-auto w-full">
        <Link to="/" className="flex items-center gap-2">
          <PlatformLogo alt="" className="w-8 h-8" />
          <span className="text-2xl font-bold">
            <Brand />
          </span>
        </Link>
        <Link
          to="/auth"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Standard sign in
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-lg">
          <div className="text-center mb-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-3 py-1.5 text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              Instant demo
            </span>
            <h1 className="font-display text-3xl font-semibold mt-3">Pick a role to explore</h1>
            <p className="text-sm text-muted-foreground mt-2">
              One click signs you in with a shared demo account. No email verification, no setup.
            </p>
          </div>

          {ready ? (
            <LazyDemoCredentials
              variant="grid"
              onAfterSignIn={(acct) => navigate({ to: acct.redirect as never, replace: true })}
            />
          ) : null}

          <p className="text-[11px] text-muted-foreground text-center mt-4">
            Demo accounts are shared across visitors. Please avoid entering real personal data.
          </p>
        </div>
      </main>
    </div>
  );
}
