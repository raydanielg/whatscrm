import { useMemo, useState } from "react";
import { Copy, Check, LogIn, Search, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { DEMO_ACCOUNTS, DEMO_MODE_STORAGE_KEY, type DemoAccount } from "@/lib/demo/accounts";
import { DEMO_PASSWORDS } from "@/lib/demo/credentials";
import { provisionDemoAccounts } from "@/lib/demo/demo.functions";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Props = {
  /** Called with credentials to autofill the parent form. */
  onAutofill?: (email: string, password: string) => void;
  /** If true, sign in immediately after ensuring the account exists. */
  onAfterSignIn?: (account: DemoAccount) => void;
  variant?: "grid" | "compact";
  className?: string;
};

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Clipboard unavailable");
  }
}

export function DemoCredentials({ onAutofill, onAfterSignIn, variant = "grid", className }: Props) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DEMO_ACCOUNTS;
    return DEMO_ACCOUNTS.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q),
    );
  }, [query]);

  async function handleQuickLogin(acct: DemoAccount) {
    setBusy(acct.key);
    try {
      // Try sign-in first; if it fails, provision then retry.
      let { error } = await supabase.auth.signInWithPassword({
        email: acct.email,
        password: DEMO_PASSWORDS[acct.key],
      });
      if (error) {
        const res = await provisionDemoAccounts({ data: { key: acct.key } });
        if (!res.ok) throw new Error(res.results.find((r) => !r.ok)?.error ?? "Provisioning failed");
        ({ error } = await supabase.auth.signInWithPassword({
          email: acct.email,
          password: DEMO_PASSWORDS[acct.key],
        }));
        if (error) throw error;
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(DEMO_MODE_STORAGE_KEY, "1");
      }
      toast.success(`Signed in as demo ${acct.label}`);
      onAfterSignIn?.(acct);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Demo sign-in failed");
    } finally {
      setBusy(null);
    }
  }

  function handleCopy(kind: "email" | "password", acct: DemoAccount) {
    const value = kind === "email" ? acct.email : DEMO_PASSWORDS[acct.key];
    copy(value, kind === "email" ? "Email" : "Password");
    setCopied(`${acct.key}-${kind}`);
    setTimeout(() => setCopied(null), 1200);
  }

  return (
    <section
      aria-label="Demo credentials"
      className={cn(
        "rounded-control border border-border bg-surface/60 backdrop-blur-sm p-4",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-control bg-primary/10 text-primary">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-none">Try a demo account</p>
            <p className="text-xs text-muted-foreground mt-0.5">One click to explore every role.</p>
          </div>
        </div>
        {variant === "grid" && DEMO_ACCOUNTS.length > 4 ? (
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="h-8 pl-7 pr-2 text-xs rounded-control border border-input bg-background w-32"
              aria-label="Search demo roles"
            />
          </div>
        ) : null}
      </header>

      <ul className={cn("grid gap-2", variant === "grid" ? "sm:grid-cols-1" : "grid-cols-1")}>
        {filtered.map((acct) => {
          const isBusy = busy === acct.key;
          return (
            <li
              key={acct.key}
              className={cn(
                "group relative rounded-control border border-border p-3 bg-gradient-to-br transition-colors hover:border-primary/40",
                acct.accent,
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{acct.label}</span>
                    <span className="text-[10px] uppercase font-medium px-1.5 py-0.5 rounded bg-background/70 border border-border text-muted-foreground">
                      {acct.key}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{acct.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleQuickLogin(acct)}
                  disabled={isBusy}
                  className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-control bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-60"
                  aria-label={`Sign in as demo ${acct.label}`}
                >
                  {isBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  {isBusy ? "Signing in" : "Login"}
                </button>
              </div>

              <dl className="mt-2 grid grid-cols-1 gap-1 text-xs">
                {(["email", "password"] as const).map((k) => {
                  const val = k === "email" ? acct.email : DEMO_PASSWORDS[acct.key];
                  const isCopied = copied === `${acct.key}-${k}`;
                  return (
                    <div
                      key={k}
                      className="flex items-center justify-between gap-2 rounded border border-border/60 bg-background/60 px-2 py-1"
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <dt className="text-[11px] capitalize text-muted-foreground shrink-0">
                          {k}:
                        </dt>
                        <dd className="font-mono text-[11px] truncate">{val}</dd>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopy(k, acct)}
                          className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          aria-label={`Copy ${k}`}
                        >
                          {isCopied ? (
                            <Check className="w-3 h-3 text-success" aria-hidden="true" />
                          ) : (
                            <Copy className="w-3 h-3" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </dl>

              {onAutofill ? (
                <button
                  type="button"
                  onClick={() => {
                    onAutofill(acct.email, DEMO_PASSWORDS[acct.key]);
                    toast.success(`Autofilled ${acct.label} credentials`);
                  }}
                  className="mt-2 text-[11px] text-accent hover:underline"
                >
                  Autofill form only
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
