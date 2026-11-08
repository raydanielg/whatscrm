/**
 * Payment gateway configuration panel.
 *
 * Add a gateway, configure an existing one (label, mode, keys, webhook),
 * enable/disable it, choose the platform default, or remove a custom gateway.
 * Rendered both on Admin → Payment Gateways and Platform Settings → Payments.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Settings2, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { GatewayAuditLog } from "./gateway-audit-log";
import { GatewayPermissionNotice } from "./gateway-permission-notice";
import { GatewayTestWebhook } from "./gateway-test-webhook";
import { GatewayWebhookHealth } from "./gateway-webhook-health";
import { GatewayWebhookReplay } from "./gateway-webhook-replay";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteGateway,
  listGateways,
  setDefaultGateway,
  setGatewayEnabled,
  setGatewayMode,
  upsertGateway,
} from "@/lib/billing/gateways.functions";
import {
  hasGatewayErrors,
  validateGatewayForm,
  type GatewayFieldErrors,
} from "@/lib/billing/gateway-validation";

/** Inline field-level error message. */
function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}


type Gateway = Awaited<ReturnType<typeof listGateways>>[number];

const PAYMENT_METHODS = [
  "card",
  "sepa",
  "ach",
  "apple_pay",
  "google_pay",
  "bank_transfer",
  "wallet",
  "upi",
  "pix",
  "mobile_money",
];

type FormState = {
  provider_id: string;
  adapter_id: string;
  display_label: string;
  mode: "sandbox" | "live";
  enabled: boolean;
  publishable_key: string;
  secret_name: string;
  webhook_secret_name: string;
  webhook_url: string;
  supported_methods: string[];
  notes: string;
  is_custom: boolean;
};

const emptyForm = (): FormState => ({
  provider_id: "",
  adapter_id: "custom",
  display_label: "",
  mode: "sandbox",
  enabled: false,
  publishable_key: "",
  secret_name: "",
  webhook_secret_name: "",
  webhook_url: "",
  supported_methods: ["card"],
  notes: "",
  is_custom: true,
});

const fromGateway = (g: Gateway): FormState => ({
  provider_id: g.id,
  adapter_id: g.adapterId ?? "custom",
  display_label: g.displayName ?? "",
  mode: g.mode,
  enabled: g.enabled,
  publishable_key: g.publishableKey ?? "",
  secret_name: g.secretName ?? "",
  webhook_secret_name: g.webhookSecretName ?? "",
  webhook_url: g.webhookUrl ?? "",
  supported_methods: g.supportedMethods?.length ? g.supportedMethods : ["card"],
  notes: g.notes ?? "",
  is_custom: !g.builtIn,
});

