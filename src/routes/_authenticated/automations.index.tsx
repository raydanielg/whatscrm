import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Bot, Workflow, Variable, Activity, Store } from "lucide-react";
import { AiAutomationsPanel } from "@/components/app/automations/ai-automations-panel";
import { WorkflowsList } from "@/components/app/automations/workflows-list";
import { VariableManager } from "@/components/app/automations/variable-manager";
import { WorkflowMonitoring } from "@/components/app/automations/workflow-monitoring";
import { TemplateMarketplace } from "@/components/app/automations/template-marketplace";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/automations/")({
  head: () => ({
    meta: [
      { title: "Automations" },
      {
        name: "description",
        content:
          "Build no-code workflows, AI automations and shared variables for WhatsApp, CRM and integrations.",
      },
      { property: "og:title", content: "Automations" },
      {
        property: "og:description",
        content:
          "Build no-code workflows, AI automations and shared variables for WhatsApp, CRM and integrations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AutomationsPage,
});

type Tab = "ai" | "workflows" | "marketplace" | "variables" | "monitoring";

function AutomationsPage() {
  const [tab, setTab] = React.useState<Tab>("workflows");
  return (
    <>
      <AppTopbar title="Automations" subtitle="AI actions, workflows, and shared variables" />
      <div className="px-4 lg:px-6 pt-4">
        {/* Same tab style as Social Studio. */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
            {[
              { value: "workflows", label: "Workflows", icon: Workflow },
              { value: "marketplace", label: "Marketplace", icon: Store },
              { value: "monitoring", label: "Monitoring", icon: Activity },
              { value: "ai", label: "AI Automations", icon: Bot },
              { value: "variables", label: "Variables", icon: Variable },
            ].map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {tab === "ai" && <AiAutomationsPanel />}
        {tab === "workflows" && <WorkflowsList />}
        {tab === "marketplace" && <TemplateMarketplace />}
        {tab === "variables" && <VariableManager />}
        {tab === "monitoring" && <WorkflowMonitoring />}
      </main>
    </>
  );
}

