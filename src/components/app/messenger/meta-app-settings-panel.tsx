/**
 * Meta App settings — secure credential status + Messenger connection check.
 *
 * Credentials live as encrypted backend secrets (META_APP_ID / META_APP_SECRET)
 * and are never sent to the browser: this panel only ever shows a masked App ID,
 * the secret's length, and the result of a live Meta Graph verification.
 */
import { useEffect, useMemo, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  getMetaAppStatus,
  type MetaAppStatus,
  type CheckState,
} from "@/lib/messenger/meta-app.functions";

function StateIcon({ state }: { state: CheckState }) {
  if (state === "ok") return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (state === "warn") return <AlertTriangle className="h-4 w-4 text-warning" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
}

export function MetaAppSettingsPanel() {
  const { data: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id;
  const statusFn = useServerFn(getMetaAppStatus);
  const started = useRef(false);
  const formatZoned = useZonedDateFormatter();

  const origin = typeof window !== "undefined" ? window.location.origin : undefined;

  const run = useMutation<MetaAppStatus, Error, void>({
    mutationFn: () =>
      statusFn({ data: { workspaceId: workspaceId!, ...(origin ? { origin } : {}) } }),
    onError: (err) => toast.error(err.message || "Could not verify the Meta connection."),
  });
  const { mutate } = run;

  useEffect(() => {
    if (!workspaceId || started.current) return;
    started.current = true;
    mutate();
  }, [workspaceId, mutate]);

  const report = run.data;
  const configured = Boolean(report?.appIdPresent && report?.appSecretPresent);

  const callbacks = useMemo(() => {
    const base = origin?.replace(/\/$/, "") ?? "";
    return [
      { label: "Instagram OAuth redirect URI", url: `${base}/api/public/instagram/callback` },
      { label: "Instagram webhook callback URL", url: `${base}/api/public/webhooks/instagram` },
      { label: "Messenger OAuth redirect URI", url: `${base}/api/public/messenger/callback` },
      { label: "Messenger webhook callback URL", url: `${base}/api/public/webhooks/messenger` },
    ];
  }, [origin]);

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-xl">Meta App</h2>
          <p className="text-sm text-muted-foreground">
            Store your Meta app credentials securely and verify the Messenger connection end to end.
          </p>
        </div>
        <Button variant="outline" onClick={() => mutate()} disabled={!workspaceId || run.isPending}>
          {run.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Verify connection
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" /> Credentials
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {run.isPending && !report ? (
            <Skeleton className="h-24 w-full rounded" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="meta-app-id">
                  META_APP_ID
                </label>
                <Input
                  id="meta-app-id"
                  readOnly
                  value={report?.appIdMasked ?? "Not configured"}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  {report?.appIdPresent
                    ? "Stored securely — only the last 4 digits are shown."
                    : "Missing."}
                </p>
              </div>
              <div className="space-y-1.5">
                <label
                  className="text-xs font-medium text-muted-foreground"
                  htmlFor="meta-app-secret"
                >
                  META_APP_SECRET
                </label>
                <Input
                  id="meta-app-secret"
                  readOnly
                  type="password"
                  value={report?.appSecretPresent ? "•".repeat(report.appSecretLength ?? 12) : ""}
                  placeholder="Not configured"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  {report?.appSecretPresent
                    ? `Stored securely — ${report.appSecretLength} characters, never displayed or logged.`
                    : "Missing."}
                </p>
              </div>
            </div>
          )}

          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>How credentials are stored</AlertTitle>
            <AlertDescription>
              Both values are kept as encrypted backend secrets and are only read inside server code
              (OAuth exchange, webhook signature verification, token introspection). They are never
              bundled into the frontend. To add or rotate them, set <code>META_APP_ID</code> and{" "}
              <code>META_APP_SECRET</code> in your deployment's environment/secret store and restart
              the server — the values never pass through this UI.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connection status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {run.isPending && !report ? (
            <>
              <Skeleton className="h-14 w-full rounded" />
              <Skeleton className="h-14 w-full rounded" />
            </>
          ) : null}

          {report ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={configured ? "default" : "destructive"}>
                  {configured ? "Credentials configured" : "Credentials missing"}
                </Badge>
                {report.appName ? <Badge variant="secondary">App: {report.appName}</Badge> : null}
                <Badge variant="secondary">
                  {report.pagesHealthy}/{report.pagesConnected} Pages healthy
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Checked {formatZoned(new Date(report.checkedAt), { timeStyle: "short" })}
                </span>
              </div>

              <ul className="divide-y divide-border rounded-control border border-border">
                {report.checks.map((c) => (
                  <li key={c.id} className="flex items-start gap-3 p-3">
                    <StateIcon state={c.state} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{c.label}</div>
                      <div className="text-xs text-muted-foreground break-words">{c.detail}</div>
                      {c.remedy ? (
                        <div className="mt-1 text-xs text-foreground/80">Fix: {c.remedy}</div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">URLs for your Meta app</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {callbacks.map((c) => (
            <div key={c.url} className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">{c.label}</div>
              <div className="flex items-center gap-2">
                <Input readOnly value={c.url} className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={`Copy ${c.label}`}
                  onClick={() => void copy(c.url)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            In your Meta app settings, add this domain under{" "}
            <strong>Settings → Basic → App Domains</strong>:{" "}
            <code className="text-foreground">
              {origin ? new URL(origin).hostname : "your-domain.com"}
            </code>
            . Then add the Instagram/Messenger redirect URIs under{" "}
            <strong>Facebook Login → Settings → Valid OAuth Redirect URIs</strong>, and the webhook
            URLs under <strong>Webhooks → Page</strong> with the fields <code>messages</code>,{" "}
            <code>messaging_postbacks</code>, <code>message_deliveries</code>,{" "}
            <code>message_reads</code>, and <code>message_reactions</code> (needed for emoji
            reactions to sync). For Instagram webhooks, subscribe to <code>messages</code>,{" "}
            <code>messaging_postbacks</code>, and <code>message_reactions</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
