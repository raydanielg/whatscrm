import { useTemplates } from "@/hooks/use-wa-templates";
import {
  extractTemplateVariables,
  validateTemplateVariables,
} from "@/lib/marketing/variable-validation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Sparkles,
  Target,
  Users,
  FileText,
  Eye,
  CalendarClock,
  Send,
  Check,
  ChevronRight,
  ChevronLeft,
  Upload,
  Repeat,
  ShieldCheck,
  Image as ImageIcon,
  X,
  Rocket,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Phone,
  Reply,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useUpsertCampaign, useSegments, type CampaignRow } from "@/hooks/use-marketing";
import { useContactLists } from "@/hooks/use-marketing-extras";
import { enqueueCampaign } from "@/lib/marketing/marketing.functions";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  evaluateCampaignReadiness,
  SECTION_LABEL,
  type ReadinessSection,
} from "@/lib/marketing/readiness";
import { createSingleFlight } from "@/lib/utils/single-flight";
import { useAudiencePreview } from "@/hooks/use-audience-preview";
import { INELIGIBILITY_REASON } from "@/lib/marketing/recipient-eligibility";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  DateTimePicker,
  fromLocalDateTimeString,
  toLocalDateTimeString,
} from "@/shared/components";

/* eslint-disable @typescript-eslint/no-explicit-any */

const STEPS = [
  { id: "basics", label: "Basics", icon: Sparkles },
  { id: "audience", label: "Audience", icon: Users },
  { id: "message", label: "Message", icon: FileText },
  { id: "preview", label: "Preview", icon: Eye },
  { id: "schedule", label: "Schedule", icon: CalendarClock },
  { id: "review", label: "Review", icon: Rocket },
] as const;

const GOALS = [
  { id: "awareness", label: "Awareness", desc: "Announce news or product updates", icon: "📣" },
  { id: "engagement", label: "Engagement", desc: "Drive replies and conversations", icon: "💬" },
  { id: "conversion", label: "Conversion", desc: "Turn contacts into customers", icon: "🛒" },
  { id: "retention", label: "Retention", desc: "Re-engage inactive customers", icon: "❤️" },
  {
    id: "transactional",
    label: "Transactional",
    desc: "Order, delivery, or booking updates",
    icon: "📦",
  },
] as const;

type FormState = {
  name: string;
  description: string;
  goal: string;
  segment_id: string;
  contact_list_id: string;
  template_id: string;
  message_body: string;
  media_url: string;
  variables: Record<string, string>;
  send_mode: "now" | "schedule";
  scheduled_at: string;
  is_recurring: boolean;
  recurrence_freq: "daily" | "weekly" | "monthly";
  recurrence_interval: number;
  throttle_per_minute: number;
  requires_approval: boolean;
  respect_opt_out: boolean;
};

const EMPTY: FormState = {
  name: "",
  description: "",
  goal: "",
  segment_id: "",
  contact_list_id: "",
  template_id: "",
  message_body: "",
  media_url: "",
  variables: {},
  send_mode: "now",
  scheduled_at: "",
  is_recurring: false,
  recurrence_freq: "weekly",
  recurrence_interval: 1,
  throttle_per_minute: 60,
  requires_approval: false,
  respect_opt_out: true,
};

/**
 * "Broadcast" is not a second data model — it is a Campaign of type
 * `broadcast` that never repeats. The wizard is the only editor for both, so
 * the distinction is carried as a mode rather than as a separate screen:
 * broadcast mode preselects the one-time type and removes the recurrence
 * choice, so "New Broadcast" cannot land the operator in a campaign that
 * quietly repeats.
 */
export type CampaignWizardMode = "campaign" | "broadcast";

