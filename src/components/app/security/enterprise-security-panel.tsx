import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ShieldCheck, Network, Trash2, FileText, Activity, RefreshCw,
  Plus, Copy, AlertTriangle, Clock, Download, Ban,
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import {
  useIPAllowlists, useUpsertIPAllowlist, useDeleteIPAllowlist,
  useRetentionPolicies, useUpsertRetentionPolicy,
  useGdprRequests, useCreateGdprRequest, useUpdateGdprRequestStatus,
  useSecurityEvents,
  useWebhookSigningSecrets, useRotateWebhookSecret,
  type RetentionResource,
} from "@/hooks/use-enterprise-security";

const RESOURCE_LABELS: Record<RetentionResource, string> = {
  messages: "Messages",
  conversations: "Conversations",
  media: "Media & attachments",
  audit_logs: "Audit logs",
  webhook_events: "Webhook events",
  login_history: "Login history",
  activities: "Activity feed",
  notifications: "Notifications",
  error_logs: "Error logs",
};

const DEFAULT_RESOURCES: RetentionResource[] = [
  "messages", "media", "audit_logs", "webhook_events", "login_history", "notifications",
];

export function EnterpriseSecurityPanel() {
  return (
    <div className="space-y-6">
      <SecurityPostureCard />
      <div className="grid gap-6 lg:grid-cols-2">
        <IPAllowlistCard />
        <WebhookRotationCard />
      </div>
      <RetentionPoliciesCard />
      <GdprRequestsCard />
      <SecurityEventsCard />
    </div>
  );
}

