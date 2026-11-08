import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Send,
  ChevronLeft,
  ChevronRight,
  Check,
  Search,
  Calendar,
  Users,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DateTimePicker,
  fromLocalDateTimeString,
  toLocalDateTimeString,
} from "@/shared/components";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useUpsertCampaign, useSegments } from "@/hooks/use-marketing";
import { enqueueCampaign } from "@/lib/marketing/marketing.functions";
import { sendTestTemplate } from "@/lib/marketing/test-send.functions";
import {
  validateTemplateVariables,
  formatLabel,
  type TemplateVarSpec,
} from "@/lib/marketing/variable-validation";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { evaluateCampaignReadiness } from "@/lib/marketing/readiness";
import { createSingleFlight } from "@/lib/utils/single-flight";
import { useCanAct } from "@/hooks/use-permissions";
import { useAudiencePreview } from "@/hooks/use-audience-preview";

export const Route = createFileRoute("/_authenticated/campaigns/send")({
  component: SendCampaignPage,
});

type WaTemplate = {
  id: string;
  name: string;
  category: string | null;
  language: string | null;
  status: string | null;
  components: unknown;
  variables: unknown;
};

function extractBody(components: unknown): string {
  if (!Array.isArray(components)) return "";
  for (const c of components as Array<Record<string, unknown>>) {
    if ((c?.type as string)?.toUpperCase() === "BODY") {
      return (c.text as string) ?? "";
    }
  }
  return "";
}

const STEPS = [
  { id: 1, label: "Select Template", icon: MessageSquare },
  { id: 2, label: "Configure & Send", icon: Send },
];

