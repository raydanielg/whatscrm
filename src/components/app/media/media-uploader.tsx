/**
 * Drag & drop media uploader with client-side image optimization.
 *
 *   - accepts image/video/audio/pdf/document
 *   - compresses large images (browser-image-compression) before upload
 *   - reports progress per file
 *   - reports one row per completed / failed upload via `onUploaded`
 */

import { useCallback, useRef, useState } from "react";
import { Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { uploadMedia, formatBytes, type UploadedMedia } from "@/lib/messaging/media.client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface MediaUploaderProps {
  workspaceId: string;
  messageId?: string;
  accept?: string;
  multiple?: boolean;
  maxSizeBytes?: number;
  expiresAt?: string;
  onUploaded: (media: UploadedMedia) => void;
  className?: string;
}

interface Task {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
}

const DEFAULT_MAX = 100 * 1024 * 1024;

export function MediaUploader({
  workspaceId,
  messageId,
  accept,
  multiple = true,
  maxSizeBytes = DEFAULT_MAX,
  expiresAt,
  onUploaded,
  className,
}: MediaUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    for (const file of arr) {
      if (file.size > maxSizeBytes) {
        toast.error(`${file.name} is too large (max ${formatBytes(maxSizeBytes)})`);
        continue;
      }
      const taskId = crypto.randomUUID();
      setTasks((t) => [...t, { id: taskId, name: file.name, size: file.size, progress: 0, status: "uploading" }]);
      try {
        const media = await uploadMedia({
          workspaceId,
          messageId,
          file,
          expiresAt,
          onProgress: (loaded, total) => {
            setTasks((t) => t.map((x) => (x.id === taskId ? { ...x, progress: total ? loaded / total : 0 } : x)));
          },
        });
        setTasks((t) => t.map((x) => (x.id === taskId ? { ...x, progress: 1, status: "done" } : x)));
        onUploaded(media);
        // Auto-hide finished tasks after a moment.
        setTimeout(() => setTasks((t) => t.filter((x) => x.id !== taskId)), 2500);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setTasks((t) => t.map((x) => (x.id === taskId ? { ...x, status: "error", error: message } : x)));
        toast.error(`Upload failed: ${message}`);
      }
    }
  }, [expiresAt, maxSizeBytes, messageId, onUploaded, workspaceId]);

  return (
    <div
      className={cn(
        "space-y-2",
        className,
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer items-center justify-center gap-2 rounded-control border-2 border-dashed p-4 text-sm text-muted-foreground transition-colors",
          dragActive ? "border-primary bg-primary/5 text-foreground" : "hover:bg-muted/50",
        )}
        aria-label="Upload media"
      >
        <Paperclip className="h-4 w-4" />
        Drop files or click to upload (max {formatBytes(maxSizeBytes)})
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {tasks.length > 0 && (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-control border bg-card p-2 text-xs">
              {t.status === "uploading" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : t.status === "error" ? (
                <X className="h-3.5 w-3.5 text-destructive" />
              ) : (
                <Paperclip className="h-3.5 w-3.5 text-primary" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <span className="truncate">{t.name}</span>
                  <span className="shrink-0 text-muted-foreground">{formatBytes(t.size)}</span>
                </div>
                {t.status === "uploading" && <Progress value={t.progress * 100} className="mt-1 h-1" />}
                {t.status === "error" && <div className="mt-0.5 text-destructive">{t.error}</div>}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => setTasks((tasks) => tasks.filter((x) => x.id !== t.id))}
                aria-label="Dismiss"
              >
                <X className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
