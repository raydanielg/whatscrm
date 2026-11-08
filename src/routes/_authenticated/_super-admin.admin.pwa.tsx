import { BRAND_NAME } from "@/lib/branding/brand";
import { useBrandName } from "@/hooks/use-brand-name";
import { ImageDropUpload } from "@/components/branding/image-drop-upload";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Save, Smartphone, Image as ImageIcon, ExternalLink } from "lucide-react";
import {
  getPlatformSettings,
  updatePlatformSetting,
} from "@/lib/admin/platform-settings.functions";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/pwa")({
  staticData: { breadcrumb: "PWA" },
  head: () => ({
    meta: [{ title: "Super Admin — PWA Settings" }, { name: "robots", content: "noindex" }],
  }),
  component: PwaSettingsPage,
});

type PwaCfg = {
  name?: string;
  short_name?: string;
  description?: string;
  theme_color?: string;
  background_color?: string;
  start_url?: string;
  scope?: string;
  display?: "standalone" | "fullscreen" | "minimal-ui" | "browser";
  orientation?: "any" | "portrait" | "landscape";
  icon_url?: string;
  icon_512_url?: string;
  splash_icon_url?: string;
  shortcut_icon_url?: string;
};

const DEFAULTS: PwaCfg = {
  name: `${BRAND_NAME}`,
  short_name: `${BRAND_NAME}`,
  description: "The AI-Powered WhatsApp CRM Platform",
  theme_color: "#075E54",
  background_color: "#ffffff",
  start_url: "/",
  scope: "/",
  display: "standalone",
  orientation: "any",
  icon_url: "/icon-192.png",
  icon_512_url: "/icon-512.png",
  splash_icon_url: "/icon-512.png",
  shortcut_icon_url: "/icon-192.png",
};

function PwaSettingsPage() {
  const brandName = useBrandName();
  const qc = useQueryClient();
  const getFn = useServerFn(getPlatformSettings);
  const setFn = useServerFn(updatePlatformSetting);

  const q = useQuery({ queryKey: ["admin", "platform-settings"], queryFn: () => getFn() });
  const saved = ((q.data?.pwa?.value as PwaCfg | undefined) ?? {}) as PwaCfg;
  const dynamicDefaults = useMemo(
    () => ({ ...DEFAULTS, name: brandName, short_name: brandName }),
    [brandName],
  );
  const [d, setD] = useState<PwaCfg>({ ...dynamicDefaults, ...saved });

  useEffect(() => {
    setD({ ...dynamicDefaults, ...saved });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, dynamicDefaults]);

  const save = useMutation({
    mutationFn: () => setFn({ data: { key: "pwa", value: d as Record<string, unknown> } }),
    onSuccess: () => {
      toast.success("PWA settings saved. Manifest will refresh within 5 minutes.");
      qc.invalidateQueries({ queryKey: ["admin", "platform-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = (p: Partial<PwaCfg>) => setD((prev) => ({ ...prev, ...p }));

  return (
    <AdminPageShell
      title="Progressive Web App"
      description={`Control how ${brandName} installs on phones, tablets, and desktops. Uploaded icons feed the manifest, install prompts, splash screens, and shortcuts.`}
    >
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="h-4 w-4" />
              Identity
            </CardTitle>
            <CardDescription>
              Names shown on the home screen, app switcher, and install prompt.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="App name">
              <Input
                value={d.name ?? ""}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder={brandName}
              />
            </Field>
            <Field label="Short name">
              <Input
                value={d.short_name ?? ""}
                onChange={(e) => patch({ short_name: e.target.value })}
                placeholder={brandName}
              />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Textarea
                value={d.description ?? ""}
                onChange={(e) => patch({ description: e.target.value })}
                rows={2}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ImageIcon className="h-4 w-4" />
              Icons & Splash
            </CardTitle>
            <CardDescription>
              Paste absolute URLs (e.g. from your uploaded assets). PNG recommended. Icons drive the
              manifest, install prompt, home screen icon, splash screen, and shortcuts.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <IconField
              label="App icon (192×192)"
              url={d.icon_url ?? ""}
              onChange={(v) => patch({ icon_url: v })}
            />
            <IconField
              label="Large icon (512×512)"
              url={d.icon_512_url ?? ""}
              onChange={(v) => patch({ icon_512_url: v })}
            />
            <IconField
              label="Splash icon (maskable, 512×512)"
              url={d.splash_icon_url ?? ""}
              onChange={(v) => patch({ splash_icon_url: v })}
            />
            <IconField
              label="Shortcut icon (192×192)"
              url={d.shortcut_icon_url ?? ""}
              onChange={(v) => patch({ shortcut_icon_url: v })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Appearance</CardTitle>
            <CardDescription>
              Colors surface the app on Android splash, tab bars, and installed window chrome.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Theme color">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Theme color"
                  value={d.theme_color ?? "#075E54"}
                  onChange={(e) => patch({ theme_color: e.target.value })}
                  className="h-9 w-12 rounded  border-input bg-background"
                />
                <Input
                  value={d.theme_color ?? ""}
                  onChange={(e) => patch({ theme_color: e.target.value })}
                />
              </div>
            </Field>
            <Field label="Background color">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Background color"
                  value={d.background_color ?? "#ffffff"}
                  onChange={(e) => patch({ background_color: e.target.value })}
                  className="h-9 w-12 rounded  border-input bg-background"
                />
                <Input
                  value={d.background_color ?? ""}
                  onChange={(e) => patch({ background_color: e.target.value })}
                />
              </div>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Behavior</CardTitle>
            <CardDescription>
              Where the app opens and how it displays when launched.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Start URL">
              <Input
                value={d.start_url ?? "/"}
                onChange={(e) => patch({ start_url: e.target.value })}
                placeholder="/"
              />
            </Field>
            <Field label="Scope">
              <Input
                value={d.scope ?? "/"}
                onChange={(e) => patch({ scope: e.target.value })}
                placeholder="/"
              />
            </Field>
            <Field label="Display mode">
              <Select
                value={d.display ?? "standalone"}
                onValueChange={(v) => patch({ display: v as PwaCfg["display"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standalone">Standalone (recommended)</SelectItem>
                  <SelectItem value="fullscreen">Fullscreen</SelectItem>
                  <SelectItem value="minimal-ui">Minimal UI</SelectItem>
                  <SelectItem value="browser">Browser</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Orientation">
              <Select
                value={d.orientation ?? "any"}
                onValueChange={(v) => patch({ orientation: v as PwaCfg["orientation"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="portrait">Portrait</SelectItem>
                  <SelectItem value="landscape">Landscape</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <a
            href="/api/public/manifest.webmanifest"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            View live manifest <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
            <Save className="h-4 w-4" />
            {save.isPending ? "Saving" : "Save PWA settings"}
          </Button>
        </div>
      </div>
    </AdminPageShell>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function IconField({
  label,
  url,
  onChange,
}: {
  label: string;
  url: string;
  onChange: (v: string) => void;
}) {
  return (
    <ImageDropUpload
      label={label}
      value={url}
      onChange={onChange}
      scope={{ kind: "platform" }}
      slot={
        label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "pwa-icon"
      }
      hint="PNG recommended · transparent background"
    />
  );
}
