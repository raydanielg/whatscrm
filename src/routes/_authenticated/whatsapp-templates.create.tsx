import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { WhatsAppTemplatesPanel } from "@/components/app/whatsapp/whatsapp-templates-panel";

export const Route = createFileRoute("/_authenticated/whatsapp-templates/create")({
  staticData: { breadcrumb: "Create" },
  head: () => ({ meta: [{ title: "Create Meta Template" }] }),
  component: CreateMetaTemplatePage,
});

/** Both entry points use the editor that uploads media to Meta and actually
 * submits via the server. The former wizard only inserted a local pending row.
 */
function CreateMetaTemplatePage() {
  return (
    <>
      <AppTopbar title="Create Meta Template" subtitle="Upload media, save a draft, or submit to WhatsApp for review" />
      <main className="p-6 max-w-7xl w-full mx-auto">
        <WhatsAppTemplatesPanel createOnMount />
      </main>
    </>
  );
}
