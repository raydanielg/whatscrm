import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { ShieldCheck, Check, XCircle } from "lucide-react";
import { sbAny } from "@/lib/supabase/untyped";

const inputSchema = z.object({
  contactId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  channel: z.string().default("whatsapp"),
  purpose: z.string().default("marketing"),
});

export const unsubscribeContact = createServerFn({ method: "POST" })
  .validator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { error } = await sbAny(supabaseAdmin).from("consent_records").insert({
      workspace_id: data.workspaceId,
      contact_id: data.contactId,
      channel: data.channel,
      purpose: data.purpose,
      status: "unsubscribed",
      source: "public-unsubscribe-link",
      effective_at: new Date().toISOString(),
      revoked_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: (s: Record<string, unknown>) => ({
    c: (s.c as string) ?? "",
    w: (s.w as string) ?? "",
    ch: (s.ch as string) ?? "whatsapp",
    p: (s.p as string) ?? "marketing",
  }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const { c, w, ch, p } = Route.useSearch();
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  const valid = /^[0-9a-f-]{36}$/i.test(c) && /^[0-9a-f-]{36}$/i.test(w);

  const submit = async () => {
    setState("loading");
    try {
      await unsubscribeContact({
        data: { contactId: c, workspaceId: w, channel: ch, purpose: p },
      });
      setState("done");
    } catch (e) {
      setErr((e as Error).message);
      setState("error");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full rounded-control border border-border bg-surface p-8 shadow-sm text-center">
        <ShieldCheck className="w-10 h-10 mx-auto text-primary mb-4" />
        <h1 className="text-xl font-semibold">Unsubscribe from {p} messages</h1>
        <p className="text-sm text-muted-foreground mt-2">
          You will no longer receive {p} messages on {ch}. You can re-subscribe any time.
        </p>
        {!valid ? (
          <div className="mt-6 text-sm text-destructive">Invalid unsubscribe link.</div>
        ) : state === "done" ? (
          <div className="mt-6 inline-flex items-center gap-2 text-success">
            <Check className="w-5 h-5" /> You’ve been unsubscribed.
          </div>
        ) : state === "error" ? (
          <div className="mt-6">
            <div className="inline-flex items-center gap-2 text-destructive text-sm mb-3">
              <XCircle className="w-5 h-5" /> {err}
            </div>
            <button
              onClick={submit}
              className="px-4 py-2 rounded-control bg-primary text-primary-foreground text-sm font-medium"
            >
              Try again
            </button>
          </div>
        ) : (
          <button
            onClick={submit}
            disabled={state === "loading"}
            className="mt-6 px-5 py-2.5 rounded-control bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {state === "loading" ? "Unsubscribing" : "Confirm unsubscribe"}
          </button>
        )}
      </div>
    </div>
  );
}
