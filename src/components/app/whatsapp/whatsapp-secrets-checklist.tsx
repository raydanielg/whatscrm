/**
 * Cloud → Secrets checklist for WhatsApp.
 *
 * Verifies that every secret referenced by the connected WhatsApp accounts
 * actually exists on the server, and gives a concrete fix for anything missing.
 */

import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import {
  checkWhatsAppSecrets,
  type SecretsChecklist,
} from "@/lib/messaging/secrets-checklist.functions";

export function WhatsAppSecretsChecklist({
  channelAccountId,
  secretNames,
  autoRun = true,
}: {
  channelAccountId?: string;
  /** Extra secret names to verify, e.g. the ones typed into the setup wizard. */
  secretNames?: Array<{ name: string; severity?: "required" | "recommended" }>;
  autoRun?: boolean;
}) {
  const { data: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id;
  const checkFn = useServerFn(checkWhatsAppSecrets);
  const startedRef = useRef(false);

  const run = useMutation<SecretsChecklist, Error, void>({
    mutationFn: () => checkFn({
        data: {
          workspaceId: workspaceId!,
          channelAccountId,
          secretNames: (secretNames ?? [])
            .filter((s) => s.name.trim().length > 0)
            .map((s) => ({ name: s.name.trim(), severity: s.severity ?? "required" })),
        },
      }),
    onError: (err) => toast.error(err.message || "Secrets checklist could not run."),
  });

  const { mutate } = run;
  useEffect(() => {
    if (!autoRun || !workspaceId || startedRef.current) return;
    startedRef.current = true;
    mutate();
  }, [autoRun, workspaceId, mutate]);

  const report = run.data;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="h-4 w-4" />
            Required secrets
          </h3>
          <p className="text-xs text-muted-foreground">
            Checks that every secret your WhatsApp accounts point to actually exists in Cloud → Secrets.
            Values are never shown.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => mutate()}
          disabled={!workspaceId || run.isPending}
        >
          {run.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Re-check
        </Button>
      </div>

      {run.isPending && !report ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded" />
          <Skeleton className="h-16 w-full rounded" />
        </div>
      ) : null}

      {report ? (
        <>
          {report.missingRequired > 0 ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>
                {report.missingRequired} required secret{report.missingRequired === 1 ? "" : "s"} missing
              </AlertTitle>
              <AlertDescription>
                WhatsApp sending will fail until these are added. Open <strong>Cloud → Secrets</strong> and
                add each secret below using the exact name shown.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>All required secrets are configured</AlertTitle>
              <AlertDescription>
                {report.missingRecommended > 0
                  ? `${report.missingRecommended} recommended secret${report.missingRecommended === 1 ? " is" : "s are"} still missing — see below.`
                  : "Nothing to fix here."}
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {report.secrets.length} secret{report.secrets.length === 1 ? "" : "s"} checked
                {report.accountsChecked > 0
                  ? ` across ${report.accountsChecked} account${report.accountsChecked === 1 ? "" : "s"}`
                  : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.secrets.map((secret) => {
                const Icon = secret.present
                  ? CheckCircle2
                  : secret.severity === "required"
                    ? XCircle
                    : AlertTriangle;
                const tone = secret.present
                  ? "text-emerald-600"
                  : secret.severity === "required"
                    ? "text-destructive"
                    : "text-amber-600";
                return (
                  <div key={secret.name} className="flex items-start gap-3 rounded border p-3">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{secret.name}</code>
                        <Badge variant={secret.severity === "required" ? "default" : "secondary"}>
                          {secret.severity === "required" ? "Required" : "Recommended"}
                        </Badge>
                        {secret.present ? (
                          <span className="text-xs text-muted-foreground">
                            Configured{secret.valueLength ? ` · ${secret.valueLength} chars` : ""}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-destructive">Missing</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{secret.purpose}</p>
                      {secret.usedBy.length > 0 ? (
                        <p className="text-xs text-muted-foreground">Used by: {secret.usedBy.join(", ")}</p>
                      ) : null}
                      {!secret.present && secret.remedy ? (
                        <p className="text-xs">
                          <span className="font-medium">Fix: </span>
                          {secret.remedy}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {report.secrets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No secrets to verify yet.</p>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </section>
  );
}
