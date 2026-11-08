import { downloadRemoteFile } from "@/lib/files/download-file";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import {
  Files as FilesIcon,
  Upload,
  Download,
  Trash2,
  Search,
  Loader2,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  MessageSquare,
  Package,
  Headphones,
  Shield,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import {
  listPortalFiles,
  requestFileUpload,
  finalizeFileUpload,
  getFileDownloadUrl,
  deleteMyFile,
  listMyFileEntities,
} from "@/lib/client-portal/portal.functions";
import { supabase } from "@/integrations/supabase/client";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/client/files")({
  component: FilesPage,
});

type FileItem = {
  id: string;
  name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  source: "uploaded" | "shared";
};

type EntityType = "conversation" | "ticket" | "order" | "general";
const TABS: Array<{
  key: "all" | EntityType | "uploaded" | "shared";
  label: string;
  icon: typeof FilesIcon;
}> = [
  { key: "all", label: "All files", icon: FilesIcon },
  { key: "conversation", label: "Conversations", icon: MessageSquare },
  { key: "ticket", label: "Tickets", icon: Headphones },
  { key: "order", label: "Orders", icon: Package },
  { key: "uploaded", label: "My uploads", icon: Upload },
  { key: "shared", label: "Shared with me", icon: Download },
];

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function fmtSize(b: number | null): string {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function iconForMime(mime: string | null) {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return FileImage;
  if (m.startsWith("video/")) return FileVideo;
  if (m.startsWith("audio/")) return FileAudio;
  if (m.includes("zip") || m.includes("compressed") || m.includes("tar")) return FileArchive;
  return FileText;
}

function FilesPage() {
  const fmtZoned = useZonedDateFormatter();
  const listFn = useServerFn(listPortalFiles);
  const dlFn = useServerFn(getFileDownloadUrl);
  const delFn = useServerFn(deleteMyFile);
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const [query, setQuery] = useState("");

  const q = useQuery({
    queryKey: ["portal-files-v2", tab],
    queryFn: () => {
      const isEntity = tab === "conversation" || tab === "ticket" || tab === "order";
      return listFn({
        data: {
          entity_type: isEntity ? (tab as EntityType) : undefined,
          limit: 200,
        },
      });
    },
  });

  const files = (q.data?.items ?? []) as FileItem[];
  const counters = q.data?.counters ?? {
    total: 0,
    conversation: 0,
    ticket: 0,
    order: 0,
    uploaded: 0,
    shared: 0,
  };

  const filtered = useMemo(() => {
    let list = files;
    if (tab === "uploaded") list = list.filter((f) => f.source === "uploaded");
    if (tab === "shared") list = list.filter((f) => f.source === "shared");
    if (query.trim()) {
      const s = query.toLowerCase();
      list = list.filter((f) => f.name.toLowerCase().includes(s));
    }
    return list;
  }, [files, tab, query]);

  const download = useMutation({
    mutationFn: (id: string) => dlFn({ data: { file_id: id } }),
    onSuccess: (r) => {
      void downloadRemoteFile(r.url, r.name);
    },

    onError: (e) => toast.error(e instanceof Error ? e.message : "Download failed"),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { file_id: id } }),
    onSuccess: () => {
      toast.success("File deleted");
      qc.invalidateQueries({ queryKey: ["portal-files-v2"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  function countFor(key: (typeof TABS)[number]["key"]): number {
    switch (key) {
      case "all":
        return counters.total;
      case "conversation":
        return counters.conversation;
      case "ticket":
        return counters.ticket;
      case "order":
        return counters.order;
      case "uploaded":
        return counters.uploaded;
      case "shared":
        return counters.shared;
      default:
        return 0;
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] uppercase   text-accent font-medium">File center</p>
          <h2 className="font-display text-2xl font-semibold flex items-center gap-2">
            <FilesIcon className="w-5 h-5" /> Your files
          </h2>
          <p className="text-sm text-muted-foreground mt-1 inline-flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Private, end-to-end scoped to your account.
          </p>
        </div>
        <UploadDialog onUploaded={() => qc.invalidateQueries({ queryKey: ["portal-files-v2"] })} />
      </header>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-control border px-3 py-1.5 text-xs transition-colors ${
              tab === t.key
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-surface hover:bg-muted"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" /> {t.label}
            <span
              className={`ml-0.5 rounded-control text-[11px] px-1.5 py-0.5 ${
                tab === t.key ? "bg-white/20" : "bg-background/60 border border-border"
              }`}
            >
              {countFor(t.key)}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by filename"
          className="pl-9"
        />
      </div>

      {q.isLoading ? (
        <div className="p-10 flex justify-center items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading files
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-control border border-dashed border-border p-14 text-center">
          <div className="w-12 h-12 mx-auto rounded-control bg-accent/10 text-accent grid place-items-center">
            <FilesIcon className="w-6 h-6" />
          </div>
          <p className="font-display text-lg font-semibold mt-3">No files yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Files you upload here or that our team shares with you will appear in this center.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((f) => {
            const Icon = iconForMime(f.mime_type);
            return (
              <div
                key={f.id}
                className="rounded-control border border-border bg-surface p-4 hover:border-border-strong transition group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-control bg-accent/10 text-accent grid place-items-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" title={f.name}>
                      {f.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {fmtSize(f.size_bytes)} ·{" "}
                      {fmtZoned(new Date(f.created_at), { dateStyle: "medium" })}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px]  rounded px-1.5 py-0.5 ${
                          f.source === "uploaded"
                            ? "bg-accent/10 text-accent"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {f.source === "uploaded" ? "Uploaded by you" : "Shared with you"}
                      </span>
                      {f.entity_label && (
                        <span
                          className="text-[11px] text-muted-foreground border border-border rounded px-1.5 py-0.5 truncate max-w-[140px]"
                          title={f.entity_label}
                        >
                          {f.entity_type}: {f.entity_label}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-end gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => download.mutate(f.id)}
                    disabled={download.isPending}
                  >
                    <Download className="w-3.5 h-3.5 " /> Download
                  </Button>
                  {f.source === "uploaded" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Delete ${f.name}?`)) del.mutate(f.id);
                      }}
                      disabled={del.isPending}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <footer className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5 pt-2">
        <Shield className="w-3.5 h-3.5" />
        Max file size 25 MB. Executables are blocked. Signed download links expire after 5 minutes.
      </footer>
    </div>
  );
}

/* ---------------- Upload dialog ---------------- */

function UploadDialog({ onUploaded }: { onUploaded: () => void }) {
  const reqFn = useServerFn(requestFileUpload);
  const finFn = useServerFn(finalizeFileUpload);
  const entitiesFn = useServerFn(listMyFileEntities);
  const [open, setOpen] = useState(false);
  const [entityType, setEntityType] = useState<EntityType>("general");
  const [entityId, setEntityId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const entitiesQ = useQuery({
    queryKey: ["portal-file-entities"],
    queryFn: () => entitiesFn(),
    enabled: open,
  });

  const options = useMemo(() => {
    const d = entitiesQ.data;
    if (!d) return [] as Array<{ id: string; label: string }>;
    if (entityType === "conversation" || entityType === "ticket") {
      return d.conversations.map((c) => ({
        id: c.id,
        label: c.subject || `Conversation ${c.id.slice(0, 8)}`,
      }));
    }
    if (entityType === "order") {
      return d.orders.map((o) => ({ id: o.id, label: o.title || `Order ${o.id.slice(0, 8)}` }));
    }
    return [];
  }, [entitiesQ.data, entityType]);

  async function handleUpload(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("File too large (max 25 MB)");
      return;
    }
    if (entityType !== "general" && !entityId) {
      toast.error(`Please pick a ${entityType} to attach this file to`);
      return;
    }
    setUploading(true);
    setProgress(10);
    try {
      // Step 1: get signed upload URL
      const req = await reqFn({
        data: {
          filename: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          entity_type: entityType,
          entity_id: entityType === "general" ? null : entityId,
        },
      });
      setProgress(35);
      // Step 2: upload to storage using the signed token
      const up = await supabase.storage
        .from(req.bucket)
        .uploadToSignedUrl(req.path, req.token, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
      if (up.error) throw new Error(up.error.message);
      setProgress(75);
      // Step 3: finalize (creates files row + attachment link)
      await finFn({
        data: {
          path: req.path,
          filename: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          entity_type: entityType,
          entity_id: entityType === "general" ? null : entityId,
        },
      });
      setProgress(100);
      toast.success(`${file.name} uploaded`);
      onUploaded();
      setOpen(false);
      setEntityId("");
      setEntityType("general");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Upload className="w-4 h-4 mr-1.5" /> Upload file
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload a file</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium block mb-1.5">Attach to</label>
            <div className="flex gap-2">
              <Select
                value={entityType}
                onValueChange={(v) => {
                  setEntityType(v as EntityType);
                  setEntityId("");
                }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="conversation">Conversation</SelectItem>
                  <SelectItem value="ticket">Support ticket</SelectItem>
                  <SelectItem value="order">Order</SelectItem>
                </SelectContent>
              </Select>
              {entityType !== "general" && (
                <Select value={entityId} onValueChange={setEntityId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue
                      placeholder={entitiesQ.isLoading ? "Loading" : `Pick a ${entityType}`}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {options.length === 0 ? (
                      <div className="text-xs text-muted-foreground p-2">Nothing available</div>
                    ) : (
                      options.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.label}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <label
            className={`block rounded-control border-2 border-dashed border-border p-8 text-center cursor-pointer hover:border-border-strong transition-colors ${
              uploading ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUpload(f);
              }}
            />
            <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Click to select a file</p>
            <p className="text-xs text-muted-foreground mt-1">Max 25 MB · executables blocked</p>
            {uploading && (
              <div className="mt-4">
                <div className="h-1 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> Uploading
                </p>
              </div>
            )}
          </label>
        </div>
        <DialogFooter>
          <p className="text-[11px] text-muted-foreground text-left mr-auto inline-flex items-center gap-1.5">
            <Shield className="w-3 h-3" /> Encrypted at rest · only visible to you and your account
            team.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
