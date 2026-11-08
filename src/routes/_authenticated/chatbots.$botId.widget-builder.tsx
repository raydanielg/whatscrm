import { Brand } from "@/components/brand";
import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getWidgetConfig, saveWidgetConfig } from "@/lib/widget/widget-builder.functions";
import { DEFAULT_WIDGET_CONFIG, type WidgetConfig } from "@/lib/widget/widget-config";
import { LiveChatWidgetPreview } from "@/components/app/widget/live-chat-widget-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Save,
  RotateCcw,
  ArrowLeft,
  Paintbrush,
  Layout,
  MessageSquare,
  Type,
  Sparkles,
  Code,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/chatbots/$botId/widget-builder")({
  head: () => ({
    meta: [
      { title: "Widget Builder" },
      {
        name: "description",
        content: "Design your live chat widget visually with a real-time preview.",
      },
    ],
  }),
  component: WidgetBuilderPage,
});

function WidgetBuilderPage() {
  const { botId } = useParams({ from: "/_authenticated/chatbots/$botId/widget-builder" });
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["widget-config", botId],
    queryFn: () => getWidgetConfig({ data: { chatbotId: botId } }),
  });

  const [config, setConfig] = useState<WidgetConfig | null>(null);
  useEffect(() => {
    if (q.data && !config) setConfig(q.data.config);
  }, [q.data, config]);

  const save = useMutation({
    mutationFn: (c: WidgetConfig) => saveWidgetConfig({ data: { chatbotId: botId, config: c } }),
    onSuccess: () => {
      toast.success("Widget saved");
      qc.invalidateQueries({ queryKey: ["widget-config", botId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading || !config) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const update = <K extends keyof WidgetConfig>(k: K, v: WidgetConfig[K]) =>
    setConfig((c) => (c ? { ...c, [k]: v } : c));

  return (
    <div className="flex flex-col h-full">
      <AppTopbar
        title="Widget Builder"
        subtitle={q.data?.chatbotName ?? ""}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/chatbots/$botId" params={{ botId }}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfig({ ...DEFAULT_WIDGET_CONFIG })}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
            <Button size="sm" onClick={() => save.mutate(config)} disabled={save.isPending}>
              {save.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save
            </Button>
          </div>
        }
      />
      <div className="border-b border-border bg-amber-500/10 px-4 py-2 text-xs text-muted-foreground flex items-center justify-between gap-4">
        <span>
          Appearance এখন Chat Widgets-এ manage করা হয়। এই পেজের পরিবর্তন শুধু এই বটের নিজস্ব
          সেটিংসে যায়।
        </span>
        <Button asChild variant="link" size="sm">
          <Link to="/widgets">Chat Widgets খুলুন</Link>
        </Button>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 min-h-0">
        {/* Controls */}
        <div className="lg:col-span-2 border-r border-border overflow-y-auto p-4">
          <Tabs defaultValue="brand">
            <TabsList className="grid grid-cols-5 w-full">
              <TabsTrigger value="brand">
                <Paintbrush className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="layout">
                <Layout className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="content">
                <MessageSquare className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="typography">
                <Type className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="advanced">
                <Code className="h-4 w-4" />
              </TabsTrigger>
            </TabsList>

            <TabsContent value="brand" className="space-y-4 mt-4">
              <Field label="Logo URL">
                <Input
                  value={config.logoUrl ?? ""}
                  onChange={(e) => update("logoUrl", e.target.value || null)}
                  placeholder="https:///logo.png"
                />
              </Field>
              <Field label="Agent avatar URL">
                <Input
                  value={config.agentAvatarUrl ?? ""}
                  onChange={(e) => update("agentAvatarUrl", e.target.value || null)}
                  placeholder="https:///avatar.png"
                />
              </Field>
              <Field label="Agent name">
                <Input
                  value={config.agentName}
                  onChange={(e) => update("agentName", e.target.value)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Brand color">
                  <ColorInput value={config.brandColor} onChange={(v) => update("brandColor", v)} />
                </Field>
                <Field label="Brand text color">
                  <ColorInput
                    value={config.brandTextColor}
                    onChange={(v) => update("brandTextColor", v)}
                  />
                </Field>
              </div>
              <Field label="Theme">
                <Select
                  value={config.theme}
                  onValueChange={(v) => update("theme", v as WidgetConfig["theme"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </TabsContent>

            <TabsContent value="layout" className="space-y-4 mt-4">
              <Field label={`Rounded corners: ${config.radius}px`}>
                <Slider
                  min={0}
                  max={32}
                  step={1}
                  value={[config.radius]}
                  onValueChange={([v]) => update("radius", v)}
                />
              </Field>
              <Field label="Chat bubble style">
                <Select
                  value={config.bubbleStyle}
                  onValueChange={(v) => update("bubbleStyle", v as WidgetConfig["bubbleStyle"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rounded">Rounded</SelectItem>
                    <SelectItem value="sharp">Sharp</SelectItem>
                    <SelectItem value="tail">Tail</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Launcher position">
                <Select
                  value={config.launcherPosition}
                  onValueChange={(v) =>
                    update("launcherPosition", v as WidgetConfig["launcherPosition"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bottom-right">Bottom right</SelectItem>
                    <SelectItem value="bottom-left">Bottom left</SelectItem>
                    <SelectItem value="top-right">Top right</SelectItem>
                    <SelectItem value="top-left">Top left</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Launcher icon">
                <Select
                  value={config.launcherIcon}
                  onValueChange={(v) => update("launcherIcon", v as WidgetConfig["launcherIcon"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chat">Chat</SelectItem>
                    <SelectItem value="message">Message</SelectItem>
                    <SelectItem value="sparkles">Sparkles</SelectItem>
                    <SelectItem value="help">Help</SelectItem>
                    <SelectItem value="life">Life ring</SelectItem>
                    <SelectItem value="custom">Custom image</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {config.launcherIcon === "custom" && (
                <Field label="Custom icon URL">
                  <Input
                    value={config.launcherIconUrl ?? ""}
                    onChange={(e) => update("launcherIconUrl", e.target.value || null)}
                  />
                </Field>
              )}
              <Field label="Launcher label (optional)">
                <Input
                  value={config.launcherLabel ?? ""}
                  onChange={(e) => update("launcherLabel", e.target.value || null)}
                  placeholder="Chat with us"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Width: ${config.width}px`}>
                  <Slider
                    min={280}
                    max={560}
                    step={10}
                    value={[config.width]}
                    onValueChange={([v]) => update("width", v)}
                  />
                </Field>
                <Field label={`Height: ${config.height}px`}>
                  <Slider
                    min={360}
                    max={900}
                    step={10}
                    value={[config.height]}
                    onValueChange={([v]) => update("height", v)}
                  />
                </Field>
              </div>
              <Field label="Animation">
                <Select
                  value={config.animation}
                  onValueChange={(v) => update("animation", v as WidgetConfig["animation"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slide">Slide up</SelectItem>
                    <SelectItem value="fade">Fade</SelectItem>
                    <SelectItem value="scale">Scale</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </TabsContent>

            <TabsContent value="content" className="space-y-4 mt-4">
              <Field label="Welcome title">
                <Input
                  value={config.welcomeTitle}
                  onChange={(e) => update("welcomeTitle", e.target.value)}
                />
              </Field>
              <Field label="Welcome subtitle">
                <Input
                  value={config.welcomeSubtitle}
                  onChange={(e) => update("welcomeSubtitle", e.target.value)}
                />
              </Field>
              <Field label="Welcome message">
                <RichTextarea
                  rows={3}
                  value={config.welcomeMessage}
                  onChange={(v) => update("welcomeMessage", v)}
                />
              </Field>
              <Field label="Input placeholder">
                <Input
                  value={config.inputPlaceholder}
                  onChange={(e) => update("inputPlaceholder", e.target.value)}
                />
              </Field>
              <div className="flex items-center justify-between rounded-control border border-border p-3">
                <div>
                  <div className="text-sm font-medium">Show branding footer</div>
                  <div className="text-xs text-muted-foreground">
                    "Powered by <Brand />"
                  </div>
                </div>
                <Switch
                  checked={config.showBrandingFooter}
                  onCheckedChange={(v) => update("showBrandingFooter", v)}
                />
              </div>
              <div className="flex items-center justify-between rounded-control border border-border p-3">
                <div>
                  <div className="text-sm font-medium">Sound on new message</div>
                  <div className="text-xs text-muted-foreground">
                    Ping visitors when a reply arrives
                  </div>
                </div>
                <Switch
                  checked={config.soundEnabled}
                  onCheckedChange={(v) => update("soundEnabled", v)}
                />
              </div>
            </TabsContent>

            <TabsContent value="typography" className="space-y-4 mt-4">
              <Field label="Font family (CSS stack)">
                <Input
                  value={config.fontFamily}
                  onChange={(e) => update("fontFamily", e.target.value)}
                />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                {["Inter", "Poppins", "Roboto", "System UI", "Georgia", "Space Grotesk"].map(
                  (name) => (
                    <Button
                      key={name}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => update("fontFamily", `${name}, system-ui, sans-serif`)}
                    >
                      {name}
                    </Button>
                  ),
                )}
              </div>
              <Field label={`Base font size: ${config.fontSizeBase}px`}>
                <Slider
                  min={10}
                  max={20}
                  step={1}
                  value={[config.fontSizeBase]}
                  onValueChange={([v]) => update("fontSizeBase", v)}
                />
              </Field>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4 mt-4">
              <div className="rounded-control border border-border p-3 bg-muted/30 text-xs text-muted-foreground flex gap-2">
                <Sparkles className="h-4 w-4 flex-shrink-0" />
                Custom CSS/JS runs inside the widget iframe only — it can't reach your site's DOM.
              </div>
              <Field label="Custom CSS">
                <Textarea
                  rows={6}
                  className="font-mono text-xs"
                  value={config.customCss}
                  onChange={(e) => update("customCss", e.target.value)}
                  placeholder=".widget-header { background: navy; }"
                />
              </Field>
              <Field label="Custom JavaScript">
                <Textarea
                  rows={6}
                  className="font-mono text-xs"
                  value={config.customJs}
                  onChange={(e) => update("customJs", e.target.value)}
                  placeholder="widget.onOpen(() => console.log('opened'));"
                />
              </Field>
            </TabsContent>
          </Tabs>
        </div>

        {/* Preview */}
        <div className="lg:col-span-3 relative bg-muted/30 overflow-hidden">
          <div
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, hsl(var(--border)) 1px, transparent 0)",
              backgroundSize: "24px 24px",
            }}
          />
          <div className="relative h-full flex items-center justify-center p-6">
            <div className="relative w-full max-w-4xl h-[720px] rounded-control border border-border bg-background overflow-hidden shadow-sm">
              <div className="h-9 border-b border-border bg-muted/50 flex items-center gap-1.5 px-3">
                <div className="h-3 w-3 rounded-full bg-red-400" />
                <div className="h-3 w-3 rounded-full bg-yellow-400" />
                <div className="h-3 w-3 rounded-full bg-green-400" />
                <div className="ml-3 text-xs text-muted-foreground">yourwebsite.com</div>
              </div>
              <div className="relative h-[calc(100%-2rem)] p-8 overflow-hidden">
                <div className="text-3xl font-bold mb-4">Your website</div>
                <div className="text-muted-foreground max-w-md">
                  This is a preview of how your widget appears to visitors. Adjust settings on the
                  left — everything updates live.
                </div>
                <LiveChatWidgetPreview config={config} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-9 w-12 rounded  border-input bg-background cursor-pointer"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono text-xs"
      />
    </div>
  );
}
