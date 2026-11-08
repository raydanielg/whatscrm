/**
 * Plan manager — super-admin CRUD UI over `public.plans`.
 *
 * Uses server-side RLS to enforce the super-admin gate: non-privileged users
 * see an empty list on read and get a permission error on write.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Eye, EyeOff, Trash2, Star, Loader2, Link2 } from "lucide-react";

import { listAllPlans, upsertPlan, setPlanActive, deletePlan } from "@/lib/billing/plans.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { PlanGatewayLinksDialog } from "./plan-gateway-links-dialog";
import { useTenantCurrency } from "@/hooks/use-currency";

type PlanRow = {
  id: string;
  code: string;
  name: string;
  tier: string;
  description: string | null;
  tagline: string | null;
  badge: string | null;
  cta_label: string | null;
  price_cents: number;
  currency: string;
  interval: "month" | "year" | "lifetime";
  trial_days: number;
  features: Record<string, unknown>;
  limits: Record<string, unknown>;
  is_active: boolean;
  is_public: boolean;
  is_custom: boolean;
  highlight: boolean;
  sort_order: number;
  monthly_plan_code: string | null;
};

const emptyPlan: Partial<PlanRow> = {
  code: "",
  name: "",
  tier: "custom",
  description: "",
  tagline: "",
  badge: null,
  cta_label: null,
  price_cents: 0,
  currency: "USD",
  interval: "month",
  trial_days: 0,
  features: {},
  limits: {},
  is_active: true,
  is_public: true,
  is_custom: false,
  highlight: false,
  sort_order: 100,
};

function fmt(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function PlanManager() {
  // New plans are priced in the platform default currency, not hardcoded USD.
  const platformCurrency = useTenantCurrency();
  const list = useServerFn(listAllPlans);
  const upsert = useServerFn(upsertPlan);
  const toggle = useServerFn(setPlanActive);
  const del = useServerFn(deletePlan);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["admin", "plans"],
    queryFn: () => list(),
  });

  const [editing, setEditing] = useState<Partial<PlanRow> | null>(null);
  const [gatewayPlan, setGatewayPlan] = useState<PlanRow | null>(null);

  const saveMut = useMutation({
    mutationFn: (input: Partial<PlanRow>) => upsert({ data: input as never }),
    onSuccess: () => {
      toast.success("Plan saved");
      qc.invalidateQueries({ queryKey: ["admin", "plans"] });
      setEditing(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) => toggle({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "plans"] }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Plan archived");
      qc.invalidateQueries({ queryKey: ["admin", "plans"] });
    },
  });

  const plans = (query.data ?? []) as PlanRow[];

  const grouped = useMemo(() => {
    const g: Record<string, PlanRow[]> = {};
    for (const p of plans) (g[p.interval] ??= []).push(p);
    return g;
  }, [plans]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold">Subscription plans</h2>
          <p className="text-sm text-muted-foreground">
            Manage tiers, pricing, trials, and marketing metadata. Changes are live immediately.
          </p>
        </div>
        <Dialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing({ ...emptyPlan, currency: platformCurrency })}>
              <Plus className="w-4 h-4 " /> New plan
            </Button>
          </DialogTrigger>
          <PlanFormDialog
            value={editing}
            onChange={setEditing}
            onSubmit={(v) => saveMut.mutate(v)}
            saving={saveMut.isPending}
          />
        </Dialog>
      </div>

      {query.isLoading ? (
        <div className="rounded-control border border-border bg-surface p-8 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading plans
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-control border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No plans yet. Create your first plan to get started.
        </div>
      ) : (
        Object.entries(grouped).map(([interval, rows]) => (
          <section
            key={interval}
            className="rounded-control border border-border bg-surface overflow-hidden"
          >
            <header className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h3 className="font-display font-semibold capitalize">{interval} plans</h3>
              <span className="text-xs text-muted-foreground">{rows.length} plans</span>
            </header>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground bg-muted/30">
                <tr>
                  <th className="text-left px-5 py-2 font-medium">Plan</th>
                  <th className="text-left px-3 py-2 font-medium">Tier</th>
                  <th className="text-right px-3 py-2 font-medium">Price</th>
                  <th className="text-right px-3 py-2 font-medium">Trial</th>
                  <th className="text-left px-3 py-2 font-medium">Visibility</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/40">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        {p.highlight && <Star className="w-3.5 h-3.5 text-accent" />}
                        <div>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{p.code}</div>
                        </div>
                        {p.badge && (
                          <Badge variant="secondary" className="ml-2">
                            {p.badge}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 capitalize text-muted-foreground">{p.tier}</td>
                    <td className="px-3 py-3 text-right ">{fmt(p.price_cents, p.currency)}</td>
                    <td className="px-3 py-3 text-right  text-muted-foreground">
                      {p.trial_days > 0 ? `${p.trial_days}d` : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={p.is_active ? "default" : "outline"}>
                          {p.is_active ? "Active" : "Inactive"}
                        </Badge>
                        {!p.is_public && <Badge variant="outline">Hidden</Badge>}
                        {p.is_custom && <Badge variant="outline">Custom</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditing(p)}
                          aria-label="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setGatewayPlan(p)}
                          aria-label="Payment gateways"
                          title="Payment gateways"
                        >
                          <Link2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => toggleMut.mutate({ id: p.id, is_active: !p.is_active })}
                          aria-label={p.is_active ? "Deactivate" : "Activate"}
                        >
                          {p.is_active ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm(`Archive "${p.name}"? Existing subscribers keep access.`))
                              delMut.mutate(p.id);
                          }}
                          aria-label="Archive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}

      {gatewayPlan && (
        <PlanGatewayLinksDialog
          planId={gatewayPlan.id}
          planName={gatewayPlan.name}
          open={gatewayPlan !== null}
          onOpenChange={(v) => !v && setGatewayPlan(null)}
        />
      )}
    </div>
  );
}

function PlanFormDialog({
  value,
  onChange,
  onSubmit,
  saving,
}: {
  value: Partial<PlanRow> | null;
  onChange: (v: Partial<PlanRow> | null) => void;
  onSubmit: (v: Partial<PlanRow>) => void;
  saving: boolean;
}) {
  const platformCurrency = useTenantCurrency();
  if (!value) return null;
  const set = <K extends keyof PlanRow>(k: K, v: PlanRow[K]) => onChange({ ...value, [k]: v });
  const priceDollars = (value.price_cents ?? 0) / 100;

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{value.id ? "Edit plan" : "New plan"}</DialogTitle>
      </DialogHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="plan-code">Code</Label>
          <Input
            id="plan-code"
            value={value.code ?? ""}
            onChange={(e) => set("code", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
            placeholder="professional_yearly"
            disabled={!!value.id}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-name">Display name</Label>
          <Input
            id="plan-name"
            value={value.name ?? ""}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Professional"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Tier</Label>
          <Select value={value.tier} onValueChange={(v) => set("tier", v as PlanRow["tier"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                "free",
                "starter",
                "professional",
                "growth",
                "business",
                "enterprise",
                "custom",
              ].map((t) => (
                <SelectItem key={t} value={t} className="capitalize">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Interval</Label>
          <Select
            value={value.interval}
            onValueChange={(v) => set("interval", v as PlanRow["interval"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Monthly</SelectItem>
              <SelectItem value="year">Yearly</SelectItem>
              <SelectItem value="lifetime">Lifetime</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="price">Price (in {value.currency ?? platformCurrency})</Label>
          <Input
            id="price"
            type="number"
            min="0"
            step="0.01"
            value={priceDollars}
            onChange={(e) =>
              set("price_cents", Math.round(parseFloat(e.target.value || "0") * 100))
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="trial">Trial (days)</Label>
          <Input
            id="trial"
            type="number"
            min="0"
            value={value.trial_days ?? 0}
            onChange={(e) => set("trial_days", parseInt(e.target.value || "0", 10))}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="tagline">Tagline</Label>
          <Input
            id="tagline"
            value={value.tagline ?? ""}
            onChange={(e) => set("tagline", e.target.value)}
            placeholder="For growing teams that need AI and scale"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="desc">Description</Label>
          <RichTextarea
            id="desc"
            value={value.description ?? ""}
            onChange={(v) => set("description", v)}
            rows={2}
            placeholder="Short summary shown on the pricing page"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="badge">Badge</Label>
          <Input
            id="badge"
            value={value.badge ?? ""}
            onChange={(e) => set("badge", e.target.value)}
            placeholder="Most Popular"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cta">CTA label</Label>
          <Input
            id="cta"
            value={value.cta_label ?? ""}
            onChange={(e) => set("cta_label", e.target.value)}
            placeholder="Start free trial"
          />
        </div>

        <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(
            [
              ["is_active", "Active", "Available for new subscriptions"],
              ["is_public", "Public", "Show on pricing page"],
              ["highlight", "Highlight", "Emphasize on pricing page"],
              ["is_custom", "Custom / enterprise", "Contact-sales only"],
            ] as const
          ).map(([key, title, hint]) => (
            <div
              key={key}
              className="flex items-center justify-between gap-3 rounded-control border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">{title}</div>
                <div className="text-xs text-muted-foreground">{hint}</div>
              </div>
              <Switch
                checked={!!value[key]}
                onCheckedChange={(v) => set(key, v as PlanRow[typeof key])}
                aria-label={title}
              />
            </div>
          ))}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="limits">Limits (JSON)</Label>
          <JsonField
            id="limits"
            value={value.limits ?? {}}
            onChange={(parsed) => set("limits", parsed as PlanRow["limits"])}
          />
          <p className="text-xs text-muted-foreground">
            Example: {`{"messages_per_month": 25000, "agents": 10}`}
          </p>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="features">Features (JSON)</Label>
          <JsonField
            id="features"
            value={value.features ?? {}}
            onChange={(parsed) => set("features", parsed as PlanRow["features"])}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onChange(null)}>
          Cancel
        </Button>
        <Button onClick={() => onSubmit(value)} disabled={saving || !value.code || !value.name}>
          {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
          Save plan
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/**
 * JSON textarea that keeps its own draft string so intermediate (invalid)
 * keystrokes are not clobbered by re-serializing the parsed object.
 */
function JsonField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: unknown;
  onChange: (parsed: unknown) => void;
}) {
  const serialized = useMemo(() => JSON.stringify(value ?? {}, null, 2), [value]);
  const [draft, setDraft] = useState(serialized);
  const [lastExternal, setLastExternal] = useState(serialized);

  if (serialized !== lastExternal) {
    setLastExternal(serialized);
    setDraft(serialized);
  }

  let invalid = false;
  try {
    JSON.parse(draft);
  } catch {
    invalid = true;
  }

  return (
    <>
      <Textarea
        id={id}
        rows={4}
        spellCheck={false}
        className={`font-mono text-xs ${invalid ? "border-destructive focus-visible:ring-destructive" : ""}`}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
          } catch {
            /* keep last valid value until JSON is well-formed again */
          }
        }}
      />
      {invalid && (
        <p className="text-xs text-destructive">
          Invalid JSON — changes are not saved until this parses.
        </p>
      )}
    </>
  );
}
