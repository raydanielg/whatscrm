import { createFileRoute, Link } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import {
  Send,
  Plus,
  MoreHorizontal,
  Copy,
  Archive,
  ArchiveRestore,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  useCampaigns,
  useUpsertCampaign,
  useMarketingRealtime,
  type CampaignRow,
} from "@/hooks/use-marketing";
import { duplicateCampaign } from "@/lib/marketing/marketing.functions";
import { useQueryClient } from "@tanstack/react-query";
import {
  CampaignWizard,
  type CampaignWizardMode,
} from "@/components/app/campaigns/campaign-wizard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { PermissionGate } from "@/components/app/permission-gate";
import { useCanAct } from "@/hooks/use-permissions";

/**
 * `?new=broadcast` opens the wizard straight into one-time broadcast mode.
 * "Broadcast" is an alias for a non-recurring Campaign, not a second model, so
 * the Broadcasts page hands off here instead of owning its own editor.
 */
export const Route = createFileRoute("/_authenticated/campaigns/")({
  // Optional, so every other link to /campaigns stays a bare link.
  validateSearch: (search: Record<string, unknown>): { new?: CampaignWizardMode } =>
    search.new === "broadcast" || search.new === "campaign"
      ? { new: search.new as CampaignWizardMode }
      : {},
  component: CampaignsPage,
});

const STATUS_STYLES: Record<string, string> = {
  running: "bg-success/10 text-success",
  scheduled: "bg-accent/10 text-accent",
  completed: "bg-muted text-muted-foreground",
  draft: "bg-secondary text-secondary-foreground",
  paused: "bg-warning/15 text-warning-foreground",
  failed: "bg-destructive/10 text-destructive",
};

type TabId = "active" | "drafts" | "approval" | "archived";

