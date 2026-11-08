import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { ExportCenter } from "@/components/app/exports/export-center";

export const Route = createFileRoute("/_authenticated/exports")({
  staticData: { breadcrumb: "Export Center" },
  head: () => ({ meta: [{ title: "Export Center" }, { name: "description", content: "Generate professional PDF, Excel, CSV and JSON exports of reports, CRM data, campaigns and conversations." }] }),
  component: ExportsPage,
});

function ExportsPage() {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id ?? "";
  const { isAdmin } = useWorkspaceRole(workspaceId);

  return (
    <div className="flex flex-1 flex-col">
      <AppTopbar title="Export Center" />
      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-7xl w-full mx-auto">
        {workspaceId ? (
          <ExportCenter workspaceId={workspaceId} canManage={isAdmin} />
        ) : (
          <p className="text-sm text-muted-foreground">Select a workspace to continue.</p>
        )}
      </div>
    </div>
  );
}
