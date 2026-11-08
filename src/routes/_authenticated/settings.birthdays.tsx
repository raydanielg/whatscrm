import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { BirthdayRemindersPanel } from "@/components/app/settings/birthday-reminders-panel";

export const Route = createFileRoute("/_authenticated/settings/birthdays")({
  component: BirthdayRemindersSettings,
  head: () => ({
    meta: [
      { title: "Birthday Reminders — Account Settings" },
      { name: "description", content: "Automate birthday greetings and manage reminder schedules for your contacts." },
      { property: "og:title", content: "Birthday Reminders — Account Settings" },
      { property: "og:description", content: "Automate birthday greetings and manage reminder schedules for your contacts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function BirthdayRemindersSettings() {
  return (
    <>
      <AppTopbar title="Birthday reminders" subtitle="Automated birthday greetings for your contacts" />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <BirthdayRemindersPanel />
      </main>
    </>
  );
}
