import { createFileRoute } from "@tanstack/react-router";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotificationsBroadcaster } from "@/components/admin/comms/notifications-broadcaster";
import { SystemTemplatesManager } from "@/components/admin/comms/system-templates-manager";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/communications")({
  head: () => ({ meta: [{ title: "Super Admin — Communications" }, { name: "robots", content: "noindex" }] }),
  component: CommunicationsPage,
});

function CommunicationsPage() {
  return (
    <AdminPageShell
      title="Communications"
      description="Send platform-wide notifications and manage transactional system message templates. Every message supports multi-language delivery."
    >
      <Tabs defaultValue="broadcast" className="space-y-4">
        <TabsList>
          <TabsTrigger value="broadcast">Broadcast</TabsTrigger>
          <TabsTrigger value="templates">System messages</TabsTrigger>
        </TabsList>
        <TabsContent value="broadcast">
          <NotificationsBroadcaster />
        </TabsContent>
        <TabsContent value="templates">
          <SystemTemplatesManager />
        </TabsContent>
      </Tabs>
    </AdminPageShell>
  );
}