export function CampaignWizard({
  open,
  onOpenChange,
  initial,
  mode = "campaign",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Partial<CampaignRow>;
  mode?: CampaignWizardMode;
}) {
  const isBroadcast = mode === "broadcast";
  const formatZoned = useZonedDateFormatter();
  const { active } = useCurrentWorkspace();
  const upsert = useUpsertCampaign();
  const enqueue = useServerFn(enqueueCampaign);
  const { data: segments } = useSegments();
  const { data: lists } = useContactLists();
  const { data: templateList } = useTemplates(active?.id);
  // `listTemplates` resolves to `{ templates: [...] }`, not an array. Calling
  // `.filter` on the wrapper threw a TypeError while rendering the wizard, which
  // is why approved templates could never be picked for a campaign.
  const templates = useMemo(
    () =>
      (templateList?.templates ?? []).filter((t) => (t.status ?? "").toUpperCase() === "APPROVED"),
    [templateList],
  );

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState<"draft" | "launch" | null>(null);
  // Synchronous guard. `saving` only disables the buttons at the next render,
  // which is one tick too late to stop a double-click from enqueueing twice.
  const submitGuard = useRef(createSingleFlight());
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    if (open) {
      setStep(0);
      setForm({
        ...EMPTY,
        name: initial?.name ?? "",
        description: (initial as any)?.description ?? "",
        goal: (initial as any)?.goal ?? "",
        segment_id: (initial as any)?.segment_id ?? "",
        contact_list_id: (initial as any)?.contact_list_id ?? "",
        template_id: (initial as any)?.template_id ?? "",
        message_body: initial?.message_body ?? "",
        media_url: (initial as any)?.media_url ?? "",
        variables: ((initial as any)?.template_variables as Record<string, string>) ?? {},
        throttle_per_minute: (initial as any)?.throttle_per_minute ?? 60,
        respect_opt_out: (initial as any)?.respect_opt_out ?? true,
        // A broadcast is one-time by definition; never inherit recurrence into it.
        is_recurring: isBroadcast ? false : ((initial as any)?.is_recurring ?? false),
      });
    }
  }, [open, initial, isBroadcast]);

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  const selectedTemplate = templates?.find((t) => t.id === form.template_id);
  const detectedVars = extractTemplateVariables(selectedTemplate?.components).map((v) => v.token);
  const variableIssues = validateTemplateVariables(
    selectedTemplate?.components,
    form.variables,
  ).issues;

  const audienceLabel = useMemo(() => {
    if (form.contact_list_id) {
      const l = lists?.find((x) => x.id === form.contact_list_id);
      return l ? `List · ${l.name} (${l.member_count})` : "List";
    }
    if (form.segment_id) {
      const s = segments?.find((x) => x.id === form.segment_id);
      return s ? `Segment · ${s.name} (${s.member_count})` : "Segment";
    }
    return "All contacts in workspace";
  }, [form.contact_list_id, form.segment_id, lists, segments]);

  // The sender is whichever WhatsApp account issued the chosen template — the
  // operator never picks it separately, so readiness has to resolve it.
  const { data: senderAccounts } = useQuery({
    queryKey: ["campaign-wizard-senders", active?.id],
    enabled: !!active?.id && open,
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

  const sender = useMemo(() => {
    const accountId = (selectedTemplate as any)?.channel_account_id as string | undefined;
    if (!accountId) return null;
    const row = senderAccounts?.find((a) => a.id === accountId);
    return row
      ? {
          id: row.id,
          status: row.status,
          workspaceId: row.workspace_id,
          displayName: row.display_name,
        }
      : null;
  }, [selectedTemplate, senderAccounts]);

  // Counted against the same partition rule the enqueue path uses, so the
  // number the operator approves is the number that gets queued.
  const { data: audience, isLoading: audienceLoading } = useAudiencePreview(
    {
      workspaceId: active?.id,
      segmentId: form.segment_id || null,
      contactListId: form.contact_list_id || null,
      respectOptOut: form.respect_opt_out,
    },
    open,
  );

  /**
   * One canonical verdict, shared with the server. The Review step renders it,
   * Schedule and Launch are gated on it, and `enqueueCampaign` re-derives the
   * same thing from the database so a bypassed UI changes nothing.
   */
  const readiness = useMemo(
    () =>
      evaluateCampaignReadiness({
        channel: "whatsapp",
        workspaceId: active?.id ?? null,
        template: selectedTemplate
          ? {
              id: selectedTemplate.id,
              name: selectedTemplate.name,
              language: (selectedTemplate as any).language ?? null,
              status: selectedTemplate.status ?? null,
              components: (selectedTemplate as any).components,
              channel_account_id: (selectedTemplate as any).channel_account_id ?? null,
            }
          : null,
        sender,
        variables: form.variables,
        mediaUrl: form.media_url,
        audienceSelected: true,
        // Undefined while the count is still loading: an uncounted audience
        // must not be reported as an empty one.
        eligibleRecipients: audience ? audience.eligible : null,
        scheduleMode: form.send_mode,
        scheduledAt: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
      }),
    [
      active?.id,
      selectedTemplate,
      sender,
      form.variables,
      form.media_url,
      form.send_mode,
      form.scheduled_at,
      audience,
    ],
  );

  const issuesFor = (section: ReadinessSection) =>
    readiness.issues.filter((i) => i.section === section);

  const canNext = (() => {
    if (step === 0) return form.name.trim().length > 1 && !!form.goal;
    if (step === 2) return !!selectedTemplate && variableIssues.length === 0;
    if (step === 4) return issuesFor("schedule").length === 0;
    return true;
  })();

  const buildPayload = (status: "draft" | "scheduled" | "running"): Partial<CampaignRow> => {
    const scheduled_at =
      form.send_mode === "schedule" && form.scheduled_at
        ? new Date(form.scheduled_at).toISOString()
        : null;
    return {
      name: form.name.trim(),
      description: form.description.trim() || null,
      message_body: form.message_body,
      segment_id: form.segment_id || null,
      template_id: form.template_id || null,
      template_variables: form.variables as any,
      media_url: form.media_url || null,
      scheduled_at,
      throttle_per_minute: form.throttle_per_minute,
      respect_opt_out: form.respect_opt_out,
      status,
      type: "broadcast",
      channel: "whatsapp",
      // custom fields
      goal: form.goal,
      contact_list_id: form.contact_list_id || null,
      is_recurring: isBroadcast ? false : form.is_recurring,
      recurrence_rule:
        !isBroadcast && form.is_recurring
          ? { freq: form.recurrence_freq, interval: form.recurrence_interval }
          : null,
      approval_status: form.requires_approval ? "pending" : "not_required",
    } as any;
  };

  async function handleUpload(file: File) {
    if (!active) return;
    setUploading(true);
    try {
      const key = `${active.id}/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from("campaign-media").upload(key, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const { data: signed, error: signedError } = await supabase.storage
        .from("campaign-media")
        .createSignedUrl(key, 60 * 60 * 24 * 7);
      if (signedError) throw signedError;
      if (!signed?.signedUrl) throw new Error("Could not create a media preview URL.");
      patch({ media_url: signed.signedUrl });
      toast.success("Media uploaded");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function saveDraft() {
    // A draft is always allowed to save — readiness gates launching, not
    // keeping your work — but it must still not save twice.
    await submitGuard.current.run(async () => {
      setSaving("draft");
      try {
        await upsert.mutateAsync({ id: (initial as any)?.id, ...buildPayload("draft") });
        toast.success("Saved as draft");
        onOpenChange(false);
      } catch (e: any) {
        toast.error(e.message ?? "Failed to save");
      } finally {
        // Released in `finally` so a failed save can be retried at once.
        setSaving(null);
      }
    });
  }

  async function launch() {
    if (!readiness.ready) {
      toast.error("This campaign is not ready to send", { description: readiness.summary });
      return;
    }
    await submitGuard.current.run(async () => {
      setSaving("launch");
      try {
        const saved = await upsert.mutateAsync({
          id: (initial as any)?.id,
          ...buildPayload("draft"),
        });
        if (form.requires_approval) {
          toast.success("Submitted for approval");
        } else {
          // The server re-runs readiness inside `enqueueCampaign`, so this is
          // the request that actually decides whether the campaign launches.
          await enqueue({ data: { campaignId: saved.id } });
          toast.success(
            form.send_mode === "schedule"
              ? "Campaign scheduled"
              : "Campaign launched — dispatching now",
          );
        }
        onOpenChange(false);
      } catch (e: any) {
        toast.error(e.message ?? "Failed to launch");
      } finally {
        setSaving(null);
      }
    });
  }

  const rendered = useMemo(() => {
    let out = form.message_body;
    for (const [k, v] of Object.entries(form.variables))
      out = out.replaceAll(`{{${k}}}`, v || `{{${k}}}`);
    return out || "Your message will appear here";
  }, [form.message_body, form.variables]);

  // The selected template's footer and buttons so the preview shows the whole
  // message, not just the body. (Static buttons render from the approved
  // template at send time; they are display-only here.)
  const templateExtras = useMemo(() => {
    const components = (selectedTemplate as { components?: unknown })?.components;
    if (!Array.isArray(components))
      return { footer: "", buttons: [] as Array<{ kind: string; label: string }> };
    const footer = String(
      (components.find((c) => String(c?.type).toUpperCase() === "FOOTER") as { text?: string })
        ?.text ?? "",
    );
    const btnComp = components.find((c) => String(c?.type).toUpperCase() === "BUTTONS") as {
      buttons?: Array<{ type?: string; text?: string; url?: string }>;
    } | undefined;
    const buttons = Array.isArray(btnComp?.buttons)
      ? btnComp.buttons
          .map((b) => {
            const kind = String(b?.type ?? "").toUpperCase();
            return { kind, label: String(b?.text ?? (kind === "URL" ? b?.url : "") ?? "") };
          })
          .filter((b) => b.label)
      : [];
    return { footer, buttons };
  }, [selectedTemplate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[calc(100dvh-2rem)] p-0 gap-0 overflow-hidden bg-background">
        <DialogTitle className="sr-only">
          {isBroadcast ? "Create a broadcast" : "Create a campaign"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Choose the audience, template, preview, and delivery schedule before launching.
        </DialogDescription>
        <div className="grid md:grid-cols-[240px_1fr] h-[min(720px,calc(100dvh-2rem))] min-h-0">
          {/* Rail */}
          <aside className="hidden md:flex flex-col gap-1 p-5 overflow-y-auto border-r border-border bg-gradient-to-br from-primary/5 via-accent/5 to-transparent">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 rounded-control bg-primary/10 text-primary grid place-items-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold">
                  {isBroadcast ? "New Broadcast" : "New Campaign"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {isBroadcast ? "One-time WhatsApp broadcast" : "Campaign wizard"}
                </div>
              </div>
            </div>
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = i < step;
              const active = i === step;
              return (
                <button
                  key={s.id}
                  onClick={() => (i <= step ? setStep(i) : null)}
                  disabled={i > step}
                  className={cn(
                    "flex items-center gap-3 rounded-control px-3 py-2 text-sm text-left transition-all",
                    active && "bg-primary text-primary-foreground shadow-sm",
                    !active && done && "text-foreground hover:bg-muted",
                    !active && !done && "text-muted-foreground",
                  )}
                >
                  <div
                    className={cn(
                      "w-7 h-7 rounded-control grid place-items-center transition",
                      active && "bg-primary-foreground/20",
                      !active && done && "bg-success/15 text-success",
                      !active && !done && "bg-muted",
                    )}
                  >
                    {done ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  </div>
                  <span className="font-medium">{s.label}</span>
                </button>
              );
            })}
            <div className="mt-auto pt-6 text-[11px] text-muted-foreground leading-relaxed">
              Use Save draft to keep your changes. You can go back before launching.
            </div>
          </aside>

          {/* Body */}
          <div className="flex flex-col min-h-0 min-w-0">
            <header className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <div className="text-xs  text-muted-foreground">
                  Step {step + 1} of {STEPS.length}
                </div>
                <div className="text-lg font-semibold">{STEPS[step].label}</div>
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="p-2 rounded-control hover:bg-muted text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            <div
              className="flex-1 min-h-0 overflow-y-auto p-6 animate-in fade-in slide-in-from-bottom-2 duration-300"
              key={step}
            >
              {step === 0 && (
                <div className="space-y-5 max-w-2xl">
                  <Field label="Campaign name" required>
                    <input
                      className="w-full px-3 py-2.5 rounded-control border border-border bg-background text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                      placeholder="e.g. Black Friday · Early Access"
                      value={form.name}
                      onChange={(e) => patch({ name: e.target.value })}
                      autoFocus
                    />
                  </Field>
                  <Field label="Description" hint="Optional — visible only to your team">
                    <textarea
                      className="w-full px-3 py-2.5 rounded-control border border-border bg-background text-sm min-h-[80px] focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                      placeholder="What is this campaign about?"
                      value={form.description}
                      onChange={(e) => patch({ description: e.target.value })}
                    />
                  </Field>
                  <Field label="Campaign goal" required>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {GOALS.map((g) => (
                        <button
                          key={g.id}
                          onClick={() => patch({ goal: g.id })}
                          className={cn(
                            "text-left p-3 rounded-control border transition-all flex items-start gap-3",
                            form.goal === g.id
                              ? "border-primary bg-primary/5 shadow-sm ring-2 ring-primary/20"
                              : "border-border hover:border-primary/40 hover:bg-muted/40",
                          )}
                        >
                          <div className="text-2xl leading-none">{g.icon}</div>
                          <div>
                            <div className="text-sm font-medium flex items-center gap-1.5">
                              {g.label}
                              {form.goal === g.id && <Check className="w-3.5 h-3.5 text-primary" />}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">{g.desc}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4 max-w-2xl">
                  <div className="rounded-control border border-border p-4 bg-surface flex items-start gap-3">
                    <Target className="w-4 h-4 text-primary mt-0.5" />
                    <div className="text-sm">
                      <div className="font-medium">Reach</div>
                      <div className="text-muted-foreground">
                        {audienceLabel}. Contacts who opted out will be skipped automatically.
                      </div>
                    </div>
                  </div>

                  <Field label="Contact List">
                    <select
                      className="w-full px-3 py-2.5 rounded-control border border-border bg-background text-sm"
                      value={form.contact_list_id}
                      onChange={(e) => patch({ contact_list_id: e.target.value, segment_id: "" })}
                    >
                      <option value="">— None —</option>
                      {(lists ?? []).map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} · {l.member_count.toLocaleString()} members
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Segment" hint="Dynamic audience by tag, status, geography, etc.">
                    <select
                      className="w-full px-3 py-2.5 rounded-control border border-border bg-background text-sm"
                      value={form.segment_id}
                      onChange={(e) => patch({ segment_id: e.target.value, contact_list_id: "" })}
                    >
                      <option value="">— None —</option>
                      {(segments ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} · {s.member_count.toLocaleString()} members
                        </option>
                      ))}
                    </select>
                  </Field>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Checkbox
                      id="respect-opt-out"
                      checked={form.respect_opt_out}
                      onCheckedChange={(v) => patch({ respect_opt_out: v === true })}
                    />
                    <Label htmlFor="respect-opt-out" className="font-normal text-muted-foreground">
                      Respect opt-outs (recommended)
                    </Label>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4 max-w-2xl">
                  <Field
                    label="Start from template"
                    hint="Optional — pre-fill message and variables"
                  >
                    <select
                      className="w-full px-3 py-2.5 rounded-control border border-border bg-background text-sm"
                      value={form.template_id}
                      onChange={(e) => {
                        const t = templates?.find((x) => x.id === e.target.value);
                        patch({
                          template_id: e.target.value,
                          message_body: String(
                            t?.components.find((c) => c.type === "BODY")?.text ?? "",
                          ),
                          variables: {},
                        });
                      }}
                    >
                      <option value="">— Blank —</option>
                      {(templates ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} {t.category ? `· ${t.category}` : ""}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    label="Message body"
                    required
                    hint="Use {{first_name}}, {{company}},  for personalization"
                  >
                    <textarea
                      className="w-full px-3 py-2.5 rounded-control border border-border bg-background text-sm min-h-[160px] font-mono focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                      placeholder="Hi {{first_name}}, we thought you'd love our new collection"
                      value={form.message_body}
                      readOnly
                    />
                    <div className="flex items-center justify-between mt-1">
                      <div className="text-[11px] text-muted-foreground">
                        {form.message_body.length} chars
                      </div>
                    </div>
                  </Field>

                  {detectedVars.length > 0 && (
                    <Field label="Template variables" hint="Required values for this campaign">
                      <div className="grid grid-cols-2 gap-2">
                        {detectedVars.map((v) => (
                          <div key={v} className="flex items-center gap-2">
                            <code className="text-[11px] px-2 py-1 rounded bg-muted whitespace-nowrap">
                              {`{{${v}}}`}
                            </code>
                            <input
                              className="flex-1 px-2 py-1.5 rounded-control border border-border bg-background text-sm"
                              placeholder="Default value"
                              value={form.variables[v] ?? ""}
                              onChange={(e) =>
                                patch({
                                  variables: { ...form.variables, [v]: e.target.value },
                                })
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </Field>
                  )}

                  <Field label="Media" hint="Optional image, video, or document">
                    <div className="flex gap-2 items-center">
                      <label className="inline-flex items-center gap-2 px-3 py-2 rounded-control border border-border bg-background text-sm cursor-pointer hover:bg-muted">
                        {uploading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        Upload
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*,video/*,application/pdf"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUpload(f);
                          }}
                        />
                      </label>
                      <input
                        className="flex-1 px-3 py-2 rounded-control border border-border bg-background text-sm"
                        placeholder="or paste a URL"
                        value={form.media_url}
                        onChange={(e) => patch({ media_url: e.target.value })}
                      />
                      {form.media_url && (
                        <button
                          onClick={() => patch({ media_url: "" })}
                          className="p-2 rounded-control hover:bg-muted text-muted-foreground"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </Field>
                </div>
              )}

              {step === 3 && (
                <div className="grid md:grid-cols-2 gap-6 max-w-3xl">
                  <div>
                    <div className="text-sm font-medium mb-3">Live preview</div>
                    <div className="rounded-control bg-[#e5ddd5] dark:bg-muted p-4 shadow-inner min-h-[320px] relative overflow-hidden">
                      <div className="absolute inset-0 opacity-30 pointer-events-none bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.15)_1px,transparent_0)] [background-size:14px_14px]" />
                      <div className="relative max-w-[85%] ml-auto animate-in slide-in-from-bottom-2 duration-300">
                        <div className="bg-[#d9fdd3] dark:bg-primary/20 rounded-control rounded-tr-sm px-3 py-2 shadow-sm">
                          {form.media_url && (
                            <div className="mb-2 rounded-control overflow-hidden bg-black/5">
                              {/\.(mp4|mov|webm)(\?|#|$)/i.test(form.media_url) ? (
                                <video src={form.media_url} className="w-full h-40 object-cover" />
                              ) : (
                                <img
                                  src={form.media_url}
                                  alt="preview"
                                  className="w-full h-40 object-cover"
                                  onError={(e) =>
                                    ((e.target as HTMLImageElement).style.display = "none")
                                  }
                                />
                              )}
                            </div>
                          )}
                          <div className="text-sm whitespace-pre-wrap break-words text-foreground">
                            {rendered}
                          </div>
                          {templateExtras.footer && (
                            <div className="text-[11px] text-muted-foreground mt-1 break-words">
                              {templateExtras.footer}
                            </div>
                          )}
                          <div className="text-[11px] text-muted-foreground text-right mt-1">
                            {formatZoned(new Date(), {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}{" "}
                            ✓✓
                          </div>
                        </div>
                        {templateExtras.buttons.length > 0 && (
                          <div className="mt-1 space-y-1">
                            {templateExtras.buttons.map((b, i) => (
                              <div
                                key={`${b.label}-${i}`}
                                className="bg-[#d9fdd3] dark:bg-primary/20 rounded-control px-3 py-2 shadow-sm flex items-center justify-center gap-1.5 text-sm font-medium text-sky-700 dark:text-primary"
                              >
                                {b.kind === "URL" ? (
                                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                                ) : b.kind === "PHONE_NUMBER" ? (
                                  <Phone className="w-3.5 h-3.5 shrink-0" />
                                ) : (
                                  <Reply className="w-3.5 h-3.5 shrink-0" />
                                )}
                                <span className="truncate">{b.label}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="text-sm font-medium">Summary</div>
                    <SummaryRow
                      icon={<Target className="w-4 h-4" />}
                      label="Goal"
                      value={GOALS.find((g) => g.id === form.goal)?.label ?? "—"}
                    />
                    <SummaryRow
                      icon={<Users className="w-4 h-4" />}
                      label="Audience"
                      value={audienceLabel}
                    />
                    <SummaryRow
                      icon={<ImageIcon className="w-4 h-4" />}
                      label="Media"
                      value={form.media_url ? "Attached" : "None"}
                    />
                    <SummaryRow
                      icon={<FileText className="w-4 h-4" />}
                      label="Variables"
                      value={detectedVars.length ? detectedVars.join(", ") : "None"}
                    />
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-5 max-w-2xl">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <ChoiceCard
                      icon={<Send className="w-4 h-4" />}
                      active={form.send_mode === "now"}
                      onClick={() => patch({ send_mode: "now" })}
                      title="Send immediately"
                      desc="Dispatch as soon as you launch"
                    />
                    <ChoiceCard
                      icon={<CalendarClock className="w-4 h-4" />}
                      active={form.send_mode === "schedule"}
                      onClick={() => patch({ send_mode: "schedule" })}
                      title="Schedule for later"
                      desc="Pick a date and time"
                    />
                  </div>

                  {form.send_mode === "schedule" && (
                    <Field label="Send at" required>
                      <DateTimePicker
                        value={fromLocalDateTimeString(form.scheduled_at)}
                        onChange={(d) => patch({ scheduled_at: toLocalDateTimeString(d) })}
                      />
                    </Field>
                  )}

                  {isBroadcast ? (
                    <div className="rounded-control border border-border p-4 flex items-center gap-2 text-sm text-muted-foreground">
                      <Repeat className="w-4 h-4" />A broadcast sends once. Use a campaign if you
                      need it to repeat.
                    </div>
                  ) : (
                    <div className="rounded-control border border-border p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Repeat className="w-4 h-4 text-primary" />
                          <div>
                            <div className="text-sm font-medium">Recurring campaign</div>
                            <div className="text-xs text-muted-foreground">
                              Automatically re-run on a schedule
                            </div>
                          </div>
                        </div>
                        <Checkbox
                          checked={form.is_recurring}
                          onCheckedChange={(v) => patch({ is_recurring: v === true })}
                        />
                      </div>
                      {form.is_recurring && (
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-sm text-muted-foreground">Every</span>
                          <input
                            type="number"
                            min={1}
                            className="w-20 px-2 py-1.5 rounded-control border border-border bg-background text-sm"
                            value={form.recurrence_interval}
                            onChange={(e) => patch({ recurrence_interval: Number(e.target.value) })}
                          />
                          <select
                            className="px-2 py-1.5 rounded-control border border-border bg-background text-sm"
                            value={form.recurrence_freq}
                            onChange={(e) => patch({ recurrence_freq: e.target.value as any })}
                          >
                            <option value="daily">day(s)</option>
                            <option value="weekly">week(s)</option>
                            <option value="monthly">month(s)</option>
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  <Field label="Throttle" hint="Messages per minute — keeps deliverability healthy">
                    <input
                      type="number"
                      min={1}
                      max={600}
                      className="w-full px-3 py-2.5 rounded-control border border-border bg-background text-sm"
                      value={form.throttle_per_minute}
                      onChange={(e) => patch({ throttle_per_minute: Number(e.target.value) })}
                    />
                  </Field>

                  <div className="flex items-center gap-3 rounded-control border border-border p-4">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">Require approval before sending</div>
                      <div className="text-xs text-muted-foreground">
                        A teammate must approve this campaign before dispatch
                      </div>
                    </div>
                    <Checkbox
                      checked={form.requires_approval}
                      onCheckedChange={(v) => patch({ requires_approval: v === true })}
                    />
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className="max-w-2xl space-y-4">
                  <div className="rounded-control border border-border overflow-hidden">
                    <div
                      className={cn(
                        "p-5",
                        readiness.ready
                          ? "bg-gradient-to-br from-primary/10 to-accent/5"
                          : "bg-destructive/5",
                      )}
                    >
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                        {readiness.ready ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                            Ready to {form.send_mode === "schedule" ? "schedule" : "launch"}
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                            Not ready — {readiness.issues.length} item
                            {readiness.issues.length === 1 ? "" : "s"} to fix
                          </>
                        )}
                      </div>
                      <div className="text-xl font-semibold mt-1">
                        {form.name || (isBroadcast ? "Untitled broadcast" : "Untitled campaign")}
                      </div>
                      {form.description && (
                        <div className="text-sm text-muted-foreground mt-1">{form.description}</div>
                      )}
                    </div>
                    <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      <ReviewRow k="Type" v={isBroadcast ? "Broadcast (one-time)" : "Campaign"} />
                      <ReviewRow k="Channel" v="WhatsApp" />
                      <ReviewRow
                        k="Sender"
                        v={
                          sender
                            ? `${sender.displayName ?? "WhatsApp account"} · ${sender.status ?? "unknown"}`
                            : "Not resolved"
                        }
                        bad={issuesFor("sender").length > 0}
                      />
                      <ReviewRow
                        k="Template"
                        v={
                          selectedTemplate
                            ? `${selectedTemplate.name} · ${selectedTemplate.status ?? "—"}`
                            : "None selected"
                        }
                        bad={issuesFor("template").length > 0}
                      />
                      <ReviewRow
                        k="Template language"
                        v={(selectedTemplate as any)?.language || "—"}
                        bad={issuesFor("template").length > 0}
                      />
                      <ReviewRow
                        k="Variables"
                        v={
                          detectedVars.length === 0
                            ? "None required"
                            : issuesFor("variables").length === 0
                              ? `${detectedVars.length} mapped`
                              : `${issuesFor("variables").length} of ${detectedVars.length} unmapped`
                        }
                        bad={issuesFor("variables").length > 0}
                      />
                      <ReviewRow k="Goal" v={GOALS.find((g) => g.id === form.goal)?.label ?? "—"} />
                      <ReviewRow
                        k="Audience"
                        v={audienceLabel}
                        bad={issuesFor("audience").length > 0}
                      />
                      <ReviewRow
                        k="Eligible recipients"
                        v={
                          audienceLoading
                            ? "Counting"
                            : `${(audience?.eligible ?? 0).toLocaleString()}${audience?.partial ? "+" : ""}`
                        }
                        bad={!audienceLoading && (audience?.eligible ?? 0) === 0}
                      />
                      <ReviewRow
                        k="Skipped recipients"
                        v={
                          audienceLoading
                            ? "Counting"
                            : audience && audience.skipped > 0
                              ? `${audience.skipped.toLocaleString()} · ${audience.reasons
                                  .map(
                                    (r) =>
                                      `${r.count} ${INELIGIBILITY_REASON[r.reason].toLowerCase()}`,
                                  )
                                  .join(", ")}`
                              : "0"
                        }
                      />
                      <ReviewRow
                        k="Schedule"
                        v={
                          form.send_mode === "now"
                            ? "Immediately"
                            : form.scheduled_at
                              ? formatZoned(new Date(form.scheduled_at), {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })
                              : "Not set"
                        }
                        bad={issuesFor("schedule").length > 0}
                      />
                      {!isBroadcast && (
                        <ReviewRow
                          k="Recurring"
                          v={
                            form.is_recurring
                              ? `Every ${form.recurrence_interval} ${form.recurrence_freq}`
                              : "No"
                          }
                        />
                      )}
                      <ReviewRow k="Throttle" v={`${form.throttle_per_minute}/min`} />
                      <ReviewRow
                        k="Approval"
                        v={form.requires_approval ? "Required" : "Not required"}
                      />
                    </div>
                  </div>

                  {!readiness.ready && (
                    <div
                      role="alert"
                      className="rounded-control border border-destructive/40 bg-destructive/5 p-4 space-y-2"
                    >
                      <div className="text-sm font-medium text-destructive flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" />
                        Fix these before scheduling or sending
                      </div>
                      <ul className="space-y-1.5">
                        {readiness.issues.map((issue, i) => (
                          <li
                            key={`${issue.section}-${i}`}
                            className="text-xs text-muted-foreground"
                          >
                            <span className="font-medium text-foreground">
                              {SECTION_LABEL[issue.section]}
                            </span>
                            {" — "}
                            {issue.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <footer className="shrink-0 flex flex-wrap gap-2 items-center justify-between px-6 py-4 border-t border-border bg-surface/50">
              <button
                onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-control text-sm text-muted-foreground hover:bg-muted"
              >
                <ChevronLeft className="w-4 h-4" />
                {step === 0 ? "Cancel" : "Back"}
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={saveDraft}
                  disabled={!form.name || saving !== null}
                  className="px-3 py-2 rounded-control text-sm border border-border hover:bg-muted disabled:opacity-50"
                >
                  {saving === "draft" ? "Saving" : "Save draft"}
                </button>
                {step < STEPS.length - 1 ? (
                  <button
                    onClick={() => setStep(step + 1)}
                    disabled={!canNext}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-control text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shadow-sm"
                  >
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={launch}
                    // Readiness blocks both Schedule and Send Now; the same
                    // verdict is re-derived server-side, so this is a hint
                    // rather than the enforcement.
                    disabled={saving !== null || !readiness.ready}
                    title={readiness.ready ? undefined : readiness.summary}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-control text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shadow-sm"
                  >
                    {saving === "launch" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Rocket className="w-4 h-4" />
                    )}
                    {form.requires_approval
                      ? "Submit for approval"
                      : form.send_mode === "now"
                        ? isBroadcast
                          ? "Send broadcast now"
                          : "Launch now"
                        : isBroadcast
                          ? "Schedule broadcast"
                          : "Schedule campaign"}
                  </button>
                )}
              </div>
            </footer>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium">
          {label} {required && <span className="text-destructive">*</span>}
        </label>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-control border border-border bg-surface p-3">
      <div className="w-8 h-8 rounded-control bg-primary/10 text-primary grid place-items-center">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px]  text-muted-foreground">{label}</div>
        <div className="text-sm truncate">{value}</div>
      </div>
    </div>
  );
}

function ChoiceCard({
  active,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-4 rounded-control border text-left transition-all",
        active
          ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm"
          : "border-border hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="w-7 h-7 rounded-control bg-primary/10 text-primary grid place-items-center">
          {icon}
        </span>
        {title}
      </div>
      <div className="text-xs text-muted-foreground mt-2">{desc}</div>
    </button>
  );
}

function ReviewRow({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <div>
      <div className="text-[11px]  text-muted-foreground">{k}</div>
      <div className={cn("text-sm font-medium mt-0.5", bad && "text-destructive")}>{v}</div>
    </div>
  );
}
