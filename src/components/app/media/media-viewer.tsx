import { downloadRemoteFile } from "@/lib/files/download-file";
/**
 * Universal media viewer.
 *
 * Renders the right preview for an attachment based on its MIME:
 *   image → <ImagePreview> (with optional Storage transform to fetch a
 *           smaller variant, protected from layout shifts by a skeleton)
 *   video → HTML5 <video> with poster / native controls
 *   audio, voice notes → HTML5 <audio>
 *   application/pdf → embedded <iframe> viewer (browser-native)
 *   anything else → a download card
 *
 * All URLs are short-lived signed URLs from `useSignedMediaUrl`.
 */

import { Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSignedMediaUrl, formatBytes } from "@/lib/messaging/media.client";
import { cn } from "@/lib/utils";
import { useMediaLightbox } from "@/components/ui/media-lightbox";

export interface MediaViewerProps {
  attachmentId: string;
  mimeType?: string | null;
  filename?: string | null;
  sizeBytes?: number | null;
  /** Preferred inline height in px for images/video. */
  height?: number;
  className?: string;
}

export function MediaViewer(props: MediaViewerProps) {
  const mime = props.mimeType ?? "";
  if (mime.startsWith("image/")) return <ImagePreview {...props} />;
  if (mime.startsWith("video/")) return <VideoPreview {...props} />;
  if (mime.startsWith("audio/")) return <AudioPreview {...props} />;
  if (mime === "application/pdf") return <PdfViewer {...props} />;
  return <FileDownloadCard {...props} />;
}

// -------------------------------------------------------------- image

export function ImagePreview({ attachmentId, filename, height = 320, className }: MediaViewerProps) {
  const { url, loading, error } = useSignedMediaUrl(attachmentId, {
    width: Math.max(640, height * 2),
  });
  const lightbox = useMediaLightbox();
  if (error) return <ErrorBox message={error} />;
  return (
    <div className={cn("relative overflow-hidden rounded-control bg-muted", className)} style={{ maxHeight: height }}>
      {loading || !url ? (
        <Skeleton className="h-full w-full" style={{ height }} />
      ) : (
        <button
          type="button"
          className="block h-full w-full cursor-zoom-in"
          aria-label={`Open ${filename ?? "attachment"}`}
          onClick={() => lightbox.open({ url, type: "image", name: filename })}
        >
          <img
            src={url}
            alt={filename ?? "attachment"}
            loading="lazy"
            decoding="async"
            className="h-auto max-size-6"
            style={{ maxHeight: height }}
          />
        </button>
      )}
    </div>
  );
}

// -------------------------------------------------------------- video

export function VideoPreview({ attachmentId, filename, height = 360, className }: MediaViewerProps) {
  const { url, loading, error } = useSignedMediaUrl(attachmentId);
  const lightbox = useMediaLightbox();
  if (error) return <ErrorBox message={error} />;
  return (
    <div className={cn("overflow-hidden rounded-control bg-black", className)}>
      {loading || !url ? (
        <Skeleton className="w-full" style={{ height }} />
      ) : (
        <div className="relative">
          <video
            src={url}
            controls
            preload="metadata"
            className="w-full"
            style={{ maxHeight: height }}
            aria-label={filename ?? "video attachment"}
          />
          <button
            type="button"
            className="absolute right-2 top-2 rounded-control bg-background/80 px-2 py-1 text-xs font-medium text-foreground shadow hover:bg-background"
            onClick={() => lightbox.open({ url, type: "video", name: filename })}
          >
            Expand
          </button>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------- audio

export function AudioPreview({ attachmentId, filename, sizeBytes, className }: MediaViewerProps) {
  const { url, loading, error } = useSignedMediaUrl(attachmentId);
  if (error) return <ErrorBox message={error} />;
  return (
    <div className={cn("flex items-center gap-3 rounded-control border bg-card p-3", className)}>
      {loading || !url ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <audio src={url} controls preload="metadata" className="w-full" aria-label={filename ?? "audio"} />
      )}
      {filename && (
        <div className="min-w-0 shrink-0 text-xs text-muted-foreground">
          <div className="truncate max-w-[160px]">{filename}</div>
          {sizeBytes != null && <div>{formatBytes(sizeBytes)}</div>}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------- pdf

export function PdfViewer({ attachmentId, filename, height = 640, className }: MediaViewerProps) {
  const { url, loading, error } = useSignedMediaUrl(attachmentId);
  if (error) return <ErrorBox message={error} />;
  return (
    <div className={cn("overflow-hidden rounded-control border bg-muted", className)}>
      {loading || !url ? (
        <Skeleton className="w-full" style={{ height }} />
      ) : (
        <iframe
          src={`${url}#toolbar=1&navpanes=0`}
          title={filename ?? "PDF document"}
          className="w-full"
          style={{ height, border: 0 }}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------- generic download card

export function FileDownloadCard({ attachmentId, mimeType, filename, sizeBytes, className }: MediaViewerProps) {
  const { url, loading } = useSignedMediaUrl(attachmentId, { download: true });
  return (
    <div className={cn("flex items-center gap-3 rounded-control border bg-card p-3", className)}>
      <div className="flex h-10 w-10 items-center justify-center rounded-control bg-muted">
        <FileText className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{filename ?? "File"}</div>
        <div className="text-xs text-muted-foreground">
          {mimeType ?? "file"}
          {sizeBytes != null && ` · ${formatBytes(sizeBytes)}`}
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={loading || !url}
        onClick={() => url && void downloadRemoteFile(url, filename)}
      >
        <Download className="mr-1 h-4 w-4" />
        Download
      </Button>

    </div>
  );
}

// -------------------------------------------------------------- shared

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-control border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
    >
      {message}
    </div>
  );
}
