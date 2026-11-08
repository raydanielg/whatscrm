import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { TaskKanban } from "@/components/app/tasks/task-kanban";

export const Route = createFileRoute("/_authenticated/tasks")({
  validateSearch: (search: Record<string, unknown>) => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
  component: TasksPage,
  head: () => ({
    meta: [{ title: "Tasks" }],
  }),
});

function TasksPage() {
  return (
    <>
      <AppTopbar title="Tasks" subtitle="Track open, in-progress, completed and cancelled tasks" />
      <main className="p-4 md:p-6 space-y-6 w-full">
        <TaskKanban />
      </main>
    </>
  );
}
