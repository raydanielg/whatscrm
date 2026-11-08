import { requireWorkspaceRole } from "@/lib/rbac";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import {
  ShieldCheck,
  ShieldAlert,
  ScrollText,
  Cookie,
  FileText,
  UserCheck,
  UserX,
  Database,
  Download,
  Plus,
  Trash2,
  Save,
  RefreshCcw,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  getComplianceOverview,
  saveComplianceSettings,
  listPrivacyRequests,
  createPrivacyRequest,
  updatePrivacyRequest,
  listRetentionPolicies,
  upsertRetentionPolicy,
  deleteRetentionPolicy,
  generateComplianceReport,
  type ComplianceSettings,
  type PrivacyRequest,
  type RetentionPolicy,
} from "@/lib/compliance/compliance-center.functions";
import { AppTopbar } from "@/components/app/app-topbar";

export const Route = createFileRoute("/_authenticated/compliance-center")({
  beforeLoad: requireWorkspaceRole("owner", "admin"),
  head: () => ({
    meta: [
      { title: "Compliance Center" },
      {
        name: "description",
        content: "GDPR & CCPA readiness, privacy requests, data retention, and consent management.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ComplianceCenterPage,
});

const RESOURCES = [
  "messages",
  "conversations",
  "media",
  "audit_logs",
  "webhook_events",
  "login_history",
  "activities",
  "notifications",
  "error_logs",
] as const;

const REQUEST_TYPES = [
  { v: "export", l: "Right to Access / Export" },
  { v: "portability", l: "Data Portability" },
  { v: "erasure", l: "Right to Erasure" },
  { v: "rectification", l: "Rectification" },
  { v: "restriction", l: "Restriction of Processing" },
] as const;

function ComplianceCenterPage() {
  const fetchOverview = useServerFn(getComplianceOverview);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["compliance-overview"],
    queryFn: () => fetchOverview(),
    refetchInterval: 60_000,
  });

  const score = data?.compliance_score ?? 0;
  const posture = data?.posture ?? "action-needed";
  const gradient = useMemo(() => {
    if (posture === "compliant") return "from-emerald-500/20 via-emerald-500/5 to-transparent";
    if (posture === "action-needed") return "from-amber-500/20 via-amber-500/5 to-transparent";
    return "from-destructive/25 via-destructive/5 to-transparent";
  }, [posture]);

  return (
    <>
      <AppTopbar
        title="Compliance Center"
        subtitle="GDPR, CCPA, data governance and privacy operations"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCcw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <DownloadReportButton />
          </div>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {/* Score hero */}
        <Card className="relative overflow-hidden border-border/60">
          <div className={`absolute inset-0 bg-gradient-to-br ${gradient} pointer-events-none`} />
          <CardContent className="relative p-6 md:p-8 grid md:grid-cols-3 gap-6 items-center">
            <div className="flex flex-col items-center justify-center">
              <div className="relative w-40 h-40">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    strokeWidth="8"
                    className="stroke-muted/40"
                    fill="none"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={`${(score / 100) * 264} 264`}
                    className={
                      posture === "compliant"
                        ? "stroke-emerald-500"
                        : posture === "action-needed"
                          ? "stroke-amber-500"
                          : "stroke-destructive"
                    }
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-4xl font-bold ">{isLoading ? "--" : score}</div>
                  <div className="text-xs text-muted-foreground ">Score</div>
                </div>
              </div>
              <Badge
                className="mt-3"
                variant={
                  posture === "compliant"
                    ? "default"
                    : posture === "action-needed"
                      ? "secondary"
                      : "destructive"
                }
              >
                {posture === "compliant" ? (
                  <ShieldCheck className="h-3 w-3 " />
                ) : (
                  <ShieldAlert className="h-3 w-3 " />
                )}
                {posture.replace("-", " ").toUpperCase()}
              </Badge>
              <div className="flex gap-2 mt-2">
                {data?.settings.gdpr_enabled && <Badge variant="outline">GDPR</Badge>}
                {data?.settings.ccpa_enabled && <Badge variant="outline">CCPA</Badge>}
              </div>
            </div>
            <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={Clock} label="Open requests" value={data?.metrics.open_requests} />
              <Stat
                icon={AlertTriangle}
                label="Overdue"
                value={data?.metrics.overdue_requests}
                tone="danger"
              />
              <Stat
                icon={CheckCircle2}
                label="Completed 30d"
                value={data?.metrics.completed_requests_30d}
              />
              <Stat
                icon={UserCheck}
                label="Opted-in contacts"
                value={data?.metrics.consented_contacts}
              />
              <Stat icon={UserX} label="Revoked consent" value={data?.metrics.revoked_contacts} />
              <Stat
                icon={Database}
                label={
                  data && data.metrics.active_retention_policies > 0 && !data.metrics.retention_enforced
                    ? "Retention (not running)"
                    : "Active retention"
                }
                value={data?.metrics.active_retention_policies}
              />
              <Stat
                icon={ScrollText}
                label="Audit events 30d"
                value={data?.metrics.audit_events_30d}
              />
              <Stat
                icon={ShieldAlert}
                label="Breach signals 30d"
                value={data?.metrics.breach_events_30d}
                tone="warn"
              />
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="requests" className="space-y-4">
          <TabsList className="grid grid-cols-2 md:grid-cols-6  ">
            <TabsTrigger value="requests">Privacy Requests</TabsTrigger>
            <TabsTrigger value="consent">Consent</TabsTrigger>
            <TabsTrigger value="retention">Retention</TabsTrigger>
            <TabsTrigger value="cookies">Cookies & Policies</TabsTrigger>
            <TabsTrigger value="processing">Processing Records</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="requests">
            <RequestsPanel />
          </TabsContent>
          <TabsContent value="consent">
            <ConsentPanel data={data} />
          </TabsContent>
          <TabsContent value="retention">
            <RetentionPanel />
          </TabsContent>
          <TabsContent value="cookies">
            {data && <CookiePoliciesPanel settings={data.settings} />}
          </TabsContent>
          <TabsContent value="processing">
            <ProcessingPanel data={data} />
          </TabsContent>
          <TabsContent value="settings">
            {data && <SettingsPanel initial={data.settings} />}
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}

/* -------- Stats -------- */

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: number | undefined;
  tone?: "warn" | "danger";
}) {
  const color =
    tone === "danger" && (value ?? 0) > 0
      ? "text-destructive"
      : tone === "warn" && (value ?? 0) > 0
        ? "text-amber-500"
        : "";
  return (
    <div className="p-3 rounded-control border bg-card/70 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`text-2xl font-semibold  mt-1 ${color}`}>{value ?? "--"}</div>
    </div>
  );
}

/* -------- Requests -------- */

function RequestsPanel() {
  const listFn = useServerFn(listPrivacyRequests);
  const createFn = useServerFn(createPrivacyRequest);
  const updateFn = useServerFn(updatePrivacyRequest);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["privacy-requests"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    request_type: "export" as PrivacyRequest["request_type"],
    subject_type: "contact" as "contact" | "user",
    subject_identifier: "",
    reason: "",
  });

  const createMut = useMutation({
    mutationFn: (payload: typeof form) => createFn({ data: payload }),
    onSuccess: () => {
      toast.success("Privacy request created");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["privacy-requests"] });
      qc.invalidateQueries({ queryKey: ["compliance-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (payload: { id: string; status: PrivacyRequest["status"] }) =>
      updateFn({ data: payload }),
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["privacy-requests"] });
      qc.invalidateQueries({ queryKey: ["compliance-overview"] });
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Privacy Requests</CardTitle>
          <CardDescription>
            Access, portability, erasure, rectification, restriction.
          </CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 " /> New request
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New privacy request</DialogTitle>
              <DialogDescription>
                Log a data-subject request. Due date defaults to 30 days.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Request type</Label>
                <Select
                  value={form.request_type}
                  onValueChange={(v) =>
                    setForm({ ...form, request_type: v as PrivacyRequest["request_type"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REQUEST_TYPES.map((t) => (
                      <SelectItem key={t.v} value={t.v}>
                        {t.l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Subject type</Label>
                <Select
                  value={form.subject_type}
                  onValueChange={(v) => setForm({ ...form, subject_type: v as "contact" | "user" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contact">Contact</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Subject identifier (email or phone)</Label>
                <Input
                  value={form.subject_identifier}
                  onChange={(e) => setForm({ ...form, subject_identifier: e.target.value })}
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <Label>Reason (optional)</Label>
                <Textarea
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createMut.mutate(form)}
                disabled={!form.subject_identifier || createMut.isPending}
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {(data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No privacy requests yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Due</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((r) => {
                const overdue =
                  ["pending", "processing"].includes(r.status) && new Date(r.due_at) < new Date();
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant="outline">{r.request_type}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate">
                      {r.subject_identifier ?? r.subject_type}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={r.status}
                        onValueChange={(v) =>
                          updateMut.mutate({ id: r.id, status: v as PrivacyRequest["status"] })
                        }
                      >
                        <SelectTrigger className="h-9 w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["pending", "processing", "completed", "rejected", "failed"].map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(r.requested_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          overdue ? "text-destructive font-medium" : "text-muted-foreground"
                        }
                      >
                        {format(new Date(r.due_at), "PP")}
                      </span>
                    </TableCell>
                    <TableCell />
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* -------- Consent -------- */

function ConsentPanel({
  data,
}: {
  data: ReturnType<typeof getComplianceOverview> extends Promise<infer T> ? T | undefined : never;
}) {
  const rows = data?.consent_by_purpose ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Consent by purpose</CardTitle>
        <CardDescription>
          Marketing, transactional, and channel-specific consent posture.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No consent records yet.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const total = r.opted_in + r.revoked;
              const pct = total > 0 ? (r.opted_in / total) * 100 : 0;
              return (
                <li key={r.purpose} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium capitalize">{r.purpose}</span>
                    <span className="text-muted-foreground ">
                      {r.opted_in} opted-in · {r.revoked} revoked
                    </span>
                  </div>
                  <Progress value={pct} />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* -------- Retention -------- */

function RetentionPanel() {
  const listFn = useServerFn(listRetentionPolicies);
  const upsertFn = useServerFn(upsertRetentionPolicy);
  const deleteFn = useServerFn(deleteRetentionPolicy);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["retention-policies"], queryFn: () => listFn() });
  const [draft, setDraft] = useState<{ resource: (typeof RESOURCES)[number]; days: number }>({
    resource: "messages",
    days: 365,
  });

  const upsertMut = useMutation({
    mutationFn: (p: {
      resource: (typeof RESOURCES)[number];
      retention_days: number;
      is_active: boolean;
    }) => upsertFn({ data: p }),
    onSuccess: () => {
      toast.success("Retention policy saved");
      qc.invalidateQueries({ queryKey: ["retention-policies"] });
      qc.invalidateQueries({ queryKey: ["compliance-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["retention-policies"] });
      qc.invalidateQueries({ queryKey: ["compliance-overview"] });
    },
  });

  const existing = new Set((data ?? []).map((p) => p.resource));
  const available = RESOURCES.filter((r) => !existing.has(r));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add retention policy</CardTitle>
          <CardDescription>
            Data older than the retention window is purged automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-3 items-end">
          <div className="flex-1">
            <Label>Resource</Label>
            <Select
              value={draft.resource}
              onValueChange={(v) =>
                setDraft({ ...draft, resource: v as (typeof RESOURCES)[number] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(available.length > 0 ? available : RESOURCES).map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Label>Retention (days)</Label>
            <Input
              type="number"
              min={1}
              max={3650}
              value={draft.days}
              onChange={(e) => setDraft({ ...draft, days: Number(e.target.value) })}
            />
          </div>
          <Button
            onClick={() =>
              upsertMut.mutate({
                resource: draft.resource,
                retention_days: draft.days,
                is_active: true,
              })
            }
            disabled={upsertMut.isPending}
          >
            <Plus className="h-4 w-4 " /> Add / Update
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active policies</CardTitle>
        </CardHeader>
        <CardContent>
          {(data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No retention policies configured yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Resource</TableHead>
                  <TableHead>Retention (days)</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead>Purged</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((p: RetentionPolicy) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.resource}</TableCell>
                    <TableCell className="">{p.retention_days}</TableCell>
                    <TableCell>
                      <Switch
                        checked={p.is_active}
                        onCheckedChange={(v) =>
                          upsertMut.mutate({
                            resource: p.resource as (typeof RESOURCES)[number],
                            retention_days: p.retention_days,
                            is_active: v,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.last_run_at
                        ? formatDistanceToNow(new Date(p.last_run_at), { addSuffix: true })
                        : "—"}
                    </TableCell>
                    <TableCell className="">{p.last_deleted_count}</TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMut.mutate(p.id)}
                        aria-label="Delete policy"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------- Processing records -------- */

function ProcessingPanel({
  data,
}: {
  data: ReturnType<typeof getComplianceOverview> extends Promise<infer T> ? T | undefined : never;
}) {
  const rows = data?.data_processing_records ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Records of processing activities (Art. 30 GDPR)</CardTitle>
        <CardDescription>Live view of workspace data lifecycle & purge activity.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Configure retention policies to populate this record.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data category</TableHead>
                <TableHead>Retention</TableHead>
                <TableHead>Last purge</TableHead>
                <TableHead>Records purged</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.resource}>
                  <TableCell className="font-mono text-xs">{r.resource}</TableCell>
                  <TableCell className="">{r.retention_days} days</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.last_run_at
                      ? formatDistanceToNow(new Date(r.last_run_at), { addSuffix: true })
                      : "—"}
                  </TableCell>
                  <TableCell className="">{r.deleted}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* -------- Cookies & Policies -------- */

function CookiePoliciesPanel({ settings }: { settings: ComplianceSettings }) {
  const saveFn = useServerFn(saveComplianceSettings);
  const qc = useQueryClient();
  const [s, setS] = useState<ComplianceSettings>(settings);
  const saveMut = useMutation({
    mutationFn: (payload: ComplianceSettings) => saveFn({ data: payload }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["compliance-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Cookie className="h-4 w-4" /> Cookie management
          </CardTitle>
          <CardDescription>Cookie banner & category defaults shown to visitors.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Cookie banner enabled</Label>
            <Switch
              checked={s.cookie_banner_enabled}
              onCheckedChange={(v) => setS({ ...s, cookie_banner_enabled: v })}
            />
          </div>
          <div>
            <Label>Banner message</Label>
            <Textarea
              rows={3}
              value={s.cookie_banner_message}
              onChange={(e) => setS({ ...s, cookie_banner_message: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Categories</Label>
            {(["essential", "functional", "analytics", "marketing"] as const).map((k) => (
              <div key={k} className="flex items-center justify-between text-sm">
                <span className="capitalize">
                  {k}
                  {k === "essential" ? " (required)" : ""}
                </span>
                <Switch
                  checked={s.cookie_categories[k]}
                  disabled={k === "essential"}
                  onCheckedChange={(v) =>
                    setS({ ...s, cookie_categories: { ...s.cookie_categories, [k]: v } })
                  }
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Terms & Privacy policy
          </CardTitle>
          <CardDescription>Linked from cookie banner, emails, and public pages.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Privacy policy URL</Label>
            <Input
              value={s.privacy_policy_url}
              onChange={(e) => setS({ ...s, privacy_policy_url: e.target.value })}
              placeholder="https://example.com/privacy"
            />
          </div>
          <div>
            <Label>Terms of service URL</Label>
            <Input
              value={s.terms_url}
              onChange={(e) => setS({ ...s, terms_url: e.target.value })}
              placeholder="https://example.com/terms"
            />
          </div>
        </CardContent>
      </Card>

      <div className="md:col-span-2 flex justify-end">
        <Button onClick={() => saveMut.mutate(s)} disabled={saveMut.isPending}>
          <Save className="h-4 w-4 " /> Save changes
        </Button>
      </div>
    </div>
  );
}

/* -------- Settings -------- */

function SettingsPanel({ initial }: { initial: ComplianceSettings }) {
  const saveFn = useServerFn(saveComplianceSettings);
  const qc = useQueryClient();
  const [s, setS] = useState<ComplianceSettings>(initial);
  const saveMut = useMutation({
    mutationFn: (payload: ComplianceSettings) => saveFn({ data: payload }),
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["compliance-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Regulations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>GDPR mode (EU)</Label>
            <Switch
              checked={s.gdpr_enabled}
              onCheckedChange={(v) => setS({ ...s, gdpr_enabled: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>CCPA mode (California)</Label>
            <Switch
              checked={s.ccpa_enabled}
              onCheckedChange={(v) => setS({ ...s, ccpa_enabled: v })}
            />
          </div>
          <div>
            <Label>Response window (days)</Label>
            <Input
              type="number"
              min={1}
              max={365}
              value={s.request_response_days}
              onChange={(e) => setS({ ...s, request_response_days: Number(e.target.value) })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data controller & DPO</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Controller name</Label>
            <Input
              value={s.controller_name}
              onChange={(e) => setS({ ...s, controller_name: e.target.value })}
            />
          </div>
          <div>
            <Label>Controller address</Label>
            <Textarea
              rows={2}
              value={s.controller_address}
              onChange={(e) => setS({ ...s, controller_address: e.target.value })}
            />
          </div>
          <div>
            <Label>Data Protection Officer</Label>
            <Input
              value={s.dpo_name}
              onChange={(e) => setS({ ...s, dpo_name: e.target.value })}
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <Label>DPO contact email</Label>
            <Input
              type="email"
              value={s.dpo_email}
              onChange={(e) => setS({ ...s, dpo_email: e.target.value })}
              placeholder="dpo@example.com"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Data processing notes</CardTitle>
          <CardDescription>Internal notes for auditors and DPAs.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={5}
            value={s.data_processing_notes}
            onChange={(e) => setS({ ...s, data_processing_notes: e.target.value })}
          />
        </CardContent>
      </Card>

      <div className="md:col-span-2 flex justify-end">
        <Button onClick={() => saveMut.mutate(s)} disabled={saveMut.isPending}>
          <Save className="h-4 w-4 " /> Save settings
        </Button>
      </div>
    </div>
  );
}

/* -------- Report download -------- */

function DownloadReportButton() {
  const reportFn = useServerFn(generateComplianceReport);
  const mut = useMutation({
    mutationFn: () => reportFn({ data: { days: 30 } }),
    onSuccess: (report) => {
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `compliance-report-${format(new Date(), "yyyy-MM-dd")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Report generated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
      <Download className="h-4 w-4" /> Generate report
    </Button>
  );
}
