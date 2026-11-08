/**
 * Feature Management — configure per-plan Limits + Features via a structured
 * matrix (plans × capabilities). Super-admin only. Writes are performed via
 * the `upsertPlan` server function, which the RLS policy on `public.plans`
 * scopes to `superadmin` / `support` roles.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, Loader2, Save, Sparkles, RotateCcw } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { listAllPlans, upsertPlan } from "@/lib/billing/plans.functions";
import {
  CAPABILITIES, LIMITS, FEATURES, GROUP_LABELS, bucketForTier,
  type CapabilityDefinition, type CapabilityGroup,
} from "@/lib/billing/feature-catalog";

type PlanRow = {
  id: string; code: string; name: string; tier: string;
  price_cents: number; currency: string; interval: string;
  features: Record<string, unknown>; limits: Record<string, unknown>;
  description: string | null; tagline: string | null; badge: string | null; cta_label: string | null;
  trial_days: number; is_active: boolean; is_public: boolean; is_custom: boolean; highlight: boolean;
  sort_order: number; monthly_plan_code: string | null;
};

type Draft = Record<string, { features: Record<string, boolean>; limits: Record<string, number | null> }>;

export function FeatureManager() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllPlans);
  const upsertFn = useServerFn(upsertPlan);

  const plansQ = useQuery({
    queryKey: ["admin-all-plans"],
    queryFn: () => listFn(),
    staleTime: 30_000,
  });

  const plans = (plansQ.data ?? []) as PlanRow[];
  const monthlyPlans = useMemo(() => plans.filter((p) => p.interval === "month" && p.is_public !== false), [plans]);

  const [draft, setDraft] = useState<Draft>({});

  const effective = (planId: string) => draft[planId] ?? { features: {}, limits: {} };

  const getLimit = (plan: PlanRow, key: string): number | null | undefined => {
    const d = effective(plan.id).limits;
    if (key in d) return d[key];
    const raw = (plan.limits as Record<string, unknown>)?.[key];
    if (raw === null || raw === "unlimited") return null;
    if (typeof raw === "number") return raw;
    if (typeof raw === "string" && /^-?\d+$/.test(raw)) return Number(raw);
    return undefined;
  };

  const getFeature = (plan: PlanRow, key: string): boolean => {
    const d = effective(plan.id).features;
    if (key in d) return d[key];
    return (plan.features as Record<string, unknown>)?.[key] === true;
  };

  const setLimit = (planId: string, key: string, value: number | null | undefined) => {
    setDraft((prev) => {
      const cur = prev[planId] ?? { features: {}, limits: {} };
      const next = { ...cur, limits: { ...cur.limits } };
      if (value === undefined) delete next.limits[key];
      else next.limits[key] = value;
      return { ...prev, [planId]: next };
    });
  };

  const setFeature = (planId: string, key: string, value: boolean) => {
    setDraft((prev) => {
      const cur = prev[planId] ?? { features: {}, limits: {} };
      return { ...prev, [planId]: { ...cur, features: { ...cur.features, [key]: value } } };
    });
  };

  const resetPlan = (planId: string) => {
    setDraft((prev) => {
      const { [planId]: _, ...rest } = prev;
      return rest;
    });
  };

  const applyDefaults = (plan: PlanRow) => {
    const bucket = bucketForTier(plan.tier);
    setDraft((prev) => {
      const cur = prev[plan.id] ?? { features: {}, limits: {} };
      const nextLimits = { ...cur.limits };
      const nextFeatures = { ...cur.features };
      for (const l of LIMITS) nextLimits[l.key] = l.defaults[bucket];
      for (const f of FEATURES) nextFeatures[f.key] = f.defaults[bucket];
      return { ...prev, [plan.id]: { features: nextFeatures, limits: nextLimits } };
    });
  };

  const saveMut = useMutation({
    mutationFn: async (plan: PlanRow) => {
      const d = effective(plan.id);
      const mergedLimits = { ...(plan.limits ?? {}), ...d.limits };
      const mergedFeatures = { ...(plan.features ?? {}), ...d.features };
      // Trim undefined
      for (const k of Object.keys(mergedLimits)) if (mergedLimits[k as keyof typeof mergedLimits] === undefined) delete mergedLimits[k as keyof typeof mergedLimits];
      return upsertFn({
        data: {
          code: plan.code, name: plan.name, tier: plan.tier as never,
          description: plan.description ?? null, tagline: plan.tagline ?? null,
          badge: plan.badge ?? null, cta_label: plan.cta_label ?? null,
          price_cents: plan.price_cents, currency: plan.currency,
          interval: plan.interval as never, trial_days: plan.trial_days,
          features: mergedFeatures, limits: mergedLimits,
          is_active: plan.is_active, is_public: plan.is_public,
          is_custom: plan.is_custom, highlight: plan.highlight,
          sort_order: plan.sort_order, monthly_plan_code: plan.monthly_plan_code ?? null,
        },
      });
    },
    onSuccess: (_row, plan) => {
      toast.success(`${plan.name} saved`);
      resetPlan(plan.id);
      qc.invalidateQueries({ queryKey: ["admin-all-plans"] });
      qc.invalidateQueries({ queryKey: ["my-subscription"] });
      qc.invalidateQueries({ queryKey: ["plans-public"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const dirtyPlanIds = useMemo(() => Object.keys(draft).filter((id) => {
    const d = draft[id];
    return Object.keys(d.features).length + Object.keys(d.limits).length > 0;
  }), [draft]);

  const groups: CapabilityGroup[] = ["workspace", "crm", "sales", "marketing", "automation", "ai", "infrastructure", "customization"];

  if (plansQ.isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> Feature Management</CardTitle>
              <CardDescription>
                Every capability below is enforced at runtime by the active subscription plan.
                Numeric limits accept whole numbers; leave blank for <Badge variant="outline" className="mx-1">Unlimited</Badge>.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {monthlyPlans.length} monthly plans · {LIMITS.length} limits · {FEATURES.length} feature flags
            </div>
          </CardHeader>
        </Card>

        <Tabs defaultValue="workspace" className="space-y-4">
          <ScrollArea className="w-full">
            <TabsList className="w-max">
              {groups.map((g) => (
                <TabsTrigger key={g} value={g} className="capitalize">
                  {GROUP_LABELS[g]}
                </TabsTrigger>
              ))}
            </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          {groups.map((g) => {
            const caps = CAPABILITIES.filter((c) => c.group === g);
            if (caps.length === 0) return null;
            return (
              <TabsContent key={g} value={g} className="space-y-4">
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            <th className="sticky left-0 z-10 bg-muted/40 px-4 py-3 text-left font-medium min-w-[240px]">Capability</th>
                            {monthlyPlans.map((p) => (
                              <th key={p.id} className="px-4 py-3 text-left font-medium min-w-[160px]">
                                <div className="flex items-center gap-2">
                                  <span>{p.name}</span>
                                  {dirtyPlanIds.includes(p.id) && <Badge variant="secondary" className="h-5 text-[11px]">unsaved</Badge>}
                                </div>
                                <div className="text-xs font-normal text-muted-foreground capitalize">{p.tier}</div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {caps.map((cap) => (
                            <CapabilityRow
                              key={cap.key}
                              cap={cap}
                              plans={monthlyPlans}
                              getLimit={getLimit}
                              getFeature={getFeature}
                              setLimit={setLimit}
                              setFeature={setFeature}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>

        {/* Save bar */}
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="text-sm text-muted-foreground">
              {dirtyPlanIds.length === 0
                ? "No changes yet — edit any cell above to activate the save bar."
                : `${dirtyPlanIds.length} plan${dirtyPlanIds.length === 1 ? "" : "s"} with unsaved changes.`}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={saveMut.isPending || monthlyPlans.length === 0}>
                  {saveMut.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Plan actions <ChevronDown className="ml-2 size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 w-64">
                {dirtyPlanIds.length > 0 && (
                  <DropdownMenuGroup aria-label="All plans">
                    <DropdownMenuItem onSelect={() => setDraft({})}>
                      <RotateCcw className="mr-2 size-4" /> Discard all changes
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </DropdownMenuGroup>
                )}
                {monthlyPlans.map((p, index) => (
                  <DropdownMenuGroup key={p.id} aria-label={p.name}>
                    {index > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel>
                      {p.name}{dirtyPlanIds.includes(p.id) ? " · Unsaved" : ""}
                    </DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => applyDefaults(p)}>
                      <RotateCcw className="mr-2 size-4" /> Reset {p.name} to defaults
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!dirtyPlanIds.includes(p.id) || saveMut.isPending}
                      onSelect={() => saveMut.mutate(p)}
                    >
                      <Save className="mr-2 size-4" /> Save {p.name}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

interface RowProps {
  cap: CapabilityDefinition;
  plans: PlanRow[];
  getLimit: (plan: PlanRow, key: string) => number | null | undefined;
  getFeature: (plan: PlanRow, key: string) => boolean;
  setLimit: (planId: string, key: string, value: number | null | undefined) => void;
  setFeature: (planId: string, key: string, value: boolean) => void;
}

function CapabilityRow({ cap, plans, getLimit, getFeature, setLimit, setFeature }: RowProps) {
  const Icon = cap.icon;
  return (
    <tr className="border-b hover:bg-muted/20">
      <td className="sticky left-0 z-10 bg-background px-4 py-3 align-top">
        <div className="flex items-start gap-2">
          <Icon className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <div className="font-medium">{cap.label}</div>
            <div className="text-xs text-muted-foreground line-clamp-2">{cap.description}</div>
            <Badge variant="outline" className="mt-1 h-5 text-[11px]">
              {cap.kind === "limit" ? cap.unit : "feature flag"}
            </Badge>
          </div>
        </div>
      </td>
      {plans.map((p) => (
        <td key={p.id} className="px-4 py-3 align-middle">
          {cap.kind === "limit" ? (
            <LimitInput
              value={getLimit(p, cap.key)}
              onChange={(v) => setLimit(p.id, cap.key, v)}
            />
          ) : (
            <Switch
              checked={getFeature(p, cap.key)}
              onCheckedChange={(v) => setFeature(p.id, cap.key, v)}
            />
          )}
        </td>
      ))}
    </tr>
  );
}

function LimitInput({ value, onChange }: { value: number | null | undefined; onChange: (v: number | null | undefined) => void }) {
  const unlimited = value === null;
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={0}
        className="h-9 w-24"
        placeholder="—"
        disabled={unlimited}
        value={unlimited || value === undefined ? "" : String(value)}
        onChange={(e) => {
          const s = e.target.value;
          if (s === "") onChange(undefined);
          else {
            const n = Number(s);
            onChange(Number.isFinite(n) && n >= 0 ? n : undefined);
          }
        }}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            <Switch checked={unlimited} onCheckedChange={(v) => onChange(v ? null : 0)} />
            <span className="text-[11px] uppercase text-muted-foreground tracking-wide">∞</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>Toggle unlimited</TooltipContent>
      </Tooltip>
    </div>
  );
}
