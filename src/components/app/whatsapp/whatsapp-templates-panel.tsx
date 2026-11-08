/**
 * WhatsApp templates management panel.
 *
 * Full CRUD + sync + preview + version history + analytics.
 * Multi-tenant / multi-account: filters by channel account (WABA/phone).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { MergeFieldPicker } from "./merge-field-picker";
import { mergeFieldSamples } from "./merge-fields";
import { Languages } from "lucide-react";
import { format } from "date-fns";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  BadgeCheck,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Clock,
  Copy,
  Edit3,
  Eye,
  FileText,
  History,
  ImageIcon,
  Info,
  ListChecks,
  Loader2,
  MapPin,
  MessageSquare,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TopbarActions } from "@/components/app/topbar-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  useTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useSyncTemplates,
  usePreviewTemplate,
  useTemplateAnalytics,
  useUploadHeaderSample,
  UploadCanceledError,
  HEADER_UPLOAD_MAX_ATTEMPTS,
  type HeaderUploadPhase,
} from "@/hooks/use-wa-templates";
import { useChannelAccounts, type ChannelAccountRow } from "@/hooks/use-channel-accounts";
import { useCurrentWorkspace, useWorkspaceRole } from "@/hooks/use-workspace";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { syncTemplates as syncTemplatesFn } from "@/lib/messaging/send.functions";
import {
  acceptAttribute,
  readMediaDuration,
  readPdfPageCount,
  validateDuration,
  validateHeaderMedia,
  validatePageCount,
  humanBytes,
  HEADER_MEDIA_RULES,
  type HeaderMediaFormat,
} from "@/lib/messaging/header-media-limits";
import { splitFriendlyMessage } from "@/lib/messaging/meta-error-messages";
import { templateEditorGate } from "@/lib/messaging/template-editor-gate";
import { createSubmitGuard } from "@/lib/messaging/submit-guard";
import {
  formatTemplatePayloadIssue,
  validateTemplateComponents,
  validateTemplatePayload,
} from "@/lib/messaging/template-payload-schema";
import {
  buttonFieldKey,
  collectTemplateFieldErrors,
  templateErrorsByField,
} from "@/lib/messaging/template-field-errors";
import {
  findTemplateButtonIssues,
  formatTemplateButtonIssue,
  normalizeTemplateComponentPhones,
  normalizeTemplateButtonPhone,
  normalizeTemplateUrlVariables,
  validateTemplateButtonPhone,
  validateTemplateButtonUrl,
} from "@/lib/messaging/template-url-validation";
import { UrlParamMapping } from "./url-param-mapping";

import {
  findTemplateBodyIssues,
  formatTemplateBodyIssue,
  renumberTemplateTokens,
  type TemplateBodyIssue,
} from "@/lib/messaging/template-body-validation";
import { templateSnapshotKey } from "@/lib/messaging/template-versions";
import {
  applyConversionToComponents,
  describeConversion,
  planTemplateVariableConversion,
  type TemplateConversionPlan,
} from "@/lib/messaging/template-import-convert";
import { TemplateConversionPreview } from "@/components/app/whatsapp/template-conversion-preview";

import {
  getAutoConvertOnImport,
  setAutoConvertOnImport,
} from "@/lib/messaging/template-convert-preference";
import { parseTemplateRejection } from "@/lib/messaging/template-rejection";
import {
  buildTemplateVariableRemap,
  isVariableIndexRejection,
} from "@/lib/messaging/template-variable-remap";

import { isSampleTemplate, SAMPLE_TEMPLATE_MESSAGE } from "@/lib/messaging/sample-templates";
import {
  normalizeTemplateVariables,
  templateVariableExamples,
} from "@/lib/messaging/template-variables";
import {
  clearHeaderMediaDraft,
  headerMediaDraftKey,
  loadHeaderMediaDraft,
  readPreviewDataUrl,
  saveHeaderMediaDraft,
} from "@/lib/messaging/header-media-draft";

type Category = "MARKETING" | "UTILITY" | "AUTHENTICATION";
type Status = "draft" | "pending" | "approved" | "rejected" | "paused" | "disabled";

/** A button as edited in the form; `PHONE_NUMBER` is WhatsApp's call button. */
type TemplateButtonDraft = {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "FLOW";
  text: string;
  url?: string;
  phone_number?: string;
  /** Meta Flow id, used when `type` is FLOW (a WhatsApp Form). */
  flow_id?: string;
};

interface TemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";
  text?: string;
  example?: Record<string, unknown>;
  buttons?: TemplateButtonDraft[];
}

