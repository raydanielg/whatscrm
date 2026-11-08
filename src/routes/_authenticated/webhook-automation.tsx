import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  Webhook,
  Plus,
  Copy,
  Check,
  Trash2,
  Play,
  Pause,
  Search,
  Activity,
  Code2,
  ExternalLink,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/webhook-automation")({
  component: WebhookAutomationPage,
});

type WebhookAutomation = {
  id: string; // internal uuid
  code: string; // short public code (e.g. X6TgmQ)
  name: string;
  description: string;
  method: "POST" | "GET" | "PUT" | "PATCH" | "DELETE";
  status: "active" | "paused";
  createdAt: string;
};

const STORAGE_PREFIX = "wacrm:webhook-automations:";
const PUBLIC_BASE = "https://crm.oneoftheprojects.com/api/v1/webhook";

function generateCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function formatDate(
  iso: string,
  formatZoned: (date: Date | string | number, options: Intl.DateTimeFormatOptions) => string,
) {
  return formatZoned(new Date(iso), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function WebhookAutomationPage() {
  const { data: ws } = useCurrentWorkspace();
  const wsId = ws?.id ?? "workspace";
  const key = STORAGE_PREFIX + wsId;
  const formatZoned = useZonedDateFormatter();

  const [items, setItems] = useState<WebhookAutomation[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<WebhookAutomation | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Create form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState<WebhookAutomation["method"]>("POST");

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
    // Seed with example rows on first visit
    const seeded: WebhookAutomation[] = [
      {
        id: crypto.randomUUID(),
        code: "X6TgmQ",
        name: "Shopify webhook",
        description: "this is for shopify webhook",
        method: "POST",
        status: "active",
        createdAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        code: "IGaUVF",
        name: "woocommerce",
        description: "this is for woo order update",
        method: "POST",
        status: "active",
        createdAt: new Date().toISOString(),
      },
    ];
    setItems(seeded);
    localStorage.setItem(key, JSON.stringify(seeded));
  }, [ws?.id, key]);

  const persist = (next: WebhookAutomation[]) => {
    setItems(next);
    localStorage.setItem(key, JSON.stringify(next));
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((w) => {
      if (statusFilter !== "all" && w.status !== statusFilter) return false;
      if (!q) return true;
      return (
        w.name.toLowerCase().includes(q) ||
        w.description.toLowerCase().includes(q) ||
        w.code.toLowerCase().includes(q)
      );
    });
  }, [items, query, statusFilter]);

  const create = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    const w: WebhookAutomation = {
      id: crypto.randomUUID(),
      code: generateCode(),
      name: name.trim(),
      description: description.trim(),
      method,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    persist([w, ...items]);
    setCreateOpen(false);
    setName("");
    setDescription("");
    setMethod("POST");
    toast.success("Webhook automation created");
    setDetail(w);
  };

  const toggle = (w: WebhookAutomation) => {
    const next = items.map((x) =>
      x.id === w.id
        ? { ...x, status: x.status === "active" ? ("paused" as const) : ("active" as const) }
        : x,
    );
    persist(next);
    toast.success(w.status === "active" ? "Paused" : "Activated");
  };

  const remove = (w: WebhookAutomation) => {
    if (!confirm(`Delete webhook "${w.name}"?`)) return;
    persist(items.filter((x) => x.id !== w.id));
    if (detail?.id === w.id) setDetail(null);
    toast.success("Webhook deleted");
  };

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1200);
    toast.success(`${label} copied`);
  };

  const urlFor = (w: WebhookAutomation) => `${PUBLIC_BASE}/${w.code}`;

  return (
    <>
      <AppTopbar
        title="Webhook Automation"
        subtitle="Automate flows triggered by webhooks"
        actions={
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:opacity-95"
          >
            <Plus className="w-4 h-4" /> New Webhook
          </button>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Total" value={items.length} />
          <Kpi
            label="Active"
            value={items.filter((w) => w.status === "active").length}
            tone="text-emerald-600"
          />
          <Kpi
            label="Paused"
            value={items.filter((w) => w.status === "paused").length}
            tone="text-amber-600"
          />
          <Kpi label="Endpoints" value={items.length} tone="text-primary" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, description, or code..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-control border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-3 py-2 text-sm rounded-control border border-border bg-background"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="rounded-control border border-dashed border-border p-12 text-center text-muted-foreground">
            <Webhook className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No webhook automations</p>
            <p className="text-xs mt-1">
              Create your first webhook to receive events from external services.
            </p>
            <button
              onClick={() => setCreateOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-control bg-primary text-primary-foreground text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> New Webhook
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((w) => (
              <div
                key={w.id}
                className="rounded-control border border-border bg-surface p-4 shadow-sm hover:shadow transition flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-9 h-9 rounded-control bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Webhook className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{w.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{w.code}</p>
                    </div>
                  </div>
                  <span
                    className={`text-[11px] uppercase font-semibold px-2 py-0.5 rounded-control ${
                      w.status === "active"
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                        : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                    }`}
                  >
                    {w.status}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-control bg-blue-50 text-blue-700 ring-1 ring-blue-200 font-mono font-semibold">
                    {w.method}
                  </span>
                  <span className="text-muted-foreground truncate">
                    Created: {formatDate(w.createdAt, formatZoned)}
                  </span>
                </div>

                <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
                  {w.description || <span className="italic opacity-60">No description</span>}
                </p>

                <div className="flex items-center gap-1 border border-border rounded-control bg-background px-2 py-1.5">
                  <Code2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <code className="text-xs font-mono truncate flex-1" title={urlFor(w)}>
                    {urlFor(w)}
                  </code>
                  <button
                    onClick={() => copy(urlFor(w), "URL")}
                    className="p-1 rounded-control hover:bg-muted shrink-0"
                    title="Copy URL"
                  >
                    {copied === "URL" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-1.5 pt-1 border-t border-border">
                  <button
                    onClick={() => setDetail(w)}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-control border border-border hover:bg-muted"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Details
                  </button>
                  <button
                    onClick={() => toggle(w)}
                    className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-control border border-border hover:bg-muted"
                    title={w.status === "active" ? "Pause" : "Activate"}
                  >
                    {w.status === "active" ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => remove(w)}
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
              <DialogTitle>New Webhook Automation</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Name *</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Shopify order webhook"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this webhook do?"
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Method</label>
                <div className="flex gap-1.5">
                  {(["POST", "GET", "PUT", "PATCH", "DELETE"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMethod(m)}
                      className={`px-3 py-1.5 rounded-control text-xs font-mono font-semibold border ${
                        method === m
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={create}>Create Webhook</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Detail modal */}
        {detail && (
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setDetail(null)}
          >
            <div
              className="bg-background rounded-control border border-border shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-border flex items-start justify-between">
                <div>
                  <h3 className="font-display font-semibold flex items-center gap-2">
                    <Webhook className="w-4 h-4 text-primary" />
                    {detail.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">{detail.code}</p>
                </div>
                <button onClick={() => setDetail(null)} className="p-1 rounded-control hover:bg-muted">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
              <div className="p-5 overflow-y-auto space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <Info
                    label="Method"
                    value={<span className="font-mono font-semibold">{detail.method}</span>}
                  />
                  <Info
                    label="Status"
                    value={
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-control text-xs font-medium ${
                          detail.status === "active"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        <Activity className="w-3 h-3" /> {detail.status}
                      </span>
                    }
                  />
                  <Info label="Created" value={formatDate(detail.createdAt, formatZoned)} />
                  <Info label="Description" value={detail.description || "—"} />
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5">Webhook URL</p>
                  <div className="flex items-center gap-2 rounded-control border border-border bg-muted/40 px-3 py-2">
                    <code className="text-xs font-mono flex-1 break-all">{urlFor(detail)}</code>
                    <button
                      onClick={() => copy(urlFor(detail), "URL")}
                      className="p-1.5 rounded-control hover:bg-background border border-border"
                    >
                      {copied === "URL" ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5">
                    Example request
                  </p>
                  <pre className="p-3 rounded-control border border-border bg-muted/50 text-xs overflow-x-auto">
                    {`curl -X ${detail.method} '${urlFor(detail)}' \\
  -H 'Content-Type: application/json' \\
  -d '{ "event": "order.created", "data": { "id": 1001 } }'`}
                  </pre>
                </div>

                <div className="rounded-control border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-900">
                  <p className="font-semibold mb-1">How it works</p>
                  <p>
                    Point your external service (Shopify, WooCommerce, Stripe, etc.) at the webhook
                    URL above. Every request that arrives triggers this automation. Pair with an
                    Automation Flow to run actions.
                  </p>
                </div>
              </div>
              <div className="px-5 py-3 border-t border-border flex justify-end gap-2 bg-muted/30">
                <Button variant="outline" onClick={() => toggle(detail)}>
                  {detail.status === "active" ? "Pause" : "Activate"}
                </Button>
                <Button onClick={() => setDetail(null)}>Close</Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function Kpi({
  label,
  value,
  tone = "text-foreground",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-control border border-border bg-surface p-4">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className={`mt-1 text-2xl font-display font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
