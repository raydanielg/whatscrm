import { createFileRoute } from "@tanstack/react-router";
import { ProjectTasksPage } from "@/components/app/project-management/project-pages";

export const Route = createFileRoute("/_authenticated/projects/tasks")({
  staticData: { breadcrumb: "Project tasks" },
  head: () => ({ meta: [{ title: "Project tasks" }] }),
  component: () => <ProjectTasksPage view="list" />,
});
