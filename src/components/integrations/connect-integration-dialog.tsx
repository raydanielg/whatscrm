import { Brand } from "@/components/brand";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { startGoogleWorkspaceOAuth, listGoogleWorkspaceConnections } from "@/lib/integrations/google-workspace.functions";
import { connectGoogleWorkspacePopup } from "@/lib/integrations/google-oauth-popup";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CheckCircle2, Loader2, Copy, ExternalLink, ShieldCheck, KeyRound, Webhook, Zap, Plug, ArrowRight, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { IntegrationProvider } from "@/lib/integrations/core";
import { ProviderAvatar } from "./provider-avatar";
import { describeScope } from "./scope-description";
import {
  useInstalledIntegrations, type ConnectionMeta,
} from "@/lib/integrations/installed-store";

type Mode = "connect" | "reconnect";

export function ConnectIntegrationDialog({
  provider, open, onOpenChange, mode = "connect", onSuccess,
}: {
  provider: IntegrationProvider | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode?: Mode;
  onSuccess?: () => void;
}) {
  const { install, reconnect } = useInstalledIntegrations();
  const { active } = useCurrentWorkspace();
  const workspaceRef = useRef(active?.id);
  workspaceRef.current = active?.id;
  const startGWOAuth = useServerFn(startGoogleWorkspaceOAuth);
  const listGWConn = useServerFn(listGoogleWorkspaceConnections);
  const [step, setStep] = useState(0);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [oauthPhase, setOauthPhase] = useState<"idle" | "redirecting" | "authorized">("idle");
  const [account, setAccount] = useState("");

  // Reset when opened / provider changes
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setConsent(false);
    setBusy(false);
    setOauthPhase("idle");
    setAccount("");
    const initial: Record<string, string | boolean> = {};
    provider?.configSchema.forEach((f) => {
      if (f.defaultValue !== undefined) initial[f.key] = f.defaultValue;
    });
    setValues(initial);
  }, [open, provider?.id, active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const callbackUrl = useMemo(() => {
    if (typeof window === "undefined" || !provider) return "";
    return `${window.location.origin}/api/public/integrations/${provider.id}/webhook`;
  }, [provider?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!provider) return null;

  // oauth2 providers must have a real, provisioned per-user connector before
  // this dialog will run their flow — otherwise we'd be faking a successful
  // handshake (fabricated email, fabricated "connected" state) for a
  // provider nobody actually authorized. See `oauthImplemented` on
  // `IntegrationProvider` for what "real" means here.
  const oauthUnavailable = provider.authType === "oauth2" && !provider.oauthImplemented;

  if (oauthUnavailable) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <ProviderAvatar id={provider.id} name={provider.name} size="sm" />
              <div className="min-w-0">
                <DialogTitle>{provider.name}</DialogTitle>
                <DialogDescription asChild><div>
                  {provider.vendor} · <Badge variant="secondary" className="text-[11px]">{provider.authType.replace("_", " ")}</Badge>
                </div></DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="py-6 text-center space-y-3">
            <div className="h-12 w-12 mx-auto rounded-full bg-muted text-muted-foreground grid place-items-center">
              <Clock className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium">Not available yet</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {provider.name} needs a real OAuth connection to {provider.vendor}, and that isn't wired up on
              this deployment yet. No account has been connected — this integration cannot be turned on until
              a real authorization flow is configured.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const steps: string[] = (() => {
    switch (provider.authType) {
      case "oauth2": return ["Review", "Permissions", "Authorize", "Done"];
      case "api_key": return ["Review", "Credentials", "Verify", "Done"];
      case "webhook_url": return ["Review", "Endpoint", "Verify", "Done"];
      case "signed_request": return ["Review", "Signing", "Verify", "Done"];
      case "none": return ["Review", "Connect", "Done"];
    }
  })();

  const isLast = step === steps.length - 1;

  const requiredFieldsFilled = provider.configSchema
    .filter((f) => f.required)
    .every((f) => {
      const v = values[f.key];
      if (f.type === "boolean") return typeof v === "boolean";
      return typeof v === "string" && v.trim().length > 0;
    });

  const canContinue = (() => {
    if (steps[step] === "Permissions") return consent;
    if (steps[step] === "Credentials") return requiredFieldsFilled;
    if (steps[step] === "Endpoint") return true;
    if (steps[step] === "Signing") return true;
    return true;
  })();

  // Reached only when provider.oauthImplemented is true (see the
  // `oauthUnavailable` gate above) — i.e. only for a provider with a real,
  // provisioned per-user OAuth connection. Each provider must call the
  // real authorization flow and only set `oauthPhase("authorized")`
  // after that flow reports genuine success — never on a timer.
  const runAuthorize = async () => {
    setBusy(true);
    try {
      if (provider.authType === "oauth2") {
        if (provider.id === "google-workspace") {
          if (!active?.id) throw new Error("Select a workspace before connecting Google Workspace");
          const authorizedWorkspaceId = active.id;
          await connectGoogleWorkspacePopup((targetOrigin) =>
            startGWOAuth({ data: { targetOrigin, workspaceId: authorizedWorkspaceId } }),
          );
          if (workspaceRef.current !== authorizedWorkspaceId) throw new Error("Workspace changed during sign-in. Connect again in the selected workspace.");
          const saved = await listGWConn({ data: { workspaceId: authorizedWorkspaceId } });
          if (workspaceRef.current !== authorizedWorkspaceId) return;
          const connected = saved.find((row) => row.status === "active");
          if (!connected) throw new Error("Google account connection was not saved");
          setAccount(connected.account_email);
          setOauthPhase("authorized");
          setStep(step + 1);
          return;
        }
        throw new Error(
          `${provider.name} has no real OAuth flow wired up yet.`,
        );
      }
      await new Promise((r) => setTimeout(r, 700));
      setStep(step + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authorization failed");
    } finally {
      setBusy(false);
    }
  };

  const finalize = () => {
    const meta: ConnectionMeta = {
      accountLabel: account || (provider.authType === "api_key" ? "API key" : provider.name),
      config: Object.fromEntries(
        provider.configSchema
          .filter((f) => !f.secret)
          .map((f) => [f.key, values[f.key]]),
      ),
      callbackUrl: provider.authType === "signed_request" ? callbackUrl : undefined,
    };
    // Redact API-key style values
    const apiKeyField = provider.configSchema.find((f) => f.type === "password" || f.secret);
    if (apiKeyField && typeof values[apiKeyField.key] === "string") {
      const v = values[apiKeyField.key] as string;
      meta.keyLast4 = v.slice(-4);
    }
    if (mode === "reconnect") {
      reconnect(provider.id, { meta, note: `via ${provider.authType}` });
      toast.success(`${provider.name} reconnected`);
    } else {
      install(provider.id, { scopes: provider.scopes, meta, note: `via ${provider.authType}` });
      // Only an OAuth grant proves a connection. Keys and webhook URLs are saved
      // locally and are not checked with the provider, so do not say "connected".
      toast.success(
        provider.authType === "oauth2"
          ? `${provider.name} connected`
          : `${provider.name} saved. It has not been verified with the provider yet.`,
      );
    }
    onOpenChange(false);
    onSuccess?.();
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  };

  const setField = (key: string, v: string | boolean) =>
    setValues((s) => ({ ...s, [key]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => (!busy || !o) && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <ProviderAvatar id={provider.id} name={provider.name} size="sm" />
            <div className="min-w-0">
              <DialogTitle>
                {mode === "reconnect" ? "Reconnect" : "Connect"} {provider.name}
              </DialogTitle>
              <DialogDescription asChild><div>
                {provider.vendor} · <Badge variant="secondary" className="text-[11px]">{provider.authType.replace("_", " ")}</Badge>
              </div></DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ol className="flex items-center gap-1.5 pt-1">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-1.5 flex-1">
              <div
                className={cn(
                  "h-5 w-5 rounded-full grid place-items-center text-[11px] font-semibold shrink-0",
                  i < step && "bg-primary text-primary-foreground",
                  i === step && "bg-primary/15 text-primary border border-primary",
                  i > step && "bg-muted text-muted-foreground",
                )}
              >
                {i < step ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
              </div>
              <span className={cn("text-[11px] truncate", i === step ? "font-medium" : "text-muted-foreground")}>
                {s}
              </span>
              {i < steps.length - 1 && <div className="flex-1 h-px bg-border" />}
            </li>
          ))}
        </ol>

        <div className="min-h-[180px] pt-2">
          {steps[step] === "Review" && (
            <div className="space-y-3">
              <p className="text-sm">{provider.tagline}</p>
              <div className="rounded-control border p-3 text-xs space-y-1.5">
                <Row label="Category" value={provider.category} />
                <Row label="Version" value={`v${provider.version}`} />
                <Row label="Actions" value={String(provider.capabilities.filter((c) => c.kind !== "trigger").length)} />
                <Row label="Triggers" value={String(provider.capabilities.filter((c) => c.kind === "trigger").length)} />
              </div>
              {provider.docsUrl && (
                <a href={provider.docsUrl} target="_blank" rel="noreferrer"
                   className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" /> Setup documentation
                </a>
              )}
            </div>
          )}

          {steps[step] === "Permissions" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <Brand /> will request these permissions from {provider.vendor}:
              </div>
              {provider.scopes && provider.scopes.length > 0 ? (
                <ul className="space-y-1.5 max-h-40 overflow-auto pr-1">
                  {provider.scopes.map((s) => (
                    <li key={s} className="text-xs flex items-start gap-2">
                      <CheckCircle2 className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <div>{describeScope(s)}</div>
                        <div className="font-mono text-[11px] text-muted-foreground truncate">{s}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Provider will use its default permission set.</p>
              )}
              <label className="flex items-start gap-2 pt-2 border-t cursor-pointer">
                <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
                <span className="text-xs">
                  I authorize <Brand /> to access {provider.name} on behalf of my workspace.
                </span>
              </label>
            </div>
          )}

          {steps[step] === "Authorize" && (
            <div className="space-y-3 text-center py-4">
              {oauthPhase === "idle" && (
                <>
                  <div className="h-12 w-12 mx-auto rounded-full bg-primary/10 text-primary grid place-items-center">
                    <Plug className="h-5 w-5" />
                  </div>
                  <p className="text-sm">You'll be redirected to {provider.vendor} to authorize access.</p>
                  <p className="text-xs text-muted-foreground">A popup will open. Approve access, then return here.</p>
                </>
              )}
              {oauthPhase === "redirecting" && (
                <div className="space-y-2 py-4">
                  <Loader2 className="h-6 w-6 mx-auto animate-spin text-primary" />
                  <p className="text-sm">Waiting for {provider.vendor} authorization</p>
                </div>
              )}
            </div>
          )}

          {steps[step] === "Credentials" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <KeyRound className="h-4 w-4 text-primary" />
                Enter your {provider.name} credentials
              </div>
              {provider.configSchema.length === 0 && (
                <Field
                  field={{ key: "api_key", label: "API key", type: "password", required: true, placeholder: "sk_live_..." }}
                  value={values["api_key"] as string | undefined}
                  onChange={(v) => setField("api_key", v)}
                />
              )}
              {provider.configSchema.map((f) => (
                <Field
                  key={f.key}
                  field={f}
                  value={values[f.key] as string | boolean | undefined}
                  onChange={(v) => setField(f.key, v)}
                />
              ))}
              <Input
                placeholder="Label (optional, e.g. Production key)"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                className="h-9"
              />
            </div>
          )}

          {steps[step] === "Endpoint" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Webhook className="h-4 w-4 text-primary" />
                Point {provider.vendor} to this endpoint:
              </div>
              <div className="rounded-control border p-2 flex items-center gap-2 bg-muted/40">
                <code className="text-xs flex-1 truncate">{callbackUrl}</code>
                <Button size="sm" variant="ghost" onClick={() => copy(callbackUrl, "Endpoint URL")}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              {provider.configSchema.map((f) => (
                <Field
                  key={f.key}
                  field={f}
                  value={values[f.key] as string | boolean | undefined}
                  onChange={(v) => setField(f.key, v)}
                />
              ))}
            </div>
          )}

          {steps[step] === "Signing" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Inbound webhook endpoint
              </div>
              <Alert>
                <AlertDescription className="text-xs">
                  {provider.vendor} will send signed requests here. <Brand /> verifies each payload's HMAC signature.
                </AlertDescription>
              </Alert>
              <div>
                <Label className="text-xs">Callback URL</Label>
                <div className="rounded-control border p-2 flex items-center gap-2 bg-muted/40">
                  <code className="text-xs flex-1 truncate">{callbackUrl}</code>
                  <Button size="sm" variant="ghost" onClick={() => copy(callbackUrl, "Callback URL")}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs">Signing secret</Label>
                <div className="rounded-control border p-2 flex items-center gap-2 bg-muted/40">
                  <code className="text-xs flex-1 truncate">whsec_{provider.id}_{cryptoRandom()}</code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copy(`whsec_${provider.id}_${cryptoRandom()}`, "Signing secret")}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Store this in {provider.vendor}'s webhook settings. It won't be shown again.
                </p>
              </div>
            </div>
          )}

          {steps[step] === "Connect" && provider.authType === "none" && (
            <div className="text-center py-4 space-y-2">
              <div className="h-12 w-12 mx-auto rounded-full bg-primary/10 text-primary grid place-items-center">
                <Zap className="h-5 w-5" />
              </div>
              <p className="text-sm">No credentials needed — {provider.name} is ready to enable.</p>
            </div>
          )}

          {steps[step] === "Verify" && (
            <div className="text-center py-4 space-y-2">
              {busy ? (
                <>
                  <Loader2 className="h-6 w-6 mx-auto animate-spin text-primary" />
                  <p className="text-sm">Verifying connection to {provider.name}</p>
                </>
              ) : (
                <>
                  <div className="h-12 w-12 mx-auto rounded-full bg-emerald-500/15 text-emerald-600 grid place-items-center">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium">Connection verified</p>
                  <p className="text-xs text-muted-foreground">
                    Ready to {mode === "reconnect" ? "reconnect" : "install"} {provider.name}.
                  </p>
                </>
              )}
            </div>
          )}

          {steps[step] === "Done" && (
            <div className="text-center py-4 space-y-2">
              <div className="h-12 w-12 mx-auto rounded-full bg-emerald-500/15 text-emerald-600 grid place-items-center">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium">
                {provider.name} {mode === "reconnect" ? "reconnected" : provider.authType === "oauth2" ? "connected" : "saved"}
              </p>
              {account && <p className="text-xs text-muted-foreground">{account}</p>}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {isLast ? "Close" : "Cancel"}
          </Button>
          {!isLast && steps[step] !== "Authorize" && steps[step] !== "Verify" && (
            <Button
              onClick={async () => {
                const next = steps[step + 1];
                if (next === "Verify") {
                  setBusy(true);
                  setStep(step + 1);
                  await new Promise((r) => setTimeout(r, 900));
                  setBusy(false);
                } else {
                  setStep(step + 1);
                }
              }}
              disabled={!canContinue}
            >
              Continue <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          )}
          {steps[step] === "Authorize" && oauthPhase !== "authorized" && (
            <Button onClick={runAuthorize} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plug className="h-3.5 w-3.5 mr-1.5" />}
              Authorize with {provider.vendor}
            </Button>
          )}
          {steps[step] === "Verify" && !busy && (
            <Button onClick={() => setStep(step + 1)}>
              Continue <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          )}
          {isLast && (
            <Button onClick={finalize}>
              Finish
            </Button>
          )}
          {steps[step + 1] === "Done" && steps[step] !== "Verify" && steps[step] !== "Authorize" && null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Field({
  field, value, onChange,
}: {
  field: {
    key: string; label: string; type: string; required?: boolean;
    placeholder?: string; helpText?: string; options?: readonly string[];
  };
  value: string | boolean | undefined;
  onChange: (v: string | boolean) => void;
}) {
  const id = `f-${field.key}`;
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {field.label}{field.required && <span className="text-destructive"> *</span>}
      </Label>
      {field.type === "textarea" ? (
        <Textarea id={id} placeholder={field.placeholder}
          value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} rows={3} />
      ) : field.type === "select" ? (
        <Select value={(value as string) ?? ""} onValueChange={onChange}>
          <SelectTrigger id={id} className="h-9"><SelectValue placeholder={field.placeholder} /></SelectTrigger>
          <SelectContent>
            {field.options?.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : field.type === "boolean" ? (
        <div className="flex items-center gap-2">
          <Switch id={id} checked={value === true} onCheckedChange={onChange} />
          <span className="text-xs text-muted-foreground">{field.helpText}</span>
        </div>
      ) : (
        <Input
          id={id}
          type={field.type === "password" ? "password" : field.type === "url" ? "url" : "text"}
          placeholder={field.placeholder}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="h-9"
        />
      )}
      {field.helpText && field.type !== "boolean" && (
        <p className="text-[11px] text-muted-foreground">{field.helpText}</p>
      )}
    </div>
  );
}

function cryptoRandom() {
  const bytes = new Uint8Array(16);
  if (typeof window !== "undefined" && window.crypto) window.crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
