import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { TaskRemindersPanel } from "@/components/app/settings/task-reminders-panel";

export const Route = createFileRoute("/_authenticated/settings/task-reminders")({
  component: TaskRemindersSettings,
  head: () => ({
    meta: [
      { title: "Task Reminders — Account Settings" },
      { name: "description", content: "Configure reminder schedules and notifications for your team's tasks." },
      { property: "og:title", content: "Task Reminders — Account Settings" },
      { property: "og:description", content: "Configure reminder schedules and notifications for your team's tasks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function TaskRemindersSettings() {
  return (
    <>
      <AppTopbar title="Task reminders" subtitle="Stay on top of due and overdue tasks" />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <TaskRemindersPanel />
      </main>
    </>
  );
}
