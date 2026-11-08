import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { ActionBar } from "@/components/app/action-bar";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useServerFn } from "@tanstack/react-start";
import {
  Send,
  Play,
  Pause,
  Copy,
  Trash2,
  BarChart3,
  Users,
  Calendar,
  FlaskConical,
  Sparkles,
  ChevronLeft,
  ListChecks,
} from "lucide-react";
import { useState } from "react";
import {
  useCampaign,
  useCampaignRecipients,
  useCampaignEvents,
  useMarketingRealtime,
} from "@/hooks/use-marketing";
import {
  useAbVariants,
  useUpsertAbVariant,
  useDeleteAbVariant,
  useDispatchStats,
  useMarketingExtrasRealtime,
} from "@/hooks/use-marketing-extras";
import { AbTestingPanel } from "@/components/app/campaigns/ab-testing-panel";
import { AiMarketingAssistant } from "@/components/app/campaigns/ai-marketing-assistant";
import { CampaignDeliveriesPanel } from "@/components/app/campaigns/campaign-deliveries-panel";
import { CampaignQueueNotice } from "@/components/app/campaigns/campaign-queue-notice";
import {
  enqueueCampaign,
  cancelCampaign,
  pauseCampaign,
  resumeCampaign,
  duplicateCampaign,
} from "@/lib/marketing/marketing.functions";
import {
  DateTimePicker,
  fromLocalDateTimeString,
  toLocalDateTimeString,
} from "@/shared/components";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { PermissionGate } from "@/components/app/permission-gate";
import { useCanAct } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_authenticated/campaigns/$campaignId")({
  component: CampaignDetailPage,
});

type Tab = "overview" | "recipients" | "deliveries" | "analytics" | "ab" | "ai" | "schedule";

