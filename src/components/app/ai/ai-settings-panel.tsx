import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Sparkles,
  Shield,
  Gauge,
  DollarSign,
  Save,
  RefreshCw,
  Loader2,
  History,
  KeyRound,
  EyeOff,
  ScrollText,
  AlertTriangle,
  Building2,
  Lock,
  Cpu,
  Trash2,
} from "lucide-react";
import { useCurrentWorkspace, useWorkspaceRole } from "@/hooks/use-workspace";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  useAiSettings,
  useAiSettingsMutation,
  useAiQuotaUsage,
  useAiAuditLogs,
  useAiProviderOptions,
  useAiBusinessContext,
  useSaveAiBusinessContext,
  useSaveTenantAiProvider,
  useDeleteTenantAiProvider,
  type AiSettings,
} from "@/hooks/use-ai-settings";
import { AI_BUSINESS_CONTEXT_MAX } from "@/lib/ai/settings.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS = [
  { id: "owner", label: "Owner" },
  { id: "admin", label: "Admin" },
  { id: "member", label: "Member" },
  { id: "agent", label: "Agent" },
  { id: "viewer", label: "Viewer" },
];

const MODERATION_CATEGORIES = [
  { id: "hate", label: "Hate speech" },
  { id: "sexual", label: "Sexual content" },
  { id: "violence", label: "Violence" },
  { id: "self_harm", label: "Self-harm" },
  { id: "harassment", label: "Harassment" },
  { id: "illegal", label: "Illegal activity" },
];

