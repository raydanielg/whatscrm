import { createFileRoute } from "@tanstack/react-router";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnnouncementsManager } from "@/components/admin/comms/announcements-manager";
import { ReleaseNotesManager } from "@/components/admin/comms/release-notes-manager";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/announcements")({
  head: () => ({ meta: [{ title: "Super Admin — Communications" }, { name: "robots", content: "noindex" }] }),
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
  return (
    <AdminPageShell
      title="Announcements & Notices"
      description="Broadcast platform news, maintenance windows, and product updates. Multi-language across every tenant."
    >
      <Tabs defaultValue="announcements" className="space-y-4">
        <TabsList>
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="releases">Release notes</TabsTrigger>
        </TabsList>
        <TabsContent value="announcements">
          <AnnouncementsManager kind="announcement" />
        </TabsContent>
        <TabsContent value="maintenance">
          <AnnouncementsManager kind="maintenance" />
        </TabsContent>
        <TabsContent value="releases">
          <ReleaseNotesManager />
        </TabsContent>
      </Tabs>
    </AdminPageShell>
  );
}
