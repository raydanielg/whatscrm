import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { MonitoringDashboard, MonitoringTabs, type TabId } from "@/components/app/monitoring/monitoring-dashboard";

export const Route = createFileRoute("/_authenticated/monitoring")({
  component: MonitoringPage,
});

function MonitoringPage() {
  const [tab, setTab] = useState<TabId>("overview");
  return (
    <>
      <AppTopbar title="Monitoring" subtitle="Realtime observability for the messaging platform" />
      <MonitoringTabs tab={tab} onChange={setTab} />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <MonitoringDashboard tab={tab} />
      </main>
    </>
  );
}
