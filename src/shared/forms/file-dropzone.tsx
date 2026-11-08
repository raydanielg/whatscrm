"use client";
import { useCallback, useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { File as FileIcon, Image as ImageIcon, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/shared/widgets";

export type UploadedFile = {
  id: string;
  file: File;
  previewUrl?: string;
  progress?: number;
  status?: "queued" | "uploading" | "done" | "error";
  error?: string;
};

export type FileDropzoneProps = {
  label?: string;
  description?: string;
  accept?: string;
  multiple?: boolean;
  maxFiles?: number;
  maxSize?: number;
  /** Preview thumbnails for image files. Enable for image-only uploaders. */
  imagePreview?: boolean;
  value?: UploadedFile[];
  onChange?: (files: UploadedFile[]) => void;
  onDrop?: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
  hint?: ReactNode;
};

/**
 * Drag & drop + click-to-browse file uploader. Handles validation
 * (size, count, mime prefix), image previews, and a removable file list.
 * Consumers own the actual upload transport — this is presentation + state.
 */
export function FileDropzone({
  label = "Upload files",
  description = "Drag and drop, or click to browse",
  accept,
  multiple = true,
  maxFiles,
  maxSize,
  imagePreview,
  value,
  onChange,
  onDrop,
  disabled,
  className,
  hint,
}: FileDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [internal, setInternal] = useState<UploadedFile[]>([]);
  const files = value ?? internal;

  const setFiles = useCallback(
    (next: UploadedFile[]) => {
      if (onChange) onChange(next);
      else setInternal(next);
    },
    [onChange],
  );

  const acceptPrefixes = (accept ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const matchesAccept = (f: File) => {
    if (!acceptPrefixes.length) return true;
    return acceptPrefixes.some((p) => {
      if (p.endsWith("/*")) return f.type.startsWith(p.slice(0, -1));
      if (p.startsWith(".")) return f.name.toLowerCase().endsWith(p);
      return f.type === p;
    });
  };

  const handleFiles = useCallback(
    (list: FileList | File[]) => {
      setError(null);
      const incoming = Array.from(list);
      const bad = incoming.find((f) => !matchesAccept(f));
      if (bad) return setError(`File type not allowed: ${bad.name}`);
      const oversize = maxSize && incoming.find((f) => f.size > maxSize);
      if (oversize) return setError(`"${oversize.name}" exceeds ${formatBytes(maxSize)}`);
      const merged = multiple ? [...files, ...incoming] : incoming.slice(0, 1);
      if (maxFiles && merged.length > maxFiles) return setError(`Maximum ${maxFiles} files`);
      const wrapped: UploadedFile[] = merged.map((f) =>
        "file" in (f as object)
          ? (f as unknown as UploadedFile)
          : {
              id: `${(f as File).name}-${(f as File).size}-${(f as File).lastModified}`,
              file: f as File,
              previewUrl:
                imagePreview && (f as File).type.startsWith("image/")
                  ? URL.createObjectURL(f as File)
                  : undefined,
              status: "queued",
            },
      );
      setFiles(wrapped);
      onDrop?.(incoming);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [files, imagePreview, maxFiles, maxSize, multiple, onDrop],
  );

  const onDropEvent = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  };

  const remove = (id: string) => setFiles(files.filter((f) => f.id !== id));

  return (
    <div className={cn("space-y-3", className)}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDropEvent}
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          "group relative flex flex-col items-center justify-center gap-2 rounded-control border-2 border-dashed border-border bg-surface-sunken/40 px-6 py-10 text-center transition-all duration-normal ease-emphasized",
          "hover:border-border-strong hover:bg-muted-muted/20",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          dragOver && "border-accent bg-accent-muted/40",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <span className="grid h-11 w-11 place-items-center rounded-full bg-accent-muted text-accent">
          {imagePreview ? <ImageIcon className="h-5 w-5" aria-hidden /> : <Upload className="h-5 w-5" aria-hidden />}
        </span>
        <div>
          <div className="text-sm font-medium text-foreground">{label}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 rounded-control border border-border bg-surface px-3 py-2"
            >
              {f.previewUrl ? (
                <img
                  src={f.previewUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-control border border-border object-cover"
                />
              ) : (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-muted text-muted-foreground">
                  <FileIcon className="h-4 w-4" aria-hidden />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{f.file.name}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatBytes(f.file.size)}</span>
                  {f.status === "uploading" && f.progress !== undefined && (
                    <span className="">· {Math.round(f.progress)}%</span>
                  )}
                  {f.status === "error" && <span className="text-danger">· {f.error ?? "Failed"}</span>}
                  {f.status === "done" && <span className="text-success">· Uploaded</span>}
                </div>
                {f.status === "uploading" && (
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-accent transition-[width] duration-normal ease-emphasized"
                      style={{ width: `${f.progress ?? 0}%` }}
                    />
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(f.id)}
                aria-label={`Remove ${f.file.name}`}
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Image-only preset that hard-codes `accept="image/*"` and enables previews.
 */
export function ImageDropzone(props: Omit<FileDropzoneProps, "accept" | "imagePreview">) {
  return (
    <FileDropzone
      accept="image/*"
      imagePreview
      label="Upload images"
      description="PNG, JPG, WebP up to the limit — drag or click"
      {...props}
    />
  );
}