export function AiSettingsPanel() {
  const ws = useCurrentWorkspace();
  const workspaceId = ws.data?.id;
  const settingsQ = useAiSettings(workspaceId);
  const providersQ = useAiProviderOptions(workspaceId);
  const quotaQ = useAiQuotaUsage(workspaceId);
  const auditQ = useAiAuditLogs(workspaceId);
  const mutation = useAiSettingsMutation(workspaceId);

  const [form, setForm] = useState<AiSettings | null>(null);
  useEffect(() => {
    if (settingsQ.data && !form) setForm(settingsQ.data);
  }, [settingsQ.data, form]);

  const dirty = useMemo(() => {
    if (!form || !settingsQ.data) return false;
    return JSON.stringify(form) !== JSON.stringify(settingsQ.data);
  }, [form, settingsQ.data]);

  if (!workspaceId || settingsQ.isLoading || !form) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading AI settings
      </div>
    );
  }

  function patch<K extends keyof AiSettings>(k: K, v: AiSettings[K]) {
    setForm((prev) => (prev ? { ...prev, [k]: v } : prev));
  }

  async function onSave() {
    if (!form || !settingsQ.data) return;
    const changed: Partial<AiSettings> = {};
    for (const key of Object.keys(form) as (keyof AiSettings)[]) {
      if (JSON.stringify(form[key]) !== JSON.stringify(settingsQ.data[key])) {
        (changed as Record<string, unknown>)[key as string] = form[key];
      }
    }
    if (Object.keys(changed).length === 0) return;
    delete (changed as Record<string, unknown>).workspace_id;
    delete (changed as Record<string, unknown>).created_at;
    delete (changed as Record<string, unknown>).updated_at;
    delete (changed as Record<string, unknown>).updated_by;
    await mutation.mutateAsync(changed);
  }

  function onReset() {
    if (settingsQ.data) setForm(settingsQ.data);
  }

  const selectedProvider =
    providersQ.data?.find((p) => p.id === form.default_provider_id) ??
    providersQ.data?.find((p) => p.isDefault) ??
    providersQ.data?.[0];
  // Never fall back across vendors — an OpenAI provider must never offer a
  // Gemini model id, and vice versa.
  const providerModels: { id: string; label: string }[] = selectedProvider?.models ?? [];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-xl flex items-center gap-2">
            <Bot className="w-4 h-4 text-accent" /> AI Settings
          </h2>
          <p className="text-sm text-muted-foreground">
            Customize how AI behaves in this workspace — providers, prompts, quotas, moderation, and
            audit trail.
          </p>
        </div>
      </header>

      <Tabs defaultValue="model">
        <TabsList>
          <TabsTrigger value="model">
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Model
          </TabsTrigger>
          <TabsTrigger value="prompts">
            <ScrollText className="h-3.5 w-3.5 mr-1.5" />
            Prompts
          </TabsTrigger>
          <TabsTrigger value="access">
            <KeyRound className="h-3.5 w-3.5 mr-1.5" />
            Access
          </TabsTrigger>
          <TabsTrigger value="limits">
            <Gauge className="h-3.5 w-3.5 mr-1.5" />
            Limits &amp; cost
          </TabsTrigger>
          <TabsTrigger value="moderation">
            <Shield className="h-3.5 w-3.5 mr-1.5" />
            Moderation
          </TabsTrigger>
          <TabsTrigger value="privacy">
            <EyeOff className="h-3.5 w-3.5 mr-1.5" />
            Privacy
          </TabsTrigger>
          <TabsTrigger value="audit">
            <History className="h-3.5 w-3.5 mr-1.5" />
            Audit log
          </TabsTrigger>
        </TabsList>

        {/* ============ Model ============ */}
        <TabsContent value="model" className="mt-4 space-y-4">
          <ProviderManagerCard workspaceId={workspaceId} />

          <Row
            title="Default provider"
            desc="Provider used when a feature has no explicit override."
          >
            <Select
              value={form.default_provider_id ?? "auto"}
              onValueChange={(v) => {
                const nextId = v === "auto" ? null : v;
                const nextProvider =
                  providersQ.data?.find((p) => p.id === nextId) ??
                  providersQ.data?.find((p) => p.isDefault) ??
                  providersQ.data?.[0];
                setForm((prev) =>
                  prev
                    ? {
                        ...prev,
                        default_provider_id: nextId,
                        default_model: nextProvider?.models[0]?.id ?? null,
                      }
                    : prev,
                );
              }}
            >
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Auto (configured provider)" />
              </SelectTrigger>
              <SelectContent>
                {(providersQ.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.kind})
                  </SelectItem>
                ))}
                <SelectItem value="auto">Auto (configured provider)</SelectItem>
              </SelectContent>
            </Select>
          </Row>

          <Row title="Default model" desc="Selected model used by default across AI features.">
            <Select
              value={form.default_model ?? ""}
              onValueChange={(v) => patch("default_model", v)}
            >
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Choose model" />
              </SelectTrigger>
              <SelectContent>
                {providerModels.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>

          <Row title="Temperature" desc="Higher = more creative. Lower = more deterministic.">
            <div className="w-72">
              <div className="flex items-center justify-between mb-1.5">
                <Slider
                  min={0}
                  max={2}
                  step={0.05}
                  value={[form.temperature]}
                  onValueChange={([v]) => patch("temperature", Math.round(v * 100) / 100)}
                  className="flex-1"
                />
                <Badge variant="outline" className="ml-3 font-mono">
                  {form.temperature.toFixed(2)}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                0.0 precise · 0.7 balanced · 1.2+ creative
              </p>
            </div>
          </Row>

          <Row title="Max tokens" desc="Upper bound on tokens per AI response.">
            <Input
              type="number"
              min={1}
              max={200000}
              className="w-40"
              value={form.max_tokens}
              onChange={(e) => patch("max_tokens", Number(e.target.value) || 1024)}
            />
          </Row>
        </TabsContent>

        {/* ============ Prompts ============ */}
        <TabsContent value="prompts" className="mt-4 space-y-4">
          <BusinessContextCard workspaceId={workspaceId} />
          <PromptField
            label="Organization prompt"
            desc="Applied to every AI call across your organization. Brand, tone, hard rules."
            value={form.organization_prompt ?? ""}
            onChange={(v) => patch("organization_prompt", v || null)}
          />
          <PromptField
            label="Workspace prompt"
            desc="Team/workspace-level context appended after the organization prompt."
            value={form.workspace_prompt ?? ""}
            onChange={(v) => patch("workspace_prompt", v || null)}
          />
          <PromptField
            label="System prompt override"
            desc="Optional override for the default assistant persona. Leave empty to inherit."
            value={form.system_prompt ?? ""}
            onChange={(v) => patch("system_prompt", v || null)}
          />
          <div className="rounded-control border border-dashed border-border p-3 text-xs text-muted-foreground flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 mt-0.5 text-accent" />
            <p>
              Prompts stack in order: <b>Organization</b> → <b>Workspace</b> → per-feature system
              prompt. Reusable prompt templates live in the <b>AI Studio → Prompts</b> section.
            </p>
          </div>
        </TabsContent>

        {/* ============ Access ============ */}
        <TabsContent value="access" className="mt-4 space-y-4">
          <Row title="Allowed roles" desc="Only these workspace roles can invoke AI features.">
            <div className="flex flex-wrap gap-2 max-w-lg">
              {ROLE_OPTIONS.map((r) => {
                const active = form.allowed_roles.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      const set = new Set(form.allowed_roles);
                      if (active) set.delete(r.id);
                      else set.add(r.id);
                      patch("allowed_roles", Array.from(set));
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-control text-xs border transition-colors",
                      active
                        ? "bg-accent/15 border-accent/40 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </Row>
          <Row
            title="Per-user daily limit"
            desc="Max AI requests per user per day. Blank = unlimited."
          >
            <NumberOrBlank
              value={form.per_user_daily_limit}
              onChange={(v) => patch("per_user_daily_limit", v)}
            />
          </Row>
        </TabsContent>

        {/* ============ Limits & cost ============ */}
        <TabsContent value="limits" className="mt-4 space-y-4">
          <QuotaSummary quota={quotaQ.data} form={form} />
          <div className="grid md:grid-cols-2 gap-3">
            <NumberCard
              icon={Gauge}
              title="Daily requests"
              hint="Blocks new AI calls once reached."
              value={form.daily_request_limit}
              onChange={(v) => patch("daily_request_limit", v)}
              used={quotaQ.data?.todayRequests ?? 0}
            />
            <NumberCard
              icon={Gauge}
              title="Monthly requests"
              hint="Rolling calendar month."
              value={form.monthly_request_limit}
              onChange={(v) => patch("monthly_request_limit", v)}
              used={quotaQ.data?.monthRequests ?? 0}
            />
            <NumberCard
              icon={Sparkles}
              title="Daily tokens"
              hint="Prompt + completion tokens."
              value={form.daily_token_limit}
              onChange={(v) => patch("daily_token_limit", v)}
              used={quotaQ.data?.todayTokens ?? 0}
            />
            <NumberCard
              icon={Sparkles}
              title="Monthly tokens"
              value={form.monthly_token_limit}
              onChange={(v) => patch("monthly_token_limit", v)}
              used={quotaQ.data?.monthTokens ?? 0}
            />
            <NumberCard
              icon={DollarSign}
              title="Monthly cost limit (USD)"
              hint="AI usage cost cap for the workspace."
              value={form.monthly_cost_limit_usd}
              onChange={(v) => patch("monthly_cost_limit_usd", v)}
              used={quotaQ.data?.monthCostUsd ?? 0}
              currency
            />
          </div>
        </TabsContent>

        {/* ============ Moderation ============ */}
        <TabsContent value="moderation" className="mt-4 space-y-4">
          <ToggleRow
            title="Content moderation"
            desc="Scan every prompt and reply before storing or sending."
            checked={form.moderation_enabled}
            onChange={(v) => patch("moderation_enabled", v)}
          />
          <Row title="Blocked categories" desc="Refuse content matching any selected category.">
            <div className="flex flex-wrap gap-2 max-w-xl">
              {MODERATION_CATEGORIES.map((c) => {
                const active = form.moderation_categories.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      const set = new Set(form.moderation_categories);
                      if (active) set.delete(c.id);
                      else set.add(c.id);
                      patch("moderation_categories", Array.from(set));
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-control text-xs border transition-colors",
                      active
                        ? "bg-destructive/10 border-destructive/30 text-destructive"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                    disabled={!form.moderation_enabled}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </Row>
          <Row title="Custom blocklist" desc="One phrase per line. Case-insensitive match.">
            <Textarea
              rows={5}
              className="w-full max-w-xl font-mono text-xs"
              value={form.moderation_blocklist.join("\n")}
              onChange={(e) =>
                patch(
                  "moderation_blocklist",
                  e.target.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              placeholder="e.g. competitor-name&#10;internal-code-word"
              disabled={!form.moderation_enabled}
            />
          </Row>
        </TabsContent>

        {/* ============ Privacy ============ */}
        <TabsContent value="privacy" className="mt-4 space-y-4">
          <ToggleRow
            title="Redact PII"
            desc="Auto-mask emails, phone numbers, and IDs before sending to providers."
            checked={form.redact_pii}
            onChange={(v) => patch("redact_pii", v)}
          />
          <ToggleRow
            title="Log prompts"
            desc="Store outgoing prompts for auditing and analytics."
            checked={form.log_prompts}
            onChange={(v) => patch("log_prompts", v)}
          />
          <ToggleRow
            title="Log responses"
            desc="Store AI responses alongside prompts."
            checked={form.log_responses}
            onChange={(v) => patch("log_responses", v)}
          />
          <ToggleRow
            title="Opt out of provider training"
            desc="Send zero-retention headers to supported providers."
            checked={form.training_opt_out}
            onChange={(v) => patch("training_opt_out", v)}
          />
          <ToggleRow
            title="Enable settings audit trail"
            desc="Record who changes AI settings and what changed."
            checked={form.audit_enabled}
            onChange={(v) => patch("audit_enabled", v)}
          />
          <Row title="Retention (days)" desc="Auto-delete AI logs older than this.">
            <Input
              type="number"
              min={1}
              max={3650}
              className="w-40"
              value={form.retention_days}
              onChange={(e) => patch("retention_days", Math.max(1, Number(e.target.value) || 90))}
            />
          </Row>
        </TabsContent>

        {/* ============ Audit log ============ */}
        <TabsContent value="audit" className="mt-4">
          <AuditLogList entries={auditQ.data} loading={auditQ.isLoading} />
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" size="sm" onClick={onReset} disabled={!dirty || mutation.isPending}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Reset
        </Button>
        <Button size="sm" onClick={onSave} disabled={!dirty || mutation.isPending}>
          {mutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1.5" />
          )}
          Save changes
        </Button>
      </div>
    </div>
  );
}

// ==================== Business context ====================

/** Platform providers and tenant-owned encrypted credentials for this workspace. */
function ProviderManagerCard({ workspaceId }: { workspaceId: string | undefined }) {
  const providersQ = useAiProviderOptions(workspaceId);
  const saveByok = useSaveTenantAiProvider(workspaceId);
  const deleteByok = useDeleteTenantAiProvider(workspaceId);
  const roleQ = useWorkspaceRole(workspaceId);
  const providers = providersQ.data ?? [];
  const canManage = roleQ.data === "owner" || roleQ.data === "admin";
  const [kind, setKind] = useState<"openai" | "gemini">("openai");
  const [apiKey, setApiKey] = useState("");
  const [organizationId, setOrganizationId] = useState("");

  async function saveKey() {
    await saveByok.mutateAsync({ kind, apiKey, organizationId: organizationId || undefined });
    setApiKey("");
  }

  return (
    <div className="rounded-control border border-border p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5 text-accent" /> AI Providers
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Use a platform provider or bring your own OpenAI/Gemini key. Tenant keys are encrypted at
          rest and are never shown again. API usage is billed to the account that owns the key.
        </p>
      </div>
      {providersQ.isLoading ? (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading providers
        </div>
      ) : providers.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No AI provider is available for this workspace. Ask your platform administrator to
          configure one before using AI features.
        </p>
      ) : (
        <div className="space-y-2">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className="flex items-center gap-2 rounded-control border border-border px-3 py-2"
            >
              <span className="text-sm font-medium truncate">{provider.name}</span>
              <Badge variant="secondary" className="text-[11px]">
                {provider.kind}
              </Badge>
              <Badge variant="outline" className="text-[11px]">
                {provider.credentialSource === "workspace" ? "Tenant key" : "Platform key"}
              </Badge>
              {provider.keyLast4 && (
                <span className="text-xs font-mono text-muted-foreground">
                  ••••{provider.keyLast4}
                </span>
              )}
              {provider.credentialSource === "workspace" && provider.canManageByok && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="ml-auto h-7 w-7 text-destructive"
                  aria-label={`Remove ${provider.name}`}
                  disabled={deleteByok.isPending}
                  onClick={() => {
                    if (window.confirm(`Remove ${provider.name} and its encrypted API key?`)) {
                      deleteByok.mutate(provider.id);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {canManage && (
        <div className="border-t border-border pt-3 space-y-3">
          <div>
            <p className="text-sm font-medium flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 text-accent" /> Tenant BYOK
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Saving another key for the same provider securely rotates the existing credential.
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-[180px_1fr_auto]">
            <Select value={kind} onValueChange={(value) => setKind(value as "openai" | "gemini")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="gemini">Google Gemini</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={kind === "openai" ? "sk-…" : "AIza…"}
              aria-label={`${kind} API key`}
            />
            <Button
              type="button"
              onClick={saveKey}
              disabled={apiKey.trim().length < 12 || saveByok.isPending}
            >
              {saveByok.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Encrypt &amp; save
            </Button>
          </div>
          {kind === "openai" && (
            <Input
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
              placeholder="OpenAI organization ID (optional)"
              className="max-w-md"
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Workspace "business context" fed to the AI reply assistant's system prompt.
 * Saved independently of the main settings form (it lives in `settings`, not
 * `ai_settings`). Owners/admins edit; everyone else sees it read-only.
 */
function BusinessContextCard({ workspaceId }: { workspaceId: string }) {
  const q = useAiBusinessContext(workspaceId);
  const save = useSaveAiBusinessContext(workspaceId);
  const [text, setText] = useState<string | null>(null);

  // Reset the local draft whenever the server copy changes (load, save, workspace switch).
  useEffect(() => {
    if (q.data) setText(q.data.text);
  }, [q.data]);

  const canEdit = q.data?.canEdit ?? false;
  const value = text ?? "";
  const dirty = q.data ? value.trim() !== q.data.text : false;
  const tooLong = value.length > AI_BUSINESS_CONTEXT_MAX;

  return (
    <div className="rounded-control border border-border bg-surface p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-accent" /> Business context
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
            Describe your business — products, services, pricing rules, policies, opening hours,
            tone. The AI reply assistant uses this to ground suggested replies in the inbox.
          </p>
        </div>
        {q.data && !canEdit && (
          <Badge variant="outline" className="gap-1 text-[11px]">
            <Lock className="w-3 h-3" /> Read-only
          </Badge>
        )}
      </div>

      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading business context
        </div>
      ) : q.isError ? (
        <p className="text-sm text-destructive">
          {q.error instanceof Error ? q.error.message : "Failed to load business context"}
        </p>
      ) : (
        <>
          <Textarea
            rows={8}
            value={value}
            onChange={(e) => setText(e.target.value)}
            disabled={!canEdit || save.isPending}
            placeholder="e.g. We are a boutique bakery in Dhaka. We deliver within 10 km, same-day orders close at 2 pm, custom cakes need 48 hours' notice"
            className="text-sm"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p
              className={cn("text-[11px] ", tooLong ? "text-destructive" : "text-muted-foreground")}
            >
              {value.length} / {AI_BUSINESS_CONTEXT_MAX}
              {!canEdit && " · Only workspace owners and admins can edit this."}
            </p>
            {canEdit && (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setText(q.data?.text ?? "")}
                  disabled={!dirty || save.isPending}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Reset
                </Button>
                <Button
                  size="sm"
                  onClick={() => save.mutate(value)}
                  disabled={!dirty || tooLong || save.isPending}
                >
                  {save.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Save context
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ==================== Building blocks ====================

function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 py-3 border-b border-border/60 last:border-0">
      <div className="max-w-md shrink min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      {/*
       * `w-full` is only right in the stacked mobile layout (field spans the
       * row under its label). In the md:flex-row layout it was still setting
       * width:100% as this item's flex-basis, which — combined with
       * `shrink-0` refusing to give any of that back — claimed the entire
       * row for the field and squeezed the label column to its min-content,
       * wrapping it one word per line. `md:w-auto` lets it size to its actual
       * content (the Select/Input already carry their own fixed widths).
       */}
      <div className="shrink-0 w-full md:w-auto max-w-xl">{children}</div>
    </div>
  );
}

function ToggleRow({
  title,
  desc,
  checked,
  onChange,
}: {
  title: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Row title={title} desc={desc}>
      <Switch checked={checked} onCheckedChange={onChange} />
    </Row>
  );
}

function PromptField({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      <Textarea
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono text-xs"
      />
      <p className="text-[11px] text-muted-foreground text-right">{value.length} / 8000</p>
    </div>
  );
}

function NumberOrBlank({
  value,
  onChange,
  placeholder = "Unlimited",
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  return (
    <Input
      type="number"
      min={0}
      placeholder={placeholder}
      className="w-40"
      value={value ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "" ? null : Math.max(0, Number(v)));
      }}
    />
  );
}

function NumberCard({
  icon: Icon,
  title,
  hint,
  value,
  onChange,
  used,
  currency,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  used: number;
  currency?: boolean;
}) {
  const pct = value && value > 0 ? Math.min(100, (used / value) * 100) : 0;
  const near = pct >= 80;
  const over = pct >= 100;
  return (
    <div className="rounded-control border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
            {title}
          </p>
          {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
        </div>
        <NumberOrBlank value={value} onChange={onChange} />
      </div>
      <div className="mt-2 space-y-1">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground ">
          <span>Used: {currency ? `$${used.toFixed(2)}` : used.toLocaleString()}</span>
          <span>{value ? `${currency ? "$" : ""}${value.toLocaleString()}` : "No limit"}</span>
        </div>
        {value && value > 0 && (
          <Progress
            value={pct}
            className={cn(
              "h-1.5",
              over && "[&>div]:bg-destructive",
              near && !over && "[&>div]:bg-amber-500",
            )}
          />
        )}
      </div>
    </div>
  );
}

function QuotaSummary({
  quota,
  form,
}: {
  quota: import("@/hooks/use-ai-settings").AiSettingsQuotaUsage | undefined;
  form: AiSettings;
}) {
  const alerts: string[] = [];
  if (quota && form.daily_request_limit && quota.todayRequests >= form.daily_request_limit)
    alerts.push("Daily request limit reached.");
  if (quota && form.monthly_request_limit && quota.monthRequests >= form.monthly_request_limit)
    alerts.push("Monthly request limit reached.");
  if (quota && form.monthly_cost_limit_usd && quota.monthCostUsd >= form.monthly_cost_limit_usd)
    alerts.push("Monthly cost cap reached.");
  if (alerts.length === 0) return null;
  return (
    <div className="rounded-control border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 mt-0.5" />
      <div>
        <p className="font-medium">Quota alert</p>
        <ul className="list-disc pl-5 text-xs">
          {alerts.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AuditLogList({
  entries,
  loading,
}: {
  entries: import("@/hooks/use-ai-settings").AiAuditLogEntry[] | undefined;
  loading: boolean;
}) {
  const formatZoned = useZonedDateFormatter();
  if (loading) {
    return (
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading audit log
      </div>
    );
  }
  if (!entries || entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">No AI setting changes yet.</p>
    );
  }
  return (
    <ul className="divide-y divide-border/60">
      {entries.map((e) => (
        <li key={e.id} className="py-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">{e.actor_name ?? "System"}</span>
            <span className="text-muted-foreground ">
              {formatZoned(new Date(e.created_at), { dateStyle: "medium", timeStyle: "short" })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {e.action} · {e.target}
          </p>
          {e.changes && Object.keys(e.changes).length > 0 && (
            <div className="mt-1.5 rounded-control bg-muted/40 p-2 text-[11px] font-mono max-h-40 overflow-auto">
              {Object.entries(e.changes as Record<string, { from: unknown; to: unknown }>).map(
                ([k, v]) => (
                  <div key={k}>
                    <span className="text-accent">{k}</span>:{" "}
                    <span className="text-muted-foreground">{fmt(v?.from)}</span>
                    {" → "}
                    <span>{fmt(v?.to)}</span>
                  </div>
                ),
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "∅";
  if (Array.isArray(v)) return v.length ? `[${v.join(", ")}]` : "[]";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
