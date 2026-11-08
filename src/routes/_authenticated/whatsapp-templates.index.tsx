import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { WhatsAppTemplatesPanel } from "@/components/app/whatsapp/whatsapp-templates-panel";

export const Route = createFileRoute("/_authenticated/whatsapp-templates/")({
  staticData: { breadcrumb: "WhatsApp Templates" },
  head: () => ({
    meta: [
      { title: "WhatsApp Templates" },
      {
        name: "description",
        content:
          "Manage WhatsApp Cloud API message templates — Marketing, Utility and Authentication categories, media & interactive templates, merge fields, and language variants.",
      },
    ],
  }),
  component: WhatsAppTemplatesPage,
});

function WhatsAppTemplatesPage() {
  return (
    <>
      <AppTopbar
        title="WhatsApp Templates"
        subtitle="Marketing, Utility and Authentication templates synced with the official WhatsApp Cloud API"
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <WhatsAppTemplatesPanel />
      </main>
    </>
  );
}
