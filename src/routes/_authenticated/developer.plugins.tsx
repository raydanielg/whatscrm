import { requireOrgRole } from "@/lib/rbac";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  listMyPlugins,
  upsertMyPlugin,
  publishPluginVersion,
} from "@/lib/plugins/plugins.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Rocket } from "lucide-react";
import { AppTopbar } from "@/components/app/app-topbar";
import { DeveloperOrgSwitcher } from "@/components/app/developer/developer-org-switcher";

export const Route = createFileRoute("/_authenticated/developer/plugins")({
  beforeLoad: requireOrgRole("owner", "admin"),
  staticData: { breadcrumb: "My Plugins" },
  head: () => ({ meta: [{ title: "My Plugins — Developer Console" }] }),
  component: DeveloperPlugins,
});

function DeveloperPlugins() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    slug: "",
    name: "",
    tagline: "",
    description: "",
    category: "productivity",
  });
  const { data, isLoading } = useQuery({
    queryKey: ["my-plugins"],
    queryFn: () => listMyPlugins({}),
  });
  const upsert = useMutation({
    mutationFn: () =>
      upsertMyPlugin({ data: { ...form, tags: [], price_cents: 0, pricing_model: "free" } }),
    onSuccess: () => {
      toast.success("Plugin draft saved");
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["my-plugins"] });
      setForm({
        slug: "",
        name: "",
        tagline: "",
        description: "",
        category: "productivity",
      });
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  return (
    <>
      <AppTopbar
        title="My Plugins"
        subtitle="Build and publish plugins for the the Marketplace."
        actions={
          <div className="flex items-center gap-2">
            <DeveloperOrgSwitcher />
            <Button onClick={() => setCreating(!creating)}>
              <Plus className="size-4 mr-2" />
              New plugin
            </Button>
          </div>
        }
      />
      <div className="container mx-auto max-w-6xl p-6 space-y-6">
        {creating && (
          <Card>
            <CardHeader>
              <CardTitle>Create plugin</CardTitle>
              <p className="text-sm text-muted-foreground">
                This step saves the listing. Add the plugin code as an HTTPS JavaScript bundle when you create a release below.
              </p>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium">Slug</label>
                <Input
                  value={form.slug}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                    }))
                  }
                  placeholder="my-awesome-plugin"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Display name</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="My Awesome Plugin"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium">Tagline</label>
                <Input
                  value={form.tagline}
                  onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
                  placeholder="One-line pitch"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium">Description</label>
                <Textarea
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium">Category</label>
                <select
                  className="h-10 w-full rounded-control border border-input bg-background px-3 text-sm"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                >
                  {[
                    "productivity",
                    "analytics",
                    "ai",
                    "communication",
                    "crm",
                    "commerce",
                    "integration",
                    "developer",
                    "other",
                  ].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2 flex gap-2">
                <Button
                  onClick={() => upsert.mutate()}
                  disabled={upsert.isPending || !form.slug || !form.name}
                >
                  Save draft
                </Button>
                <Button variant="outline" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <p className="text-muted-foreground">Loading</p>
        ) : (data?.plugins ?? []).length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              You haven't created any plugins yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data!.plugins.map((p: any) => (
              <PluginRow
                key={p.id}
                plugin={p}
                onChange={() => qc.invalidateQueries({ queryKey: ["my-plugins"] })}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function PluginRow({ plugin, onChange }: { plugin: any; onChange: () => void }) {
  const [showPublish, setShowPublish] = useState(false);
  const [ver, setVer] = useState({ version: "1.0.0", changelog: "", permissions: "", entryUrl: "" });
  const validEntryUrl = (() => {
    try {
      return new URL(ver.entryUrl).protocol === "https:";
    } catch {
      return false;
    }
  })();
  const publish = useMutation({
    mutationFn: () =>
      publishPluginVersion({
        data: {
          pluginId: plugin.id,
          version: ver.version,
          entry_url: ver.entryUrl.trim(),
          changelog: ver.changelog || undefined,
          permissions: ver.permissions
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          manifest: { slug: plugin.slug, name: plugin.name, version: ver.version },
          is_stable: true,
        },
      }),
    onSuccess: () => {
      toast.success(plugin.status === "published" ? "Plugin update published" : "Release submitted for review");
      setShowPublish(false);
      onChange();
    },
    onError: (e: any) => toast.error(e.message ?? "Publish failed"),
  });
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{plugin.name}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{plugin.slug}</p>
          </div>
          <Badge
            variant={plugin.status === "published" ? "default" : "outline"}
            className="capitalize"
          >
            {plugin.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {plugin.tagline ?? plugin.description ?? "—"}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{plugin.install_count} installs</span>·
          <span>
            {Number(plugin.rating_avg).toFixed(1)}★ ({plugin.rating_count})
          </span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowPublish(!showPublish)}>
            <Rocket className="size-3.5 mr-1.5" />
            Add code release
          </Button>
        </div>
        {showPublish && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs text-muted-foreground">
              Bundle your plugin functions into a CommonJS JavaScript file and host it over HTTPS. The app loads this URL after installation. See the{" "}
              <Link to="/developer-tools/publishing" className="text-primary underline">publishing guide</Link>.
            </p>
            <Input
              placeholder="Semver (e.g. 1.0.0)"
              value={ver.version}
              onChange={(e) => setVer((v) => ({ ...v, version: e.target.value }))}
            />
            <div className="space-y-1">
              <label htmlFor={`plugin-entry-${plugin.id}`} className="text-xs font-medium">Code bundle URL</label>
              <Input
                id={`plugin-entry-${plugin.id}`}
                type="url"
                placeholder="https://example.com/my-plugin.js"
                value={ver.entryUrl}
                onChange={(e) => setVer((v) => ({ ...v, entryUrl: e.target.value }))}
                aria-invalid={ver.entryUrl.length > 0 && !validEntryUrl}
              />
              {ver.entryUrl.length > 0 && !validEntryUrl && (
                <p className="text-xs text-destructive">Enter an HTTPS URL for the built JavaScript file.</p>
              )}
            </div>
            <Textarea
              placeholder="Changelog"
              rows={2}
              value={ver.changelog}
              onChange={(e) => setVer((v) => ({ ...v, changelog: e.target.value }))}
            />
            <Input
              placeholder="Permissions (comma separated)"
              value={ver.permissions}
              onChange={(e) => setVer((v) => ({ ...v, permissions: e.target.value }))}
            />
            <Button size="sm" onClick={() => publish.mutate()} disabled={publish.isPending || !validEntryUrl}>
              {plugin.status === "published" ? "Publish update" : "Submit for review"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