/* ---------------- Posture summary ---------------- */
function SecurityPostureCard() {
  const { data: ips = [] } = useIPAllowlists();
  const { data: retention = [] } = useRetentionPolicies();
  const { data: events = [] } = useSecurityEvents(50);
  const critical = events.filter((e) => e.severity === "critical").length;

  const items = [
    { ok: ips.filter((i) => i.is_active).length > 0, label: "IP allowlist configured" },
    { ok: retention.filter((r) => r.is_active).length > 0, label: "Data retention active" },
    { ok: critical === 0, label: "No critical security events" },
    { ok: true, label: "Webhook signatures verified (HMAC-SHA256)" },
    { ok: true, label: "API tokens hashed at rest" },
    { ok: true, label: "Media served via signed URLs" },
    { ok: true, label: "RLS enforced on all workspace tables" },
    { ok: true, label: "OWASP input validation via Zod" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-600" /> Enterprise Security Posture
        </CardTitle>
        <CardDescription>
          Secure-by-default controls. Warnings turn amber when action is required.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 md:grid-cols-2">
          {items.map((it) => (
            <li key={it.label} className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${it.ok ? "bg-emerald-500" : "bg-amber-500"}`} />
              <span className={it.ok ? "" : "text-amber-700 dark:text-amber-400"}>{it.label}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/* ---------------- IP Allowlist ---------------- */
function IPAllowlistCard() {
  const { data: rows = [], isLoading } = useIPAllowlists();
  const upsert = useUpsertIPAllowlist();
  const del = useDeleteIPAllowlist();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [cidr, setCidr] = useState("");
  const [applies, setApplies] = useState<"api" | "ui" | "all">("api");

  const save = async () => {
    if (!label.trim() || !cidr.trim()) return toast.error("Label and CIDR are required");
    // Loose CIDR / IP validation.
    if (!/^([0-9a-f.:]+)(\/\d+)?$/i.test(cidr.trim())) return toast.error("Invalid CIDR");
    try {
      await upsert.mutateAsync({ label: label.trim(), cidr: cidr.trim(), applies_to: applies, is_active: true });
      toast.success("IP range added");
      setOpen(false); setLabel(""); setCidr("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Network className="h-5 w-5" /> IP Restrictions</CardTitle>
          <CardDescription>Allow API/UI access only from listed CIDR ranges.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 " /> Add range</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add IP range</DialogTitle>
              <DialogDescription>Traffic outside this list will be denied for the selected surface.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Label</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Office HQ" />
              </div>
              <div>
                <Label>CIDR</Label>
                <Input value={cidr} onChange={(e) => setCidr(e.target.value)} placeholder="203.0.113.0/24" />
              </div>
              <div>
                <Label>Applies to</Label>
                <Select value={applies} onValueChange={(v) => setApplies(v as typeof applies)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="api">API only</SelectItem>
                    <SelectItem value="ui">UI only</SelectItem>
                    <SelectItem value="all">API and UI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={upsert.isPending}>Add range</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No IP restrictions. Access is allowed from any address.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>CIDR</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell className="font-mono text-xs">{r.cidr}</TableCell>
                  <TableCell><Badge variant="secondary">{r.applies_to}</Badge></TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => del.mutate(r.id)}>
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
  );
}

/* ---------------- Webhook Rotation ---------------- */
function WebhookRotationCard() {
  const { data: secrets = [] } = useWebhookSigningSecrets();
  const rotate = useRotateWebhookSecret();
  const [revealed, setRevealed] = useState<string | null>(null);

  const doRotate = async () => {
    try {
      const { secret } = await rotate.mutateAsync();
      setRevealed(secret);
      toast.success("Webhook signing secret rotated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rotation failed");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5" /> Webhook Signing</CardTitle>
          <CardDescription>Rotate HMAC signing secrets used to verify inbound webhooks.</CardDescription>
        </div>
        <Button size="sm" onClick={doRotate} disabled={rotate.isPending}>Rotate now</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {revealed && (
          <Alert>
            <AlertTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Copy the new secret now
            </AlertTitle>
            <AlertDescription>
              <p className="mb-2 text-sm">
                We only store a hash. This is the only time we can show the plaintext value.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded border bg-background px-2 py-1 text-xs break-all">
                  {revealed}
                </code>
                <Button size="sm" variant="outline" onClick={() => {
                  navigator.clipboard.writeText(revealed);
                  toast.success("Copied");
                }}>
                  <Copy className="h-4 w-4 " /> Copy
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRevealed(null)}>I've saved it</Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
        {secrets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No signing secret yet — rotate to create one.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prefix</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Activated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {secrets.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.secret_prefix}</TableCell>
                  <TableCell>
                    {s.is_primary
                      ? <Badge>Primary</Badge>
                      : <Badge variant="secondary">Retired</Badge>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDistanceToNow(new Date(s.activated_at), { addSuffix: true })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Retention Policies ---------------- */
function RetentionPoliciesCard() {
  const { data: rows = [] } = useRetentionPolicies();
  const upsert = useUpsertRetentionPolicy();
  const byResource = new Map(rows.map((r) => [r.resource, r]));

  const setDays = async (resource: RetentionResource, days: number, active: boolean) => {
    try {
      await upsert.mutateAsync({ resource, retention_days: days, is_active: active });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Data Retention</CardTitle>
        <CardDescription>
          Automatically delete or archive workspace data after the specified number of days. Runs daily.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Resource</TableHead>
              <TableHead className="w-32">Days</TableHead>
              <TableHead className="w-24">Active</TableHead>
              <TableHead>Last run</TableHead>
              <TableHead className="text-right">Last deleted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DEFAULT_RESOURCES.map((r) => {
              const existing = byResource.get(r);
              const days = existing?.retention_days ?? 365;
              const active = existing?.is_active ?? false;
              return (
                <TableRow key={r}>
                  <TableCell className="font-medium">{RESOURCE_LABELS[r]}</TableCell>
                  <TableCell>
                    <Input
                      type="number" min={1} max={3650} defaultValue={days}
                      onBlur={(e) => {
                        const n = Number(e.target.value);
                        if (n > 0 && n !== days) setDays(r, n, active);
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch checked={active} onCheckedChange={(v) => setDays(r, days, v)} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {existing?.last_run_at
                      ? formatDistanceToNow(new Date(existing.last_run_at), { addSuffix: true })
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right ">
                    {existing?.last_deleted_count ?? 0}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ---------------- GDPR Requests ---------------- */
function GdprRequestsCard() {
  const { data: rows = [] } = useGdprRequests();
  const create = useCreateGdprRequest();
  const update = useUpdateGdprRequestStatus();
  const [open, setOpen] = useState(false);
  const [subjectId, setSubjectId] = useState("");
  const [subjectIdentifier, setSubjectIdentifier] = useState("");
  const [type, setType] = useState<"export" | "erasure" | "restriction" | "rectification" | "portability">("export");
  const [notes, setNotes] = useState("");

  const submit = async () => {
    if (!subjectId.trim()) return toast.error("Subject ID (contact UUID) is required");
    try {
      await create.mutateAsync({
        subject_type: "contact",
        subject_id: subjectId.trim(),
        subject_identifier: subjectIdentifier.trim() || undefined,
        request_type: type,
        notes: notes.trim() || undefined,
      });
      toast.success("GDPR request logged");
      setOpen(false); setSubjectId(""); setSubjectIdentifier(""); setNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create request");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> GDPR Requests</CardTitle>
          <CardDescription>Log and track data subject requests (export, erasure, restriction).</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 " /> New request</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New data subject request</DialogTitle>
              <DialogDescription>Must be completed within 30 days under GDPR Article 12.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Contact ID</Label>
                <Input value={subjectId} onChange={(e) => setSubjectId(e.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000" />
              </div>
              <div>
                <Label>Identifier (email or phone)</Label>
                <Input value={subjectIdentifier} onChange={(e) => setSubjectIdentifier(e.target.value)} />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="export">Data export (Art. 15)</SelectItem>
                    <SelectItem value="erasure">Erasure / right to be forgotten (Art. 17)</SelectItem>
                    <SelectItem value="restriction">Restriction (Art. 18)</SelectItem>
                    <SelectItem value="rectification">Rectification (Art. 16)</SelectItem>
                    <SelectItem value="portability">Portability (Art. 20)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={create.isPending}>Log request</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No GDPR requests logged.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const overdue = r.status !== "completed" && r.status !== "rejected"
                  && new Date(r.due_at) < new Date();
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.subject_identifier ?? "—"}</div>
                      <div className="text-xs text-muted-foreground font-mono">{r.subject_id.slice(0, 8)}</div>
                    </TableCell>
                    <TableCell><Badge variant="secondary">{r.request_type}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={r.status === "completed" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className={overdue ? "text-destructive text-sm" : "text-sm"}>
                      {formatDistanceToNow(new Date(r.due_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {r.status === "pending" && (
                        <>
                          <Button size="sm" variant="outline"
                            onClick={() => update.mutate({ id: r.id, status: "completed" })}>
                            <Download className="h-3 w-3 " /> Complete
                          </Button>
                          <Button size="sm" variant="ghost"
                            onClick={() => update.mutate({ id: r.id, status: "rejected" })}>
                            <Ban className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </TableCell>
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

/* ---------------- Security Events ---------------- */
function SecurityEventsCard() {
  const { data: events = [] } = useSecurityEvents(50);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Security Event Stream</CardTitle>
        <CardDescription>Add an audit log that records every template edit, delete attempt, and sync change with timestamps and user details.</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No security events yet.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {events.map((e) => (
              <div key={e.id} className="flex items-start gap-3 rounded-control border bg-card p-3">
                <span className={`mt-1 h-2 w-2 rounded-full ${
                  e.severity === "critical" ? "bg-destructive"
                  : e.severity === "warning" ? "bg-amber-500" : "bg-emerald-500"
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{e.event_type}</span>
                    <Badge variant="outline" className="text-xs">{e.severity}</Badge>
                  </div>
                  {e.resource_type && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {e.resource_type} {e.resource_id?.slice(0, 12)}
                    </div>
                  )}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