interface Template {
  id: string;
  workspace_id: string;
  channel_account_id: string;
  name: string;
  language: string;
  category: string;
  status: Status;
  components: TemplateComponent[];
  variables: string[];
  versions: Array<{
    version: number;
    created_at: string;
    category?: string;
    components?: TemplateComponent[];
  }>;
  external_template_id: string | null;
  rejection_reason: string | null;
  quality_score: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_STYLE: Record<Status, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground border-border" },
  pending: { label: "Pending", className: "bg-warning/10 text-warning border-warning/30" },
  approved: { label: "Approved", className: "bg-success/10 text-success border-success/30" },
  rejected: {
    label: "Rejected",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  paused: { label: "Paused", className: "bg-warning/10 text-warning border-warning/30" },
  disabled: {
    label: "Disabled",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

const CATEGORY_META: Record<Category, { label: string; icon: typeof Zap; hint: string }> = {
  MARKETING: { label: "Marketing", icon: Zap, hint: "Promotional messages, offers, newsletters." },
  UTILITY: {
    label: "Utility",
    icon: ClipboardList,
    hint: "Order updates, receipts, account alerts.",
  },
  AUTHENTICATION: {
    label: "Authentication",
    icon: ShieldCheck,
    hint: "One-time passcodes and verification codes.",
  },
};

const LANGUAGES = [
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "es", label: "Spanish" },
  { code: "pt_BR", label: "Portuguese (BR)" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "nb_NO", label: "Norwegian" },
  { code: "sv", label: "Swedish" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "id", label: "Indonesian" },
  { code: "ja", label: "Japanese" },
  { code: "zh_CN", label: "Chinese (Simplified)" },
];

// ---------------------------------------------------------------------------
// panel
// ---------------------------------------------------------------------------

export function WhatsAppTemplatesPanel({
  createOnMount = false,
}: { createOnMount?: boolean } = {}) {
  const { data: ws, isPending: workspacePending } = useCurrentWorkspace();
  const { data: accountsRes, isPending: accountsPending } = useChannelAccounts(ws?.id);
  const accounts = (accountsRes?.accounts ?? []) as ChannelAccountRow[];
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [tab, setTab] = useState<"all" | Category>("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(createOnMount);

  const { data: userRole, isPending: rolePending } = useWorkspaceRole(ws?.id);
  const isAdmin = userRole === "owner" || userRole === "admin";

  const channelAccountId = accountFilter === "all" ? undefined : accountFilter;
  const { data, isLoading } = useTemplates(ws?.id, channelAccountId);

  const templates = (data?.templates ?? []) as unknown as Template[];
  const sync = useSyncTemplates();
  const queryClient = useQueryClient();
  const runSyncTemplates = useServerFn(syncTemplatesFn);
  const [syncingAll, setSyncingAll] = useState(false);

  // Sync every WhatsApp account, not just the default one, and report each
  // account separately so one failing token does not hide the others.
  async function syncAllAccounts() {
    if (!ws?.id) return;
    const targets = accounts.filter((a) => a.provider === "whatsapp_cloud");
    if (targets.length === 0) return;
    setSyncingAll(true);
    const lines: string[] = [];
    let failed = 0;
    for (const acc of targets) {
      try {
        const r = await runSyncTemplates({
          data: { workspaceId: ws.id, channelAccountId: acc.id },
        });
        lines.push(`${acc.display_name}: ${r.synced} templates`);
      } catch (e) {
        failed += 1;
        // Keep the reason short: drop Meta's trailing docs sentence.
        const reason = e instanceof Error ? e.message.split(". Please read")[0] : "sync failed";
        lines.push(`${acc.display_name}: ${reason}`);
      }
    }
    setSyncingAll(false);
    await queryClient.invalidateQueries({ queryKey: ["wa_templates"] });
    if (failed > 0)
      toast.error("Some WhatsApp accounts did not sync", { description: lines.join(" · ") });
    else toast.success("All WhatsApp accounts synced", { description: lines.join(" · ") });
  }

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (tab !== "all" && t.category !== tab) return false;
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [templates, tab, search]);

  const totals = useMemo(() => {
    const c = { total: templates.length, approved: 0, pending: 0, rejected: 0, draft: 0 };
    for (const t of templates) {
      if (t.status in c) (c as Record<string, number>)[t.status] += 1;
    }
    return c;
  }, [templates]);

  const primaryAccountId =
    channelAccountId ?? accounts.find((a) => a.is_default)?.id ?? accounts[0]?.id;

  // Resolved only while the user is actually trying to create, so the list
  // view for a read-only member stays free of permission warnings.
  const editorGate = templateEditorGate({
    workspacePending,
    workspaceId: ws?.id,
    rolePending,
    isAdmin,
    accountsPending,
    accountId: primaryAccountId,
  });

  return (
    <div className="space-y-6">
      <TopbarActions>
        <Button
          variant="outline"
          size="sm"
          disabled={!primaryAccountId || sync.isPending || syncingAll || !isAdmin}
          onClick={() => void syncAllAccounts()}
          title={!isAdmin ? "Only admins can sync templates" : undefined}
        >
          {sync.isPending || syncingAll ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Sync from WA
        </Button>
        <Button
          size="sm"
          onClick={() => setCreating(true)}
          disabled={!primaryAccountId || !isAdmin}
          title={!isAdmin ? "Only admins can create templates" : undefined}
        >
          <Plus className="w-4 h-4" /> New template
        </Button>
      </TopbarActions>

      {/* stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total", value: totals.total, icon: MessageSquare },
          { label: "Approved", value: totals.approved, icon: BadgeCheck, tone: "text-success" },
          { label: "Pending", value: totals.pending, icon: Clock, tone: "text-warning" },
          { label: "Draft", value: totals.draft, icon: Edit3 },
          {
            label: "Rejected",
            value: totals.rejected,
            icon: CircleAlert,
            tone: "text-destructive",
          },
        ].map((s) => (
          <div key={s.label} className="rounded-control border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <s.icon className={`w-4 h-4 ${s.tone ?? "text-muted-foreground"}`} />
            </div>
            <div className="text-xl font-semibold mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      {/* filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="md:w-64">
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.display_name} · {a.phone_number ?? a.phone_number_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input
          className="md:flex-1"
          placeholder="Search by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {accounts.length === 0 && !accountsPending && editorGate.state !== "blocked" && (
        <Alert>
          <CircleAlert className="w-4 h-4" />
          <AlertTitle>No WhatsApp account connected</AlertTitle>
          <AlertDescription>
            Connect a WhatsApp Business Account in the WhatsApp Accounts tab before creating
            templates.
          </AlertDescription>
        </Alert>
      )}

      {/* The editor was requested but cannot open — say why instead of
          rendering nothing, which is indistinguishable from a dead button. */}
      {creating && editorGate.state === "blocked" && (
        <Alert variant="destructive" data-testid="wa-template-create-blocked">
          <CircleAlert className="w-4 h-4" />
          <AlertTitle>{editorGate.title}</AlertTitle>
          <AlertDescription>{editorGate.description}</AlertDescription>
        </Alert>
      )}

      {/* tabs by category */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="MARKETING">Marketing</TabsTrigger>
          <TabsTrigger value="UTILITY">Utility</TabsTrigger>
          <TabsTrigger value="AUTHENTICATION">Authentication</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-control border border-dashed border-border p-12 text-center">
              <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No templates yet. Create one or Sync from WA.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map((t) => (
                <TemplateCard key={t.id} template={t} accounts={accounts} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {creating && editorGate.state === "ready" && ws?.id && primaryAccountId && (
        <TemplateEditorDialog
          open={creating}
          onOpenChange={setCreating}
          workspaceId={ws.id}
          channelAccountId={primaryAccountId}
          accounts={accounts}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// template card
// ---------------------------------------------------------------------------

function TemplateCard({
  template,
  accounts,
}: {
  template: Template;
  accounts: ChannelAccountRow[];
}) {
  const { data: ws } = useCurrentWorkspace();
  const { data: userRole } = useWorkspaceRole(ws?.id);
  const isAdmin = userRole === "owner" || userRole === "admin";
  const formatZoned = useZonedDateFormatter();

  const [editing, setEditing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [cloning, setCloning] = useState(false);
  const del = useDeleteTemplate();
  const create = useCreateTemplate();
  const update = useUpdateTemplate();

  const account = accounts.find((a) => a.id === template.channel_account_id);
  const status = STATUS_STYLE[template.status] ?? STATUS_STYLE.draft;

  const cat = CATEGORY_META[template.category as Category];

  async function cloneToLanguage(lang: string) {
    if (!lang || lang === template.language) return;
    await create.mutateAsync({
      workspaceId: template.workspace_id,
      channelAccountId: template.channel_account_id,
      name: template.name,
      language: lang,
      category: template.category as Category,
      components: template.components as unknown as Array<Record<string, unknown>>,
      submit: false,
    });
    setCloning(false);
  }

  const bodyText = template.components.find((c) => c.type === "BODY")?.text ?? "";
  const hasMedia = template.components.some(
    (c) => c.type === "HEADER" && c.format && c.format !== "TEXT",
  );
  const hasButtons = template.components.some((c) => c.type === "BUTTONS");
  const isSample = isSampleTemplate(template.name);
  const templateVars = normalizeTemplateVariables(template.variables);
  const varIssues = findTemplateBodyIssues(template.components);
  const buttonIssues = findTemplateButtonIssues(template.components);
  const rejectionHint = parseTemplateRejection(template.rejection_reason, template.components);

  /**
   * One-click recovery for a phone rejection: apply the suggested E.164 value
   * to the stored components and resubmit in the same call. Name, language,
   * category, body and variables are untouched — only the phone value changes.
   */
  const phoneFix = useMemo(() => {
    if (rejectionHint?.field !== "phone_number" || !rejectionHint.suggestion) return null;
    const { components, changes } = normalizeTemplateComponentPhones(template.components);
    if (changes.length === 0) return null;
    return { components: components as Array<Record<string, unknown>>, changes };
  }, [rejectionHint, template.components]);

  async function applyPhoneFixAndResubmit() {
    if (!phoneFix) return;
    await update.mutateAsync({
      id: template.id,
      components: phoneFix.components,
      resubmit: true,
    });
  }

  /**
   * One-click recovery for a variable-index rejection: renumber placeholders to
   * sequential {{1}}, {{2}},  per component, carry the example values with
   * them, and resubmit. Name, language, category and buttons stay as-is.
   */
  const variableFix = useMemo(() => {
    const rejectedForVars =
      !!template.rejection_reason &&
      template.status === "rejected" &&
      (isVariableIndexRejection(template.rejection_reason) || varIssues.length > 0);
    if (!rejectedForVars) return null;
    return buildTemplateVariableRemap(template.components, template.variables);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.rejection_reason, template.components, template.variables, varIssues.length]);

  async function applyVariableFixAndResubmit() {
    if (!variableFix) return;
    await update.mutateAsync({
      id: template.id,
      components: variableFix.components,
      resubmit: true,
    });
  }

  return (
    <div className="rounded-control border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{template.name}</span>
            <Badge variant="outline" className={status.className}>
              {status.label}
            </Badge>
            {cat && (
              <Badge variant="outline" className="text-xs">
                <cat.icon className="w-3 h-3 " />
                {cat.label}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {template.language}
            </Badge>
            {hasMedia && (
              <Badge variant="outline" className="text-xs">
                <ImageIcon className="w-3 h-3 " />
                Media
              </Badge>
            )}
            {hasButtons && (
              <Badge variant="outline" className="text-xs">
                <ListChecks className="w-3 h-3 " />
                Interactive
              </Badge>
            )}
            {isSample && (
              <Badge variant="outline" className="text-xs">
                Meta sample · read-only
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2 whitespace-pre-wrap">
            {bodyText || "—"}
          </p>
          <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-1">
            <span>Account: {account?.display_name ?? "—"}</span>
            {templateVars.length > 0 && (
              <span>Variables: {templateVars.map((v) => `{{${v}}}`).join(", ")}</span>
            )}
            <span>
              Updated {formatZoned(new Date(template.updated_at), { dateStyle: "medium" })}
            </span>
          </div>
          {isSample && (
            <p className="text-xs text-muted-foreground mt-2">{SAMPLE_TEMPLATE_MESSAGE}</p>
          )}
          {varIssues.length > 0 && (
            <p className="text-xs text-destructive mt-2">{varIssues[0].message}</p>
          )}
          {buttonIssues.length > 0 &&
            !(template.rejection_reason && template.status === "rejected") && (
              <p className="text-xs text-destructive mt-2">{buttonIssues[0].reason}</p>
            )}
          {template.rejection_reason && template.status === "rejected" && (
            <div className="mt-2 rounded-control border border-destructive/30 bg-destructive/5 p-2 space-y-1">
              <p className="text-xs text-destructive">Rejected: {template.rejection_reason}</p>
              {rejectionHint && (
                <p className="text-xs text-muted-foreground">{rejectionHint.message}</p>
              )}
              {rejectionHint?.suggestion && (
                <p className="text-xs text-muted-foreground">
                  Suggested fix: <span className="font-mono">{rejectionHint.suggestion}</span>
                </p>
              )}
              {variableFix && (
                <p className="text-xs text-muted-foreground">
                  Variable remap:{" "}
                  <span className="font-mono">
                    {Object.entries(variableFix.tokenMap)
                      .map(([from, to]) => `{{${from}}} → {{${to}}}`)
                      .join(", ")}
                  </span>
                </p>
              )}
              {isAdmin && !isSample && (
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {phoneFix && (
                    <Button
                      size="sm"
                      className="h-7"
                      disabled={update.isPending}
                      onClick={applyPhoneFixAndResubmit}
                      title={`Set ${phoneFix.changes[0].from} → ${phoneFix.changes[0].to} and resubmit`}
                    >
                      {update.isPending ? "Resubmitting" : "Apply fix & resubmit"}
                    </Button>
                  )}
                  {variableFix && !phoneFix && (
                    <Button
                      size="sm"
                      className="h-7"
                      disabled={update.isPending}
                      data-testid="wa-template-variable-fix"
                      onClick={applyVariableFixAndResubmit}
                      title={
                        "Renumber variables to {{1}}, {{2}},  and resubmit — name, category and sample values are kept"
                      }
                    >
                      {update.isPending ? "Resubmitting" : "Apply fix & resubmit"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() => setEditing(true)}
                  >
                    {phoneFix || variableFix ? "Review in editor" : "Fix & resubmit"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setPreviewing(true)}
            title="Preview"
            className="h-9 w-9"
          >
            <Eye className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setShowVersions(true)}
            title="Version history"
            className="h-9 w-9"
          >
            <History className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setCloning(true)}
            title="Add language variant"
            className="h-9 w-9"
          >
            <Languages className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            disabled={isSample || !isAdmin}
            onClick={() => setEditing(true)}
            title={
              !isAdmin
                ? "Only admins can edit templates"
                : isSample
                  ? SAMPLE_TEMPLATE_MESSAGE
                  : "Edit"
            }
            className="h-9 w-9"
          >
            <Edit3 className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            disabled={isSample || !isAdmin}
            onClick={() => {
              if (
                confirm(`Delete template "${template.name}"? This also removes it from WhatsApp.`)
              )
                del.mutate(template.id);
            }}
            title={
              !isAdmin
                ? "Only admins can delete templates"
                : isSample
                  ? SAMPLE_TEMPLATE_MESSAGE
                  : "Delete"
            }
            className="h-9 w-9"
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </div>

      {cloning && (
        <Dialog open={cloning} onOpenChange={setCloning}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Add language variant</DialogTitle>
              <DialogDescription>
                Copies the current components as a new draft in another language. Same name, submit
                separately for approval.
              </DialogDescription>
            </DialogHeader>
            <Label>Language</Label>
            <Select onValueChange={cloneToLanguage}>
              <SelectTrigger>
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.filter((l) => l.code !== template.language).map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCloning(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <TemplateAnalyticsStrip id={template.id} />

      {editing && (
        <TemplateEditorDialog
          open={editing}
          onOpenChange={setEditing}
          workspaceId={template.workspace_id}
          channelAccountId={template.channel_account_id}
          accounts={accounts}
          existing={template}
        />
      )}
      {previewing && (
        <TemplatePreviewDialog open={previewing} onOpenChange={setPreviewing} template={template} />
      )}
      {showVersions && (
        <TemplateVersionsDialog
          open={showVersions}
          onOpenChange={setShowVersions}
          template={template}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// analytics strip
// ---------------------------------------------------------------------------

function TemplateAnalyticsStrip({ id }: { id: string }) {
  const { data } = useTemplateAnalytics(id);
  if (!data) return null;
  const total = data.sent + data.delivered + data.read + data.failed;
  if (total === 0) return null;
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border">
      <span>
        Sent <strong className="text-foreground">{data.sent}</strong>
      </span>
      <span>
        Delivered <strong className="text-foreground">{data.delivered}</strong>
      </span>
      <span>
        Read <strong className="text-foreground">{data.read}</strong>
      </span>
      <span>
        Failed{" "}
        <strong className={data.failed > 0 ? "text-destructive" : "text-foreground"}>
          {data.failed}
        </strong>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// editor dialog
// ---------------------------------------------------------------------------

export function TemplateEditorDialog({
  open,
  onOpenChange,
  workspaceId,
  channelAccountId,
  accounts,
  existing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  channelAccountId: string;
  accounts: ChannelAccountRow[];
  existing?: Template;
}) {
  const create = useCreateTemplate();
  const update = useUpdateTemplate();
  // A draft Meta has never seen can still be renamed; once submitted the name
  // and language are immutable at the provider.
  const isLocalDraft =
    Boolean(existing) && existing?.status === "draft" && !existing?.external_template_id;
  const identityLocked = Boolean(existing) && !isLocalDraft;
  const [name, setName] = useState(existing?.name ?? "");
  const [language, setLanguage] = useState(existing?.language ?? "en_US");
  const [category, setCategory] = useState<Category>(
    (existing?.category as Category) ?? "MARKETING",
  );
  const [account, setAccount] = useState(channelAccountId);
  /** Last submit failure, shown inline so the dialog never fails silently. */
  const [submitError, setSubmitError] = useState<{ title: string; description?: string } | null>(
    null,
  );
  const submitGuard = useRef(createSubmitGuard());
  const initial = existing?.components ?? [
    { type: "BODY", text: "Hello {{1}}, thanks for reaching out!" },
  ];
  const [header, setHeader] = useState<string>(
    initial.find((c) => c.type === "HEADER")?.text ?? "",
  );
  const [headerFormat, setHeaderFormat] = useState<
    "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION"
  >(
    (initial.find((c) => c.type === "HEADER")?.format as
      "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION") ?? "NONE",
  );
  const [body, setBody] = useState<string>(initial.find((c) => c.type === "BODY")?.text ?? "");
  const [footer, setFooter] = useState<string>(
    initial.find((c) => c.type === "FOOTER")?.text ?? "",
  );
  const [buttons, setButtons] = useState<TemplateButtonDraft[]>(
    (initial.find((c) => c.type === "BUTTONS")?.buttons as TemplateButtonDraft[]) ?? [],
  );
  const existingHandle = (() => {
    const h = initial.find((c) => c.type === "HEADER");
    const ex = h?.example as { header_handle?: unknown } | undefined;
    const arr = Array.isArray(ex?.header_handle) ? (ex!.header_handle as unknown[]) : [];
    return typeof arr[0] === "string" ? (arr[0] as string) : "";
  })();
  // Persisted upload context (file name / thumbnail) for the handle stored on
  // the template, so reopening the editor keeps showing the chosen file.
  const draftKey = useMemo(
    () => headerMediaDraftKey(workspaceId, existing?.id, existing?.channel_account_id ?? account),
    [workspaceId, existing?.id, existing?.channel_account_id, account],
  );
  const persisted = useMemo(() => {
    const draft = loadHeaderMediaDraft(draftKey);
    if (!draft) return null;
    // For a saved template the template's own handle wins; a stale draft that
    // points at a different upload must not be resurrected.
    if (existingHandle && draft.handle !== existingHandle) return null;
    return draft;
  }, [draftKey, existingHandle]);

  const [headerHandle, setHeaderHandle] = useState<string>(
    existingHandle || persisted?.handle || "",
  );
  const [headerFileName, setHeaderFileName] = useState<string>(
    persisted?.fileName ?? (existingHandle ? "File already uploaded" : ""),
  );
  const [headerPreview, setHeaderPreview] = useState<string>(persisted?.previewDataUrl ?? "");

  const [dragActive, setDragActive] = useState(false);
  const uploadSample = useUploadHeaderSample();
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [uploadPhase, setUploadPhase] = useState<HeaderUploadPhase | "idle" | "canceled" | "error">(
    "idle",
  );
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadAttempt, setUploadAttempt] = useState({
    attempt: 1,
    maxAttempts: HEADER_UPLOAD_MAX_ATTEMPTS,
  });
  const [uploadNote, setUploadNote] = useState("");
  const uploadAbortRef = useRef<AbortController | null>(null);
  const rampRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFileRef = useRef<File | null>(null);

  const stopRamp = () => {
    if (rampRef.current) {
      clearInterval(rampRef.current);
      rampRef.current = null;
    }
  };

  useEffect(
    () => () => {
      stopRamp();
      uploadAbortRef.current?.abort();
    },
    [],
  );

  // A restored create-draft also restores the media header format it was for,
  // otherwise the handle would sit invisible behind a "None" header.
  useEffect(() => {
    if (!existing && persisted && headerFormat === "NONE") setHeaderFormat(persisted.format);
    // Only meant to run for the initial rehydrate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cancelHeaderUpload() {
    uploadAbortRef.current?.abort();
    stopRamp();
    setUploadPhase("canceled");
    setUploadPercent(0);
    setUploadNote("");
  }

  /** Drop the selected media entirely: preview, file name and uploaded handle. */
  function clearHeaderMedia() {
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    stopRamp();
    setHeaderHandle("");
    setHeaderFileName("");
    setHeaderPreview((prev) => {
      // Persisted previews are data URLs; only session previews are object URLs.
      if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return "";
    });
    clearHeaderMediaDraft(draftKey);
    lastFileRef.current = null;
    setUploadPhase("idle");
    setUploadPercent(0);
    setUploadNote("");
    setUploadAttempt({ attempt: 1, maxAttempts: HEADER_UPLOAD_MAX_ATTEMPTS });
    if (mediaInputRef.current) mediaInputRef.current.value = "";
  }

  const acceptFor = (fmt: string) => acceptAttribute(fmt as HeaderMediaFormat);

  async function handleHeaderFile(file: File | undefined | null) {
    if (!file) return;
    const fmt = headerFormat as HeaderMediaFormat;
    const typeError = validateHeaderMedia(fmt, { mimeType: file.type, size: file.size });
    if (typeError) {
      toast.error(typeError);
      return;
    }
    const duration = await readMediaDuration(file);
    const durationError = validateDuration(fmt, duration);
    if (durationError) {
      toast.error(durationError);
      return;
    }
    const pageError = validatePageCount(fmt, await readPdfPageCount(file));
    if (pageError) {
      toast.error(pageError);
      return;
    }

    lastFileRef.current = file;
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setUploadPhase("encoding");
    setUploadPercent(0);
    setUploadNote("");
    setUploadAttempt({ attempt: 1, maxAttempts: HEADER_UPLOAD_MAX_ATTEMPTS });

    try {
      const res = await uploadSample.mutateAsync({
        workspaceId,
        channelAccountId: existing?.channel_account_id ?? account,
        file,
        ...(duration ? { durationSeconds: duration } : {}),
        signal: controller.signal,
        onProgress: ({ phase, percent, attempt, maxAttempts, reason }) => {
          setUploadPhase(phase);
          setUploadAttempt({ attempt, maxAttempts });
          if (phase === "retrying") {
            // A transient failure (network blip, Meta 5xx or rate limit).
            stopRamp();
            setUploadPercent(30);
            setUploadNote(reason ?? "Temporary problem reaching Meta");
            return;
          }
          setUploadPercent((prev) =>
            phase === "uploading" ? Math.max(prev, percent) : Math.max(prev, percent),
          );
          if (phase === "uploading" && !rampRef.current) {
            // Meta's resumable upload gives no byte-level feedback, so creep
            // toward 90% while the server transfer is in flight.
            rampRef.current = setInterval(() => {
              setUploadPercent((prev) => (prev < 90 ? prev + 1 : prev));
            }, 250);
          }
          if (phase === "done") stopRamp();
        },
      });

      stopRamp();
      setUploadPhase("done");
      setUploadPercent(100);
      setUploadNote("");
      setHeaderHandle(res.handle);
      setHeaderFileName(file.name);
      setHeaderPreview((prev) => {
        if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
        return file.type.startsWith("image/") || file.type.startsWith("video/")
          ? URL.createObjectURL(file)
          : "";
      });
      // Remember the upload so reopening this template keeps file + handle.
      const previewDataUrl = await readPreviewDataUrl(file);
      saveHeaderMediaDraft(draftKey, {
        handle: res.handle,
        fileName: file.name,
        mimeType: file.type,
        format: fmt,
        ...(previewDataUrl ? { previewDataUrl } : {}),
      });

      toast.success(`${file.name} uploaded`);
    } catch (err) {
      stopRamp();
      setUploadPercent(0);
      setHeaderHandle("");
      if (err instanceof UploadCanceledError || controller.signal.aborted) {
        setUploadPhase("canceled");
        toast.info("Upload canceled");
        return;
      }
      setUploadPhase("error");
      // Upload failures come back as "what went wrong\nwhat to do about it".
      const { title, description } = splitFriendlyMessage(
        err instanceof Error && err.message ? err.message : "Upload failed",
      );
      toast.error(title, description ? { description, duration: 10_000 } : undefined);
    }
  }

  const headerRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const footerRef = useRef<HTMLInputElement>(null);

  function insertAt<E extends HTMLInputElement | HTMLTextAreaElement>(
    el: E | null,
    value: string,
    setValue: (v: string) => void,
    token: string,
  ) {
    if (!el) {
      setValue(value + token);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    setValue(next);
    // Restore caret after React re-renders.
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  const components: TemplateComponent[] = useMemo(() => {
    const out: TemplateComponent[] = [];
    if (headerFormat !== "NONE") {
      if (headerFormat === "TEXT") {
        out.push({ type: "HEADER", format: "TEXT", text: header || "" });
      } else if (headerFormat === "LOCATION") {
        // Location headers carry no sample: the coordinates are supplied per send.
        out.push({ type: "HEADER", format: "LOCATION" });
      } else {
        out.push({
          type: "HEADER",
          format: headerFormat,
          ...(headerHandle ? { example: { header_handle: [headerHandle] } } : {}),
        });
      }
    }
    out.push({ type: "BODY", text: body });
    if (footer.trim()) out.push({ type: "FOOTER", text: footer.trim() });
    if (buttons.length > 0) out.push({ type: "BUTTONS", buttons });
    return out;
  }, [header, headerFormat, headerHandle, body, footer, buttons]);

  function nextVariableIndex(text: string): number {
    const re = /\{\{\s*(\d+)\s*\}\}/g;
    const seen = new Set<number>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) seen.add(Number(m[1]));
    return seen.size + 1;
  }

  const variables = useMemo(() => {
    const set = new Set<string>();
    const re = /\{\{\s*(\d+)\s*\}\}/g;
    const s = `${header} ${body} ${footer}`;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) set.add(m[1]);
    return Array.from(set);
  }, [header, body, footer]);

  // Every param path Meta may validate, mapped back to the editor field it
  // belongs to. Recomputed as the admin types so submit stays blocked while
  // anything is invalid.
  const fieldErrors = useMemo(
    () =>
      collectTemplateFieldErrors({
        name,
        language,
        category,
        components,
        isEdit: identityLocked,
        headerFormat,
        headerHandle,
      }),
    [name, language, category, components, identityLocked, headerFormat, headerHandle],
  );
  const errorFor = useMemo(() => templateErrorsByField(fieldErrors), [fieldErrors]);
  const hasBlockingErrors = fieldErrors.length > 0;
  // Errors that have no matching input (payload/component-level rules).
  const generalErrors = useMemo(
    () =>
      fieldErrors.filter(
        (e) =>
          !["name", "language", "category", "header", "body", "footer", "buttons"].includes(
            e.field,
          ) && !e.field.startsWith("buttons."),
      ),
    [fieldErrors],
  );
  const varIssues = useMemo(() => findTemplateBodyIssues(components), [components]);
  const bodyIssue = varIssues[0];
  /** Components (HEADER/BODY/FOOTER) whose placeholders can be auto-renumbered. */
  const fixableVarComponents = useMemo(() => {
    const set = new Set<"HEADER" | "BODY" | "FOOTER">();
    for (const [text, kind] of [
      [header, "HEADER"],
      [body, "BODY"],
      [footer, "FOOTER"],
    ] as const) {
      if (text && renumberTemplateTokens(text) !== text) set.add(kind);
    }
    return set;
  }, [header, body, footer]);

  /** Remap out-of-range/invalid {{n}} placeholders to sequential indices. */
  function fixVariables(scope?: "HEADER" | "BODY" | "FOOTER") {
    let fixed = 0;
    if (!scope || scope === "HEADER") {
      const next = renumberTemplateTokens(header);
      if (next !== header) {
        setHeader(next);
        fixed++;
      }
    }
    if (!scope || scope === "BODY") {
      const next = renumberTemplateTokens(body);
      if (next !== body) {
        setBody(next);
        fixed++;
      }
    }
    if (!scope || scope === "FOOTER") {
      const next = renumberTemplateTokens(footer);
      if (next !== footer) {
        setFooter(next);
        fixed++;
      }
    }
    if (fixed > 0) toast.success(`Variables renumbered in ${fixed} field${fixed > 1 ? "s" : ""}`);
  }

  /**
   * Optional converter for imported drafts: rewrites named placeholders such
   * as {{name}} into {{1}}, {{2}},  in order of appearance, per component.
   */
  const conversionPlan = useMemo(
    () => planTemplateVariableConversion({ header, body, footer, buttons }),
    [header, body, footer, buttons],
  );
  const [autoConvert, setAutoConvert] = useState(true);
  /** Persisted preference: convert on import without prompting. */
  const [convertOnImport, setConvertOnImport] = useState(false);

  /** Writes the plan back into the editor fields so the operator can review it. */
  function applyConversion(plan: TemplateConversionPlan = conversionPlan, notify = true) {
    if (!plan.changed) return;
    if (plan.header !== undefined) setHeader(plan.header);
    if (plan.body !== undefined) setBody(plan.body);
    if (plan.footer !== undefined) setFooter(plan.footer);
    if (Object.keys(plan.buttonUrls).length > 0) {
      setButtons((prev) =>
        prev.map((b, i) =>
          plan.buttonUrls[i] !== undefined ? { ...b, url: plan.buttonUrls[i] } : b,
        ),
      );
    }
    if (!notify) return;
    toast.success(
      `Converted ${plan.renames.length} variable${plan.renames.length > 1 ? "s" : ""}`,
      {
        description: describeConversion(plan),
      },
    );
  }

  // On open, load the stored preference and — when enabled — silently renumber
  // an imported draft once, so the converter banner never appears for it.
  const convertedOnOpenRef = useRef(false);
  useEffect(() => {
    if (!open) {
      convertedOnOpenRef.current = false;
      return;
    }
    setSubmitError(null);
    const pref = getAutoConvertOnImport();
    setConvertOnImport(pref);
    if (!pref || convertedOnOpenRef.current) return;
    convertedOnOpenRef.current = true;
    const plan = planTemplateVariableConversion({ header, body, footer, buttons });
    if (!plan.changed) return;
    applyConversion(plan, false);
    toast.success("Imported variables renumbered automatically", {
      description: describeConversion(plan),
    });
    // Runs once per open with the draft as loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save(submit: boolean) {
    // Convert first when enabled, so validation and the payload both see the
    // numbered version of an imported template.
    const converted =
      autoConvert && conversionPlan.changed
        ? applyConversionToComponents(components, conversionPlan)
        : components;
    if (autoConvert && conversionPlan.changed) applyConversion();

    if (submit) {
      // Recompute from the live draft: never rely on memoized state to decide
      // whether a payload may reach Meta.
      const blocking = collectTemplateFieldErrors({
        name,
        language,
        category,
        components: converted,
        isEdit: identityLocked,
        headerFormat,
        headerHandle,
      });
      if (blocking.length > 0) {
        const first = blocking[0];
        toast.error(`Param ${first.path} is invalid`, {
          description:
            blocking.length > 1
              ? `${first.message} (+${blocking.length - 1} more field${blocking.length > 2 ? "s" : ""} to fix)`
              : first.message,
          duration: 12_000,
          action:
            fixableVarComponents.size > 0
              ? { label: "Fix all variables", onClick: () => fixVariables() }
              : undefined,
        });
        return;
      }
    }

    if (existing) {
      await update.mutateAsync({
        id: existing.id,
        ...(isLocalDraft ? { name: name.trim(), language } : {}),
        category,
        components: converted as unknown as Array<Record<string, unknown>>,
        resubmit: submit,
      });
    } else {
      const created = await create.mutateAsync({
        workspaceId,
        channelAccountId: account,
        name: name.trim(),
        language,
        category,
        components: converted as unknown as Array<Record<string, unknown>>,
        submit,
      });

      // Re-key the pending create draft onto the saved template so the file
      // context follows it into future edit sessions.
      const newId = (created as { id?: string } | undefined)?.id;
      if (headerHandle && newId) {
        const draft = loadHeaderMediaDraft(draftKey);
        if (draft) saveHeaderMediaDraft(headerMediaDraftKey(workspaceId, newId, account), draft);
      }
      clearHeaderMediaDraft(draftKey);
    }

    onOpenChange(false);
  }

  /**
   * Click entry point for both footer actions.
   *
   * `save` awaits `mutateAsync`, which re-throws after the hook's `onError`
   * toast. Calling it straight from `onClick` left that rejection floating as
   * an unhandled promise, so the failure never reached the dialog: it stayed
   * open with no indication of what went wrong. The rejection is handled here
   * and surfaced inline, and the guard flips synchronously so a double click
   * cannot start a second submit before `busy` re-renders.
   */
  function handleSave(submit: boolean) {
    setSubmitError(null);
    void submitGuard.current.run(async () => {
      try {
        await save(submit);
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        // splitFriendlyMessage yields the operator-facing title/hint pair the
        // server already sanitises; raw provider payloads never reach here.
        setSubmitError(splitFriendlyMessage(raw || "Could not save this template"));
      }
    });
  }

  const busy = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{existing ? `Edit ${existing.name}` : "Create template"}</DialogTitle>
          <DialogDescription>
            Templates are submitted to WhatsApp for approval. Approval typically completes within
            minutes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1">
          <div className="grid md:grid-cols-2 gap-6">
            {/* editor */}
            <div className="space-y-4">
              {!existing && (
                <div>
                  <Label>Account</Label>
                  <Select value={account} onValueChange={setAccount}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Name</Label>
                  <Input
                    disabled={identityLocked}
                    value={name}
                    onChange={(e) =>
                      setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))
                    }
                    placeholder="order_confirmation"
                    aria-invalid={Boolean(errorFor["name"])}
                    className={
                      errorFor["name"]
                        ? "border-destructive focus-visible:ring-destructive"
                        : undefined
                    }
                  />
                  <FieldError message={errorFor["name"]} field="name" />
                </div>
                <div>
                  <Label>Language</Label>
                  <Select value={language} onValueChange={setLanguage} disabled={identityLocked}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l.code} value={l.code}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={errorFor["language"]} field="language" />
                </div>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CATEGORY_META) as Category[]).map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_META[c].label} — {CATEGORY_META[c].hint}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={errorFor["category"]} field="category" />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label>Header</Label>
                  {headerFormat === "TEXT" && (
                    <MergeFieldPicker
                      onInsert={(t) => insertAt(headerRef.current, header, setHeader, t)}
                      getNextIndex={() => nextVariableIndex(header)}
                      label="Insert variable"
                    />
                  )}
                </div>
                <div className="flex gap-2 mt-1">
                  <Select
                    value={headerFormat}
                    onValueChange={(v) => {
                      if (v !== headerFormat) clearHeaderMedia();
                      setHeaderFormat(v as typeof headerFormat);
                    }}
                  >
                    <SelectTrigger className="w-32" data-testid="wa-header-format">
                      <SelectValue />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="NONE">None</SelectItem>
                      <SelectItem value="TEXT">Text</SelectItem>
                      <SelectItem value="IMAGE">Image</SelectItem>
                      <SelectItem value="VIDEO">Video</SelectItem>
                      <SelectItem value="DOCUMENT">Document</SelectItem>
                      <SelectItem value="LOCATION">Location</SelectItem>
                    </SelectContent>
                  </Select>
                  {headerFormat === "TEXT" && (
                    <Input
                      ref={headerRef}
                      value={header}
                      onChange={(e) => setHeader(e.target.value)}
                      placeholder="Header text (max 60)"
                      maxLength={60}
                    />
                  )}
                </div>

                {headerFormat === "LOCATION" && (
                  <p className="mt-2 rounded-control border border-border p-3 text-xs text-muted-foreground">
                    Location headers need no upload. Meta shows a map card and you supply the
                    latitude, longitude, name and address as header parameters when sending the
                    message.
                  </p>
                )}

                {headerFormat !== "NONE" &&
                  headerFormat !== "TEXT" &&
                  headerFormat !== "LOCATION" && (
                    <div className="mt-2 space-y-2 rounded-control border border-border p-3">
                      <p className="text-xs text-muted-foreground">
                        Upload your own {headerFormat.toLowerCase()} for this header. Allowed:{" "}
                        {HEADER_MEDIA_RULES[headerFormat as HeaderMediaFormat].mimes
                          .map((m) =>
                            m.split("/")[1].replace("vnd.openxmlformats-officedocument.", ""),
                          )
                          .join(", ")}{" "}
                        · max{" "}
                        {humanBytes(HEADER_MEDIA_RULES[headerFormat as HeaderMediaFormat].maxBytes)}
                        {HEADER_MEDIA_RULES[headerFormat as HeaderMediaFormat].maxDurationSeconds
                          ? ` · max ${HEADER_MEDIA_RULES[headerFormat as HeaderMediaFormat].maxDurationSeconds}s`
                          : ""}
                        .
                      </p>

                      <input
                        ref={mediaInputRef}
                        data-testid="wa-header-file-input"
                        type="file"

                        className="hidden"
                        accept={acceptFor(headerFormat)}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          await handleHeaderFile(file);
                        }}
                      />

                      <div
                        data-testid="wa-header-dropzone"

                        role="button"
                        tabIndex={0}
                        onClick={() => !uploadSample.isPending && mediaInputRef.current?.click()}
                        onKeyDown={(e) =>
                          (e.key === "Enter" || e.key === " ") &&
                          !uploadSample.isPending &&
                          mediaInputRef.current?.click()
                        }
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragActive(true);
                        }}
                        onDragLeave={() => setDragActive(false)}
                        onDrop={async (e) => {
                          e.preventDefault();
                          setDragActive(false);
                          if (uploadSample.isPending) return;
                          await handleHeaderFile(e.dataTransfer.files?.[0]);
                        }}
                        className={`flex cursor-pointer items-center justify-center gap-2 rounded-control border-2 border-dashed p-4 text-xs transition-colors ${
                          dragActive
                            ? "border-primary bg-primary/5 text-foreground"
                            : "text-muted-foreground hover:bg-muted/50"
                        } ${uploadSample.isPending ? "cursor-not-allowed opacity-60" : ""}`}
                      >
                        {uploadSample.isPending ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
                            {uploadPhase === "encoding"
                              ? "Preparing file"
                              : uploadPhase === "retrying"
                                ? `Retrying upload (attempt ${uploadAttempt.attempt} of ${uploadAttempt.maxAttempts})`
                                : "Uploading to Meta"}
                          </>
                        ) : (
                          <>
                            <ImageIcon className="w-3.5 h-3.5" /> Drop your{" "}
                            {headerFormat.toLowerCase()} here or click to choose a file
                          </>
                        )}
                      </div>

                      {uploadSample.isPending && (
                        <div className="space-y-2" data-testid="wa-header-upload-progress">
                          <Progress value={uploadPercent} className="h-2" />
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
                              data-testid="wa-header-upload-status"
                            >
                              {uploadPhase === "encoding"
                                ? "Preparing file"
                                : uploadPhase === "retrying"
                                  ? `Retrying — attempt ${uploadAttempt.attempt} of ${uploadAttempt.maxAttempts}`
                                  : uploadAttempt.attempt > 1
                                    ? `Uploading to Meta (attempt ${uploadAttempt.attempt} of ${uploadAttempt.maxAttempts})`
                                    : "Uploading to Meta"}{" "}
                              · {uploadPercent}%
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              data-testid="wa-header-upload-cancel"
                              onClick={cancelHeaderUpload}
                            >
                              <X className="mr-1 h-3.5 w-3.5" /> Cancel
                            </Button>
                          </div>
                          {uploadNote && (
                            <p className="text-xs text-amber-600 [overflow-wrap:anywhere]">
                              {uploadNote}
                            </p>
                          )}
                        </div>
                      )}

                      {!uploadSample.isPending &&
                        (uploadPhase === "canceled" || uploadPhase === "error") &&
                        lastFileRef.current && (
                          <div className="flex items-center justify-between gap-2 rounded-control border border-border bg-muted/30 p-2">
                            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                              {uploadPhase === "canceled" ? "Upload canceled" : "Upload failed"} —{" "}
                              {lastFileRef.current.name}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              data-testid="wa-header-upload-retry"
                              onClick={() => handleHeaderFile(lastFileRef.current)}
                            >
                              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Retry
                            </Button>
                          </div>
                        )}

                      {(headerFileName || headerPreview) && (
                        <div className="flex items-center gap-3 rounded-control border border-border bg-muted/30 p-2">
                          {headerPreview && headerFormat === "IMAGE" && (
                            <img
                              src={headerPreview}
                              alt="Header preview"
                              className="h-12 w-12 rounded object-cover"
                            />
                          )}
                          {headerPreview && headerFormat === "VIDEO" && (
                            <video
                              src={headerPreview}
                              className="h-12 w-20 rounded object-cover"
                              muted
                              playsInline
                            />
                          )}
                          <span
                            data-testid="wa-header-file-name"
                            className="min-w-0 flex-1 truncate text-xs"
                          >
                            {headerFileName}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            data-testid="wa-header-media-replace"
                            disabled={uploadSample.isPending}
                            onClick={() => mediaInputRef.current?.click()}
                          >
                            Replace
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            data-testid="wa-header-media-remove"
                            disabled={uploadSample.isPending}
                            onClick={() => {
                              clearHeaderMedia();
                              toast.info("Header media removed");
                            }}
                          >
                            <X className="mr-1 h-3.5 w-3.5" /> Remove
                          </Button>
                        </div>
                      )}

                      {!headerHandle && (
                        <p className="text-xs text-amber-600">
                          Upload a {headerFormat.toLowerCase()} file before submitting this template
                          for approval.
                        </p>
                      )}
                    </div>
                  )}
              </div>

              <FieldError message={errorFor["header"]} field="header" />
              <VariableFixRow
                issues={varIssues}
                component="HEADER"
                fixable={fixableVarComponents.has("HEADER")}
                onFix={() => fixVariables("HEADER")}
              />

              <div>
                <div className="flex items-center justify-between">
                  <Label>
                    Body <span className="text-xs text-muted-foreground">— required</span>
                  </Label>
                  <MergeFieldPicker
                    onInsert={(t) => insertAt(bodyRef.current, body, setBody, t)}
                    getNextIndex={() => nextVariableIndex(body)}
                    label="Insert variable"
                  />
                </div>
                <Alert variant="default" className="mt-2 py-2 bg-primary/5 border-primary/20">
                  <Info className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-xs">
                    WhatsApp only accepts numbered placeholders like{" "}
                    <code className="font-mono text-foreground">{"{{1}}"}</code> and{" "}
                    <code className="font-mono text-foreground">{"{{2}}"}</code>. Named variables
                    such as <code className="font-mono text-foreground">{"{{order_id}}"}</code> are
                    rejected by Meta.
                  </AlertDescription>
                </Alert>
                <Textarea
                  ref={bodyRef}
                  rows={5}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Hi {{1}}, your order {{2}} has shipped."
                  aria-invalid={Boolean(errorFor["body"])}
                  className={`mt-2 ${errorFor["body"] ? "border-destructive focus-visible:ring-destructive" : ""}`}
                />
                <FieldError message={errorFor["body"]} field="body" />
                <VariableFixRow
                  issues={varIssues}
                  component="BODY"
                  fixable={fixableVarComponents.has("BODY")}
                  onFix={() => fixVariables("BODY")}
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label>
                    Footer <span className="text-xs text-muted-foreground">(optional)</span>
                  </Label>
                  <MergeFieldPicker
                    onInsert={(t) => insertAt(footerRef.current, footer, setFooter, t)}
                    getNextIndex={() => nextVariableIndex(footer)}
                    label="Insert variable"
                  />
                </div>
                <Input
                  ref={footerRef}
                  value={footer}
                  onChange={(e) => setFooter(e.target.value)}
                  maxLength={60}
                  aria-invalid={Boolean(errorFor["footer"])}
                  className={`mt-1 ${errorFor["footer"] ? "border-destructive focus-visible:ring-destructive" : ""}`}
                />
                <FieldError message={errorFor["footer"]} field="footer" />
                <VariableFixRow
                  issues={varIssues}
                  component="FOOTER"
                  fixable={fixableVarComponents.has("FOOTER")}
                  onFix={() => fixVariables("FOOTER")}
                />
              </div>

              {fixableVarComponents.size > 1 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => fixVariables()}
                >
                  Fix all variables ({fixableVarComponents.size} fields)
                </Button>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <Label>Buttons</Label>
                  {buttons.length < 3 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setButtons([...buttons, { type: "QUICK_REPLY", text: "" }])}
                    >
                      <Plus className="w-3 h-3 " /> Add button
                    </Button>
                  )}
                </div>
                <FieldError message={errorFor["buttons"]} field="buttons" />
                <div className="space-y-2 mt-1">
                  {buttons.map((b, i) => {
                    // Meta answers a bad call button with the opaque
                    // "(#192)  ['phone_number'] is not a valid phone number",
                    // so the same checks run here, as the admin types — plus the
                    // label/quick-reply rules from the full payload schema.
                    const labelError = errorFor[buttonFieldKey(i, "text")];
                    const typeError = errorFor[buttonFieldKey(i, "type")];
                    const urlError =
                      b.type === "URL" && (b.url ?? "").trim() !== ""
                        ? validateTemplateButtonUrl(b.url)
                        : (errorFor[buttonFieldKey(i, "url")] ?? null);
                    const phoneError =
                      b.type === "PHONE_NUMBER" && (b.phone_number ?? "").trim() !== ""
                        ? validateTemplateButtonPhone(b.phone_number)
                        : (errorFor[buttonFieldKey(i, "phone_number")] ?? null);
                    const fieldError = urlError ?? phoneError ?? labelError ?? typeError;

                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex gap-2">
                          <Select
                            value={b.type}
                            onValueChange={(v) => {
                              const next = [...buttons];
                              next[i] = { ...next[i], type: v as TemplateButtonDraft["type"] };
                              setButtons(next);
                            }}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="QUICK_REPLY">Reply</SelectItem>
                              <SelectItem value="URL">URL</SelectItem>
                              <SelectItem value="PHONE_NUMBER">Call</SelectItem>
                              <SelectItem value="FLOW">Form (Flow)</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            value={b.text}
                            onChange={(e) => {
                              const next = [...buttons];
                              next[i] = { ...next[i], text: e.target.value };
                              setButtons(next);
                            }}
                            placeholder="Button label"
                            maxLength={25}
                          />
                          {b.type === "URL" && (
                            <Input
                              value={b.url ?? ""}
                              onChange={(e) => {
                                const next = [...buttons];
                                next[i] = { ...next[i], url: e.target.value };
                                setButtons(next);
                              }}
                              // Links pasted from a browser arrive with %7B%7B1%7D%7D —
                              // decode them back into a real placeholder on blur.
                              onBlur={() => {
                                const normalized = normalizeTemplateUrlVariables(b.url);
                                if (!normalized || normalized === (b.url ?? "").trim()) return;
                                const next = [...buttons];
                                next[i] = { ...next[i], url: normalized };
                                setButtons(next);
                              }}
                              placeholder="https://example.com/orders?id={{1}}"
                              aria-invalid={Boolean(urlError)}
                              className={
                                urlError
                                  ? "border-destructive focus-visible:ring-destructive"
                                  : undefined
                              }
                            />
                          )}

                          {b.type === "FLOW" && (
                            <Input
                              value={b.flow_id ?? ""}
                              onChange={(e) => {
                                const next = [...buttons];
                                next[i] = { ...next[i], flow_id: e.target.value.trim() };
                                setButtons(next);
                              }}
                              placeholder="Flow ID (from WhatsApp Forms)"
                            />
                          )}

                          {b.type === "PHONE_NUMBER" && (
                            <Input
                              value={b.phone_number ?? ""}
                              onChange={(e) => {
                                const next = [...buttons];
                                next[i] = { ...next[i], phone_number: e.target.value };
                                setButtons(next);
                              }}
                              // Tidy "+1 (415) 555-1234" into E.164 the moment focus leaves.
                              onBlur={() => {
                                const normalized = normalizeTemplateButtonPhone(b.phone_number);
                                if (!normalized || normalized === (b.phone_number ?? "").trim())
                                  return;
                                const next = [...buttons];
                                next[i] = { ...next[i], phone_number: normalized };
                                setButtons(next);
                              }}
                              inputMode="tel"
                              placeholder="+14155551234"
                              aria-invalid={Boolean(phoneError)}
                              className={
                                phoneError
                                  ? "border-destructive focus-visible:ring-destructive"
                                  : undefined
                              }
                            />
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setButtons(buttons.filter((_, j) => j !== i))}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                        {fieldError && <p className="text-xs text-destructive">{fieldError}</p>}
                        {b.type === "URL" && (b.url ?? "").trim() !== "" && (
                          <UrlParamMapping url={b.url} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* live preview */}
            <div className="space-y-2">
              <Label>Live preview</Label>
              <div className="rounded-control border border-border bg-muted/30 p-4 min-h-[300px]">
                <PhoneBubble
                  components={components}
                  mediaPreview={headerPreview}
                  mediaFileName={headerFileName}
                />
              </div>
              {variables.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Detected variables: {variables.map((v) => `{{${v}}}`).join(", ")}
                </p>
              )}
            </div>
          </div>

          {conversionPlan.changed && (
            <div
              data-testid="wa-template-convert-banner"
              className="rounded-control border border-border bg-muted/40 p-3 text-xs space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium">Convert named variables to numbered</p>
                  <p className="text-muted-foreground">
                    Imported templates often use names. WhatsApp only accepts {"{{1}}"}, {"{{2}}"},
                     — these will be renumbered in order of appearance.
                  </p>
                  <p className="[overflow-wrap:anywhere] text-muted-foreground">
                    {describeConversion(conversionPlan)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch
                    id="wa-auto-convert"
                    checked={autoConvert}
                    onCheckedChange={setAutoConvert}
                    aria-label="Convert named variables on save"
                  />
                  <Label htmlFor="wa-auto-convert" className="text-xs">
                    On save
                  </Label>
                </div>
              </div>
              <TemplateConversionPreview
                draft={{ header, body, footer, buttons }}
                plan={conversionPlan}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" size="sm" variant="outline" onClick={() => applyConversion()}>
                  Convert now
                </Button>
                <div className="flex items-center gap-2">
                  <Switch
                    id="wa-convert-on-import"
                    checked={convertOnImport}
                    onCheckedChange={(v) => {
                      setConvertOnImport(v);
                      setAutoConvertOnImport(v);
                      if (v) {
                        applyConversion(conversionPlan, false);
                        toast.success("Imported templates will convert automatically", {
                          description: "The converter banner stays hidden from now on.",
                        });
                      }
                    }}
                    aria-label="Always convert named variables on import"
                  />
                  <Label htmlFor="wa-convert-on-import" className="text-xs">
                    Always convert on import (don't ask again)
                  </Label>
                </div>
              </div>
            </div>
          )}

          {hasBlockingErrors && (
            <div
              data-testid="wa-template-error-summary"
              className="rounded-control border border-destructive/40 bg-destructive/5 p-3 text-xs"
            >
              <p className="font-medium text-destructive">
                {fieldErrors.length} issue{fieldErrors.length > 1 ? "s" : ""} must be fixed before
                WhatsApp will accept this template
              </p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {fieldErrors.slice(0, 6).map((e) => (
                  <li key={`${e.field}-${e.message}`} className="[overflow-wrap:anywhere]">
                    <code className="text-[11px]">{e.path}</code> — {e.message}
                  </li>
                ))}
              </ul>
              {generalErrors.length > 0 && fieldErrors.length > 6 && (
                <p className="mt-1 text-muted-foreground">and {fieldErrors.length - 6} more.</p>
              )}
            </div>
          )}

          {submitError && (
            <Alert variant="destructive" data-testid="wa-template-submit-error">
              <CircleAlert className="w-4 h-4" />
              <AlertTitle>{submitError.title}</AlertTitle>
              {submitError.description && (
                <AlertDescription>{submitError.description}</AlertDescription>
              )}
            </Alert>
          )}
        </div>
        {/* end scrollable area */}

        <DialogFooter className="shrink-0 border-t pt-4 mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !body.trim() || (!existing && !name.trim())}
            onClick={() => handleSave(false)}
          >
            {busy && <Loader2 className="w-3 h-3 mr-1 animate-spin" />} Save draft
          </Button>
          <Button
            disabled={
              busy ||
              !body.trim() ||
              (!existing && !name.trim()) ||
              hasBlockingErrors ||
              (headerFormat !== "NONE" &&
                headerFormat !== "TEXT" &&
                headerFormat !== "LOCATION" &&
                !headerHandle)
            }
            data-testid="wa-template-submit"
            title={hasBlockingErrors ? fieldErrors[0]?.message : undefined}
            onClick={() => handleSave(true)}
          >
            {busy && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}{" "}
            {existing ? "Save & resubmit to Meta" : "Submit to Meta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Inline, field-level error text tied to a Meta parameter path. */
function FieldError({ message, field }: { message?: string | null; field: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs text-destructive" data-testid={`wa-template-error-${field}`}>
      {message}
    </p>
  );
}

/**
 * Placeholder problems for one text component plus a one-click remap that
 * renumbers its {{n}} tokens to sequential, in-range indices.
 */
function VariableFixRow({
  issues,
  component,
  fixable,
  onFix,
}: {
  issues: TemplateBodyIssue[];
  component: "HEADER" | "BODY" | "FOOTER";
  fixable: boolean;
  onFix: () => void;
}) {
  const matching = issues.filter((i) => i.component === component);
  const issue = matching[0];
  if (!issue && !fixable) return null;
  const rename = matching.flatMap((i) => i.rename ?? []);
  return (
    <div className="mt-1 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {issue && (
          <p
            className="text-xs text-destructive"
            data-testid={`wa-template-vars-${component.toLowerCase()}`}
          >
            {matching.map((i) => i.message).join(" ")}
          </p>
        )}
        {fixable && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs"
            onClick={onFix}
          >
            Fix variables
          </Button>
        )}
      </div>
      {rename.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-1.5"
          data-testid={`wa-template-vars-rename-${component.toLowerCase()}`}
        >
          {rename.map((r) => (
            <span
              key={`${r.from}-${r.to}`}
              className="inline-flex items-center gap-1 rounded-control border border-destructive/30 bg-destructive/5 px-1.5 py-0.5 font-mono text-[11px]"
            >
              <span className="text-destructive line-through">{r.from}</span>
              <span className="text-muted-foreground">→</span>
              <span className="text-foreground">{r.to}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// preview dialog with variable inputs
// ---------------------------------------------------------------------------

function TemplatePreviewDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template: Template;
}) {
  const vars = useMemo(() => normalizeTemplateVariables(template.variables), [template.variables]);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const list = normalizeTemplateVariables(template.variables);
    const samples = mergeFieldSamples(list);
    const stored = templateVariableExamples(template.variables);
    const seed: Record<string, string> = {};
    for (const v of list) seed[v] = stored[v] ?? samples[v] ?? "";
    return seed;
  });
  const preview = usePreviewTemplate();
  const rendered = preview.data?.preview.components ?? template.components;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{template.name}</DialogTitle>
          <DialogDescription>Fill sample values to preview how variables render.</DialogDescription>
        </DialogHeader>
        {vars.length > 0 && (
          <div className="space-y-2">
            {vars.map((v) => (
              <div key={v}>
                <Label className="text-xs">{`{{${v}}}`}</Label>
                <Input
                  value={values[v] ?? ""}
                  onChange={(e) => setValues({ ...values, [v]: e.target.value })}
                />
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => preview.mutate({ id: template.id, variables: values })}
            >
              Render
            </Button>
          </div>
        )}
        <div className="rounded-control border border-border bg-muted/30 p-4">
          <PhoneBubble components={rendered as TemplateComponent[]} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// version history dialog
// ---------------------------------------------------------------------------

function TemplateVersionsDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template: Template;
}) {
  const formatZoned = useZonedDateFormatter();
  // Older rows can contain identical consecutive snapshots (repeated saves or
  // resubmits of unchanged content). Collapse them into a single entry.
  const collapsed = useMemo(() => {
    const out: Array<{
      version: number;
      created_at: string;
      category?: string;
      components?: TemplateComponent[];
      repeats: number;
      lastAt: string;
    }> = [];
    for (const v of template.versions) {
      const prev = out[out.length - 1];
      const same =
        prev &&
        templateSnapshotKey(prev.category, prev.components) ===
          templateSnapshotKey(v.category, v.components);
      if (same && prev) {
        prev.repeats += 1;
        prev.lastAt = v.created_at;
        continue;
      }
      out.push({ ...v, repeats: 1, lastAt: v.created_at });
    }
    return out.reverse();
  }, [template.versions]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Version history — {template.name}</DialogTitle>
          <DialogDescription>
            Each change is captured with a timestamp and component snapshot. Re-saves without
            changes are grouped.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {collapsed.length === 0 && (
            <p className="text-sm text-muted-foreground">No versions recorded.</p>
          )}
          {collapsed.map((v) => (
            <div key={v.version} className="rounded-control border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">v{v.version}</span>
                <span className="text-xs text-muted-foreground">
                  {formatZoned(new Date(v.created_at), { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
              {v.repeats > 1 && (
                <div className="text-[11px] text-muted-foreground mt-1">
                  Re-saved {v.repeats - 1} more {v.repeats - 1 === 1 ? "time" : "times"} with no
                  changes (last{" "}
                  {formatZoned(new Date(v.lastAt), { dateStyle: "medium", timeStyle: "short" })})
                </div>
              )}
              {v.category && (
                <div className="text-xs text-muted-foreground mt-1">Category: {v.category}</div>
              )}
              {v.components && (
                <pre className="text-xs bg-muted/40 rounded p-2 mt-2 overflow-x-auto">
                  {JSON.stringify(v.components, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// phone bubble preview
// ---------------------------------------------------------------------------

function PhoneBubble({
  components,
  mediaPreview,
  mediaFileName,
}: {
  components: TemplateComponent[];
  mediaPreview?: string;
  mediaFileName?: string;
}) {
  const header = components.find((c) => c.type === "HEADER");
  const body = components.find((c) => c.type === "BODY");
  const footer = components.find((c) => c.type === "FOOTER");
  const btns = components.find((c) => c.type === "BUTTONS");
  const fmt = header?.format;
  return (
    <div className="max-w-[300px] mx-auto rounded-control bg-background border border-border shadow-sm overflow-hidden">
      {header &&
        (fmt === "TEXT" ? (
          <div className="px-3 pt-3 font-semibold text-sm">{header.text}</div>
        ) : fmt === "IMAGE" && mediaPreview ? (
          <img src={mediaPreview} alt="Header preview" className="h-40 w-full object-cover" />
        ) : fmt === "VIDEO" && mediaPreview ? (
          <video
            src={mediaPreview}
            className="h-40 w-full bg-black object-contain"
            controls
            muted
            playsInline
          />
        ) : fmt === "DOCUMENT" && mediaFileName ? (
          <div className="flex items-center gap-2 bg-muted px-3 py-4">
            <FileText className="h-8 w-8 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-xs">{mediaFileName}</span>
          </div>
        ) : fmt === "LOCATION" ? (
          <div className="flex h-32 flex-col items-center justify-center gap-1 bg-muted text-muted-foreground">
            <MapPin className="h-9 w-9" />
            <span className="text-xs">Location card</span>
          </div>
        ) : (
          <div className="bg-muted h-32 flex items-center justify-center text-muted-foreground">
            <ImageIcon className="w-8 h-8" />
            <span className="ml-2 text-xs">{fmt}</span>
          </div>
        ))}
      <div className="px-3 py-2 text-sm whitespace-pre-wrap">{body?.text}</div>
      {footer?.text && <div className="px-3 pb-2 text-xs text-muted-foreground">{footer.text}</div>}
      {btns?.buttons && (
        <div className="border-t border-border">
          {btns.buttons.map((b, i) => (
            <div
              key={i}
              className="px-3 py-2 text-center text-sm text-primary border-t border-border first:border-t-0 flex items-center justify-center gap-1"
            >
              {b.type === "URL" && <Copy className="w-3 h-3" />} {b.text || "Button"}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
