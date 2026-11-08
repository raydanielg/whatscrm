import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/integrations/settings")({
  component: IntegrationsSettingsPage,
  head: () => ({
    meta: [
      { title: "Integration Settings" },
      { name: "description", content: "Configure global preferences for the integrations platform." },
    ],
  }),
});

function IntegrationsSettingsPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Global preferences</CardTitle>
          <CardDescription>Defaults applied to every connected provider.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="auto-sync">Auto-sync on install</Label>
              <p className="text-xs text-muted-foreground">Trigger an initial sync as soon as a provider is connected.</p>
            </div>
            <Switch id="auto-sync" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="notify-failures">Notify on failures</Label>
              <p className="text-xs text-muted-foreground">Email workspace admins when a provider's sync repeatedly fails.</p>
            </div>
            <Switch id="notify-failures" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="sandbox">Sandbox mode</Label>
              <p className="text-xs text-muted-foreground">Route provider calls to sandbox endpoints when available.</p>
            </div>
            <Switch id="sandbox" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
