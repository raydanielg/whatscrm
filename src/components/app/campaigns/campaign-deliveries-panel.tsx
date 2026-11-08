import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Clock,
  Send,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  AlertTriangle,
  Download,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCampaignRecipients } from "@/hooks/use-marketing";
import { retryFailedRecipients } from "@/lib/marketing/marketing.functions";

type Recipient = {
  id: string;
  status: string;
  error_code: string | null;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  created_at: string;
  contact?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    phone_number: string | null;
  } | null;
};

type Bucket = "queued" | "sending" | "completed" | "failed";

const BUCKETS: Record<
  Bucket,
  { label: string; statuses: string[]; icon: typeof Clock; tone: string }
> = {
  queued: {
    label: "Queued",
    statuses: ["queued", "pending", "scheduled"],
    icon: Clock,
    tone: "text-muted-foreground",
  },
  sending: {
    label: "Sending",
    statuses: ["sending", "processing", "in_flight"],
    icon: Send,
    tone: "text-accent",
  },
  completed: {
    label: "Completed",
    statuses: ["sent", "delivered", "read", "replied", "clicked"],
    icon: CheckCircle2,
    tone: "text-success",
  },
  failed: {
    label: "Failed",
    statuses: ["failed", "error", "rejected", "undelivered"],
    icon: XCircle,
    tone: "text-destructive",
  },
};

function bucketOf(status: string): Bucket {
  const s = status?.toLowerCase() ?? "";
  for (const b of Object.keys(BUCKETS) as Bucket[]) {
    if (BUCKETS[b].statuses.includes(s)) return b;
  }
  return "queued";
}