function CampaignsPage() {
  useMarketingRealtime();
  const formatZoned = useZonedDateFormatter();
  const { data: campaigns, isLoading, isError, error, refetch } = useCampaigns();
  const upsert = useUpsertCampaign();
  const duplicate = useServerFn(duplicateCampaign);
  const qc = useQueryClient();

  const navigate = Route.useNavigate();
  const { new: newParam } = Route.useSearch();

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardInitial, setWizardInitial] = useState<Partial<CampaignRow> | undefined>();
  const [wizardMode, setWizardMode] = useState<CampaignWizardMode>("campaign");

  // Deep link from /broadcasts. The param is cleared as the wizard opens so a
  // refresh or a back navigation does not reopen it.
  useEffect(() => {
    if (!newParam) return;
    setWizardInitial(undefined);
    setWizardMode(newParam);
    setWizardOpen(true);
    navigate({ search: {}, replace: true });
  }, [newParam, navigate]);
  const [tab, setTab] = useState<TabId>("active");
  const [search, setSearch] = useState("");
  const canSend = useCanAct("campaigns.send");

  const counts = useMemo(() => {
    const all = campaigns ?? [];
    return {
      active: all.filter(
        (c) =>
          !(c as any).archived_at &&
          !["draft"].includes(c.status) &&
          (c as any).approval_status !== "pending",
      ).length,
      drafts: all.filter(
        (c) =>
          !(c as any).archived_at &&
          c.status === "draft" &&
          (c as any).approval_status !== "pending",
      ).length,
      approval: all.filter(
        (c) => (c as any).approval_status === "pending" && !(c as any).archived_at,
      ).length,
      archived: all.filter((c) => !!(c as any).archived_at).length,
    };
  }, [campaigns]);

  const filtered = useMemo(() => {
    const all = campaigns ?? [];
    const bySearch = (c: CampaignRow) =>
      !search || c.name.toLowerCase().includes(search.toLowerCase());
    return all.filter((c) => {
      const a = c as any;
      if (!bySearch(c)) return false;
      if (tab === "archived") return !!a.archived_at;
      if (a.archived_at) return false;
      if (tab === "approval") return a.approval_status === "pending";
      if (tab === "drafts") return c.status === "draft" && a.approval_status !== "pending";
      return !["draft"].includes(c.status) && a.approval_status !== "pending";
    });
  }, [campaigns, search, tab]);

  const openNew = (mode: CampaignWizardMode = "campaign") => {
    setWizardInitial(undefined);
    setWizardMode(mode);
    setWizardOpen(true);
  };

  const handleDuplicate = async (id: string) => {
    try {
      await duplicate({ data: { campaignId: id } });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campaign duplicated");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to duplicate");
    }
  };

  const handleArchive = async (c: CampaignRow, archive: boolean) => {
    try {
      await upsert.mutateAsync({
        id: c.id,
        archived_at: archive ? new Date().toISOString() : (null as any),
      } as any);
      toast.success(archive ? "Campaign archived" : "Campaign restored");
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  };

  const handleApprove = async (c: CampaignRow) => {
    if (!canSend) return;
    try {
      await upsert.mutateAsync({
        id: c.id,
        approval_status: "approved",
        approved_at: new Date().toISOString(),
        status: c.scheduled_at ? "scheduled" : "running",
      } as any);
      toast.success("Campaign approved");
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  };

  return (
    <>
      <AppTopbar
        title="Campaigns"
        subtitle="Broadcast messaging & template campaigns"
        actions={
          <button
            onClick={() => openNew()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 shadow-sm transition"
          >
            <Sparkles className="w-4 h-4" /> New campaign
          </button>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {/* Tabs & search */}
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="inline-flex rounded-control border border-border bg-surface p-0.75 gap-1">
            {(
              [
                { id: "active", label: "Active", n: counts.active },
                { id: "drafts", label: "Drafts", n: counts.drafts },
                { id: "approval", label: "Approval", n: counts.approval },
                { id: "archived", label: "Archived", n: counts.archived },
              ] as { id: TabId; label: string; n: number }[]
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "px-3 py-1.5 rounded-control text-sm font-medium transition-all",
                  tab === t.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "ml-1.5 text-[11px] px-1.5 py-0.5 rounded-control",
                    tab === t.id ? "bg-primary-foreground/20" : "bg-muted",
                  )}
                >
                  {t.n}
                </span>
              </button>
            ))}
          </div>
          <input
            className="px-3 py-2 rounded-control border border-border bg-background text-sm w-full sm:w-64"
            placeholder="Search campaigns"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading campaigns</div>
        ) : isError ? (
          <div
            className="rounded-control border border-destructive/30 bg-destructive/5 p-6 text-center"
            role="alert"
          >
            <div className="font-medium text-destructive">Couldn't load campaigns</div>
            <div className="text-sm text-muted-foreground mt-1">
              {(error as Error)?.message ?? "Unexpected error."}
            </div>
            <button
              onClick={() => void refetch()}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-control border border-border text-sm font-medium hover:bg-muted"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-control border border-dashed border-border bg-surface p-10 text-center">
            <Send className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
            <div className="font-medium">
              {tab === "archived" ? "Nothing archived" : "No campaigns here"}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {tab === "archived"
                ? "Archived campaigns will appear here."
                : "Create your first campaign to reach a segment or list with a WhatsApp message."}
            </div>
            {tab !== "archived" && (
              <button
                onClick={() => openNew()}
                className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
              >
                <Plus className="w-4 h-4" /> New campaign
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-control border border-border bg-surface shadow-sm">
            <div className="divide-y divide-border">
              {filtered.map((c) => {
                const a = c as any;
                const isPending = a.approval_status === "pending";
                return (
                  <div
                    key={c.id}
                    className="group p-5 flex flex-wrap items-center gap-4 hover:bg-muted/40 transition"
                  >
                    <Link
                      to="/campaigns/$campaignId"
                      params={{ campaignId: c.id }}
                      className="flex items-center gap-4 flex-1 min-w-[220px]"
                    >
                      <div className="w-10 h-10 rounded-control bg-accent/10 text-accent grid place-items-center">
                        <Send className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          {c.total_recipients.toLocaleString()} recipients · throttle{" "}
                          {c.throttle_per_minute}/min
                          {c.scheduled_at
                            ? ` · ${formatZoned(new Date(c.scheduled_at), {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}`
                            : ""}
                          {a.is_recurring ? " · Recurring" : ""}
                        </div>
                      </div>
                    </Link>
                    <div className="flex gap-6 text-sm ">
                      <Kpi label="Sent" v={c.sent_count} />
                      <Kpi label="Delivered" v={c.delivered_count} />
                      <Kpi label="Read" v={c.read_count} />
                      <Kpi label="Failed" v={c.failed_count} />
                    </div>
                    <div className="flex items-center gap-2">
                      {isPending && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-control text-[11px] bg-warning/15 text-warning-foreground">
                          <ShieldCheck className="w-3 h-3" /> Awaiting approval
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-control text-xs font-medium capitalize ${
                          STATUS_STYLES[c.status] ?? "bg-muted"
                        }`}
                      >
                        {c.status}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1.5 rounded-control hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition">
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {isPending && (
                            <PermissionGate permission="campaigns.send">
                              <DropdownMenuItem onClick={() => handleApprove(c)}>
                                <ShieldCheck className="w-4 h-4" /> Approve & schedule
                              </DropdownMenuItem>
                            </PermissionGate>
                          )}
                          <DropdownMenuItem
                            onClick={() => {
                              setWizardInitial(c);
                              setWizardOpen(true);
                            }}
                          >
                            <Sparkles className="w-4 h-4" /> Edit in wizard
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(c.id)}>
                            <Copy className="w-4 h-4" /> Duplicate
                          </DropdownMenuItem>
                          {a.archived_at ? (
                            <DropdownMenuItem onClick={() => handleArchive(c, false)}>
                              <ArchiveRestore className="w-4 h-4" /> Restore
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => handleArchive(c, true)}>
                              <Archive className="w-4 h-4" /> Archive
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <CampaignWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        initial={wizardInitial}
        mode={wizardMode}
      />
    </>
  );
}

function Kpi({ label, v }: { label: string; v: number }) {
  return (
    <div className="text-right min-w-[54px]">
      <div className="font-semibold">{v.toLocaleString()}</div>
      <div className="text-[11px]  text-muted-foreground">{label}</div>
    </div>
  );
}
