import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { AppTopbar } from "@/components/app/app-topbar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker, fromDateString, toDateString } from "@/shared/components";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  Download,
  Search,
  Plus,
  AlertTriangle,
  FileClock,
  TrendingUp,
  MailX,
} from "lucide-react";
import { toast } from "sonner";
import {
  useConsentRecords,
  useConsentStats,
  useSuppressionList,
  useRecordConsent,
  useConfirmDoubleOptIn,
  useConsentAuditLogs,
  useGdprRequests,
  useCreateGdprRequest,
  useConsentRealtime,
  type ConsentStatus,
} from "@/hooks/use-consent";

export const Route = createFileRoute("/_authenticated/consent")({
  component: ConsentPage,
});

const STATUS_META: Record<
  ConsentStatus,
  { icon: typeof CheckCircle2; className: string; label: string }
> = {
  opted_in: { icon: CheckCircle2, className: "bg-success/10 text-success", label: "Opted in" },
  opted_out: { icon: XCircle, className: "bg-destructive/10 text-destructive", label: "Opted out" },
  pending: { icon: Clock, className: "bg-warning/10 text-warning", label: "Pending" },
  unsubscribed: { icon: MailX, className: "bg-muted text-muted-foreground", label: "Unsubscribed" },
};

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: typeof CheckCircle2;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-destructive"
          : "text-foreground";
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs  text-muted-foreground">{label}</div>
          <div className={`text-2xl font-semibold mt-1 ${toneClass}`}>{value}</div>
          {hint ? <div className="text-xs text-muted-foreground mt-1">{hint}</div> : null}
        </div>
        <Icon className={`w-5 h-5 ${toneClass}`} />
      </div>
    </Card>
  );
}

function ConsentPage() {
  useConsentRealtime();
  const [tab, setTab] = useState("overview");
  return (
    <>
      <AppTopbar
        title="Consent Management"
        subtitle="GDPR-ready opt-in/out records, suppression lists and audit trail"
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-2 md:grid-cols-6 w-full md:w-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="records">Records</TabsTrigger>
            <TabsTrigger value="suppression">Suppression</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="gdpr">GDPR</TabsTrigger>
            <TabsTrigger value="audit">Audit Log</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-6">
            <OverviewTab />
          </TabsContent>
          <TabsContent value="records" className="mt-6">
            <RecordsTab />
          </TabsContent>
          <TabsContent value="suppression" className="mt-6">
            <SuppressionTab />
          </TabsContent>
          <TabsContent value="preferences" className="mt-6">
            <PreferencesTab />
          </TabsContent>
          <TabsContent value="gdpr" className="mt-6">
            <GdprTab />
          </TabsContent>
          <TabsContent value="audit" className="mt-6">
            <AuditTab />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}

/* -------------------- Overview -------------------- */

function OverviewTab() {
  const { data: stats, isLoading } = useConsentStats();
  if (isLoading || !stats) {
    return <div className="text-sm text-muted-foreground">Loading compliance dashboard</div>;
  }
  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
        <KpiCard
          label="Compliance score"
          value={`${stats.complianceScore}%`}
          icon={ShieldCheck}
          tone="success"
          hint="Opted-in ratio"
        />
        <KpiCard label="Total records" value={stats.total} icon={FileClock} />
        <KpiCard label="Opted in" value={stats.optedIn} icon={CheckCircle2} tone="success" />
        <KpiCard label="Opted out" value={stats.optedOut} icon={XCircle} tone="danger" />
        <KpiCard
          label="Pending (double opt-in)"
          value={stats.pending}
          icon={Clock}
          tone="warning"
        />
        <KpiCard label="Unsubscribed" value={stats.unsubscribed} icon={MailX} />
        <KpiCard
          label="Expiring < 30 days"
          value={stats.expiringSoon}
          icon={AlertTriangle}
          tone="warning"
        />
        <KpiCard
          label="Expired consents"
          value={stats.expired}
          icon={AlertTriangle}
          tone="danger"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <div className="font-medium">Consent by channel</div>
          </div>
          <BarList items={stats.byChannel} />
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <div className="font-medium">Consent by purpose</div>
          </div>
          <BarList items={stats.byPurpose} />
        </Card>
      </div>
    </div>
  );
}

