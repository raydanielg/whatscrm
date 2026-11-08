import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  Send,
  Plus,
  Search,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  LinkIcon,
  Unlink,
  X,
  QrCode,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useBrandName } from "@/hooks/use-brand-name";

export const Route = createFileRoute("/_authenticated/telegram-sessions")({
  component: TelegramSessionsPage,
});

type TgSession = {
  id: string; // short public id like ASHPRw2H
  name: string; // e.g. Wacrm
  displayName: string; // e.g. Stay Anonymous
  username: string; // e.g. stay_anonymous (no @)
  phone?: string;
  status: "connected" | "disconnected" | "connecting" | "expired";
  createdAt: string;
  lastActiveAt?: string;
};

const STORAGE_PREFIX = "wacrm:telegram-sessions:";

function shortId(len = 8) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function formatDate(
  iso: string | undefined,
  formatZoned: (date: Date | string | number, options: Intl.DateTimeFormatOptions) => string,
) {
  if (!iso) return "—";
  return formatZoned(new Date(iso), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_STYLES: Record<TgSession["status"], string> = {
  connected: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  disconnected: "bg-muted text-muted-foreground ring-1 ring-border",
  connecting: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  expired: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

function TelegramSessionsPage() {
  const brandName = useBrandName();
  const { data: ws } = useCurrentWorkspace();
  const wsId = ws?.id ?? "workspace";
  const key = STORAGE_PREFIX + wsId;
  const formatZoned = useZonedDateFormatter();

  const [items, setItems] = useState<TgSession[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | TgSession["status"]>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [qrSession, setQrSession] = useState<TgSession | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (!ws?.id) return;
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        setItems(JSON.parse(raw));
        return;
      } catch {
        /* ignore */
      }
    }
    const seed: TgSession[] = [
      {
        id: "ASHPRw2H",
        name: brandName,
        displayName: "Stay Anonymous",
        username: "stay_anonymous",
        status: "disconnected",
        createdAt: new Date().toISOString(),
      },
    ];
    setItems(seed);
    localStorage.setItem(key, JSON.stringify(seed));
  }, [ws?.id, key, brandName]);

  const persist = (next: TgSession[]) => {
    setItems(next);
    localStorage.setItem(key, JSON.stringify(next));
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((s) => {
      if (status !== "all" && s.status !== status) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.displayName.toLowerCase().includes(q) ||
        s.username.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      );
    });
  }, [items, query, status]);

  const create = () => {
    if (!name.trim() || !displayName.trim() || !username.trim()) {
      toast.error("Name, display name, and username are required");
      return;
    }
    const s: TgSession = {
      id: shortId(8),
      name: name.trim(),
      displayName: displayName.trim(),
      username: username.trim().replace(/^@/, ""),
      phone: phone.trim() || undefined,
      status: "disconnected",
      createdAt: new Date().toISOString(),
    };
    persist([s, ...items]);
    setCreateOpen(false);
    setName("");
    setDisplayName("");
    setUsername("");
    setPhone("");
    toast.success("Session created");
    setQrSession(s);
  };

  const connect = (s: TgSession) => {
    persist(items.map((x) => (x.id === s.id ? { ...x, status: "connecting" } : x)));
    setQrSession({ ...s, status: "connecting" });
    // Simulate connection after 3s
    setTimeout(() => {
      setItems((cur) => {
        const next = cur.map((x) =>
          x.id === s.id
            ? { ...x, status: "connected" as const, lastActiveAt: new Date().toISOString() }
            : x,
        );
        localStorage.setItem(key, JSON.stringify(next));
        return next;
      });
      toast.success(`${s.name} connected`);
    }, 3000);
  };

  const disconnect = (s: TgSession) => {
    if (!confirm(`Disconnect "${s.name}"?`)) return;
    persist(items.map((x) => (x.id === s.id ? { ...x, status: "disconnected" } : x)));
    toast.success("Disconnected");
  };

  const remove = (s: TgSession) => {
    if (!confirm(`Delete session "${s.name}"? This cannot be undone.`)) return;
    persist(items.filter((x) => x.id !== s.id));
    toast.success("Session deleted");
  };

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1200);
    toast.success(`${label} copied`);
  };

  const kpi = {
    total: items.length,
    connected: items.filter((s) => s.status === "connected").length,
    disconnected: items.filter((s) => s.status === "disconnected").length,
    connecting: items.filter((s) => s.status === "connecting").length,
  };

  return (
    <>
      <AppTopbar
        title="Telegram Sessions"
        subtitle="Manage your Telegram sessions and connect accounts"
        actions={
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:opacity-95"
          >
            <Plus className="w-4 h-4" /> New Session
          </button>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Total" value={kpi.total} />
          <Kpi label="Connected" value={kpi.connected} tone="text-emerald-600" />
          <Kpi label="Disconnected" value={kpi.disconnected} tone="text-muted-foreground" />
          <Kpi label="Connecting" value={kpi.connecting} tone="text-blue-600" />
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, @username, or session ID..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-control border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="px-3 py-2 text-sm rounded-control border border-border bg-background"
          >
            <option value="all">All statuses</option>
            <option value="connected">Connected</option>
            <option value="disconnected">Disconnected</option>
            <option value="connecting">Connecting</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-control border border-dashed border-border p-12 text-center text-muted-foreground">
            <Send className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No Telegram sessions</p>
            <p className="text-xs mt-1">
              Create a session and scan the QR code to link a Telegram account.
            </p>
            <button
              onClick={() => setCreateOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-control bg-primary text-primary-foreground text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> New Session
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((s) => (
              <div
                key={s.id}
                className="rounded-control border border-border bg-surface p-4 shadow-sm hover:shadow transition flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-control bg-sky-500/10 text-sky-600 flex items-center justify-center shrink-0">
                      <Send className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {s.displayName} <span className="text-sky-600">(@{s.username})</span>
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-[11px] uppercase font-semibold px-2 py-0.5 rounded-control whitespace-nowrap ${STATUS_STYLES[s.status]}`}
                  >
                    {s.status}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">ID:</span>
                  <code className="font-mono text-xs bg-muted/60 px-1.5 py-0.5 rounded-control">
                    {s.id}
                  </code>
                  <button
                    onClick={() => copy(s.id, "Session ID")}
                    className="p-0.5 rounded-control hover:bg-muted"
                    title="Copy session ID"
                  >
                    {copied === "Session ID" ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3 text-muted-foreground" />
                    )}
                  </button>
                </div>

                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>Created: {formatDate(s.createdAt, formatZoned)}</div>
                  {s.lastActiveAt && (
                    <div>Last active: {formatDate(s.lastActiveAt, formatZoned)}</div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 pt-1 border-t border-border">
                  {s.status === "connected" ? (
                    <button
                      onClick={() => disconnect(s)}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-control border border-border hover:bg-muted"
                    >
                      <Unlink className="w-3.5 h-3.5" /> Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => connect(s)}
                      disabled={s.status === "connecting"}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-control bg-primary text-primary-foreground hover:opacity-95 disabled:opacity-60"
                    >
                      {s.status === "connecting" ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Connecting
                        </>
                      ) : (
                        <>
                          <LinkIcon className="w-3.5 h-3.5" /> Connect
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => setQrSession(s)}
                    className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-control border border-border hover:bg-muted"
                    title="Show QR"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => remove(s)}
                    className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-control border border-red-200 text-red-600 hover:bg-red-50"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New Telegram Session</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Session Name *</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`e.g. ${brandName}`}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Display Name *</label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Stay Anonymous"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Telegram Username *
                </label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="stay_anonymous"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Phone (optional)
                </label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555 0100"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={create}>Create & Show QR</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* QR modal */}
        {qrSession && (
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setQrSession(null)}
          >
            <div
              className="bg-background rounded-control border border-border shadow-xl max-w-md w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-border flex items-start justify-between">
                <div>
                  <h3 className="font-display font-semibold flex items-center gap-2">
                    <Send className="w-4 h-4 text-sky-600" />
                    Scan to connect
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {qrSession.name} · <code className="font-mono">{qrSession.id}</code>
                  </p>
                </div>
                <button
                  onClick={() => setQrSession(null)}
                  className="p-1 rounded-control hover:bg-muted"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
              <div className="p-6 flex flex-col items-center gap-4">
                <div className="w-56 h-56 rounded-control border border-border bg-white flex items-center justify-center relative overflow-hidden">
                  {/* Faux QR pattern */}
                  <div
                    className="absolute inset-2 grid gap-[2px]"
                    style={{
                      gridTemplateColumns: "repeat(25, 1fr)",
                      gridTemplateRows: "repeat(25, 1fr)",
                    }}
                    aria-hidden
                  >
                    {Array.from({ length: 625 }).map((_, i) => {
                      const on =
                        (Math.sin(i * 12.9898 + qrSession.id.charCodeAt(0)) * 43758.5453) % 1;
                      return (
                        <div
                          key={i}
                          className={Math.abs(on) > 0.55 ? "bg-black" : "bg-transparent"}
                        />
                      );
                    })}
                  </div>
                  <QrCode className="w-14 h-14 text-black/10 relative" />
                </div>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Open Telegram on your phone</li>
                  <li>
                    Go to <b>Settings → Devices → Link Desktop Device</b>
                  </li>
                  <li>Scan the QR code above</li>
                </ol>
                <div className="flex items-center gap-2 w-full">
                  <button
                    onClick={() => connect(qrSession)}
                    disabled={qrSession.status === "connecting" || qrSession.status === "connected"}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-control bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
                  >
                    <Smartphone className="w-4 h-4" />
                    {qrSession.status === "connected"
                      ? "Connected"
                      : qrSession.status === "connecting"
                        ? "Waiting for scan..."
                        : "Simulate scan"}
                  </button>
                  <button
                    onClick={() => setQrSession(null)}
                    className="px-3 py-2 rounded-control border border-border text-sm font-medium hover:bg-muted"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-control border border-border bg-surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${tone ?? ""}`}>{value}</p>
    </div>
  );
}
