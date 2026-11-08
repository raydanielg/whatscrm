import { createFileRoute } from "@tanstack/react-router";
import { ProjectDetailPage } from "@/components/app/project-management/project-detail-page";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  validateSearch: (search: Record<string, unknown>) => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
  staticData: { breadcrumb: "Project" },
  head: () => ({ meta: [{ title: "Project" }] }),
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
  return <ProjectDetailPage projectId={projectId} />;
}