function BarList({ items }: { items: Record<string, number> }) {
  const entries = Object.entries(items).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (entries.length === 0)
    return <div className="text-sm text-muted-foreground">No data yet.</div>;
  return (
    <div className="space-y-2">
      {entries.map(([k, v]) => (
        <div key={k}>
          <div className="flex justify-between text-xs mb-1">
            <span className="capitalize">{k}</span>
            <span className="text-muted-foreground">{v}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${(v / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------- Records -------------------- */

function RecordsTab() {
  const fmtZoned = useZonedDateFormatter();
  const [status, setStatus] = useState<string>("all");
  const [channel, setChannel] = useState<string>("all");
  const [purpose, setPurpose] = useState<string>("all");
  const [search, setSearch] = useState("");
  const { data, isLoading } = useConsentRecords({
    status: status === "all" ? undefined : (status as ConsentStatus),
    channel: channel === "all" ? undefined : channel,
    purpose: purpose === "all" ? undefined : purpose,
    limit: 1000,
  });
  const confirm = useConfirmDoubleOptIn();
  const filtered = (data ?? []).filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = r.contact;
    return (
      c?.first_name?.toLowerCase?.().includes(s) ||
      c?.last_name?.toLowerCase?.().includes(s) ||
      c?.phone_number?.toLowerCase?.().includes(s) ||
      c?.email?.toLowerCase?.().includes(s) ||
      r.source?.toLowerCase?.().includes(s)
    );
  });

  const exportCsv = () => {
    const header = "contact,channel,purpose,status,source,effective_at,expires_at,ip,notes\n";
    const rows = filtered
      .map((r) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = r.contact;
        const name = c
          ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() ||
            c.phone_number ||
            c.email ||
            r.contact_id
          : r.contact_id;
        return [
          name,
          r.channel,
          r.purpose,
          r.status,
          r.source ?? "",
          r.effective_at,
          r.expires_at ?? "",
          r.ip_address ?? "",
          (r.notes ?? "").replaceAll("\n", " "),
        ]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(",");
      })
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `consent-records-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by contact, phone, email, source"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="opted_in">Opted in</SelectItem>
            <SelectItem value="opted_out">Opted out</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="voice">Voice</SelectItem>
            <SelectItem value="push">Push</SelectItem>
          </SelectContent>
        </Select>
        <Select value={purpose} onValueChange={setPurpose}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Purpose" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All purposes</SelectItem>
            <SelectItem value="marketing">Marketing</SelectItem>
            <SelectItem value="transactional">Transactional</SelectItem>
            <SelectItem value="utility">Utility</SelectItem>
            <SelectItem value="authentication">Authentication</SelectItem>
            <SelectItem value="service">Service</SelectItem>
          </SelectContent>
        </Select>
        <RecordConsentDialog />
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="w-4 h-4 " />
          Export CSV
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading</div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <ShieldCheck className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
          <div className="font-medium">No consent records match your filters</div>
          <div className="text-sm text-muted-foreground mt-1">
            Consent is recorded automatically from forms, replies and API calls.
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs  text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2.5">Contact</th>
                  <th className="text-left px-4 py-2.5">Channel</th>
                  <th className="text-left px-4 py-2.5">Purpose</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="text-left px-4 py-2.5">Source</th>
                  <th className="text-left px-4 py-2.5">Effective</th>
                  <th className="text-left px-4 py-2.5">Expires</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => {
                  const meta = STATUS_META[r.status] ?? STATUS_META.pending;
                  const Icon = meta.icon;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const c: any = r.contact;
                  const name = c
                    ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() ||
                      c.phone_number ||
                      c.email ||
                      "—"
                    : "—";
                  const expired = r.expires_at && new Date(r.expires_at) < new Date();
                  return (
                    <tr key={r.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{name}</div>
                        {c?.phone_number ? (
                          <div className="text-xs text-muted-foreground">{c.phone_number}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 capitalize">{r.channel}</td>
                      <td className="px-4 py-2.5 capitalize">{r.purpose}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-control text-xs ${meta.className}`}
                        >
                          <Icon className="w-3 h-3" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.source ?? "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {fmtZoned(new Date(r.effective_at), { dateStyle: "medium" })}
                      </td>
                      <td className="px-4 py-2.5">
                        {r.expires_at ? (
                          <span className={expired ? "text-destructive" : "text-muted-foreground"}>
                            {fmtZoned(new Date(r.expires_at), { dateStyle: "medium" })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {r.status === "pending" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              confirm.mutate(r.id, {
                                onSuccess: () => toast.success("Double opt-in confirmed"),
                                onError: (e) => toast.error((e as Error).message),
                              })
                            }
                          >
                            Confirm
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function RecordConsentDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    contact_id: "",
    channel: "whatsapp",
    purpose: "marketing",
    status: "opted_in" as ConsentStatus,
    source: "manual",
    notes: "",
    expires_at: "",
  });
  const mut = useRecordConsent();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="w-4 h-4 " />
          Record consent
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record consent</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Contact ID</label>
            <Input
              value={form.contact_id}
              onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
              placeholder="uuid"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Channel</label>
              <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="voice">Voice</SelectItem>
                  <SelectItem value="push">Push</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Purpose</label>
              <Select value={form.purpose} onValueChange={(v) => setForm({ ...form, purpose: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="transactional">Transactional</SelectItem>
                  <SelectItem value="utility">Utility</SelectItem>
                  <SelectItem value="authentication">Authentication</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Status</label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as ConsentStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="opted_in">Opted in</SelectItem>
                  <SelectItem value="opted_out">Opted out</SelectItem>
                  <SelectItem value="pending">Pending (double opt-in)</SelectItem>
                  <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Source</label>
              <Input
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                placeholder="web-form, whatsapp-reply, api"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Expires at</label>
              <DatePicker
                value={fromDateString(form.expires_at)}
                onChange={(d) => setForm({ ...form, expires_at: toDateString(d) })}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Notes</label>
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional context / proof reference"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!form.contact_id || mut.isPending}
            onClick={() =>
              mut.mutate(
                {
                  contact_id: form.contact_id,
                  channel: form.channel,
                  purpose: form.purpose,
                  status: form.status,
                  source: form.source,
                  notes: form.notes || undefined,
                  expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
                },
                {
                  onSuccess: () => {
                    toast.success("Consent recorded");
                    setOpen(false);
                  },
                  onError: (e) => toast.error((e as Error).message),
                },
              )
            }
          >
            {mut.isPending ? "Saving" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------- Suppression / Blacklist -------------------- */

function SuppressionTab() {
  const fmtZoned = useZonedDateFormatter();
  const { data, isLoading } = useSuppressionList();
  const record = useRecordConsent();
  return (
    <div className="space-y-4">
      <Card className="p-4 bg-destructive/5 border-destructive/20">
        <div className="flex items-start gap-3">
          <Ban className="w-5 h-5 text-destructive mt-0.5" />
          <div className="text-sm">
            <div className="font-medium">Suppression list</div>
            <div className="text-muted-foreground">
              Contacts on this list are blocked from receiving marketing messages. The campaign
              dispatcher automatically filters these contacts out at send time.
            </div>
          </div>
        </div>
      </Card>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading</div>
      ) : !data || data.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <ShieldCheck className="w-8 h-8 mx-auto text-success mb-3" />
          <div className="font-medium">Nobody suppressed</div>
          <div className="text-sm text-muted-foreground mt-1">
            All contacts are eligible for marketing outreach.
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs  text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5">Contact</th>
                <th className="text-left px-4 py-2.5">Channel</th>
                <th className="text-left px-4 py-2.5">Reason</th>
                <th className="text-left px-4 py-2.5">Source</th>
                <th className="text-left px-4 py-2.5">Since</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((r) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const c: any = r.contact;
                const name = c
                  ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() ||
                    c.phone_number ||
                    c.email ||
                    "—"
                  : "—";
                return (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{name}</div>
                      {c?.phone_number ? (
                        <div className="text-xs text-muted-foreground">{c.phone_number}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 capitalize">{r.channel}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className="capitalize">
                        {r.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.source ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {fmtZoned(new Date(r.effective_at), { dateStyle: "medium" })}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          record.mutate(
                            {
                              contact_id: r.contact_id,
                              channel: r.channel,
                              purpose: r.purpose,
                              status: "opted_in",
                              source: "manual-reinstate",
                            },
                            {
                              onSuccess: () => toast.success("Consent reinstated"),
                              onError: (e) => toast.error((e as Error).message),
                            },
                          )
                        }
                      >
                        Reinstate
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

/* -------------------- Preferences -------------------- */

function PreferencesTab() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-5">
        <div className="font-medium mb-2">Privacy defaults</div>
        <div className="text-sm text-muted-foreground mb-4">
          Baseline behaviours applied to every new contact until they set explicit preferences.
        </div>
        <PreferenceRow label="Require double opt-in for marketing" defaultOn />
        <PreferenceRow label="Honor unsubscribe replies (STOP, UNSUBSCRIBE)" defaultOn />
        <PreferenceRow label="Suppress marketing outside business hours" defaultOn />
        <PreferenceRow label="Consent expires after 24 months of inactivity" />
      </Card>
      <Card className="p-5">
        <div className="font-medium mb-2">Communication preferences</div>
        <div className="text-sm text-muted-foreground mb-4">
          Which purposes can be reached on which channels by default.
        </div>
        <PrefMatrix />
      </Card>
    </div>
  );
}

function PreferenceRow({ label, defaultOn }: { label: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(!!defaultOn);
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <div className="text-sm">{label}</div>
      <button
        onClick={() => setOn(!on)}
        className={`w-10 h-6 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"}`}
        aria-pressed={on}
      >
        <span
          className={`block w-5 h-5 rounded-full bg-background shadow transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`}
        />
      </button>
    </div>
  );
}

function PrefMatrix() {
  const purposes = ["Marketing", "Transactional", "Utility", "Authentication"];
  const channels = ["WhatsApp", "Email", "SMS"];
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-muted-foreground">
          <th className="text-left py-1"></th>
          {channels.map((c) => (
            <th key={c} className="text-center py-1">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {purposes.map((p) => (
          <tr key={p} className="border-t border-border">
            <td className="py-2 pr-2">{p}</td>
            {channels.map((c) => (
              <td key={c} className="text-center py-2">
                <Checkbox
                  defaultChecked={p !== "Marketing" || c === "WhatsApp"}
                  className="mx-auto"
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* -------------------- GDPR -------------------- */

function GdprTab() {
  const fmtZoned = useZonedDateFormatter();
  const { data, isLoading } = useGdprRequests();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    subject_id: "",
    request_type: "export" as
      "export" | "erasure" | "restriction" | "rectification" | "portability",
    reason: "",
  });
  const create = useCreateGdprRequest();
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          Track data subject requests under GDPR / CCPA. Due dates default to 30 days.
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 " />
              New request
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New GDPR request</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Subject (contact) ID</label>
                <Input
                  value={form.subject_id}
                  onChange={(e) => setForm({ ...form, subject_id: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Request type</label>
                <Select
                  value={form.request_type}
                  onValueChange={(v) =>
                    setForm({ ...form, request_type: v as typeof form.request_type })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="export">Data export</SelectItem>
                    <SelectItem value="erasure">Erasure (right to be forgotten)</SelectItem>
                    <SelectItem value="rectification">Rectification</SelectItem>
                    <SelectItem value="restriction">Restriction</SelectItem>
                    <SelectItem value="portability">Portability</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Reason</label>
                <Input
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!form.subject_id || create.isPending}
                onClick={() =>
                  create.mutate(
                    {
                      subject_type: "contact",
                      subject_id: form.subject_id,
                      request_type: form.request_type,
                      reason: form.reason,
                    },
                    {
                      onSuccess: () => {
                        toast.success("GDPR request logged");
                        setOpen(false);
                      },
                      onError: (e) => toast.error((e as Error).message),
                    },
                  )
                }
              >
                {create.isPending ? "Saving" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading</div>
      ) : !data || data.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <ShieldCheck className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
          <div className="font-medium">No GDPR requests yet</div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs  text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5">Type</th>
                <th className="text-left px-4 py-2.5">Subject</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Requested</th>
                <th className="text-left px-4 py-2.5">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((r) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const row: any = r;
                const overdue = row.status !== "completed" && new Date(row.due_at) < new Date();
                return (
                  <tr key={row.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 capitalize">{row.request_type}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {row.subject_identifier ?? row.subject_id}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className="capitalize">
                        {row.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {fmtZoned(new Date(row.requested_at), { dateStyle: "medium" })}
                    </td>
                    <td
                      className={`px-4 py-2.5 ${overdue ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {fmtZoned(new Date(row.due_at), { dateStyle: "medium" })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

/* -------------------- Audit -------------------- */

function AuditTab() {
  const fmtZoned = useZonedDateFormatter();
  const { data, isLoading } = useConsentAuditLogs();
  if (isLoading) return <div className="text-sm text-muted-foreground">Loading audit log</div>;
  if (!data || data.length === 0)
    return (
      <Card className="p-10 text-center border-dashed">
        <FileClock className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
        <div className="font-medium">No audit events yet</div>
        <div className="text-sm text-muted-foreground mt-1">
          Every consent, GDPR and contact change is recorded here for compliance.
        </div>
      </Card>
    );
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs  text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-2.5">When</th>
            <th className="text-left px-4 py-2.5">Action</th>
            <th className="text-left px-4 py-2.5">Resource</th>
            <th className="text-left px-4 py-2.5">Resource ID</th>
            <th className="text-left px-4 py-2.5">Actor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((row) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r: any = row;
            return (
              <tr key={r.id} className="hover:bg-muted/20">
                <td className="px-4 py-2.5 text-muted-foreground">
                  {fmtZoned(new Date(r.created_at), { dateStyle: "medium", timeStyle: "short" })}
                </td>
                <td className="px-4 py-2.5 capitalize">{r.action}</td>
                <td className="px-4 py-2.5 capitalize">{r.resource_type}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground truncate max-w-[220px]">
                  {r.resource_id}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[180px]">
                  {r.actor_id ?? "system"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
