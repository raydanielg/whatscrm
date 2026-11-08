import { createFileRoute } from "@tanstack/react-router";
import { ProjectTasksPage } from "@/components/app/project-management/project-pages";

export const Route = createFileRoute("/_authenticated/projects/board")({
  staticData: { breadcrumb: "Kanban board" },
  head: () => ({ meta: [{ title: "Kanban board" }] }),
  component: () => <ProjectTasksPage view="board" />,
});
