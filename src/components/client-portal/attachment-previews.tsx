import { FileText, X, Loader2, AlertCircle, RotateCw, Image as ImageIcon, Film, Music } from "lucide-react";
import type { StagedAttachment } from "@/hooks/use-portal-attachments";
import { cn } from "@/lib/utils";

function fmtBytes(b: number): string {
  const u = ["B", "KB", "MB", "GB"];
  let i = 0; let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

function KindIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <ImageIcon className="w-4 h-4" />;
  if (mime.startsWith("video/")) return <Film className="w-4 h-4" />;
  if (mime.startsWith("audio/")) return <Music className="w-4 h-4" />;
  return <FileText className="w-4 h-4" />;
}

export function AttachmentPreviews({
  items, onRemove, onRetry, compact = false,
}: {
  items: StagedAttachment[];
  onRemove: (tempId: string) => void;
  onRetry: (tempId: string) => void;
  compact?: boolean;
}) {
  if (!items.length) return null;
  const size = compact ? "w-14 h-14" : "w-16 h-16";
  return (
    <div className={cn("flex flex-wrap gap-2", compact ? "px-2.5 pt-2" : "px-3 pt-3")}>
      {items.map((a) => {
        const isImg = a.file.type.startsWith("image/") && a.preview_url;
        return (
          <div
            key={a.tempId}
            className={cn(
              "relative group rounded-control border border-border bg-surface overflow-hidden shrink-0",
              size,
            )}
            title={`${a.file.name} · ${fmtBytes(a.file.size)}`}
          >
            {isImg ? (
              <img src={a.preview_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 p-1 text-muted-foreground">
                <KindIcon mime={a.file.type} />
                <span className="text-[11px] leading-tight text-center truncate w-full">
                  {a.file.name}
                </span>
              </div>
            )}

            {/* Overlay: progress / states */}
            {a.status === "uploading" && (
              <div className="absolute inset-0 bg-background/70 backdrop-blur-[1px] grid place-items-center">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
                  <div
                    className="h-full bg-primary transition-[width] duration-150"
                    style={{ width: `${a.progress}%` }}
                    aria-valuenow={a.progress}
                    role="progressbar"
                  />
                </div>
              </div>
            )}
            {a.status === "error" && (
              <div className="absolute inset-0 bg-destructive/15 grid place-items-center">
                <button
                  type="button"
                  onClick={() => onRetry(a.tempId)}
                  title={a.error ?? "Retry"}
                  className="p-1 rounded-full bg-background/90 shadow hover:bg-background"
                  aria-label="Retry upload"
                >
                  <RotateCw className="w-3 h-3 text-destructive" />
                </button>
              </div>
            )}
            {a.status === "error" && (
              <span className="absolute top-0 left-0 p-0.5 text-destructive" title={a.error}>
                <AlertCircle className="w-3 h-3" />
              </span>
            )}

            <button
              type="button"
              onClick={() => onRemove(a.tempId)}
              aria-label={`Remove ${a.file.name}`}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-foreground text-background grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Render already-sent attachments inside a message bubble. */
export function BubbleAttachments({
  attachments,
  onOwnBubble = false,
}: {
  attachments: Array<{
    id?: string;
    tempId?: string;
    url?: string | null;
    preview_url?: string;
    mime_type?: string | null;
    file_name?: string | null;
    thumb?: string | null;
  }>;
  onOwnBubble?: boolean;
}) {
  if (!attachments.length) return null;
  return (
    <div className="mb-1.5 space-y-1.5">
      {attachments.map((a, idx) => {
        const key = a.id ?? a.tempId ?? String(idx);
        const src = a.url ?? a.preview_url ?? "";
        const mime = a.mime_type ?? "";
        if (mime.startsWith("image/")) {
          return (
            <a key={key} href={src || "#"} target="_blank" rel="noreferrer" className="block">
              <img src={a.thumb ?? src} alt={a.file_name ?? ""} className="rounded-control max-h-64 object-cover" />
            </a>
          );
        }
        if (mime.startsWith("video/")) {
          return <video key={key} src={src} controls className="rounded-control max-h-64 w-full" />;
        }
        if (mime.startsWith("audio/")) {
          return <audio key={key} src={src} controls className="w-full h-9" />;
        }
        return (
          <a
            key={key}
            href={src || "#"}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "flex items-center gap-2 text-xs px-2 py-1.5 rounded-control",
              onOwnBubble ? "bg-primary-foreground/15 hover:bg-primary-foreground/25" : "bg-black/5 hover:bg-black/10",
            )}
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="truncate">{a.file_name ?? "File"}</span>
          </a>
        );
      })}
    </div>
  );
}
