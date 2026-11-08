/**
 * Dynamic Feature Control — feature registry, module visibility, tenant/plan
 * overrides, rollout percentage, versioning, and license management.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  KeyRound,
  Loader2,
  Search,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker, fromDateString, toDateString } from "@/shared/components";
import { Label } from "@/components/ui/label";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatDistanceToNow } from "date-fns";

import {
  getFeatureManagementState,
  upsertFeature,
  deleteFeature,
  setModuleVisibility,
  setTenantOverride,
  setPlanOverride,
  activateLicense,
  revokeLicense,
  validateLicense,
  type FeatureTier,
  type FeatureRecord,
} from "@/lib/admin/feature-management.functions";

const TIER_STYLES: Record<FeatureTier, string> = {
  stable: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  beta: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  premium: "bg-violet-500/10 text-violet-700 border-violet-500/30",
  enterprise: "bg-sky-500/10 text-sky-700 border-sky-500/30",
};

const KNOWN_MODULES = [
  "inbox",
  "crm",
  "sales",
  "marketing",
  "automation",
  "ai",
  "bi",
  "billing",
  "admin",
  "portal",
  "kb",
];

export function DynamicFeatureControl() {
  const qc = useQueryClient();
  const getFn = useServerFn(getFeatureManagementState);
  const state = useQuery({
    queryKey: ["feature-management-state"],
    queryFn: () => getFn(),
    staleTime: 15_000,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["feature-management-state"] });

  if (state.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (state.isError) {
    return (
      <div className="p-6 text-sm text-destructive">Failed to load feature management state.</div>
    );
  }

  const data = state.data!;
  const features = Object.values(data.registry).sort(
    (a, b) => a.module.localeCompare(b.module) || a.label.localeCompare(b.label),
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Dynamic Feature Control</CardTitle>
              <CardDescription>
                Feature flags, module visibility, per-tenant / per-plan overrides, rollout, and
                license management.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={invalidate}>
              <RefreshCw className="mr-1 h-4 w-4" /> Refresh
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="flags" className="space-y-4">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="flags">Feature Flags</TabsTrigger>
          <TabsTrigger value="modules">Module Visibility</TabsTrigger>
          <TabsTrigger value="tenants">Tenant Overrides</TabsTrigger>
          <TabsTrigger value="plans">Plan Overrides</TabsTrigger>
          <TabsTrigger value="rollout">Rollout &amp; Versioning</TabsTrigger>
          <TabsTrigger value="licenses">Licenses</TabsTrigger>
          <TabsTrigger value="logs">License Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="flags" className="space-y-4">
          <FeatureFlagsPanel features={features} onChanged={invalidate} />
        </TabsContent>
        <TabsContent value="modules" className="space-y-4">
          <ModuleVisibilityPanel modules={data.modules} onChanged={invalidate} />
        </TabsContent>
        <TabsContent value="tenants" className="space-y-4">
          <TenantOverridesPanel
            organizations={data.organizations}
            features={features}
            overrides={data.tenantOverrides}
            onChanged={invalidate}
          />
        </TabsContent>
        <TabsContent value="plans" className="space-y-4">
          <PlanOverridesPanel
            plans={data.plans}
            features={features}
            overrides={data.planOverrides}
            onChanged={invalidate}
          />
        </TabsContent>
        <TabsContent value="rollout" className="space-y-4">
          <RolloutPanel features={features} onChanged={invalidate} />
        </TabsContent>
        <TabsContent value="licenses" className="space-y-4">
          <LicensePanel licenses={data.licenses} onChanged={invalidate} />
        </TabsContent>
        <TabsContent value="logs" className="space-y-4">
          <LicenseLogsPanel logs={data.logs} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feature Flags
// ---------------------------------------------------------------------------
function FeatureFlagsPanel({
  features,
  onChanged,
}: {
  features: FeatureRecord[];
  onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [editing, setEditing] = useState<FeatureRecord | null>(null);
  const [open, setOpen] = useState(false);

  const upsertFn = useServerFn(upsertFeature);
  const deleteFn = useServerFn(deleteFeature);

  const filtered = features.filter((f) => {
    if (tierFilter !== "all" && f.tier !== tierFilter) return false;
    if (query && !`${f.key} ${f.label} ${f.module}`.toLowerCase().includes(query.toLowerCase()))
      return false;
    return true;
  });

  const toggle = useMutation({
    mutationFn: (f: FeatureRecord) => upsertFn({ data: { ...f, enabled: !f.enabled } }),
    onSuccess: () => {
      toast.success("Feature updated");
      onChanged();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const del = useMutation({
    mutationFn: (key: string) => deleteFn({ data: { key } }),
    onSuccess: () => {
      toast.success("Feature removed");
      onChanged();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search features"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            <SelectItem value="stable">Stable</SelectItem>
            <SelectItem value="beta">Beta</SelectItem>
            <SelectItem value="premium">Premium</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Add feature
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No features registered yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <th className="px-4 py-3 text-left font-medium">Feature</th>
                  <th className="px-4 py-3 text-left font-medium">Module</th>
                  <th className="px-4 py-3 text-left font-medium">Tier</th>
                  <th className="px-4 py-3 text-left font-medium">Rollout</th>
                  <th className="px-4 py-3 text-left font-medium">Version</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr key={f.key} className="border-b hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="font-medium">{f.label}</div>
                      <div className="text-xs text-muted-foreground font-mono">{f.key}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{f.module}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={TIER_STYLES[f.tier]} variant="outline">
                        {f.tier}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{f.rollout_pct}%</td>
                    <td className="px-4 py-3 font-mono text-xs">{f.version}</td>
                    <td className="px-4 py-3">
                      <Switch checked={f.enabled} onCheckedChange={() => toggle.mutate(f)} />
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(f);
                          setOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => del.mutate(f.key)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <FeatureEditor open={open} onOpenChange={setOpen} initial={editing} onSaved={onChanged} />
    </>
  );
}

function FeatureEditor({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: FeatureRecord | null;
  onSaved: () => void;
}) {
  const upsertFn = useServerFn(upsertFeature);
  const [form, setForm] = useState<FeatureRecord>(
    initial ?? {
      key: "",
      label: "",
      description: "",
      module: KNOWN_MODULES[0],
      tier: "stable",
      enabled: true,
      rollout_pct: 100,
      version: "1.0.0",
      updated_at: new Date().toISOString(),
    },
  );

  // Reset when opening
  useMemo(() => {
    if (open) {
      setForm(
        initial ?? {
          key: "",
          label: "",
          description: "",
          module: KNOWN_MODULES[0],
          tier: "stable",
          enabled: true,
          rollout_pct: 100,
          version: "1.0.0",
          updated_at: new Date().toISOString(),
        },
      );
    }
  }, [open, initial]);

  const save = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          key: form.key,
          label: form.label,
          description: form.description,
          module: form.module,
          tier: form.tier,
          enabled: form.enabled,
          rollout_pct: form.rollout_pct,
          version: form.version,
        },
      }),
    onSuccess: () => {
      toast.success("Feature saved");
      onSaved();
      onOpenChange(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit feature" : "Add feature"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Key</Label>
            <Input
              value={form.key}
              disabled={!!initial}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
              placeholder="ai.copilot"
            />
          </div>
          <div>
            <Label>Label</Label>
            <Input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </div>
          <div>
            <Label>Description</Label>
            <RichTextarea
              rows={2}
              value={form.description ?? ""}
              onChange={(v) => setForm({ ...form, description: v })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Module</Label>
              <Select value={form.module} onValueChange={(v) => setForm({ ...form, module: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KNOWN_MODULES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tier</Label>
              <Select
                value={form.tier}
                onValueChange={(v) => setForm({ ...form, tier: v as FeatureTier })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stable">Stable</SelectItem>
                  <SelectItem value="beta">Beta</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Version</Label>
              <Input
                value={form.version}
                onChange={(e) => setForm({ ...form, version: e.target.value })}
                placeholder="1.0.0"
              />
            </div>
            <div>
              <Label>Rollout ({form.rollout_pct}%)</Label>
              <Slider
                value={[form.rollout_pct]}
                min={0}
                max={100}
                step={5}
                onValueChange={([v]) => setForm({ ...form, rollout_pct: v })}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => setForm({ ...form, enabled: v })}
            />
            <span className="text-sm">Enabled globally</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!form.key || !form.label || save.isPending}
          >
            {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Module Visibility
// ---------------------------------------------------------------------------
function ModuleVisibilityPanel({
  modules,
  onChanged,
}: {
  modules: Record<
    string,
    { module: string; visible: boolean; min_tier: FeatureTier; updated_at: string }
  >;
  onChanged: () => void;
}) {
  const setFn = useServerFn(setModuleVisibility);
  const mut = useMutation({
    mutationFn: (input: { module: string; visible: boolean; min_tier: FeatureTier }) =>
      setFn({ data: input }),
    onSuccess: () => {
      toast.success("Module visibility updated");
      onChanged();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="px-4 py-3 text-left font-medium">Module</th>
              <th className="px-4 py-3 text-left font-medium">Visible</th>
              <th className="px-4 py-3 text-left font-medium">Minimum tier</th>
            </tr>
          </thead>
          <tbody>
            {KNOWN_MODULES.map((m) => {
              const rec = modules[m] ?? {
                module: m,
                visible: true,
                min_tier: "stable" as FeatureTier,
                updated_at: "",
              };
              return (
                <tr key={m} className="border-b hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium capitalize">{m}</td>
                  <td className="px-4 py-3">
                    <Switch
                      checked={rec.visible}
                      onCheckedChange={(v) =>
                        mut.mutate({ module: m, visible: v, min_tier: rec.min_tier })
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={rec.min_tier}
                      onValueChange={(v) =>
                        mut.mutate({ module: m, visible: rec.visible, min_tier: v as FeatureTier })
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="stable">Stable</SelectItem>
                        <SelectItem value="beta">Beta</SelectItem>
                        <SelectItem value="premium">Premium</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Overrides (Tenant + Plan) — shared UI
// ---------------------------------------------------------------------------
function OverrideMatrix({
  rows,
  features,
  values,
  onSet,
}: {
  rows: { id: string; label: string; subtitle?: string }[];
  features: FeatureRecord[];
  values: Record<string, Record<string, boolean>>;
  onSet: (rowId: string, featureKey: string, value: boolean | null) => void;
}) {
  const [rowFilter, setRowFilter] = useState("");
  const filtered = rows.filter(
    (r) =>
      !rowFilter ||
      `${r.label} ${r.subtitle ?? ""}`.toLowerCase().includes(rowFilter.toLowerCase()),
  );

  return (
    <Card>
      <CardContent className="p-0">
        <div className="p-3 border-b bg-muted/40">
          <Input
            placeholder="Filter"
            value={rowFilter}
            onChange={(e) => setRowFilter(e.target.value)}
            className="max-w-sm"
          />
        </div>
        <ScrollArea className="w-full">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b">
                <th className="sticky left-0 bg-muted/40 px-4 py-3 text-left font-medium min-w-[220px]">
                  Target
                </th>
                {features.map((f) => (
                  <th key={f.key} className="px-3 py-3 text-left font-medium min-w-[160px]">
                    <div>{f.label}</div>
                    <div className="text-xs font-normal text-muted-foreground font-mono">
                      {f.key}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b hover:bg-muted/20">
                  <td className="sticky left-0 bg-background px-4 py-3">
                    <div className="font-medium">{row.label}</div>
                    {row.subtitle && (
                      <div className="text-xs text-muted-foreground">{row.subtitle}</div>
                    )}
                  </td>
                  {features.map((f) => {
                    const current = values[row.id]?.[f.key];
                    const state = current === undefined ? "inherit" : current ? "on" : "off";
                    return (
                      <td key={f.key} className="px-3 py-3">
                        <Select
                          value={state}
                          onValueChange={(v) =>
                            onSet(row.id, f.key, v === "inherit" ? null : v === "on")
                          }
                        >
                          <SelectTrigger className="h-9 w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inherit">Inherit</SelectItem>
                            <SelectItem value="on">Force on</SelectItem>
                            <SelectItem value="off">Force off</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={features.length + 1}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No targets match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function TenantOverridesPanel({
  organizations,
  features,
  overrides,
  onChanged,
}: {
  organizations: { id: string; name: string; slug: string }[];
  features: FeatureRecord[];
  overrides: Record<string, Record<string, boolean>>;
  onChanged: () => void;
}) {
  const setFn = useServerFn(setTenantOverride);
  const mut = useMutation({
    mutationFn: (input: {
      organization_id: string;
      feature_key: string;
      enabled: boolean | null;
    }) => setFn({ data: input }),
    onSuccess: () => {
      toast.success("Override saved");
      onChanged();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  if (features.length === 0) return <EmptyFeatures />;
  return (
    <OverrideMatrix
      rows={organizations.map((o) => ({ id: o.id, label: o.name, subtitle: o.slug }))}
      features={features}
      values={overrides}
      onSet={(id, key, val) => mut.mutate({ organization_id: id, feature_key: key, enabled: val })}
    />
  );
}

function PlanOverridesPanel({
  plans,
  features,
  overrides,
  onChanged,
}: {
  plans: { code: string; name: string; tier: string }[];
  features: FeatureRecord[];
  overrides: Record<string, Record<string, boolean>>;
  onChanged: () => void;
}) {
  const setFn = useServerFn(setPlanOverride);
  const mut = useMutation({
    mutationFn: (input: { plan_code: string; feature_key: string; enabled: boolean | null }) =>
      setFn({ data: input }),
    onSuccess: () => {
      toast.success("Override saved");
      onChanged();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  if (features.length === 0) return <EmptyFeatures />;
  return (
    <OverrideMatrix
      rows={plans.map((p) => ({ id: p.code, label: p.name, subtitle: p.tier }))}
      features={features}
      values={overrides}
      onSet={(code, key, val) => mut.mutate({ plan_code: code, feature_key: key, enabled: val })}
    />
  );
}

function EmptyFeatures() {
  return (
    <Card>
      <CardContent className="py-12 text-center text-sm text-muted-foreground">
        Register at least one feature flag under <strong>Feature Flags</strong> to configure
        overrides.
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Rollout & Versioning
// ---------------------------------------------------------------------------
function RolloutPanel({
  features,
  onChanged,
}: {
  features: FeatureRecord[];
  onChanged: () => void;
}) {
  const upsertFn = useServerFn(upsertFeature);
  const [local, setLocal] = useState<Record<string, { rollout_pct: number; version: string }>>({});

  const save = useMutation({
    mutationFn: (f: FeatureRecord) => {
      const patch = local[f.key];
      return upsertFn({
        data: {
          key: f.key,
          label: f.label,
          description: f.description,
          module: f.module,
          tier: f.tier,
          enabled: f.enabled,
          rollout_pct: patch?.rollout_pct ?? f.rollout_pct,
          version: patch?.version ?? f.version,
        },
      });
    },
    onSuccess: () => {
      toast.success("Rollout updated");
      onChanged();
      setLocal({});
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  if (features.length === 0) return <EmptyFeatures />;

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="px-4 py-3 text-left font-medium">Feature</th>
              <th className="px-4 py-3 text-left font-medium">Rollout %</th>
              <th className="px-4 py-3 text-left font-medium">Version</th>
              <th className="px-4 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {features.map((f) => {
              const patch = local[f.key] ?? { rollout_pct: f.rollout_pct, version: f.version };
              const dirty = patch.rollout_pct !== f.rollout_pct || patch.version !== f.version;
              return (
                <tr key={f.key} className="border-b hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="font-medium">{f.label}</div>
                    <div className="text-xs text-muted-foreground font-mono">{f.key}</div>
                  </td>
                  <td className="px-4 py-3 w-64">
                    <div className="flex items-center gap-2">
                      <Slider
                        className="flex-1"
                        value={[patch.rollout_pct]}
                        min={0}
                        max={100}
                        step={5}
                        onValueChange={([v]) =>
                          setLocal((s) => ({ ...s, [f.key]: { ...patch, rollout_pct: v } }))
                        }
                      />
                      <span className="text-xs w-10 text-right">{patch.rollout_pct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 w-40">
                    <Input
                      value={patch.version}
                      onChange={(e) =>
                        setLocal((s) => ({ ...s, [f.key]: { ...patch, version: e.target.value } }))
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      disabled={!dirty || save.isPending}
                      onClick={() => save.mutate(f)}
                    >
                      Save
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Licenses
// ---------------------------------------------------------------------------
type LicenseRow = {
  key: string;
  product: string;
  organization_id?: string | null;
  seats: number;
  status: "active" | "revoked" | "expired" | "pending";
  activated_at?: string | null;
  revoked_at?: string | null;
  expires_at?: string | null;
  notes?: string;
};

function LicensePanel({
  licenses,
  onChanged,
}: {
  licenses: Record<string, LicenseRow>;
  onChanged: () => void;
}) {
  const rows = Object.values(licenses).sort((a, b) =>
    (b.activated_at ?? "").localeCompare(a.activated_at ?? ""),
  );
  const [open, setOpen] = useState(false);
  const [validateKey, setValidateKey] = useState("");
  const activateFn = useServerFn(activateLicense);
  const revokeFn = useServerFn(revokeLicense);
  const validateFn = useServerFn(validateLicense);

  const [form, setForm] = useState({
    key: "",
    product: "Enterprise",
    organization_id: "",
    seats: 10,
    expires_at: "",
    notes: "",
  });

  const activate = useMutation({
    mutationFn: () =>
      activateFn({
        data: {
          key: form.key || undefined,
          product: form.product,
          organization_id: form.organization_id || null,
          seats: form.seats,
          expires_at: form.expires_at || null,
          notes: form.notes || undefined,
        },
      }),
    onSuccess: (res: { key: string }) => {
      toast.success(`License ${res.key} activated`);
      onChanged();
      setOpen(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Activation failed"),
  });

  const revoke = useMutation({
    mutationFn: (key: string) => revokeFn({ data: { key } }),
    onSuccess: () => {
      toast.success("License revoked");
      onChanged();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Revoke failed"),
  });

  const validate = useMutation({
    mutationFn: (key: string) => validateFn({ data: { key } }),
    onSuccess: (res: { ok: boolean; message: string }) => {
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      onChanged();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Validate failed"),
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 flex items-center gap-2">
          <Input
            placeholder="Validate license key"
            value={validateKey}
            onChange={(e) => setValidateKey(e.target.value)}
            className="max-w-sm"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!validateKey || validate.isPending}
            onClick={() => validate.mutate(validateKey.trim())}
          >
            <ShieldCheck className="mr-1 h-4 w-4" /> Validate
          </Button>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <KeyRound className="mr-1 h-4 w-4" /> Issue license
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Issue / activate license</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>License key (leave blank to generate)</Label>
                <Input
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value })}
                  placeholder="LIC-XXXXX-XXXXX-XXXXX-XXXXX"
                />
              </div>
              <div>
                <Label>Product</Label>
                <Input
                  value={form.product}
                  onChange={(e) => setForm({ ...form, product: e.target.value })}
                />
              </div>
              <div>
                <Label>Organization ID (optional)</Label>
                <Input
                  value={form.organization_id}
                  onChange={(e) => setForm({ ...form, organization_id: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Seats</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.seats}
                    onChange={(e) => setForm({ ...form, seats: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Expires (optional)</Label>
                  <DatePicker
                    value={fromDateString(form.expires_at)}
                    onChange={(d) => setForm({ ...form, expires_at: toDateString(d) })}
                  />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <RichTextarea
                  rows={2}
                  value={form.notes}
                  onChange={(v) => setForm({ ...form, notes: v })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => activate.mutate()}
                disabled={activate.isPending || !form.product}
              >
                Activate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No licenses issued yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <th className="px-4 py-3 text-left font-medium">Key</th>
                  <th className="px-4 py-3 text-left font-medium">Product</th>
                  <th className="px-4 py-3 text-left font-medium">Organization</th>
                  <th className="px-4 py-3 text-left font-medium">Seats</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Activated</th>
                  <th className="px-4 py-3 text-left font-medium">Expires</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.key} className="border-b hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs">{l.key}</td>
                    <td className="px-4 py-3">{l.product}</td>
                    <td className="px-4 py-3 font-mono text-xs">{l.organization_id ?? "—"}</td>
                    <td className="px-4 py-3">{l.seats}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={
                          l.status === "active"
                            ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                            : l.status === "revoked"
                              ? "bg-red-500/10 text-red-700 border-red-500/30"
                              : "bg-amber-500/10 text-amber-700 border-amber-500/30"
                        }
                      >
                        {l.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {l.activated_at
                        ? formatDistanceToNow(new Date(l.activated_at), { addSuffix: true })
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {l.expires_at ? new Date(l.expires_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => validate.mutate(l.key)}>
                        <ShieldCheck className="h-4 w-4" />
                      </Button>
                      {l.status === "active" && (
                        <Button size="sm" variant="ghost" onClick={() => revoke.mutate(l.key)}>
                          <ShieldOff className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// License Logs
// ---------------------------------------------------------------------------
function LicenseLogsPanel({
  logs,
}: {
  logs: {
    ts: string;
    action: string;
    license_key: string;
    actor?: string;
    ok: boolean;
    message?: string;
  }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>License activity</CardTitle>
        <CardDescription>
          Most recent 500 events. Also mirrored to platform audit log.
        </CardDescription>
      </CardHeader>
      <Separator />
      <CardContent className="p-0">
        {logs.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No license activity yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b">
                <th className="px-4 py-3 text-left font-medium">Time</th>
                <th className="px-4 py-3 text-left font-medium">Action</th>
                <th className="px-4 py-3 text-left font-medium">License</th>
                <th className="px-4 py-3 text-left font-medium">Result</th>
                <th className="px-4 py-3 text-left font-medium">Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={`${l.ts}-${i}`} className="border-b hover:bg-muted/20">
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(l.ts).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{l.action}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{l.license_key}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={
                        l.ok
                          ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                          : "bg-red-500/10 text-red-700 border-red-500/30"
                      }
                    >
                      {l.ok ? "ok" : "failed"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs">{l.message ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
