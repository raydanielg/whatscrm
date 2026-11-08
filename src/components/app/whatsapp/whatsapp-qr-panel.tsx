import { Brand } from "@/components/brand";
import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeSVG } from "qrcode.react";
import {
  QrCode,
  RefreshCw,
  ShieldOff,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  Search,
  Pencil,
  Trash2,
  Plug,
  PlugZap,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listQrSessions,
  startQrSession,
  pollQrSession,
  revokeQrSession,
  reconnectQrSession,
  deleteQrSession,
  renameQrSession,
  revokeAllQrSessions,
  qrWorkerHealth,
} from "@/lib/messaging/qr-sessions.functions";

type Session = {
  id: string;
  status: string;
  phone_number: string | null;
  display_name: string | null;
  device_platform: string | null;
  error_message: string | null;
  last_seen_at: string | null;
  connected_at: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
};

const ACTIVE_STATUSES = ["pending", "awaiting_scan", "scanned", "connecting"];
const FILTERS = [
  { id: "all", label: "All" },
  { id: "connected", label: "Connected" },
  { id: "active", label: "Pending" },
  { id: "issues", label: "Issues" },
  { id: "revoked", label: "Revoked" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

function sessionLabel(s: Session) {
  const label = (s.metadata as { label?: string } | null)?.label;
  return typeof label === "string" && label.trim() ? label.trim() : null;
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending: { label: "Starting", className: "bg-muted text-muted-foreground" },
  awaiting_scan: { label: "Awaiting scan", className: "bg-warning/10 text-warning" },
  scanned: { label: "Scanned", className: "bg-primary/10 text-primary" },
  connecting: { label: "Connecting", className: "bg-primary/10 text-primary" },
  connected: { label: "Connected", className: "bg-success/10 text-success" },
  disconnected: { label: "Disconnected", className: "bg-muted text-muted-foreground" },
  revoked: { label: "Revoked", className: "bg-destructive/10 text-destructive" },
  error: { label: "Error", className: "bg-destructive/10 text-destructive" },
};

export function WhatsAppQrPanel() {
  const { data: ws } = useCurrentWorkspace();
  const formatZoned = useZonedDateFormatter();
  const qc = useQueryClient();
  const list = useServerFn(listQrSessions);
  const startFn = useServerFn(startQrSession);
  const revokeFn = useServerFn(revokeQrSession);
  const reconnectFn = useServerFn(reconnectQrSession);
  const deleteFn = useServerFn(deleteQrSession);
  const renameFn = useServerFn(renameQrSession);
  const revokeAllFn = useServerFn(revokeAllQrSessions);
  const healthFn = useServerFn(qrWorkerHealth);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [confirm, setConfirm] = useState<
    { kind: "revoke" | "delete"; session: Session } | { kind: "revoke-all" } | null
  >(null);
  const [renaming, setRenaming] = useState<{ session: Session; value: string } | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["wa-qr-sessions", ws?.id] });

  const sessionsQ = useQuery({
    queryKey: ["wa-qr-sessions", ws?.id],
    queryFn: () => list({ data: { workspaceId: ws!.id } }) as Promise<Session[]>,
    enabled: !!ws?.id,
    refetchInterval: 5000,
  });

  const healthQ = useQuery({
    queryKey: ["wa-qr-worker-health"],
    queryFn: () =>
      healthFn({}) as Promise<{ configured: boolean; reachable: boolean; uptime: number | null }>,
    refetchInterval: 30000,
  });

  const startM = useMutation({
    mutationFn: () => startFn({ data: { workspaceId: ws!.id } }),
    onSuccess: (res: any) => {
      setActiveSessionId(res.id);
      invalidate();
      if (!res.worker_available) {
        toast.warning(
          "Session created, but the QR worker is not configured — no live QR is available.",
        );
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeM = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { sessionId: id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Session revoked");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reconnectM = useMutation({
    mutationFn: (id: string) => reconnectFn({ data: { sessionId: id } }),
    onSuccess: (res: any) => {
      invalidate();
      setActiveSessionId(res.id);
      if (!res.worker_available)
        toast.warning(
          "Session reset, but the QR worker is not configured — no live QR is available.",
        );
      else toast.success("Reconnecting — scan the new QR code");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { sessionId: id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Session deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renameM = useMutation({
    mutationFn: (v: { sessionId: string; label: string }) => renameFn({ data: v }),
    onSuccess: () => {
      invalidate();
      setRenaming(null);
      toast.success("Label saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeAllM = useMutation({
    mutationFn: () => revokeAllFn({ data: { workspaceId: ws!.id } }),
    onSuccess: (res: any) => {
      invalidate();
      toast.success(`Revoked ${res.revoked} session${res.revoked === 1 ? "" : "s"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sessions = sessionsQ.data ?? [];
  const active = sessions.find((s) => s.id === activeSessionId) ?? null;

  const stats = useMemo(
    () => ({
      total: sessions.length,
      connected: sessions.filter((s) => s.status === "connected").length,
      pending: sessions.filter((s) => ACTIVE_STATUSES.includes(s.status)).length,
      issues: sessions.filter((s) => s.status === "error" || s.status === "disconnected").length,
    }),
    [sessions],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      const matchesFilter =
        filter === "all"
          ? true
          : filter === "connected"
            ? s.status === "connected"
            : filter === "active"
              ? ACTIVE_STATUSES.includes(s.status)
              : filter === "issues"
                ? s.status === "error" || s.status === "disconnected"
                : s.status === "revoked";
      if (!matchesFilter) return false;
      if (!q) return true;
      return [s.phone_number, s.display_name, sessionLabel(s), s.device_platform, s.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [sessions, search, filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-xl flex items-center gap-2">
            <QrCode className="w-5 h-5" /> QR WhatsApp Login
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Connect personal WhatsApp accounts by scanning a QR code, then manage every linked
            device from here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setConfirm({ kind: "revoke-all" })}
            disabled={revokeAllM.isPending || stats.total === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded border border-border text-sm hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50 disabled:opacity-60"
          >
            <ShieldOff className="w-4 h-4" /> Revoke all
          </button>
          <button
            onClick={() => startM.mutate()}
            disabled={startM.isPending || !ws?.id}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
          >
            {startM.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <QrCode className="w-4 h-4" />
            )}
            New QR session
          </button>
        </div>
      </div>

      {/* Worker health */}
      <div className="flex items-center gap-2 text-sm rounded border border-border p-3">
        {healthQ.data?.reachable ? (
          <>
            <Wifi className="w-4 h-4 text-success" />
            <span className="text-success font-medium">Worker online</span>
            {healthQ.data.uptime != null && (
              <span className="text-muted-foreground text-xs">
                uptime {Math.round(healthQ.data.uptime / 60)} min
              </span>
            )}
          </>
        ) : healthQ.data?.configured === false ? (
          <>
            <WifiOff className="w-4 h-4 text-warning" />
            <span className="text-warning font-medium">Worker not configured</span>
            <span className="text-muted-foreground text-xs">
              Set WA_QR_WORKER_URL and WA_QR_WORKER_TOKEN to enable live QR login.
            </span>
          </>
        ) : (
          <>
            <WifiOff className="w-4 h-4 text-destructive" />
            <span className="text-destructive font-medium">Worker unreachable</span>
            <span className="text-muted-foreground text-xs">
              Sessions can be managed, but no live QR is available.
            </span>
          </>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Sessions", value: stats.total, icon: Smartphone, tone: "text-foreground" },
          { label: "Connected", value: stats.connected, icon: CheckCircle2, tone: "text-success" },
          { label: "Pending", value: stats.pending, icon: Loader2, tone: "text-warning" },
          { label: "Issues", value: stats.issues, icon: AlertTriangle, tone: "text-destructive" },
        ].map((c) => (
          <div key={c.label} className="rounded border border-border p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <c.icon className={`w-3.5 h-3.5 ${c.tone}`} /> {c.label}
            </div>
            <div className="text-2xl font-bold mt-1">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by number, label or device"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded text-xs border ${
                filter === f.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {active && (
        <QrDialog
          sessionId={active.id}
          onClose={() => setActiveSessionId(null)}
          onConnected={invalidate}
        />
      )}

      <div className="rounded border border-border overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Session</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Device</th>
              <th className="text-left p-3">Last activity</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted-foreground">
                  {sessions.length === 0 ? (
                    <>
                      No QR sessions yet. Click <strong>New QR session</strong> to connect a device.
                    </>
                  ) : (
                    "No sessions match your filters."
                  )}
                </td>
              </tr>
            )}
            {visible.map((s) => {
              const badge = STATUS_STYLES[s.status] ?? {
                label: s.status,
                className: "bg-muted text-muted-foreground",
              };
              const label = sessionLabel(s);
              return (
                <tr key={s.id} className="border-t border-border">
                  <td className="p-3">
                    <div className="font-medium flex items-center gap-2">
                      {label || s.phone_number || s.display_name || "Unnamed session"}
                      <button
                        onClick={() => setRenaming({ session: s, value: label ?? "" })}
                        className="p-1 rounded hover:bg-muted text-muted-foreground"
                        aria-label="Rename session"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {label && s.phone_number ? `${s.phone_number} · ` : ""}
                      Created{" "}
                      {formatZoned(new Date(s.created_at), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </div>
                  </td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-1 rounded ${badge.className}`}>
                      {badge.label}
                    </span>
                    {s.error_message && (
                      <div className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {s.error_message}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Smartphone className="w-3.5 h-3.5" />
                      {s.device_platform || "—"}
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {s.last_seen_at
                      ? formatZoned(new Date(s.last_seen_at), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                  </td>
                  <td className="p-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      {ACTIVE_STATUSES.includes(s.status) && (
                        <button
                          onClick={() => setActiveSessionId(s.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-xs hover:bg-muted text-nowrap"
                        >
                          <QrCode className="w-3.5 h-3.5" /> Show QR
                        </button>
                      )}
                      {s.status !== "connected" && (
                        <button
                          onClick={() => reconnectM.mutate(s.id)}
                          disabled={reconnectM.isPending}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-xs hover:bg-muted disabled:opacity-60 text-nowrap"
                        >
                          {reconnectM.isPending && reconnectM.variables === s.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <PlugZap className="w-3.5 h-3.5" />
                          )}
                          Reconnect
                        </button>
                      )}
                      {s.status !== "revoked" && (
                        <button
                          onClick={() => setConfirm({ kind: "revoke", session: s })}
                          disabled={revokeM.isPending}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-xs hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50"
                        >
                          <ShieldOff className="w-3.5 h-3.5" /> Revoke
                        </button>
                      )}
                      <button
                        onClick={() => setConfirm({ kind: "delete", session: s })}
                        disabled={deleteM.isPending}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-xs hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50"
                        aria-label="Delete session"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-muted-foreground rounded border border-dashed border-border p-3 flex items-start gap-2">
        <Plug className="w-3.5 h-3.5 mt-0.5" />
        <span>
          <strong>Note:</strong> QR login requires the <Brand /> WhatsApp QR worker service to be
          deployed and configured with <code>WA_QR_WORKER_URL</code> and{" "}
          <code>WA_QR_WORKER_TOKEN</code>. Without it, sessions can still be created and revoked but
          no live QR is available.
        </span>
      </div>

      {/* Rename dialog */}
      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename session</DialogTitle>
          </DialogHeader>
          <Input
            value={renaming?.value ?? ""}
            maxLength={80}
            placeholder="e.g. Sales phone"
            onChange={(e) => setRenaming((r) => (r ? { ...r, value: e.target.value } : r))}
          />
          <DialogFooter>
            <button
              onClick={() => setRenaming(null)}
              className="px-3 py-1.5 rounded border border-border text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={() =>
                renaming &&
                renameM.mutate({ sessionId: renaming.session.id, label: renaming.value })
              }
              disabled={renameM.isPending}
              className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-60"
            >
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Destructive confirmations */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "delete"
                ? "Delete this session?"
                : confirm?.kind === "revoke-all"
                  ? "Revoke all sessions?"
                  : "Revoke this WhatsApp session?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "delete"
                ? "The session row and its worker state are permanently removed. This cannot be undone."
                : confirm?.kind === "revoke-all"
                  ? "Every linked device in this workspace is disconnected immediately."
                  : "The linked device is disconnected immediately. You can reconnect later with a new QR scan."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirm) return;
                if (confirm.kind === "revoke-all") revokeAllM.mutate();
                else if (confirm.kind === "delete") deleteM.mutate(confirm.session.id);
                else revokeM.mutate(confirm.session.id);
                setConfirm(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function QrDialog({
  sessionId,
  onClose,
  onConnected,
}: {
  sessionId: string;
  onClose: () => void;
  onConnected: () => void;
}) {
  const poll = useServerFn(pollQrSession);
  const [state, setState] = useState<{
    qr: string | null;
    status: string;
    worker_available: boolean;
    error?: string | null;
  }>({ qr: null, status: "pending", worker_available: true });

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function tick() {
      try {
        const res: any = await poll({ data: { sessionId } });
        if (!alive) return;
        setState({
          qr: res.qr,
          status: res.session.status,
          worker_available: res.worker_available,
          error: res.session.error_message,
        });
        if (res.session.status === "connected") {
          onConnected();
          setTimeout(() => alive && onClose(), 1500);
          return;
        }
      } catch {
        /* ignore, retry */
      }
      if (alive) timer = setTimeout(tick, 2500);
    }
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, poll, onClose, onConnected]);

  const badge = STATUS_STYLES[state.status] ?? {
    label: state.status,
    className: "bg-muted text-muted-foreground",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-control border border-border bg-surface shadow-lg">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="font-display font-semibold">Scan to connect WhatsApp</div>
          <button onClick={onClose} className="p-1 rounded-control hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 flex flex-col items-center gap-4">
          <div className="w-64 h-64 flex items-center justify-center rounded-control border border-border bg-white p-3">
            {state.status === "connected" ? (
              <div className="text-center text-success">
                <CheckCircle2 className="w-16 h-16 mx-auto mb-2" />
                <div className="font-medium">Connected</div>
              </div>
            ) : state.qr ? (
              <QRCodeSVG value={state.qr} size={224} />
            ) : !state.worker_available ? (
              <div className="text-center text-sm text-muted-foreground px-3">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-warning" />
                QR worker is not configured, so no live QR can be shown.
                <br />
                Ask an admin to set WA_QR_WORKER_URL and WA_QR_WORKER_TOKEN.
              </div>
            ) : (
              <div className="text-center text-sm text-muted-foreground">
                <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
                Waiting for QR from worker
              </div>
            )}
          </div>
          <span className={`text-xs px-2 py-1 rounded-control ${badge.className}`}>{badge.label}</span>
          {state.error && (
            <div className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {state.error}
            </div>
          )}
          <ol className="text-xs text-muted-foreground space-y-1 self-start">
            <li>1. Open WhatsApp on your phone.</li>
            <li>2. Go to Settings → Linked Devices → Link a Device.</li>
            <li>3. Point your phone at this screen.</li>
          </ol>
          <div className="flex items-center gap-2 self-end">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-control border border-border text-sm hover:bg-muted"
            >
              Close
            </button>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-control border border-border text-sm hover:bg-muted"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
