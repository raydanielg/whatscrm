import { createFileRoute } from "@tanstack/react-router";
import { ProjectsOverviewPage } from "@/components/app/project-management/project-pages";

export const Route = createFileRoute("/_authenticated/projects/")({
  staticData: { breadcrumb: "Projects" },
  head: () => ({ meta: [{ title: "Projects" }] }),
  component: ProjectsOverviewPage,
});
