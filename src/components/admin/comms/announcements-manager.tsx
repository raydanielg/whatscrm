import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, formatDistanceToNow } from "date-fns";
import {
  Megaphone,
  Plus,
  Trash2,
  Wrench,
  Loader2,
  Info,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DateTimePicker,
  fromLocalDateTimeString,
  toLocalDateTimeString,
} from "@/shared/components";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  listAnnouncements,
  upsertAnnouncement,
  toggleAnnouncement,
  deleteAnnouncement,
} from "@/lib/admin/communications.functions";
import { TranslationsEditor } from "./translations-editor";
import type { Translations } from "@/lib/i18n/languages";

type Kind = "announcement" | "maintenance";
type Severity = "info" | "success" | "warning" | "critical";

interface Row {
  id: string;
  title: string;
  body: string | null;
  severity: Severity;
  kind: Kind;
  audience: string;
  cta_label: string | null;
  cta_url: string | null;
  starts_at: string | null;
  expires_at: string | null;
  published_at: string | null;
  translations: Translations;
  created_at: string;
}

const severityMeta: Record<Severity, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: "bg-sky-500/10 text-sky-600 border-sky-500/20" },
  success: {
    icon: CheckCircle2,
    className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  },
  warning: { icon: AlertTriangle, className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  critical: { icon: AlertCircle, className: "bg-red-500/10 text-red-600 border-red-500/20" },
};

export function AnnouncementsManager({ kind }: { kind: Kind }) {
  const qc = useQueryClient();
  const fetchAll = useServerFn(listAnnouncements);
  const upsert = useServerFn(upsertAnnouncement);
  const toggle = useServerFn(toggleAnnouncement);
  const remove = useServerFn(deleteAnnouncement);

  const { data: all = [], isLoading } = useQuery({
    queryKey: ["platform_announcements"],
    queryFn: () => fetchAll(),
  });
  const rows = (all as Row[]).filter((r) => r.kind === kind);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Row> | null>(null);

  const mUpsert = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => upsert({ data: payload as never }),
    onSuccess: () => {
      toast.success(editing?.id ? "Updated" : "Created");
      qc.invalidateQueries({ queryKey: ["platform_announcements"] });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mToggle = useMutation({
    mutationFn: async (v: { id: string; publish: boolean }) => toggle({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform_announcements"] }),
  });

  const mDelete = useMutation({
    mutationFn: async (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["platform_announcements"] });
    },
  });

  const openNew = () => {
    setEditing({
      title: "",
      body: "",
      severity: kind === "maintenance" ? "warning" : "info",
      kind,
      audience: "all",
      translations: {},
    });
    setOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-semibold">
            {kind === "maintenance" ? "Maintenance notices" : "Announcements"}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {kind === "maintenance"
              ? "Scheduled downtime, incident advisories, and service impact notices."
              : "Product news, policy updates and broadcast messages to tenants."}
          </p>
        </div>
        <Button size="sm" onClick={openNew} className="gap-1.5">
          <Plus className="w-4 h-4" /> New {kind === "maintenance" ? "notice" : "announcement"}
        </Button>
      </div>

      <div className="rounded-control border border-border bg-surface divide-y divide-border">
        {isLoading ? (
          <div className="p-6 flex items-center justify-center text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No {kind === "maintenance" ? "maintenance notices" : "announcements"} yet.
          </div>
        ) : (
          rows.map((a) => {
            const meta = severityMeta[a.severity];
            const Icon = kind === "maintenance" ? Wrench : meta.icon;
            const published = !!a.published_at;
            return (
              <div key={a.id} className="p-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div
                    className={`w-9 h-9 grid place-items-center shrink-0 border ${meta.className}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-medium truncate">{a.title}</div>
                      <Badge variant={published ? "default" : "secondary"} className="text-[11px]">
                        {published ? "Published" : "Draft"}
                      </Badge>
                      {Object.keys(a.translations ?? {}).length > 0 && (
                        <Badge variant="outline" className="text-[11px]">
                          {Object.keys(a.translations).length + 1} languages
                        </Badge>
                      )}
                    </div>
                    {a.body && (
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {a.body}
                      </div>
                    )}
                    <div className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-3">
                      <span>Audience: {a.audience}</span>
                      {a.starts_at && <span>Starts {format(new Date(a.starts_at), "PP p")}</span>}
                      {a.expires_at && (
                        <span>Expires {format(new Date(a.expires_at), "PP p")}</span>
                      )}
                      <span>
                        {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => mToggle.mutate({ id: a.id, publish: !published })}
                    disabled={mToggle.isPending}
                  >
                    {published ? "Unpublish" : "Publish"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(a);
                      setOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => {
                      if (confirm("Delete this?")) mDelete.mutate(a.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="w-4 h-4" />
              {editing?.id ? "Edit" : "New"}{" "}
              {kind === "maintenance" ? "maintenance notice" : "announcement"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Title (English)</Label>
                <Input
                  value={editing.title ?? ""}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Body (English)</Label>
                <RichTextarea
                  rows={4}
                  value={editing.body ?? ""}
                  onChange={(v) => setEditing({ ...editing, body: v })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Severity</Label>
                  <Select
                    value={editing.severity ?? "info"}
                    onValueChange={(v) => setEditing({ ...editing, severity: v as Severity })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Audience</Label>
                  <Select
                    value={editing.audience ?? "all"}
                    onValueChange={(v) => setEditing({ ...editing, audience: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All tenants</SelectItem>
                      <SelectItem value="paid">Paid plans</SelectItem>
                      <SelectItem value="trial">Trial plans</SelectItem>
                      <SelectItem value="owners">Workspace owners</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {kind === "maintenance" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Starts at</Label>
                    <DateTimePicker
                      value={fromLocalDateTimeString(editing.starts_at?.slice(0, 16) ?? "")}
                      onChange={(d) =>
                        setEditing({ ...editing, starts_at: toLocalDateTimeString(d) })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Expires at</Label>
                    <DateTimePicker
                      value={fromLocalDateTimeString(editing.expires_at?.slice(0, 16) ?? "")}
                      onChange={(d) =>
                        setEditing({ ...editing, expires_at: toLocalDateTimeString(d) })
                      }
                    />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">CTA label (optional)</Label>
                  <Input
                    value={editing.cta_label ?? ""}
                    onChange={(e) => setEditing({ ...editing, cta_label: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">CTA URL (optional)</Label>
                  <Input
                    value={editing.cta_url ?? ""}
                    onChange={(e) => setEditing({ ...editing, cta_url: e.target.value })}
                  />
                </div>
              </div>
              <TranslationsEditor
                translations={editing.translations ?? {}}
                onChange={(t) => setEditing({ ...editing, translations: t })}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => editing && mUpsert.mutate({ ...editing, publish: false })}
              disabled={mUpsert.isPending}
            >
              Save draft
            </Button>
            <Button
              onClick={() => editing && mUpsert.mutate({ ...editing, publish: true })}
              disabled={mUpsert.isPending}
            >
              {mUpsert.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save & publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
