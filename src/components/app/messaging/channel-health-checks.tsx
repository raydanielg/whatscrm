/**
 * Inbound health panel for Messenger and Instagram.
 *
 * Sits directly above the account list, because that list is where the
 * misleading signal lives: an account shows "Connected" on the strength of an
 * outbound Graph call alone, while Meta's inbound deliveries may be refused at
 * the door. The first card here answers the only question that matters when a
 * channel receives nothing — is the webhook actually working — and names the
 * variable or dashboard setting to change when it is not.
 */
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  HeartPulse,
  HelpCircle,
  Loader2,
  RefreshCw,
  Server,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useInstagramHealth, useMessengerHealth } from "@/hooks/use-meta-health";
import type {
  ChannelHealthCheck,
  ChannelHealthReport,
  HealthStatus,
} from "@/lib/messaging/meta-health.functions";

const STATUS_META: Record<
  HealthStatus,
  { icon: typeof CheckCircle2; className: string; label: string }
> = {
  ok: { icon: CheckCircle2, className: "text-emerald-600", label: "Healthy" },
  warn: { icon: AlertTriangle, className: "text-amber-600", label: "Needs attention" },
  error: { icon: XCircle, className: "text-destructive", label: "Action required" },
  unknown: { icon: HelpCircle, className: "text-muted-foreground", label: "Unknown" },
};

const CHANNEL_LABEL = { messenger: "Messenger", instagram: "Instagram" } as const;

function CheckList({ checks }: { checks: ChannelHealthCheck[] }) {
  return (
    <ul className="divide-y divide-border/60">
      {checks.map((check, i) => {
        const meta = STATUS_META[check.status];
        const Icon = meta.icon;
        return (
          <li key={`${check.id}-${i}`} className="flex gap-2 py-2 text-xs">
            <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${meta.className}`} />
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium">{check.label}</p>
              <p className="text-muted-foreground break-words">{check.detail}</p>
              {check.remedy && (
                <p className="text-foreground/80 break-words">Fix: {check.remedy}</p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The single sentence worth reading first. Inbound is a chain, so the earliest
 * failing link is the one to act on — listing six reds in order of appearance
 * buries the cause under its own consequences.
 */
function headlineFailure(report: ChannelHealthReport): ChannelHealthCheck | null {
  return (
    report.platform.find((c) => c.status === "error") ??
    report.accounts.flatMap((a) => a.checks).find((c) => c.status === "error") ??
    null
  );
}

export function ChannelHealthChecks({
  channel,
  autoRun = true,
}: {
  channel: "messenger" | "instagram";
  autoRun?: boolean;
}) {
  const { data: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id;
  const label = CHANNEL_LABEL[channel];

  // `refetch()` is a no-op on a disabled query, so the button has to enable the
  // query rather than only ask it to run again — otherwise `autoRun={false}`
  // would render a Run checks button that silently did nothing.
  const [requested, setRequested] = useState(false);
  const active = autoRun || requested;

  // Both hooks are called unconditionally — React requires a stable hook order —
  // and only the one for this channel is enabled.
  const messenger = useMessengerHealth(active && channel === "messenger");
  const instagram = useInstagramHealth(active && channel === "instagram");
  const health = channel === "messenger" ? messenger : instagram;

  const report = health.data;
  const pending = health.isFetching;

  const rerun = () => {
    setRequested(true);
    void health.refetch().then(({ data }) => {
      if (!data) return;
      const failing = [...data.platform, ...data.accounts.flatMap((a) => a.checks)].filter(
        (c) => c.status === "error",
      );
      if (failing.length > 0) {
        toast.error(`${label} inbound is not healthy`, {
          description: failing[0]?.label ? `${failing[0].label}: ${failing[0].detail}` : undefined,
        });
      } else if (data.problems > 0) {
        toast.warning(`${data.problems} ${label} warning${data.problems === 1 ? "" : "s"}`);
      } else {
        toast.success(`All ${label} inbound checks passed.`);
      }
    });
  };

  const copyCallback = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.callbackUrl);
      toast.success("Callback URL copied");
    } catch {
      toast.error("Could not copy — select the URL and copy it manually.");
    }
  };

  const headline = report ? headlineFailure(report) : null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium text-sm flex items-center gap-2">
            <HeartPulse className="w-4 h-4" /> Inbound health
          </h3>
          <p className="text-xs text-muted-foreground">
            Checks whether Meta can actually deliver {label} messages to this app — app secret,
            verify token, webhook subscription and a signed test delivery.
            {report
              ? ` Last run ${formatDistanceToNow(new Date(report.checkedAt), { addSuffix: true })}.`
              : ""}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={rerun}
          disabled={pending || !workspaceId}
        >
          {pending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Run checks
        </Button>
      </div>

      {pending && !report ? (
        <div className="space-y-2">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : health.isError ? (
        <Alert variant="destructive">
          <XCircle className="w-4 h-4" />
          <AlertTitle>Health checks could not run</AlertTitle>
          <AlertDescription>
            {health.error instanceof Error ? health.error.message : "Unknown error"}
          </AlertDescription>
        </Alert>
      ) : !report ? (
        <Alert>
          <HeartPulse className="w-4 h-4" />
          <AlertTitle>Health checks not run yet</AlertTitle>
          <AlertDescription>
            Run the checks to probe Meta and this deployment&apos;s webhook endpoint.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-3">
          {headline && (
            <Alert variant="destructive">
              <XCircle className="w-4 h-4" />
              <AlertTitle>
                {label} messages cannot arrive: {headline.label}
              </AlertTitle>
              <AlertDescription className="space-y-1">
                <p>{headline.detail}</p>
                {headline.remedy && <p className="font-medium">Fix: {headline.remedy}</p>}
              </AlertDescription>
            </Alert>
          )}

          <Card className="rounded">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex flex-wrap items-center gap-2">
                <Server className="w-4 h-4 text-muted-foreground" />
                Webhook delivery
                <Badge
                  variant={
                    report.status === "error"
                      ? "destructive"
                      : report.status === "ok"
                        ? "outline"
                        : "secondary"
                  }
                  className="text-[11px]"
                >
                  {STATUS_META[report.status].label}
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-1.5 pt-1">
                <code className="text-[11px] text-muted-foreground break-all">
                  {report.callbackUrl}
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0"
                  onClick={() => void copyCallback()}
                  aria-label="Copy callback URL"
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <CheckList checks={report.platform} />
            </CardContent>
          </Card>

          {report.accounts.length === 0 ? (
            <Alert>
              <HelpCircle className="w-4 h-4" />
              <AlertTitle>No {label} accounts connected</AlertTitle>
              <AlertDescription>
                The delivery checks above still apply — fix them first, then connect an account so
                there is somewhere for inbound messages to land.
              </AlertDescription>
            </Alert>
          ) : (
            report.accounts.map((account) => {
              const meta = STATUS_META[account.status];
              const Icon = meta.icon;
              return (
                <Card key={account.accountId} className="rounded">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex flex-wrap items-center gap-2">
                      <Icon className={`w-4 h-4 ${meta.className}`} />
                      {account.displayName}
                      {account.subtitle && (
                        <span className="font-normal text-xs text-muted-foreground">
                          {account.subtitle}
                        </span>
                      )}
                      <Badge
                        variant={
                          account.status === "error"
                            ? "destructive"
                            : account.status === "ok"
                              ? "outline"
                              : "secondary"
                        }
                        className="text-[11px]"
                      >
                        {meta.label}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <CheckList checks={account.checks} />
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}
