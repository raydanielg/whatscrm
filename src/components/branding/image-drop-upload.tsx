/**
 * Drag-and-drop image field used for every brand asset in the app
 * (light/dark logos, favicon, email logo, PWA icons).
 *
 * Behaviour: drop a file, click to browse, or paste an image while focused.
 * The file uploads to the branding bucket and the resulting delivery path is
 * pushed up through `onChange`, so callers keep storing a plain URL string and
 * a pasted external URL keeps working.
 */
import { useCallback, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Image as ImageIcon, Link2, Loader2, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  BRANDING_ACCEPT,
  type BrandingScope,
  uploadBrandingAsset,
  removeBrandingAsset,
} from "@/lib/branding/upload";

export type ImageDropUploadProps = {
  label: string;
  value: string | null | undefined;
  onChange: (url: string) => void;
  /** Where the file is stored: platform-wide or inside one organization. */
  scope: BrandingScope;
  /** Folder name inside the scope, e.g. "logo", "favicon", "pwa-icon-192". */
  slot: string;
  hint?: string;
  /** Renders the preview on a dark surface (for dark-mode logos). */
  dark?: boolean;
  className?: string;
  previewClassName?: string;
  disabled?: boolean;
};

export function ImageDropUpload({
  label,
  value,
  onChange,
  scope,
  slot,
  hint,
  dark,
  className,
  previewClassName,
  disabled,
}: ImageDropUploadProps) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [broken, setBroken] = useState(false);

  const handleFiles = useCallback(
    async (files: FileList | File[] | null) => {
      const file = files?.[0];
      if (!file || disabled) return;
      setBusy(true);
      const previous = value;
      try {
        const url = await uploadBrandingAsset(file, scope, slot);
        setBroken(false);
        onChange(url);
        void removeBrandingAsset(previous);
        toast.success(`${label} uploaded`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [disabled, label, onChange, scope, slot, value],
  );

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">
          {label}
        </Label>
        <button
          type="button"
          onClick={() => setShowUrl((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Link2 className="h-3 w-3" />
          {showUrl ? "Hide URL" : "Use URL"}
        </button>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label={`Upload ${label}`}
        aria-busy={busy}
        onClick={() => !disabled && fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!disabled) fileRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer?.files ?? null);
        }}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData?.files ?? []);
          if (files.length) {
            e.preventDefault();
            void handleFiles(files);
          }
        }}
        className={cn(
          "control-focus flex cursor-pointer items-center gap-3 rounded-control border border-dashed border-input p-3 transition-colors",
          dragging && "border-primary bg-primary/5",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <div
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-control border border-border",
            dark ? "bg-foreground" : "bg-muted",
            previewClassName,
          )}
        >
          {value && !broken ? (
            <img
              src={value}
              alt={`${label} preview`}
              className="size-6 p-1"
              onError={() => setBroken(true)}
              onLoad={() => setBroken(false)}
            />
          ) : (
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
            {busy ? "Uploading" : "Drag & drop, or click to upload"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {broken && value ? "Image could not be loaded — check the URL." : (hint ?? "PNG, JPG, WEBP, SVG or ICO · max 5 MB")}
          </p>
        </div>

        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label={`Remove ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              void removeBrandingAsset(value);
              setBroken(false);
              onChange("");
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <input
        id={inputId}
        ref={fileRef}
        type="file"
        accept={BRANDING_ACCEPT}
        className="sr-only"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {showUrl ? (
        <Input
          value={value ?? ""}
          onChange={(e) => {
            setBroken(false);
            onChange(e.target.value);
          }}
          placeholder="https:///logo.png"
          aria-label={`${label} URL`}
        />
      ) : null}
    </div>
  );
}
