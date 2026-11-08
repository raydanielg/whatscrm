import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Loader2,
  Save,
  Plus,
  X,
  ChevronLeft,
  Code2,
  Palette,
  Route as RouteIcon,
  BarChart3,
  CalendarClock,
  AlertTriangle,
} from "lucide-react";
import { getChatWidget, updateChatWidget, type RoutingRule } from "@/lib/widgets/widgets.functions";
import { listChatbots, bulkUpdateChatbotStatus } from "@/lib/chatbots/chatbots.functions";
import { DEFAULT_WIDGET_CONFIG, type WidgetConfig } from "@/lib/widget/widget-config";
import { DEFAULT_SCHEDULE, evaluateSchedule, type WidgetSchedule } from "@/lib/widgets/schedule";
import { InstallSnippetGenerator } from "@/components/widgets/install-snippet-generator";
import { WidgetAnalyticsDashboard } from "@/components/widgets/analytics-dashboard";
import { WidgetAppearancePreview } from "@/components/widgets/appearance-preview";
import { RoutingRuleTester } from "@/components/widgets/routing-rule-tester";
import { WidgetScheduleEditor } from "@/components/widgets/schedule-editor";

export const Route = createFileRoute("/_authenticated/widgets_/$widgetId")({
  head: () => ({
    meta: [
      { title: "Widget — Chat Widgets" },
      {
        name: "description",
        content:
          "Configure appearance, routing, install snippet, and analytics for this chat widget.",
      },
    ],
  }),
  loader: ({ params }) => ({
    breadcrumbs: [
      { label: "Extensions" },
      { label: "Chat Widgets", to: "/widgets" },
      { label: params.widgetId.slice(0, 8) },
    ],
  }),
  component: WidgetDetailPage,
});