export function GatewaySettingsPanel({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const gatewaysFn = useServerFn(listGateways);
  const toggleFn = useServerFn(setGatewayEnabled);
  const defaultFn = useServerFn(setDefaultGateway);
  const modeFn = useServerFn(setGatewayMode);
  const upsertFn = useServerFn(upsertGateway);
  const deleteFn = useServerFn(deleteGateway);

  const [editing, setEditing] = useState<{ mode: "add" | "edit"; form: FormState } | null>(
    null,
  );

  const gatewaysQ = useQuery({
    queryKey: ["billing", "gateways"],
    queryFn: () => gatewaysFn(),
  });
  const gateways: Gateway[] = gatewaysQ.data ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["billing", "gateways"] });
    qc.invalidateQueries({ queryKey: ["payments", "providers"] });
    qc.invalidateQueries({ queryKey: ["billing", "gateway-audit"] });
  };

  const toggleMut = useMutation({
    mutationFn: (vars: { provider_id: string; enabled: boolean }) => toggleFn({ data: vars }),
    onSuccess: (res) => {
      toast.success(`${res.provider_id} ${res.enabled ? "enabled" : "disabled"}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const defaultMut = useMutation({
    mutationFn: (vars: { provider_id: string }) => defaultFn({ data: vars }),
    onSuccess: (res) => {
      toast.success(`${res.provider_id} is now the default gateway`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const modeMut = useMutation({
    mutationFn: (vars: { provider_id: string; mode: "sandbox" | "live" }) =>
      modeFn({ data: vars }),
    onSuccess: (res) => {
      toast.success(`${res.provider_id} switched to ${res.mode}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: (form: FormState) => upsertFn({ data: form }),
    onSuccess: (res) => {
      toast.success(`${res.provider_id} saved`);
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (provider_id: string) => deleteFn({ data: { provider_id } }),
    onSuccess: (res) => {
      toast.success(`${res.provider_id} removed`);
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enabledCount = gateways.filter((g) => g.enabled).length;

  if (gatewaysQ.isError) {
    return (
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Registered gateways</h3>
        <GatewayPermissionNotice error={gatewaysQ.error} />
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Registered gateways</h3>
          <p className="text-xs text-muted-foreground">
            {enabledCount} of {gateways.length} enabled · credentials are stored as backend
            secret names, never as raw keys.
          </p>
        </div>
        <Button
          size="sm"
          className="h-8"
          onClick={() => setEditing({ mode: "add", form: emptyForm() })}
        >
          <Plus className="w-4 h-4 " /> Add gateway
        </Button>
      </div>

      <div
        className={`grid gap-3 ${compact ? "md:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3"}`}
      >
        {gatewaysQ.isLoading && (
          <Card className="p-4 text-sm text-muted-foreground">Loading gateways</Card>
        )}
        {gateways.map((p) => {
          const implemented = Boolean(p.supports.payments && p.supports.checkout);
          const busy = toggleMut.isPending && toggleMut.variables?.provider_id === p.id;
          return (
            <Card key={p.id} className={`p-4 space-y-3 ${p.enabled ? "" : "opacity-70"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2 truncate">
                    {p.displayName}
                    {p.isDefault && (
                      <Badge variant="default" className="text-[11px]">
                        Default
                      </Badge>
                    )}
                    {!p.builtIn && (
                      <Badge variant="outline" className="text-[11px]">
                        Custom
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    {implemented ? (
                      <ShieldCheck className="w-3 h-3" />
                    ) : (
                      <ShieldAlert className="w-3 h-3" />
                    )}
                    {implemented ? "Full adapter" : "Stub adapter"} · {p.mode}
                    {p.secretName ? " · key set" : " · no key"}
                  </div>
                </div>
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mt-1" />
                ) : (
                  <Switch
                    checked={p.enabled}
                    aria-label={`${p.enabled ? "Disable" : "Enable"} ${p.displayName}`}
                    onCheckedChange={(v) =>
                      toggleMut.mutate({ provider_id: p.id, enabled: v })
                    }
                  />
                )}
              </div>

              <div className="flex flex-wrap gap-1 text-[11px]">
                {Object.entries(p.supports)
                  .filter(([, v]) => v)
                  .map(([k]) => (
                    <span
                      key={k}
                      className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                    >
                      {k.replace(/_/g, " ")}
                    </span>
                  ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => setEditing({ mode: "edit", form: fromGateway(p) })}
                >
                  <Settings2 className="w-4 h-4 " /> Configure
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={p.isDefault || defaultMut.isPending}
                  onClick={() => defaultMut.mutate({ provider_id: p.id })}
                >
                  {p.isDefault ? "Default gateway" : "Make default"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  disabled={modeMut.isPending}
                  onClick={() =>
                    modeMut.mutate({
                      provider_id: p.id,
                      mode: p.mode === "live" ? "sandbox" : "live",
                    })
                  }
                >
                  Switch to {p.mode === "live" ? "sandbox" : "live"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <GatewayWebhookHealth />

      <GatewayTestWebhook gatewayIds={gateways.map((g) => g.id)} />

      <GatewayWebhookReplay gatewayIds={gateways.map((g) => g.id)} />


      <GatewayAuditLog />



      <GatewayDialog
        state={editing}
        onClose={() => setEditing(null)}
        onSave={(form) => saveMut.mutate(form)}
        onDelete={(id) => deleteMut.mutate(id)}
        saving={saveMut.isPending}
        deleting={deleteMut.isPending}
        existingIds={gateways.map((g) => g.id)}
      />
    </section>
  );
}

function GatewayDialog({
  state,
  onClose,
  onSave,
  onDelete,
  saving,
  deleting,
  existingIds,
}: {
  state: { mode: "add" | "edit"; form: FormState } | null;
  onClose: () => void;
  onSave: (form: FormState) => void;
  onDelete: (providerId: string) => void;
  saving: boolean;
  deleting: boolean;
  existingIds: string[];
}) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (state) {
      setForm(state.form);
      setSubmitted(false);
    }
  }, [state]);

  if (!state) return null;
  const isAdd = state.mode === "add";
  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  const allErrors = validateGatewayForm(form, { isNew: isAdd, existingIds });
  // Only surface inline errors after the first save attempt.
  const errors: GatewayFieldErrors = submitted ? allErrors : {};

  const submit = () => {
    setSubmitted(true);
    if (hasGatewayErrors(allErrors)) {
      toast.error(`Fix ${Object.keys(allErrors).length} field(s) before saving`);
      return;
    }
    onSave(form);
  };


  const toggleMethod = (m: string) => {
    const s = new Set(form.supported_methods);
    if (s.has(m)) s.delete(m);
    else s.add(m);
    patch({ supported_methods: Array.from(s) });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isAdd ? "Add payment gateway" : `Configure ${form.display_label || form.provider_id}`}</DialogTitle>
          <DialogDescription>
            Secrets live in the backend secret store — enter the secret <em>name</em>, not the
            key value.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {submitted && hasGatewayErrors(errors) && (
            <div className="rounded-control border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Fix the highlighted fields before saving.
            </div>
          )}
          {isAdd && (
            <div className="grid gap-1.5">
              <Label>Gateway ID</Label>
              <Input
                value={form.provider_id}
                onChange={(e) =>
                  patch({ provider_id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })
                }
                placeholder="my_gateway"
                aria-invalid={Boolean(errors.provider_id)}
              />
              {errors.provider_id ? (
                <FieldError message={errors.provider_id} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, numbers and underscores. Must be unique.
                </p>
              )}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>Display name</Label>
            <Input
              value={form.display_label}
              onChange={(e) => patch({ display_label: e.target.value })}
              placeholder="My Gateway"
              aria-invalid={Boolean(errors.display_label)}
            />
            <FieldError message={errors.display_label} />
          </div>


          <div className="grid md:grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Mode</Label>
              <Select
                value={form.mode}
                onValueChange={(v) => patch({ mode: v as "sandbox" | "live" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox (test)</SelectItem>
                  <SelectItem value="live">Live</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Enabled</Label>
              <div className="flex items-center gap-2 h-9">
                <Switch
                  checked={form.enabled}
                  aria-label="Gateway enabled"
                  onCheckedChange={(v) => patch({ enabled: v })}
                />
                <span className="text-sm text-muted-foreground">
                  {form.enabled ? "Accepting new payments" : "Blocked for new payments"}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Publishable key</Label>
            <Input
              value={form.publishable_key}
              onChange={(e) => patch({ publishable_key: e.target.value })}
              placeholder="pk_test_"
              aria-invalid={Boolean(errors.publishable_key)}
            />
            <FieldError message={errors.publishable_key} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Secret key name</Label>
              <Input
                className="font-mono text-xs"
                value={form.secret_name}
                onChange={(e) => patch({ secret_name: e.target.value.toUpperCase() })}
                placeholder="MY_GATEWAY_SECRET_KEY"
                aria-invalid={Boolean(errors.secret_name)}
              />
              <FieldError message={errors.secret_name} />
            </div>
            <div className="grid gap-1.5">
              <Label>Webhook secret name</Label>
              <Input
                className="font-mono text-xs"
                value={form.webhook_secret_name}
                onChange={(e) => patch({ webhook_secret_name: e.target.value.toUpperCase() })}
                placeholder="MY_GATEWAY_WEBHOOK_SECRET"
                aria-invalid={Boolean(errors.webhook_secret_name)}
              />
              <FieldError message={errors.webhook_secret_name} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Webhook URL</Label>
            <Input
              value={form.webhook_url}
              onChange={(e) => patch({ webhook_url: e.target.value })}
              placeholder="https:///api/public/webhooks/my-gateway"
              aria-invalid={Boolean(errors.webhook_url)}
            />
            <FieldError message={errors.webhook_url} />
          </div>


          <div className="grid gap-1.5">
            <Label>Supported payment methods</Label>
            <div className="flex flex-wrap gap-1.5">
              {PAYMENT_METHODS.map((m) => {
                const on = form.supported_methods.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMethod(m)}
                    className={`px-2 py-1 rounded text-xs border transition-colors ${
                      on
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-transparent"
                    }`}
                  >
                    {m.replace(/_/g, " ")}
                  </button>
                );
              })}
            </div>
            <FieldError message={errors.supported_methods} />
          </div>

          <div className="grid gap-1.5">
            <Label>Internal notes</Label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder="Who owns this account, rollout notes, "
              aria-invalid={Boolean(errors.notes)}
            />
            <FieldError message={errors.notes} />
          </div>
        </div>


        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {!isAdd && form.is_custom && (
              <Button
                variant="destructive"
                disabled={deleting}
                onClick={() => onDelete(form.provider_id)}
              >
                <Trash2 className="w-4 h-4 " /> Remove
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={submit}>
              {saving ? "Saving" : isAdd ? "Add gateway" : "Save changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
