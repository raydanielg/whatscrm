import { downloadRemoteFile } from "@/lib/files/download-file";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Download, FileText, ImageIcon, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AttachmentFileRef = {
  name?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  bucket?: string | null;
  path?: string | null;
  is_public?: boolean | null;
  /** Direct URL fallback (e.g. provider-hosted media without storage refs). */
  url?: string | null;
};

export function formatFileSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Public bucket → stable public URL. Private → short-lived signed URL. */
export function useAttachmentUrl(file: AttachmentFileRef | undefined) {
  const bucket = file?.bucket ?? null;
  const path = file?.path ?? null;
  const isPublic = !!file?.is_public;

  const directUrl = file?.url ?? null;
  const publicUrl =
    isPublic && bucket && path
      ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
      : (!bucket || !path) && directUrl
        ? directUrl
        : null;

  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSignedUrl(null);
    if (publicUrl) {
      setError(null);
      setLoading(false);
      return;
    }
    if (!bucket || !path) {
      setLoading(false);
      setError(file && !directUrl ? "Missing storage location for this file." : null);
      return;
    }
    setLoading(true);
    setError(null);
    void supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 10)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        setLoading(false);
        if (err || !data?.signedUrl) {
          setSignedUrl(null);
          setError(err?.message ?? "Could not create a download link.");
          return;
        }
        setSignedUrl(data.signedUrl);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : "Network error while loading this file.");
      });
    return () => {
      cancelled = true;
    };
  }, [bucket, path, publicUrl, attempt, file, directUrl]);

  return { url: publicUrl ?? signedUrl, error, loading, retry };
}

/** Shared error banner for a failed attachment list request. */
export function AttachmentsErrorState({
  error,
  onRetry,
  context,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  context?: string;
  className?: string;
}) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : "Unknown error";
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code: unknown }).code)
      : null;

  return (
    <div
      role="alert"
      className={cn(
        "rounded-control border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-2",
        className,
      )}
    >
      <div className="flex items-start gap-2 text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="font-medium">Couldn't load attachments</div>
          <div className="text-xs text-muted-foreground break-words">
            {context ? `${context} · ` : ""}
            {message}
            {code ? ` (code ${code})` : ""}
          </div>
        </div>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" className="h-8" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Retry
        </Button>
      )}
    </div>
  );
}

export function AttachmentItem({
  file,
  createdAt,
  className,
}: {
  file: AttachmentFileRef | undefined;
  createdAt?: string | null;
  className?: string;
}) {
  const { url, error, loading, retry } = useAttachmentUrl(file);
  const [imageError, setImageError] = useState<string | null>(null);
  const name = file?.name ?? "File";
  const mime = file?.mime_type ?? "";
  const isImage = mime.startsWith("image/");
  const meta = [formatFileSize(file?.size_bytes), mime].filter(Boolean).join(" · ");
  const failure = error ?? imageError;
  const location = [file?.bucket, file?.path].filter(Boolean).join("/");

  return (
    <div
      className={cn(
        "rounded-control border p-2 transition-colors",
        failure ? "border-destructive/40 bg-destructive/5" : "border-border hover:bg-muted",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-control bg-muted">
          {failure ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : isImage && url ? (
            <img
              src={url}
              alt={name}
              loading="lazy"
              className="h-full w-full object-cover"
              onError={() => setImageError("The image could not be downloaded from storage.")}
            />
          ) : isImage ? (
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          ) : (
            <FileText className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">{name}</div>
          <div className="text-[11px] text-muted-foreground">
            {meta}
            {createdAt ? `${meta ? " · " : ""}${new Date(createdAt).toLocaleDateString()}` : ""}
          </div>
        </div>
        {failure ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0"
            onClick={() => {
              setImageError(null);
              retry();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Retry
          </Button>
        ) : url ? (
          <button
            type="button"
            onClick={() => void downloadRemoteFile(url, name)}
            aria-label={`Download ${name}`}
            className="control-focus control-hover inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-muted-foreground"
          >
            <Download className="h-4 w-4" />
          </button>
        ) : (


          <span className="shrink-0 text-[11px] text-muted-foreground">
            {loading ? "Loading" : "Unavailable"}
          </span>
        )}
      </div>
      {failure && (
        <div className="mt-1.5 pl-[52px] text-[11px] text-destructive break-words">
          {failure}
          {location ? <span className="text-muted-foreground"> · {location}</span> : null}
        </div>
      )}
    </div>
  );
}
