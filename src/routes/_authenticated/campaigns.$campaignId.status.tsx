import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ChevronLeft,
  Clock,
  Send,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  AlertTriangle,
} from "lucide-react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useCampaign, useCampaignRecipients, useMarketingRealtime } from "@/hooks/use-marketing";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/campaigns/$campaignId/status")({
  component: CampaignStatusPage,
});

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
    avatar_url: string | null;
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
    tone: "text-blue-500",
  },
  completed: {
    label: "Completed",
    statuses: ["sent", "delivered", "read", "replied", "clicked"],
    icon: CheckCircle2,
    tone: "text-emerald-500",
  },
  failed: {
    label: "Failed",
    statuses: ["failed", "error", "rejected", "undelivered"],
    icon: XCircle,
    tone: "text-red-500",
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

function CampaignStatusPage() {
  const { campaignId } = Route.useParams();
  useMarketingRealtime();
  const qc = useQueryClient();
  const { data: campaign } = useCampaign(campaignId);
  const { data, isLoading, refetch, isFetching } = useCampaignRecipients(campaignId);
  const recipients = (data ?? []) as unknown as Recipient[];
  const formatZoned = useZonedDateFormatter();
  const fmt = (d: string | null | undefined) => {
    if (!d) return "—";
    try {
      return formatZoned(new Date(d), { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return d;
    }
  };

  const [filter, setFilter] = useState<Bucket | "all">("all");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { queued: 0, sending: 0, completed: 0, failed: 0 };
    for (const r of recipients) c[bucketOf(r.status)]++;
    return c;
  }, [recipients]);

  const total = recipients.length;

  const failedList = useMemo(
    () => recipients.filter((r) => bucketOf(r.status) === "failed"),
    [recipients],
  );

  const filtered = useMemo(() => {
    const search = q.trim().toLowerCase();
    return recipients.filter((r) => {
      if (filter !== "all" && bucketOf(r.status) !== filter) return false;
      if (!search) return true;
      const hay = [displayName(r), r.contact?.phone_number, r.error_code, r.error_message, r.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(search);
    });
  }, [recipients, filter, q]);

  return (
    <div className="flex h-full flex-col">
      <AppTopbar
        title={campaign?.name ? `${campaign.name} — Status` : "Campaign Status"}
        subtitle={
          campaign
            ? `${total.toLocaleString()} of ${campaign.total_recipients?.toLocaleString?.() ?? total} recipients · ${campaign.status}`
            : "Live delivery status"
        }
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/campaigns/$campaignId" params={{ campaignId }}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Back
              </Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                qc.invalidateQueries({ queryKey: ["campaign-recipients", campaignId] });
                refetch();
              }}
              disabled={isFetching}
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-7xl w-full mx-auto">
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

        {/* Failed spotlight */}
        {failedList.length > 0 && (
          <Card className="rounded-control border-red-500/40 bg-red-500/5 p-4">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <div className="text-sm font-semibold">
                {failedList.length} failed {failedList.length === 1 ? "delivery" : "deliveries"}
              </div>
            </div>
            <div className="max-h-64 overflow-auto rounded-control border bg-background">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Recipient</th>
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium">Error</th>
                    <th className="px-3 py-2 font-medium">Failed at</th>
                  </tr>
                </thead>
                <tbody>
                  {failedList.slice(0, 100).map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-medium">{displayName(r)}</div>
                        <div className="text-muted-foreground">
                          {r.contact?.phone_number ?? "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px]">{r.error_code ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.error_message ?? "Unknown error"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {fmt(r.failed_at ?? r.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search recipients, phone, error code"
              className="pl-8"
            />
          </div>
          <div className="flex items-center gap-1">
            {(["all", "queued", "sending", "completed", "failed"] as const).map((b) => (
              <Button
                key={b}
                size="sm"
                variant={filter === b ? "default" : "outline"}
                onClick={() => setFilter(b)}
                className="capitalize"
              >
                {b}
              </Button>
            ))}
          </div>
        </div>

        {/* All recipients */}
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
                  <th className="px-4 py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                      Loading recipients
                    </td>
                  </tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No recipients match this filter.
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
                        <Badge variant="outline" className={`capitalize ${meta.tone}`}>
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
                      <td className="px-4 py-2 text-xs">
                        {r.error_message ? (
                          <div>
                            <div className="font-mono text-[11px] text-red-500">
                              {r.error_code ?? "ERROR"}
                            </div>
                            <div className="text-muted-foreground line-clamp-2">
                              {r.error_message}
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
              Showing latest 500 recipients. Refine with search or filters to find specific
              deliveries.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