function CampaignDetailPage() {
  const { campaignId } = Route.useParams();
  const navigate = useNavigate();
  useMarketingRealtime();
  useMarketingExtrasRealtime();

  const { data: campaign, isLoading } = useCampaign(campaignId);
  const { data: queueStats } = useDispatchStats(campaignId);
  const [tab, setTab] = useState<Tab>("overview");
  const enqueue = useServerFn(enqueueCampaign);
  const pause = useServerFn(pauseCampaign);
  const resume = useServerFn(resumeCampaign);
  const cancel = useServerFn(cancelCampaign);
  const duplicate = useServerFn(duplicateCampaign);
  const [busy, setBusy] = useState(false);
  const canSend = useCanAct("campaigns.send");
  const canDelete = useCanAct("campaigns.delete");

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading</div>;
  if (!campaign) return <div className="p-6 text-sm text-muted-foreground">Not found.</div>;

  // The campaign row stores the audience estimate captured at launch; once the
  // dispatch queue is materialised the queued rows are the truth. Showing the
  // estimate after launch made the header disagree with the Recipients tab.
  const queuedTotal = queueStats
    ? queueStats.pending +
      queueStats.processing +
      queueStats.sent +
      queueStats.failed +
      queueStats.skipped +
      queueStats.cancelled
    : 0;
  const recipientsTotal = queuedTotal > 0 ? queuedTotal : (campaign.total_recipients ?? 0);
  const recipientsLabel = queuedTotal > 0 ? "recipients" : "recipients (estimated)";

  const tabs: Array<{ id: Tab; label: string; icon: typeof Send }> = [
    { id: "overview", label: "Overview", icon: Send },
    { id: "recipients", label: "Recipients", icon: Users },
    { id: "deliveries", label: "Deliveries", icon: ListChecks },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "ab", label: "A/B Testing", icon: FlaskConical },
    { id: "ai", label: "AI Assistant", icon: Sparkles },
    { id: "schedule", label: "Schedule", icon: Calendar },
  ];

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AppTopbar
        title={campaign.name}
        subtitle={`${recipientsTotal.toLocaleString()} ${recipientsLabel} · ${campaign.status}`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/campaigns"
              className="inline-flex items-center gap-1 px-2 py-2 rounded-control text-sm text-muted-foreground hover:bg-muted"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </Link>
            <ActionBar
              primary={[
                <>
                  {(campaign.status === "draft" || campaign.status === "paused") && (
                    <PermissionGate key="launch" permission="campaigns.send">
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (!canSend) return;
                          run(() => enqueue({ data: { campaignId } }));
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                      >
                        <Play className="w-4 h-4" /> Launch
                      </button>
                    </PermissionGate>
                  )}
                  {campaign.status === "running" && (
                    <button
                      key="pause"
                      disabled={busy}
                      onClick={() => run(() => pause({ data: { campaignId } }))}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-control bg-warning text-warning-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      <Pause className="w-4 h-4" /> Pause
                    </button>
                  )}
                  {campaign.status === "paused" && (
                    <PermissionGate key="resume" permission="campaigns.send">
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (!canSend) return;
                          run(() => resume({ data: { campaignId } }));
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                      >
                        <Play className="w-4 h-4" /> Resume
                      </button>
                    </PermissionGate>
                  )}
                </>,
                <Link
                  key="live-status"
                  to="/campaigns/$campaignId/status"
                  params={{ campaignId }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-control border border-border text-sm hover:bg-muted"
                >
                  <BarChart3 className="w-4 h-4" /> Live status
                </Link>,
              ]}
              overflow={[
                <DropdownMenuItem
                  key="duplicate"
                  disabled={busy}
                  onClick={async () => {
                    const dup = (await duplicate({ data: { campaignId } })) as { id: string };
                    if (dup?.id)
                      navigate({ to: "/campaigns/$campaignId", params: { campaignId: dup.id } });
                  }}
                >
                  <Copy className="w-4 h-4 mr-2" /> Duplicate
                </DropdownMenuItem>,
                ...(campaign.status !== "completed"
                  ? [
                      <PermissionGate key="cancel" permission="campaigns.delete">
                        <DropdownMenuItem
                          disabled={busy}
                          onClick={() => {
                            if (!canDelete) return;
                            run(() => cancel({ data: { campaignId } }));
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" /> Cancel
                        </DropdownMenuItem>
                      </PermissionGate>,
                    ]
                  : []),
              ]}
            />
          </div>
        }
      />

      <div className="border-b border-border bg-background sticky top-[var(--topbar-height,var(--header-height))] z-10">
        <ScrollArea orientation="horizontal" type="hover" className="w-full">
          <div className="px-4 lg:px-6 flex w-max gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2.5 text-sm border-b-2 flex items-center gap-1.5 transition rounded-none ${
                  tab === t.id
                    ? "border-primary text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <CampaignQueueNotice campaign={campaign} stats={queueStats} />
        {tab === "overview" && <OverviewTab campaignId={campaignId} />}
        {tab === "recipients" && (
          <RecipientsTab
            campaignId={campaignId}
            expected={campaign.total_recipients ?? 0}
            queued={queuedTotal}
          />
        )}
        {tab === "deliveries" && <CampaignDeliveriesPanel campaignId={campaignId} />}
        {tab === "analytics" && <AnalyticsTab campaignId={campaignId} />}
        {tab === "ab" && <AbTab campaignId={campaignId} />}
        {tab === "ai" && <AiMarketingAssistant campaignId={campaignId} />}
        {tab === "schedule" && <ScheduleTab campaignId={campaignId} />}
      </main>
    </>
  );
}

/* -------- Tabs -------- */

function OverviewTab({ campaignId }: { campaignId: string }) {
  const { data: campaign } = useCampaign(campaignId);
  const { data: stats } = useDispatchStats(campaignId);
  if (!campaign) return null;
  const items = [
    { label: "Pending", value: stats?.pending ?? 0 },
    { label: "Processing", value: stats?.processing ?? 0 },
    { label: "Sent", value: stats?.sent ?? 0 },
    { label: "Failed", value: stats?.failed ?? 0 },
    { label: "Cancelled", value: stats?.cancelled ?? 0 },
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 rounded-control border border-border bg-surface p-5 shadow-sm">
        <div className="text-xs  text-muted-foreground">Message</div>
        <div className="mt-2 whitespace-pre-wrap font-mono text-sm">
          {campaign.message_body || <span className="text-muted-foreground">No body set.</span>}
        </div>
      </div>
      <div className="rounded-control border border-border bg-surface p-5 shadow-sm">
        <div className="text-xs  text-muted-foreground">Queue</div>
        <div className="mt-3 space-y-2">
          {items.map((i) => (
            <div key={i.label} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{i.label}</span>
              <span className=" font-medium">{i.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RecipientsTab({
  campaignId,
  expected = 0,
  queued = 0,
}: {
  campaignId: string;
  expected?: number;
  queued?: number;
}) {
  const {
    data: recipients,
    isLoading,
    isError,
    error,
    refetch,
  } = useCampaignRecipients(campaignId);
  const formatZoned = useZonedDateFormatter();
  if (isLoading) return <div className="text-sm text-muted-foreground">Loading</div>;
  if (isError)
    return (
      <div className="space-y-2 text-sm" role="alert">
        <p className="font-medium text-destructive">Could not load recipients.</p>
        <p className="text-xs text-muted-foreground break-words">
          {(error as Error | null)?.message ?? "Unknown error"}
        </p>
        <button
          onClick={() => void refetch()}
          className="rounded-control border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Retry
        </button>
      </div>
    );
  if (!recipients || recipients.length === 0)
    return (
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>No recipients yet. Launch to enqueue.</p>
        {expected > 0 && (
          <p className="text-xs">
            This campaign reports {expected.toLocaleString()} recipients, but none have been
            materialised into the delivery queue yet — the summary count comes from the audience
            estimate, not from queued rows.
          </p>
        )}
      </div>
    );
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        Showing {Math.min(recipients.length, 200).toLocaleString()} of{" "}
        {(queued || recipients.length).toLocaleString()} queued recipients
        {expected > 0 && expected !== (queued || recipients.length) && (
          <> · audience estimate at launch: {expected.toLocaleString()}</>
        )}
      </div>
      <div className="rounded-control border border-border bg-surface shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs  text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5">Contact</th>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="text-left px-4 py-2.5">Sent</th>
              <th className="text-left px-4 py-2.5">Delivered</th>
              <th className="text-left px-4 py-2.5">Read</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {recipients.slice(0, 200).map((r: any) => (
              <tr key={r.id}>
                <td className="px-4 py-2">
                  {r.contact
                    ? `${r.contact.first_name ?? ""} ${r.contact.last_name ?? ""}`.trim() ||
                      r.contact.phone_number
                    : r.contact_id}
                </td>
                <td className="px-4 py-2 capitalize">{r.status}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {r.sent_at
                    ? formatZoned(new Date(r.sent_at), { dateStyle: "medium", timeStyle: "short" })
                    : "—"}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {r.delivered_at
                    ? formatZoned(new Date(r.delivered_at), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "—"}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {r.read_at
                    ? formatZoned(new Date(r.read_at), { dateStyle: "medium", timeStyle: "short" })
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnalyticsTab({ campaignId }: { campaignId: string }) {
  const { data: campaign } = useCampaign(campaignId);
  const { data: events } = useCampaignEvents(campaignId);
  const formatZoned = useZonedDateFormatter();
  if (!campaign) return null;
  const kpis = [
    { label: "Recipients", v: campaign.total_recipients },
    { label: "Sent", v: campaign.sent_count },
    { label: "Delivered", v: campaign.delivered_count },
    { label: "Read", v: campaign.read_count },
    { label: "Replied", v: campaign.replied_count },
    { label: "Clicked", v: campaign.clicked_count },
    { label: "Failed", v: campaign.failed_count },
    { label: "Opted out", v: campaign.opted_out_count },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-control border border-border bg-surface p-4 shadow-sm"
          >
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className="text-2xl font-display font-semibold mt-1 ">{k.v.toLocaleString()}</div>
          </div>
        ))}
      </div>
      <div className="rounded-control border border-border bg-surface shadow-sm">
        <div className="px-4 py-3 border-b border-border font-medium">Event timeline</div>
        <div className="divide-y divide-border max-h-[400px] overflow-auto">
          {(events ?? []).slice(0, 100).map((e: any) => (
            <div key={e.id} className="p-3 flex items-center gap-3 text-sm">
              <span className="text-xs px-2 py-0.5 rounded-control bg-muted capitalize">
                {e.event_type}
              </span>
              <span className="text-muted-foreground text-xs">
                {formatZoned(new Date(e.created_at), { dateStyle: "medium", timeStyle: "short" })}
              </span>
              <span className="text-muted-foreground text-xs truncate">
                {JSON.stringify(e.payload ?? {})}
              </span>
            </div>
          ))}
          {(!events || events.length === 0) && (
            <div className="p-4 text-sm text-muted-foreground">No events yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function AbTab({ campaignId }: { campaignId: string }) {
  return <AbTestingPanel campaignId={campaignId} />;
}

function ScheduleTab({ campaignId }: { campaignId: string }) {
  const { data: campaign } = useCampaign(campaignId);
  const enqueue = useServerFn(enqueueCampaign);
  const [when, setWhen] = useState(
    campaign?.scheduled_at ? new Date(campaign.scheduled_at).toISOString().slice(0, 16) : "",
  );
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-control border border-border bg-surface p-5 shadow-sm max-w-lg space-y-3">
      <div className="font-medium">Schedule campaign</div>
      <div className="text-xs text-muted-foreground">
        The dispatcher picks up pending queue rows every minute and respects the campaign throttle.
      </div>
      <DateTimePicker
        value={fromLocalDateTimeString(when)}
        onChange={(d) => setWhen(toLocalDateTimeString(d))}
      />
      <div className="flex justify-end gap-2">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await enqueue({
                data: {
                  campaignId,
                  runAt: when ? new Date(when).toISOString() : new Date().toISOString(),
                },
              });
            } finally {
              setBusy(false);
            }
          }}
          className="px-3 py-1.5 rounded-control text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {when ? "Schedule" : "Send now"}
        </button>
      </div>
    </div>
  );
}

function Metric({ label, v }: { label: string; v: number }) {
  return (
    <div>
      <div className="text-sm font-semibold ">{v.toLocaleString()}</div>
      <div className="text-[11px]  text-muted-foreground">{label}</div>
    </div>
  );
}