function WidgetDetailPage() {
  const { widgetId } = Route.useParams();
  const qc = useQueryClient();
  const widgetQ = useQuery({
    queryKey: ["chat-widget", widgetId],
    queryFn: () => getChatWidget({ data: { widgetId } }),
  });

  const w = widgetQ.data;
  const [name, setName] = useState("");
  const [chatbotId, setChatbotId] = useState<string>("");
  const [config, setConfig] = useState<WidgetConfig>(DEFAULT_WIDGET_CONFIG);
  const [schedule, setSchedule] = useState<WidgetSchedule>(DEFAULT_SCHEDULE);
  const [domains, setDomains] = useState<string[]>([]);
  const [domainInput, setDomainInput] = useState("");
  const [rules, setRules] = useState<RoutingRule[]>([]);

  useEffect(() => {
    if (!w) return;
    setName(w.name);
    setChatbotId(w.chatbotId ?? "");
    setConfig(w.config);
    setSchedule(w.schedule);
    setDomains(w.allowedDomains);
    setRules(w.routingRules);
  }, [w?.id, w?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const botsQ = useQuery({
    queryKey: ["chatbots-min", w?.workspaceId],
    queryFn: () => listChatbots({ data: { workspaceId: w!.workspaceId } }),
    enabled: !!w?.workspaceId,
  });

  const saveMut = useMutation({
    mutationFn: () =>
      updateChatWidget({
        data: {
          widgetId,
          patch: {
            name,
            chatbotId: chatbotId || null,
            config,
            schedule,
            allowedDomains: domains,
            routingRules: rules,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["chat-widget", widgetId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeToggleMut = useMutation({
    mutationFn: (next: boolean) =>
      updateChatWidget({ data: { widgetId, patch: { isActive: next } } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-widget", widgetId] });
      qc.invalidateQueries({ queryKey: ["chat-widgets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** One-click publish: a paused bot makes the public embed refuse sessions. */
  const activateBot = useMutation({
    mutationFn: (botId: string) =>
      bulkUpdateChatbotStatus({ data: { ids: [botId], status: "active" } }),
    onSuccess: () => {
      toast.success("Chatbot activated — the widget can start chats now");
      qc.invalidateQueries({ queryKey: ["chat-widget", widgetId] });
      qc.invalidateQueries({ queryKey: ["chatbots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scheduleEval = w ? evaluateSchedule(schedule) : null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  if (widgetQ.isLoading || !w) {
    return (
      <div className="flex flex-col">
        <AppTopbar title="Widget" />
        <div className="grid h-40 place-items-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <AppTopbar
        title={name || "Widget"}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/widgets">
              <Button variant="ghost" size="sm">
                <ChevronLeft className="mr-2 size-4" /> All widgets
              </Button>
            </Link>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Save className="mr-2 size-4" />
              )}
              Save changes
            </Button>
          </div>
        }
      />
      <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
        <Tabs defaultValue="install" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="install">
              <Code2 className="mr-2 size-4" /> Install
            </TabsTrigger>
            <TabsTrigger value="appearance">
              <Palette className="mr-2 size-4" /> Appearance
            </TabsTrigger>
            <TabsTrigger value="schedule">
              <CalendarClock className="mr-2 size-4" /> Schedule
            </TabsTrigger>
            <TabsTrigger value="routing">
              <RouteIcon className="mr-2 size-4" /> Routing
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart3 className="mr-2 size-4" /> Analytics
            </TabsTrigger>
          </TabsList>

          {/* INSTALL */}
          <TabsContent value="install" className="grid gap-6">
            <InstallSnippetGenerator widgetId={widgetId} origin={origin} widgetName={name} />
            <Card className="p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-lg">Status</h3>
                  <p className="mt-1 text-muted-foreground text-sm">
                    {w.isActive
                      ? schedule.enabled
                        ? scheduleEval?.active
                          ? "Enabled and inside the scheduled window — serving on installed sites."
                          : `Enabled but currently outside the scheduled window (${scheduleEval?.reason.replace(/_/g, " ")}).`
                        : "Enabled — serving 24/7 on installed sites."
                      : "Master switch off — the snippet will not render, regardless of schedule."}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      w.isActive
                        ? schedule.enabled && scheduleEval && !scheduleEval.active
                          ? "outline"
                          : "default"
                        : "secondary"
                    }
                  >
                    {!w.isActive
                      ? "Off"
                      : schedule.enabled
                        ? scheduleEval?.active
                          ? "Live"
                          : "Scheduled off"
                        : "Live"}
                  </Badge>
                  <Switch
                    checked={w.isActive}
                    disabled={activeToggleMut.isPending}
                    onCheckedChange={(v) => activeToggleMut.mutate(v)}
                    aria-label="Master switch"
                  />
                  <a href={`/embed/w/${widgetId}`} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline">
                      Preview
                    </Button>
                  </a>
                </div>
              </div>
            </Card>

            {w && (!w.chatbotId || (w.chatbotStatus && w.chatbotStatus !== "active")) && (
              <Card className="flex flex-col gap-3 border-amber-500/40 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <div className="text-sm">
                    <p className="font-medium">Visitors can't start a chat yet</p>
                    <p className="text-muted-foreground">
                      {!w.chatbotId
                        ? "This widget has no chatbot linked. Pick a default chatbot below and save."
                        : `“${w.chatbotName ?? "The linked chatbot"}” is ${w.chatbotStatus}. Activate it so the embed can open sessions.`}
                    </p>
                  </div>
                </div>
                {w.chatbotId && (
                  <Button
                    size="sm"
                    disabled={activateBot.isPending}
                    onClick={() => activateBot.mutate(w.chatbotId!)}
                  >
                    {activateBot.isPending ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    Activate chatbot
                  </Button>
                )}
              </Card>
            )}

            <Card className="p-6">
              <h3 className="font-bold text-lg">General</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Widget name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <Label>Default chatbot</Label>
                  <Select value={chatbotId} onValueChange={setChatbotId}>
                    <SelectTrigger>
                      <SelectValue placeholder="No chatbot" />
                    </SelectTrigger>
                    <SelectContent>
                      {(botsQ.data ?? []).map((b) => (
                        <SelectItem key={(b as { id: string }).id} value={(b as { id: string }).id}>
                          {(b as { name: string }).name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-6">
                <Label>Allowed domains</Label>
                <p className="text-muted-foreground text-xs">
                  Leave empty to allow embedding anywhere. Example: <code>acme.com</code>
                </p>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    placeholder="example.com"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && domainInput.trim()) {
                        setDomains([...domains, domainInput.trim().toLowerCase()]);
                        setDomainInput("");
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (domainInput.trim()) {
                        setDomains([...domains, domainInput.trim().toLowerCase()]);
                        setDomainInput("");
                      }
                    }}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {domains.map((d, i) => (
                    <Badge key={`${d}-${i}`} variant="secondary" className="gap-1">
                      {d}
                      <button
                        aria-label="Remove"
                        onClick={() => setDomains(domains.filter((_, j) => j !== i))}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* APPEARANCE */}
          <TabsContent value="appearance" className="grid gap-6 lg:grid-cols-[1fr_420px]">
            <div className="grid gap-6">
              <Card className="p-6">
                <h3 className="font-bold text-lg">Branding</h3>
                <div className="mt-4 grid gap-4">
                  <div>
                    <Label>Agent name</Label>
                    <Input
                      value={config.agentName}
                      onChange={(e) => setConfig({ ...config, agentName: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Brand color</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={config.brandColor}
                          onChange={(e) => setConfig({ ...config, brandColor: e.target.value })}
                          className="h-9 w-12 rounded "
                        />
                        <Input
                          value={config.brandColor}
                          onChange={(e) => setConfig({ ...config, brandColor: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Text on brand</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={config.brandTextColor}
                          onChange={(e) => setConfig({ ...config, brandTextColor: e.target.value })}
                          className="h-9 w-12 rounded "
                        />
                        <Input
                          value={config.brandTextColor}
                          onChange={(e) => setConfig({ ...config, brandTextColor: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Position</Label>
                      <Select
                        value={config.launcherPosition}
                        onValueChange={(v) =>
                          setConfig({
                            ...config,
                            launcherPosition: v as WidgetConfig["launcherPosition"],
                          })
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
                    </div>
                    <div>
                      <Label>Show after (ms)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={500}
                        value={config.showDelayMs}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            showDelayMs: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>Theme</Label>
                      <Select
                        value={config.theme}
                        onValueChange={(v) =>
                          setConfig({ ...config, theme: v as WidgetConfig["theme"] })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light">Light</SelectItem>
                          <SelectItem value="dark">Dark</SelectItem>
                          <SelectItem value="system">Match visitor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Corner radius ({config.radius}px)</Label>
                      <Input
                        type="range"
                        min={0}
                        max={24}
                        value={config.radius}
                        onChange={(e) => setConfig({ ...config, radius: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label>Base font size ({config.fontSizeBase}px)</Label>
                      <Input
                        type="range"
                        min={12}
                        max={18}
                        value={config.fontSizeBase}
                        onChange={(e) =>
                          setConfig({ ...config, fontSizeBase: Number(e.target.value) })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Width ({config.width}px)</Label>
                      <Input
                        type="range"
                        min={280}
                        max={480}
                        value={config.width}
                        onChange={(e) => setConfig({ ...config, width: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label>Height ({config.height}px)</Label>
                      <Input
                        type="range"
                        min={400}
                        max={800}
                        value={config.height}
                        onChange={(e) => setConfig({ ...config, height: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>
              </Card>
              <Card className="p-6">
                <h3 className="font-bold text-lg">Copy</h3>
                <div className="mt-4 grid gap-4">
                  <div>
                    <Label>Welcome title</Label>
                    <Input
                      value={config.welcomeTitle}
                      onChange={(e) => setConfig({ ...config, welcomeTitle: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Welcome subtitle</Label>
                    <Input
                      value={config.welcomeSubtitle}
                      onChange={(e) => setConfig({ ...config, welcomeSubtitle: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Welcome message</Label>
                    <Textarea
                      rows={3}
                      value={config.welcomeMessage}
                      onChange={(e) => setConfig({ ...config, welcomeMessage: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Input placeholder</Label>
                    <Input
                      value={config.inputPlaceholder}
                      onChange={(e) => setConfig({ ...config, inputPlaceholder: e.target.value })}
                    />
                  </div>
                </div>
              </Card>
            </div>
            <div className="lg:sticky lg:top-4 lg:self-start">
              <WidgetAppearancePreview config={config} widgetName={name} />
            </div>
          </TabsContent>

          {/* SCHEDULE */}
          <TabsContent value="schedule">
            <WidgetScheduleEditor schedule={schedule} onChange={setSchedule} />
          </TabsContent>

          {/* ROUTING */}
          <TabsContent value="routing" className="grid gap-4">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg">Routing rules</h3>
                  <p className="text-muted-foreground text-sm">
                    Send visitors to different chatbots by URL, language, or business hours. First
                    matching rule wins.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    setRules([
                      ...rules,
                      {
                        id: crypto.randomUUID(),
                        name: "New rule",
                        when: [],
                        chatbotId: null,
                        team: null,
                      },
                    ])
                  }
                >
                  <Plus className="mr-2 size-4" /> Add rule
                </Button>
              </div>
              <div className="mt-4 grid gap-3">
                {rules.length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    No routing rules — all visitors get the default chatbot.
                  </p>
                )}
                {rules.map((r, ri) => (
                  <Card key={r.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="grid gap-3 md:grid-cols-3">
                          <div>
                            <Label>Rule name</Label>
                            <Input
                              value={r.name}
                              onChange={(e) =>
                                setRules(
                                  rules.map((x, i) =>
                                    i === ri ? { ...x, name: e.target.value } : x,
                                  ),
                                )
                              }
                            />
                          </div>
                          <div>
                            <Label>Route to chatbot</Label>
                            <Select
                              value={r.chatbotId ?? ""}
                              onValueChange={(v) =>
                                setRules(
                                  rules.map((x, i) =>
                                    i === ri ? { ...x, chatbotId: v || null } : x,
                                  ),
                                )
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Default" />
                              </SelectTrigger>
                              <SelectContent>
                                {(botsQ.data ?? []).map((b) => (
                                  <SelectItem
                                    key={(b as { id: string }).id}
                                    value={(b as { id: string }).id}
                                  >
                                    {(b as { name: string }).name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-end gap-2">
                            <label className="flex items-center gap-2 text-sm">
                              <Switch
                                checked={!!r.hideWidget}
                                onCheckedChange={(v) =>
                                  setRules(
                                    rules.map((x, i) => (i === ri ? { ...x, hideWidget: v } : x)),
                                  )
                                }
                              />
                              Hide widget
                            </label>
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs uppercase text-muted-foreground">
                            When (all conditions match)
                          </Label>
                          <div className="mt-2 grid gap-2">
                            {r.when.map((c, ci) => (
                              <div
                                key={ci}
                                className="flex flex-wrap items-center gap-2 rounded-control border p-2"
                              >
                                <Select
                                  value={c.type}
                                  onValueChange={(v) =>
                                    setRules(
                                      rules.map((x, i) =>
                                        i === ri
                                          ? {
                                              ...x,
                                              when: x.when.map((cc, cj) =>
                                                cj === ci
                                                  ? ({
                                                      type: v,
                                                      value: (cc as { value?: string }).value ?? "",
                                                    } as typeof cc)
                                                  : cc,
                                              ),
                                            }
                                          : x,
                                      ),
                                    )
                                  }
                                >
                                  <SelectTrigger className="w-56">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="url_contains">URL contains</SelectItem>
                                    <SelectItem value="url_equals">URL equals</SelectItem>
                                    <SelectItem value="path_starts_with">
                                      Path starts with
                                    </SelectItem>
                                    <SelectItem value="language">Language is</SelectItem>
                                    <SelectItem value="business_hours">Business hours</SelectItem>
                                  </SelectContent>
                                </Select>
                                {c.type === "business_hours" ? (
                                  <>
                                    <Input
                                      type="time"
                                      className="w-28"
                                      value={(c as { from?: string }).from ?? "09:00"}
                                      onChange={(e) =>
                                        setRules(
                                          rules.map((x, i) =>
                                            i === ri
                                              ? {
                                                  ...x,
                                                  when: x.when.map((cc, cj) =>
                                                    cj === ci
                                                      ? { ...cc, from: e.target.value }
                                                      : cc,
                                                  ),
                                                }
                                              : x,
                                          ),
                                        )
                                      }
                                    />
                                    <span className="text-muted-foreground text-xs">to</span>
                                    <Input
                                      type="time"
                                      className="w-28"
                                      value={(c as { to?: string }).to ?? "17:00"}
                                      onChange={(e) =>
                                        setRules(
                                          rules.map((x, i) =>
                                            i === ri
                                              ? {
                                                  ...x,
                                                  when: x.when.map((cc, cj) =>
                                                    cj === ci ? { ...cc, to: e.target.value } : cc,
                                                  ),
                                                }
                                              : x,
                                          ),
                                        )
                                      }
                                    />
                                    <Input
                                      className="w-40"
                                      placeholder="Timezone (e.g. UTC)"
                                      value={(c as { timezone?: string }).timezone ?? ""}
                                      onChange={(e) =>
                                        setRules(
                                          rules.map((x, i) =>
                                            i === ri
                                              ? {
                                                  ...x,
                                                  when: x.when.map((cc, cj) =>
                                                    cj === ci
                                                      ? { ...cc, timezone: e.target.value }
                                                      : cc,
                                                  ),
                                                }
                                              : x,
                                          ),
                                        )
                                      }
                                    />
                                  </>
                                ) : (
                                  <Input
                                    className="flex-1"
                                    value={(c as { value?: string }).value ?? ""}
                                    onChange={(e) =>
                                      setRules(
                                        rules.map((x, i) =>
                                          i === ri
                                            ? {
                                                ...x,
                                                when: x.when.map((cc, cj) =>
                                                  cj === ci ? { ...cc, value: e.target.value } : cc,
                                                ),
                                              }
                                            : x,
                                        ),
                                      )
                                    }
                                  />
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Remove"
                                  onClick={() =>
                                    setRules(
                                      rules.map((x, i) =>
                                        i === ri
                                          ? { ...x, when: x.when.filter((_, cj) => cj !== ci) }
                                          : x,
                                      ),
                                    )
                                  }
                                >
                                  <X className="size-4" />
                                </Button>
                              </div>
                            ))}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setRules(
                                  rules.map((x, i) =>
                                    i === ri
                                      ? {
                                          ...x,
                                          when: [...x.when, { type: "url_contains", value: "" }],
                                        }
                                      : x,
                                  ),
                                )
                              }
                            >
                              <Plus className="mr-2 size-4" /> Add condition
                            </Button>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete rule"
                        onClick={() => setRules(rules.filter((_, i) => i !== ri))}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </Card>
            <RoutingRuleTester
              rules={rules}
              chatbots={(botsQ.data ?? []) as { id: string; name: string }[]}
            />
          </TabsContent>

          {/* ANALYTICS */}
          <TabsContent value="analytics">
            <WidgetAnalyticsDashboard widgetId={widgetId} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
