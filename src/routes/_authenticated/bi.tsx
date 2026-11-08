import { lazy, Suspense } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import {
  LayoutDashboard,
  FileBarChart,
  Clock,
  TrendingUp,
  Briefcase,
  MessageSquare,
  Megaphone,
  Sparkles,
  LayoutGrid,
  Download,
} from "lucide-react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useBiRealtime } from "@/hooks/use-bi-realtime";
import { BiHealthStrip } from "@/components/app/bi/bi-health-strip";
import { listReports } from "@/lib/bi/bi.functions";

// Executive dashboard is the default tab — keep eager so first paint has real content.
import { ExecutiveDashboard } from "@/components/app/bi/executive-dashboard";

// Everything else is split so the initial BI bundle stays small.
const DashboardManager = lazy(() =>
  import("@/components/app/bi/dashboard-manager").then((m) => ({ default: m.DashboardManager })),
);
const WhatsAppAnalytics = lazy(() =>
  import("@/components/app/bi/whatsapp-analytics").then((m) => ({ default: m.WhatsAppAnalytics })),
);
const CrmSalesAnalytics = lazy(() =>
  import("@/components/app/bi/crm-sales-analytics").then((m) => ({ default: m.CrmSalesAnalytics })),
);
const MarketingAnalytics = lazy(() =>
  import("@/components/app/bi/marketing-analytics").then((m) => ({
    default: m.MarketingAnalytics,
  })),
);
const AiAutomationAnalytics = lazy(() =>
  import("@/components/app/bi/ai-automation-analytics").then((m) => ({
    default: m.AiAutomationAnalytics,
  })),
);
const CustomReportBuilder = lazy(() =>
  import("@/components/app/bi/custom-report-builder").then((m) => ({
    default: m.CustomReportBuilder,
  })),
);
const BiForecastWidget = lazy(() =>
  import("@/components/app/bi/bi-forecast-widget").then((m) => ({ default: m.BiForecastWidget })),
);
const BiScheduledReports = lazy(() =>
  import("@/components/app/bi/bi-scheduled-reports").then((m) => ({
    default: m.BiScheduledReports,
  })),
);
const DownloadCenter = lazy(() =>
  import("@/components/app/bi/download-center").then((m) => ({ default: m.DownloadCenter })),
);

const TAB_IDS = [
  "executive",
  "dashboards",
  "whatsapp",
  "crm-sales",
  "marketing",
  "ai-automation",
  "reports",
  "forecasts",
  "schedules",
  "downloads",
] as const;
type Tab = (typeof TAB_IDS)[number];

const searchSchema = z.object({
  tab: z.enum(TAB_IDS).catch("executive").default("executive"),
});

export const Route = createFileRoute("/_authenticated/bi")({
  staticData: { breadcrumb: "Business Intelligence" },
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Business Intelligence" },
      {
        name: "description",
        content:
          "Real-time BI: executive KPIs, dashboards, WhatsApp analytics, CRM & sales, marketing, AI, forecasts, and scheduled reports.",
      },
    ],
  }),
  component: BiHub,
});

const TABS: { id: Tab; label: string; icon: typeof LayoutDashboard; hint: string }[] = [
  { id: "executive", label: "Executive", icon: LayoutDashboard, hint: "Executive KPIs" },
  { id: "dashboards", label: "Dashboards", icon: LayoutGrid, hint: "Custom dashboards" },
  { id: "whatsapp", label: "WhatsApp", icon: MessageSquare, hint: "Conversation analytics" },
  { id: "crm-sales", label: "CRM & Sales", icon: Briefcase, hint: "Pipeline & revenue" },
  { id: "marketing", label: "Marketing", icon: Megaphone, hint: "Campaign performance" },
  {
    id: "ai-automation",
    label: "AI & Automation",
    icon: Sparkles,
    hint: "AI & workflow analytics",
  },
  { id: "reports", label: "Reports", icon: FileBarChart, hint: "Custom reports" },
  { id: "forecasts", label: "Forecasts", icon: TrendingUp, hint: "Predictive forecasts" },
  { id: "schedules", label: "Schedules", icon: Clock, hint: "Scheduled reports" },
  { id: "downloads", label: "Downloads", icon: Download, hint: "Download history" },
];

function BiHub() {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id ?? "";
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  useBiRealtime(workspaceId);

  const list = useServerFn(listReports);
  const { data: reports } = useQuery(
    queryOptions({
      queryKey: ["bi.reports.min", workspaceId],
      enabled: !!workspaceId,
      queryFn: () => list({ data: { workspaceId } }),
      staleTime: 60_000,
    }),
  );

  const setTab = (id: Tab) => navigate({ search: (prev: { tab: Tab }) => ({ ...prev, tab: id }) });

  return (
    <>
      <AppTopbar
        title="Business Intelligence"
        subtitle="Real-time analytics, reports, and forecasts"
      />
      <div className="border-b border-border">
        <ScrollArea orientation="horizontal" type="hover" className="w-full">
          <div
            role="tablist"
            aria-label="Business Intelligence sections"
            aria-orientation="horizontal"
            className="flex w-max items-center gap-1 px-6"
          >
            {TABS.map((t) => {
              const selected = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`bi-panel-${t.id}`}
                  id={`bi-tab-${t.id}`}
                  tabIndex={selected ? 0 : -1}
                  title={t.hint}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors rounded-none whitespace-nowrap ${
                    selected
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <t.icon className="w-4 h-4" aria-hidden="true" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {workspaceId && <BiHealthStrip workspaceId={workspaceId} />}

        <section
          role="tabpanel"
          id={`bi-panel-${tab}`}
          aria-labelledby={`bi-tab-${tab}`}
          tabIndex={0}
          className="focus-visible:outline-none"
        >
          {!workspaceId ? (
            <p className="text-sm text-muted-foreground">Select a workspace to view BI.</p>
          ) : (
            <Suspense fallback={<TabSkeleton />}>
              {tab === "executive" && <ExecutiveDashboard workspaceId={workspaceId} />}
              {tab === "dashboards" && <DashboardManager workspaceId={workspaceId} />}
              {tab === "whatsapp" && <WhatsAppAnalytics workspaceId={workspaceId} />}
              {tab === "crm-sales" && <CrmSalesAnalytics workspaceId={workspaceId} />}
              {tab === "marketing" && <MarketingAnalytics workspaceId={workspaceId} />}
              {tab === "ai-automation" && <AiAutomationAnalytics workspaceId={workspaceId} />}
              {tab === "reports" && <CustomReportBuilder workspaceId={workspaceId} />}
              {tab === "forecasts" && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <BiForecastWidget
                    workspaceId={workspaceId}
                    metric="deals.revenue"
                    title="Revenue forecast"
                  />
                  <BiForecastWidget
                    workspaceId={workspaceId}
                    metric="conversations.total"
                    title="Conversations forecast"
                  />
                  <BiForecastWidget
                    workspaceId={workspaceId}
                    metric="leads.new"
                    title="New leads forecast"
                  />
                  <BiForecastWidget
                    workspaceId={workspaceId}
                    metric="ai.cost"
                    title="AI cost forecast"
                  />
                </div>
              )}
              {tab === "schedules" && (
                <BiScheduledReports
                  workspaceId={workspaceId}
                  reports={(reports ?? []).map((r) => ({ id: r.id, name: r.name }))}
                />
              )}
              {tab === "downloads" && <DownloadCenter workspaceId={workspaceId} />}
            </Suspense>
          )}
        </section>
      </main>
    </>
  );
}

function TabSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    </div>
  );
}