function displayName(r: Recipient) {
  const n = `${r.contact?.first_name ?? ""} ${r.contact?.last_name ?? ""}`.trim();
  return n || r.contact?.phone_number || "Unknown";
}

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(rows: Recipient[], campaignId: string) {
  const header = [
    "recipient",
    "phone",
    "status",
    "sent_at",
    "delivered_at",
    "read_at",
    "failed_at",
    "error_code",
    "error_message",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        displayName(r),
        r.contact?.phone_number ?? "",
        r.status,
        r.sent_at ?? "",
        r.delivered_at ?? "",
        r.read_at ?? "",
        r.failed_at ?? "",
        r.error_code ?? "",
        r.error_message ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `campaign-${campaignId}-deliveries.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function CampaignDeliveriesPanel({ campaignId }: { campaignId: string }) {
  const qc = useQueryClient();
  const { data, isLoading, refetch, isFetching } = useCampaignRecipients(campaignId);
  const recipients = (data ?? []) as unknown as Recipient[];

  const [filter, setFilter] = useState<Bucket | "all">("all");
  const [q, setQ] = useState("");
  const [retryOpen, setRetryOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const retryFn = useServerFn(retryFailedRecipients);

  async function handleRetry(scope: "all" | "filtered") {
    setRetrying(true);
    try {
      const recipientIds =
        scope === "filtered"
          ? filtered.filter((r) => bucketOf(r.status) === "failed").map((r) => r.id)
          : undefined;
      if (scope === "filtered" && (!recipientIds || recipientIds.length === 0)) {
        toast.error("No failed recipients in the current view");
        return;
      }
      const res = (await retryFn({ data: { campaignId, recipientIds } })) as {
        retried: number;
      };
      if (res.retried === 0) {
        toast.info("No failed recipients to retry");
      } else {
        toast.success(`Requeued ${res.retried} failed ${res.retried === 1 ? "recipient" : "recipients"}`);
      }
      qc.invalidateQueries({ queryKey: ["campaign-recipients", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaign-events", campaignId] });
      setRetryOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to retry recipients");
    } finally {
      setRetrying(false);
    }
  }


  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { queued: 0, sending: 0, completed: 0, failed: 0 };
    for (const r of recipients) c[bucketOf(r.status)]++;
    return c;
  }, [recipients]);

  const total = recipients.length;
  const failedCount = counts.failed;

  const filtered = useMemo(() => {
    const search = q.trim().toLowerCase();
    return recipients.filter((r) => {
      if (filter !== "all" && bucketOf(r.status) !== filter) return false;
      if (!search) return true;
      const hay = [
        displayName(r),
        r.contact?.phone_number,
        r.error_code,
        r.error_message,
        r.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(search);
    });
  }, [recipients, filter, q]);

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(Object.keys(BUCKETS) as Bucket[]).map((b) => {
          const meta = BUCKETS[b];
          const Icon = meta.icon;
          const active = filter === b;
          const pct = total ? Math.round((counts[b] / total) * 100) : 0;
          return (
            <button
              key={b}
              onClick={() => setFilter(active ? "all" : b)}
              className={`text-left rounded-control border bg-card p-4 transition hover:border-primary ${
                active ? "border-primary ring-1 ring-primary" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">{meta.label}</span>
                <Icon className={`h-4 w-4 ${meta.tone}`} />
              </div>
              <div className="mt-2 text-2xl font-semibold ">
                {counts[b].toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{pct}% of loaded</div>
            </button>
          );
        })}
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search recipient, phone, error code"
            className="pl-8 rounded-control"
          />
        </div>
        <div className="flex items-center gap-1">
          {(["all", "queued", "sending", "completed", "failed"] as const).map((b) => (
            <Button
              key={b}
              size="sm"
              variant={filter === b ? "default" : "outline"}
              onClick={() => setFilter(b)}
              className="capitalize rounded-control"
            >
              {b}
            </Button>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="rounded-control"
          onClick={() => {
            qc.invalidateQueries({ queryKey: ["campaign-recipients", campaignId] });
            refetch();
          }}
          disabled={isFetching}
        >
          <RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-control"
          onClick={() => exportCsv(filtered, campaignId)}
          disabled={filtered.length === 0}
        >
          <Download className="mr-1 h-4 w-4" /> Export CSV
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="rounded-control"
          onClick={() => setRetryOpen(true)}
          disabled={failedCount === 0 || retrying}
          title={failedCount === 0 ? "No failed recipients" : "Resend to failed recipients"}
        >
          <RotateCcw className={`mr-1 h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
          Retry failed{failedCount > 0 ? ` (${failedCount})` : ""}
        </Button>
        <Button asChild size="sm" variant="ghost" className="rounded-control">
          <Link to="/campaigns/$campaignId/status" params={{ campaignId }}>
            <ExternalLink className="mr-1 h-4 w-4" /> Full status view
          </Link>
        </Button>
      </div>

      {failedCount > 0 && (
        <div className="flex items-center gap-2 rounded-control border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span className="flex-1">
            {failedCount} failed {failedCount === 1 ? "delivery" : "deliveries"} — filter by{" "}
            <button
              className="underline underline-offset-2 hover:text-destructive"
              onClick={() => setFilter("failed")}
            >
              Failed
            </button>{" "}
            to review error reasons.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-control border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => setRetryOpen(true)}
            disabled={retrying}
          >
            <RotateCcw className={`mr-1 h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
            Retry all failed
          </Button>
        </div>
      )}

      {/* Deliveries table */}
      <Card className="rounded-control p-0">
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/50 text-left text-xs">
              <tr>
                <th className="px-4 py-2 font-medium">Recipient</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Sent</th>
                <th className="px-4 py-2 font-medium">Delivered</th>
                <th className="px-4 py-2 font-medium">Read</th>
                <th className="px-4 py-2 font-medium">Failed</th>
                <th className="px-4 py-2 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    Loading deliveries
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No deliveries match this filter.
                  </td>
                </tr>
              )}
              {filtered.map((r) => {
                const b = bucketOf(r.status);
                const meta = BUCKETS[b];
                return (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-2">
                      <div className="font-medium">{displayName(r)}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.contact?.phone_number ?? "—"}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <Badge
                        variant="outline"
                        className={`capitalize rounded-control ${meta.tone}`}
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {fmt(r.sent_at)}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {fmt(r.delivered_at)}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {fmt(r.read_at)}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {fmt(r.failed_at)}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {r.error_message || r.error_code ? (
                        <div>
                          <div className="font-mono text-[11px] text-destructive">
                            {r.error_code ?? "ERROR"}
                          </div>
                          <div className="text-muted-foreground line-clamp-2">
                            {r.error_message ?? "Unknown error"}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {recipients.length >= 500 && (
          <div className="border-t px-4 py-2 text-xs text-muted-foreground">
            Showing latest 500 deliveries. Refine with search or filters to find specific messages.
          </div>
        )}
      </Card>

      <AlertDialog open={retryOpen} onOpenChange={setRetryOpen}>
        <AlertDialogContent className="rounded-control">
          <AlertDialogHeader>
            <AlertDialogTitle>Retry failed recipients?</AlertDialogTitle>
            <AlertDialogDescription>
              This requeues{" "}
              <strong>
                {failedCount} failed {failedCount === 1 ? "recipient" : "recipients"}
              </strong>{" "}
              for immediate resend. Successful, queued, and in-flight messages are unchanged.
              If the campaign was completed or paused it will resume running.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={retrying} className="rounded-control">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={retrying || failedCount === 0}
              onClick={(e) => {
                e.preventDefault();
                void handleRetry("all");
              }}
              className="rounded-control"
            >
              {retrying ? "Requeuing" : `Retry ${failedCount} failed`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