function SendCampaignPage() {
  const navigate = useNavigate();
  const { active } = useCurrentWorkspace();
  const upsert = useUpsertCampaign();
  const enqueue = useServerFn(enqueueCampaign);
  const testSend = useServerFn(sendTestTemplate);
  const { data: segments } = useSegments();
  const canSend = useCanAct("campaigns.send");

  const [step, setStep] = useState(1);
  const [search, setSearch] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [audience, setAudience] = useState<"all" | "segment">("all");
  const [segmentId, setSegmentId] = useState<string>("");
  const [scheduleType, setScheduleType] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [throttle, setThrottle] = useState(60);
  const [respectOptOut, setRespectOptOut] = useState(true);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  // `submitting` only disables the button at the next render, which is too
  // late to stop two clicks in the same tick from both enqueueing.
  const submitGuard = useRef(createSingleFlight());

  const { data: templates, isLoading: tplLoading } = useQuery({
    queryKey: ["wa-templates-approved", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_templates")
        .select("id,name,category,language,status,components,variables")
        .eq("workspace_id", active!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WaTemplate[];
    },
  });

  const selectedTemplate = useMemo(
    () => templates?.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  const varSpecs = useMemo<TemplateVarSpec[]>(() => {
    const res = validateTemplateVariables(selectedTemplate?.components, variables);
    return res.specs;
  }, [selectedTemplate, variables]);

  const varIssues = useMemo(() => {
    return validateTemplateVariables(selectedTemplate?.components, variables).issues;
  }, [selectedTemplate, variables]);

  const varTokens = useMemo(() => varSpecs.map((s) => s.token), [varSpecs]);

  const { data: senderAccounts } = useQuery({
    queryKey: ["send-page-senders", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channel_accounts")
        .select("id, status, display_name, workspace_id")
        .eq("workspace_id", active!.id);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        status: string | null;
        display_name: string | null;
        workspace_id: string;
      }>;
    },
  });

  const { data: audiencePreview } = useAudiencePreview({
    workspaceId: active?.id,
    segmentId: audience === "segment" ? segmentId || null : null,
    contactListId: null,
    respectOptOut,
  });

  /**
   * The same verdict the wizard's Review step and the server both use, so this
   * page cannot green-light a campaign the enqueue path will reject.
   */
  const readiness = useMemo(() => {
    const accountId = (selectedTemplate as unknown as { channel_account_id?: string })
      ?.channel_account_id;
    const account = accountId ? senderAccounts?.find((a) => a.id === accountId) : undefined;
    return evaluateCampaignReadiness({
      channel: "whatsapp",
      workspaceId: active?.id ?? null,
      template: selectedTemplate
        ? {
            id: selectedTemplate.id,
            name: selectedTemplate.name,
            language: selectedTemplate.language,
            status: selectedTemplate.status,
            components: selectedTemplate.components,
            channel_account_id: accountId ?? null,
          }
        : null,
      sender: account
        ? {
            id: account.id,
            status: account.status,
            workspaceId: account.workspace_id,
            displayName: account.display_name,
          }
        : null,
      variables,
      mediaUrl: null,
      audienceSelected: audience === "all" || !!segmentId,
      eligibleRecipients: audiencePreview ? audiencePreview.eligible : null,
      scheduleMode: scheduleType === "later" ? "schedule" : "now",
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    });
  }, [
    active?.id,
    selectedTemplate,
    senderAccounts,
    variables,
    audience,
    segmentId,
    audiencePreview,
    scheduleType,
    scheduledAt,
  ]);

  useEffect(() => {
    if (selectedTemplate && !name) setName(`${selectedTemplate.name} campaign`);
  }, [selectedTemplate, name]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = templates ?? [];
    if (!q) return list;
    return list.filter(
      (t) =>
        t.name.toLowerCase().includes(q) || extractBody(t.components).toLowerCase().includes(q),
    );
  }, [templates, search]);

  const renderedPreview = useMemo(() => {
    let body = extractBody(selectedTemplate?.components);
    for (const [k, v] of Object.entries(variables)) {
      body = body.replaceAll(`{{${k}}}`, v || `{{${k}}}`);
    }
    return body;
  }, [selectedTemplate, variables]);

  async function handleSubmit() {
    if (!selectedTemplate || !active) return;
    if (!canSend) {
      toast.error("You don't have permission to send campaigns");
      return;
    }
    if (!name.trim()) {
      toast.error("Give the campaign a name");
      return;
    }
    if (!readiness.ready) {
      toast.error("This campaign is not ready to send", { description: readiness.summary });
      return;
    }
    await submitGuard.current.run(async () => {
      setSubmitting(true);
      try {
        const campaign = await upsert.mutateAsync({
          workspace_id: active.id,
          name: name.trim(),
          channel: "whatsapp",
          type: "broadcast",
          // Always created as a draft. `enqueueCampaign` is what moves it to
          // scheduled or running, and only after it has re-run readiness —
          // writing "scheduled" here would let an unready campaign sit in a
          // live state if the enqueue then failed.
          status: "draft",
          template_id: selectedTemplate.id,
          template_variables: variables,
          message_body: extractBody(selectedTemplate.components),
          segment_id: audience === "segment" ? segmentId : null,
          throttle_per_minute: throttle,
          respect_opt_out: respectOptOut,
          scheduled_at: scheduleType === "later" ? new Date(scheduledAt).toISOString() : null,
        });
        const res = await enqueue({
          data: {
            campaignId: campaign.id,
            runAt: scheduleType === "later" ? new Date(scheduledAt).toISOString() : undefined,
          },
        });
        toast.success(
          scheduleType === "later"
            ? `Scheduled — ${res.enqueued ?? 0} recipients queued`
            : `Sending — ${res.enqueued ?? 0} recipients queued`,
        );
        navigate({ to: "/campaigns/$campaignId", params: { campaignId: campaign.id } });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to send";
        if (msg.toLowerCase().includes("oauth") || msg.toLowerCase().includes("access token")) {
          toast.error("Invalid Meta access token", {
            description:
              "Reconnect the WhatsApp Business account in Settings → Channels to refresh the OAuth token.",
          });
        } else {
          toast.error(msg);
        }
      } finally {
        // Released on failure so the operator can fix and retry immediately.
        setSubmitting(false);
      }
    });
  }

  async function handleTestSend() {
    if (!selectedTemplate) return;
    if (!canSend) {
      toast.error("You don't have permission to send campaigns");
      return;
    }
    const phone = testPhone.trim();
    if (!/^\+?[1-9]\d{6,14}$/.test(phone)) {
      toast.error("Enter a valid phone in E.164 format, e.g. +15551234567");
      return;
    }
    if ((selectedTemplate.status ?? "").toLowerCase() !== "approved") {
      toast.error("Only APPROVED templates can be test-sent");
      return;
    }
    if (varIssues.length > 0) {
      toast.error("Fix template variables before sending a test", {
        description: varIssues[0]?.message,
      });
      return;
    }
    setTesting(true);
    try {
      const res = await testSend({
        data: {
          templateId: selectedTemplate.id,
          phoneNumber: phone,
          variables,
        },
      });
      if (res.ok) {
        toast.success("Test message sent", {
          description: `Meta id: ${res.externalMessageId ?? "—"}`,
        });
      } else {
        const err = res.error ?? "Send failed";
        if (err.toLowerCase().includes("oauth") || err.toLowerCase().includes("access token")) {
          toast.error("Invalid Meta access token", {
            description: "Reconnect the WhatsApp Business account in Settings → Channels.",
          });
        } else {
          toast.error("Test send failed", { description: err });
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test send failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <AppTopbar title="Send Campaign" subtitle="Send bulk messages on WhatsApp using Meta API" />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl p-6 space-y-6">
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => {
              const active = step === s.id;
              const done = step > s.id;
              const Icon = s.icon;
              return (
                <div key={s.id} className="flex items-center gap-2 flex-1">
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-control border px-3 py-2 flex-1",
                      active && "border-primary bg-primary/5",
                      done && "border-success/40 bg-success/5",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-control border text-xs font-medium",
                        active && "border-primary bg-primary text-primary-foreground",
                        done && "border-success bg-success text-success-foreground",
                      )}
                    >
                      {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <div className="text-sm font-medium">{s.label}</div>
                  </div>
                  {i < STEPS.length - 1 && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              );
            })}
          </div>

          {step === 1 && (
            <Card className="p-4 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold">Select Template</h2>
                  <p className="text-sm text-muted-foreground">
                    Pick an approved WhatsApp template to broadcast.
                  </p>
                </div>
                <div className="relative w-72">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search templates"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              {tplLoading ? (
                <div className="text-sm text-muted-foreground">Loading templates</div>
              ) : filtered.length === 0 ? (
                <div className="rounded-control border border-dashed p-8 text-center">
                  <Sparkles className="mx-auto h-6 w-6 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium">No templates found</p>
                  <p className="text-xs text-muted-foreground">
                    Create and submit a Meta template first.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => navigate({ to: "/whatsapp-templates/create" })}
                  >
                    Create Meta Template
                  </Button>
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {filtered.map((t) => {
                    const selected = templateId === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTemplateId(t.id)}
                        className={cn(
                          "rounded-control border p-3 text-left transition hover:border-primary/60",
                          selected && "border-primary bg-primary/5 ring-1 ring-primary",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate text-sm font-medium">{t.name}</div>
                          <Badge variant="outline" className="text-[11px] uppercase">
                            {t.status ?? "draft"}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {t.category && (
                            <Badge variant="secondary" className="text-[11px]">
                              {t.category}
                            </Badge>
                          )}
                          {t.language && (
                            <Badge variant="secondary" className="text-[11px]">
                              {t.language}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-2 line-clamp-3 text-xs text-muted-foreground whitespace-pre-wrap">
                          {extractBody(t.components) || "—"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

          {step === 2 && selectedTemplate && (
            <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
              <Card className="p-4 space-y-5">
                <div>
                  <h2 className="text-base font-semibold">Configure & Send</h2>
                  <p className="text-sm text-muted-foreground">
                    Set your audience, schedule, and template variables.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="camp-name">Campaign name</Label>
                  <Input
                    id="camp-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. October promo blast"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" /> Audience
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAudience("all")}
                      className={cn(
                        "rounded-control border p-3 text-left text-sm",
                        audience === "all" && "border-primary bg-primary/5",
                      )}
                    >
                      <div className="font-medium">All contacts</div>
                      <div className="text-xs text-muted-foreground">Every eligible contact</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAudience("segment")}
                      className={cn(
                        "rounded-control border p-3 text-left text-sm",
                        audience === "segment" && "border-primary bg-primary/5",
                      )}
                    >
                      <div className="font-medium">Segment</div>
                      <div className="text-xs text-muted-foreground">Target a saved segment</div>
                    </button>
                  </div>
                  {audience === "segment" && (
                    <Select value={segmentId} onValueChange={setSegmentId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a segment" />
                      </SelectTrigger>
                      <SelectContent>
                        {(segments ?? []).map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} · {s.member_count ?? 0}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {varSpecs.length > 0 && (
                  <div className="space-y-2">
                    <Label>Template variables</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {varSpecs.map((spec) => {
                        const issue = varIssues.find((i) => i.token === spec.token);
                        return (
                          <div key={spec.token} className="space-y-1">
                            <Label className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                              <span>{`{{${spec.token}}}`}</span>
                              <span className="text-[11px] uppercase tracking-wide">
                                {spec.location} · {formatLabel(spec.format)}
                              </span>
                            </Label>
                            <Input
                              value={variables[spec.token] ?? ""}
                              onChange={(e) =>
                                setVariables((v) => ({ ...v, [spec.token]: e.target.value }))
                              }
                              placeholder={formatLabel(spec.format)}
                              aria-invalid={!!issue}
                              className={cn(
                                issue && "border-destructive focus-visible:ring-destructive/40",
                              )}
                            />
                            {issue && (
                              <div className="text-[11px] text-destructive flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {issue.message}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {varIssues.length > 0 && (
                      <div className="rounded-control border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive flex items-center gap-2">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {varIssues.length} variable
                        {varIssues.length === 1 ? "" : "s"} need attention before this campaign can
                        be sent.
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5" /> Schedule
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setScheduleType("now")}
                      className={cn(
                        "rounded-control border p-3 text-left text-sm",
                        scheduleType === "now" && "border-primary bg-primary/5",
                      )}
                    >
                      <div className="font-medium">Send now</div>
                      <div className="text-xs text-muted-foreground">Start immediately</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setScheduleType("later")}
                      className={cn(
                        "rounded-control border p-3 text-left text-sm",
                        scheduleType === "later" && "border-primary bg-primary/5",
                      )}
                    >
                      <div className="font-medium">Schedule</div>
                      <div className="text-xs text-muted-foreground">Send at a later time</div>
                    </button>
                  </div>
                  {scheduleType === "later" && (
                    <DateTimePicker
                      value={fromLocalDateTimeString(scheduledAt)}
                      onChange={(d) => setScheduledAt(toLocalDateTimeString(d))}
                    />
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="throttle">Throttle (msgs/min)</Label>
                    <Input
                      id="throttle"
                      type="number"
                      min={1}
                      max={1000}
                      value={throttle}
                      onChange={(e) => setThrottle(Math.max(1, Number(e.target.value) || 1))}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-control border p-3">
                    <div>
                      <div className="text-sm font-medium">Respect opt-out</div>
                      <div className="text-xs text-muted-foreground">
                        Skip unsubscribed contacts
                      </div>
                    </div>
                    <Switch checked={respectOptOut} onCheckedChange={setRespectOptOut} />
                  </div>
                </div>
              </Card>

              <Card className="p-4 space-y-3 h-fit sticky top-4">
                <div className="text-xs font-medium uppercase text-muted-foreground">Preview</div>
                <div className="rounded-control border bg-[#e5ddd5] p-3">
                  <div className="max-w-xs rounded-control rounded-tl-none bg-white px-3 py-2 text-sm shadow-sm whitespace-pre-wrap">
                    {renderedPreview || extractBody(selectedTemplate.components) || "—"}
                  </div>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>
                    Template: <span className="text-foreground">{selectedTemplate.name}</span>
                  </div>
                  <div>Language: {selectedTemplate.language ?? "—"}</div>
                  <div>Category: {selectedTemplate.category ?? "—"}</div>
                  <div>
                    Eligible recipients:{" "}
                    <span className="text-foreground">
                      {audiencePreview ? audiencePreview.eligible.toLocaleString() : "—"}
                    </span>
                    {audiencePreview && audiencePreview.skipped > 0 && (
                      <> · {audiencePreview.skipped.toLocaleString()} skipped</>
                    )}
                  </div>
                </div>

                {!readiness.ready && (
                  <div
                    role="alert"
                    className="rounded-control border border-destructive/40 bg-destructive/5 p-2 space-y-1"
                  >
                    <div className="text-[11px] font-medium text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Not ready to send
                    </div>
                    <ul className="space-y-0.5">
                      {readiness.issues.map((issue, i) => (
                        <li
                          key={`${issue.section}-${i}`}
                          className="text-[11px] text-muted-foreground"
                        >
                          {issue.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="space-y-2 border-t pt-3">
                  <Label
                    htmlFor="test-phone"
                    className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground"
                  >
                    <Send className="h-3 w-3" /> Test send
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Send this template to a single number before launching the campaign. Uses your
                    workspace's connected WhatsApp Cloud account.
                  </p>
                  <Input
                    id="test-phone"
                    type="tel"
                    inputMode="tel"
                    placeholder="+15551234567"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handleTestSend}
                    disabled={!canSend || testing || !testPhone.trim() || varIssues.length > 0}
                    title={canSend ? undefined : "You don't have permission to send campaigns"}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {testing ? "Sending test" : "Send test message"}
                  </Button>
                </div>
              </Card>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => (step === 1 ? navigate({ to: "/campaigns" }) : setStep(1))}
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            {step === 1 ? (
              <Button disabled={!templateId} onClick={() => setStep(2)}>
                Continue <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!canSend || submitting || !readiness.ready || !name.trim()}
                title={
                  !canSend
                    ? "You don't have permission to send campaigns"
                    : readiness.ready
                      ? undefined
                      : readiness.summary
                }
              >
                <Send className="h-4 w-4" />
                {submitting
                  ? "Sending"
                  : scheduleType === "later"
                    ? "Schedule campaign"
                    : "Send now"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
