import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Play, Pause, Clock, Mail, MessageSquare, Download, Lock } from "lucide-react";
import { listSchedules, upsertSchedule, deleteSchedule } from "@/lib/bi/bi.functions";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";

interface Props { workspaceId: string; reports: Array<{ id: string; name: string }> }

type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "custom";
type Delivery = "email" | "whatsapp" | "download";
type Format = "pdf" | "csv" | "xlsx" | "json";

const FREQUENCY_TO_CRON: Record<Exclude<Frequency, "custom">, string> = {
  daily: "0 8 * * *",
  weekly: "0 8 * * 1",
  monthly: "0 8 1 * *",
  quarterly: "0 8 1 1,4,7,10 *",
  yearly: "0 8 1 1 *",
};

const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: "Daily · 08:00",
  weekly: "Weekly · Monday 08:00",
  monthly: "Monthly · 1st, 08:00",
  quarterly: "Quarterly · Jan/Apr/Jul/Oct",
  yearly: "Yearly · Jan 1",
  custom: "Custom cron",
};

function cronToFrequency(cron: string): Frequency {
  for (const [k, v] of Object.entries(FREQUENCY_TO_CRON)) if (v === cron) return k as Frequency;
  return "custom";
}

export function BiScheduledReports({ workspaceId, reports }: Props) {
  const qc = useQueryClient();
  const list = useServerFn(listSchedules);
  const upsert = useServerFn(upsertSchedule);
  const del = useServerFn(deleteSchedule);
  const { canManageSchedules, isLoading: roleLoading } = useWorkspaceRole(workspaceId);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [reportId, setReportId] = useState(reports[0]?.id ?? "");
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [customCron, setCustomCron] = useState("0 8 * * *");
  const [delivery, setDelivery] = useState<Delivery>("email");
  const [format, setFormat] = useState<Format>("pdf");
  const [recipients, setRecipients] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const { data: schedules } = useQuery({
    queryKey: ["bi.schedules", workspaceId],
    queryFn: () => list({ data: { workspaceId } }),
  });

  const activeCron = frequency === "custom" ? customCron : FREQUENCY_TO_CRON[frequency];

  const createMut = useMutation({
    mutationFn: () => upsert({ data: {
      workspaceId, reportId, name, cron: activeCron,
      frequency,
      recipients: delivery === "email" ? recipients.split(",").map((s) => s.trim()).filter(Boolean) : [],
      whatsappRecipients: delivery === "whatsapp" ? whatsapp.split(",").map((s) => s.trim()).filter(Boolean) : [],
      format, delivery, enabled: true,
    } as any }),
    onSuccess: () => {
      setShowForm(false); setName(""); setRecipients(""); setWhatsapp("");
      qc.invalidateQueries({ queryKey: ["bi.schedules", workspaceId] });
    },
  });

  const toggleMut = useMutation({
    mutationFn: (row: any) => upsert({ data: {
      id: row.id, workspaceId, reportId: row.report_id, name: row.name,
      cron: row.cron, frequency: row.frequency, recipients: row.recipients ?? [],
      whatsappRecipients: row.whatsapp_recipients ?? [],
      format: row.format, delivery: row.delivery, enabled: !row.enabled,
    } as any }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bi.schedules", workspaceId] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bi.schedules", workspaceId] }),
  });

  if (!roleLoading && !canManageSchedules) {
    return (
      <div className="rounded-control border border-border bg-surface p-8 text-center">
        <Lock className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
        <p className="font-medium">Scheduled reports are managed by admins</p>
        <p className="text-sm text-muted-foreground mt-1">Ask your workspace owner or admin to schedule reports on your behalf.</p>
      </div>
    );
  }

  return (
    <div className="rounded-control border border-border bg-surface">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="font-display font-semibold">Scheduled Reports</h3>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="inline-flex items-center gap-1 text-sm rounded-control bg-primary text-primary-foreground px-3 py-1.5 hover:opacity-90">
          <Plus className="h-4 w-4" /> Schedule
        </button>
      </div>

      {showForm && (
        <div className="p-4 border-b border-border space-y-3 bg-surface-elevated/40">
          <div className="grid gap-2 md:grid-cols-4">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Schedule name" className="rounded-control border border-border bg-background px-3 py-2 text-sm md:col-span-2" />
            <select value={reportId} onChange={(e) => setReportId(e.target.value)} className="rounded-control border border-border bg-background px-3 py-2 text-sm">
              {reports.length === 0 && <option value="">— No reports —</option>}
              {reports.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} className="rounded-control border border-border bg-background px-3 py-2 text-sm">
              {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((f) => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
            </select>
          </div>
          {frequency === "custom" && (
            <input value={customCron} onChange={(e) => setCustomCron(e.target.value)} placeholder="Cron expression e.g. 0 9 * * 1-5" className="w-full rounded-control border border-border bg-background px-3 py-2 text-sm font-mono" />
          )}
          <div className="grid gap-2 md:grid-cols-4">
            <div className="md:col-span-2 flex gap-1">
              {(["email", "whatsapp", "download"] as Delivery[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDelivery(d)}
                  className={`flex-1 inline-flex items-center justify-center gap-1 text-xs rounded-control border py-1.5 capitalize ${delivery === d ? "border-primary bg-primary/10" : "border-border"}`}
                >
                  {d === "email" && <Mail className="h-3 w-3" />}
                  {d === "whatsapp" && <MessageSquare className="h-3 w-3" />}
                  {d === "download" && <Download className="h-3 w-3" />}
                  {d}
                </button>
              ))}
            </div>
            <select value={format} onChange={(e) => setFormat(e.target.value as Format)} className="rounded-control border border-border bg-background px-3 py-2 text-sm md:col-span-2">
              {(["pdf", "csv", "xlsx", "json"] as Format[]).map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
            </select>
          </div>
          {delivery === "email" && (
            <input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="Recipients (comma-separated emails)" className="w-full rounded-control border border-border bg-background px-3 py-2 text-sm" />
          )}
          {delivery === "whatsapp" && (
            <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="WhatsApp numbers (comma-separated, E.164)" className="w-full rounded-control border border-border bg-background px-3 py-2 text-sm" />
          )}
          {delivery === "download" && (
            <p className="text-xs text-muted-foreground">Reports will be generated and available in the Download Center. No external delivery.</p>
          )}
          <div className="flex justify-end">
            <button disabled={!name || !reportId || createMut.isPending} onClick={() => createMut.mutate()} className="rounded-control bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50">
              Save schedule
            </button>
          </div>
        </div>
      )}

      <ul className="divide-y divide-border">
        {(schedules ?? []).map((s: any) => {
          const freq = s.frequency ?? cronToFrequency(s.cron);
          const DeliveryIcon = s.delivery === "whatsapp" ? MessageSquare : s.delivery === "download" ? Download : Mail;
          const count = s.delivery === "whatsapp" ? (s.whatsapp_recipients ?? []).length : (s.recipients ?? []).length;
          return (
            <li key={s.id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-sm">{s.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                  <span>{FREQUENCY_LABELS[freq as Frequency] ?? s.cron}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1"><DeliveryIcon className="h-3 w-3" />{s.delivery}</span>
                  <span>·</span>
                  <span>{s.format?.toUpperCase()}</span>
                  {s.delivery !== "download" && <><span>·</span><span>{count} recipient(s)</span></>}
                  <span>·</span>
                  <span className={s.enabled ? "text-emerald-500" : "text-muted-foreground"}>{s.enabled ? "enabled" : "paused"}</span>
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => toggleMut.mutate(s)} className="p-2 hover:bg-surface-elevated rounded-control" title={s.enabled ? "Pause" : "Resume"}>
                  {s.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button onClick={() => { if (confirm(`Delete schedule "${s.name}"?`)) deleteMut.mutate(s.id); }} className="p-2 hover:bg-surface-elevated rounded-control text-rose-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          );
        })}
        {schedules && schedules.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">No scheduled reports yet.</li>
        )}
      </ul>
    </div>
  );
}
