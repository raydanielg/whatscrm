import { downloadRemoteFile } from "@/lib/files/download-file";
import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Minus, Plus, RotateCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type LightboxItem = {
  url: string;
  type?: "image" | "video" | "audio";
  name?: string | null;
  caption?: string | null;
};

type LightboxState = { items: LightboxItem[]; index: number } | null;

type Ctx = {
  /** Open the lightbox with one or more media items. */
  open: (items: LightboxItem[] | LightboxItem, index?: number) => void;
  close: () => void;
};

const MediaLightboxContext = React.createContext<Ctx | null>(null);

/**
 * App-wide media viewer. Mounted once in the root route so any surface
 * (Inbox bubbles, chat widget transcripts, CRM attachments) can open the
 * same full-screen viewer instead of dumping the raw file into a new tab.
 */
export function MediaLightboxProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<LightboxState>(null);

  const open = React.useCallback((items: LightboxItem[] | LightboxItem, index = 0) => {
    const list = (Array.isArray(items) ? items : [items]).filter((i) => !!i?.url);
    if (!list.length) return;
    setState({ items: list, index: Math.min(Math.max(index, 0), list.length - 1) });
  }, []);
  const close = React.useCallback(() => setState(null), []);

  const value = React.useMemo(() => ({ open, close }), [open, close]);

  return (
    <MediaLightboxContext.Provider value={value}>
      {children}
      {state ? <LightboxOverlay state={state} setState={setState} onClose={close} /> : null}
    </MediaLightboxContext.Provider>
  );
}

export function useMediaLightbox(): Ctx {
  const ctx = React.useContext(MediaLightboxContext);
  // No-op fallback keeps components usable outside the provider (tests, widget).
  return ctx ?? { open: () => {}, close: () => {} };
}

function guessType(item: LightboxItem): "image" | "video" | "audio" {
  if (item.type) return item.type;
  const u = item.url.split("?")[0]?.toLowerCase() ?? "";
  if (/\.(mp4|webm|mov|m4v)$/.test(u)) return "video";
  if (/\.(mp3|ogg|wav|m4a|opus)$/.test(u)) return "audio";
  return "image";
}

function LightboxOverlay({
  state,
  setState,
  onClose,
}: {
  state: NonNullable<LightboxState>;
  setState: React.Dispatch<React.SetStateAction<LightboxState>>;
  onClose: () => void;
}) {
  const { items, index } = state;
  const item = items[index]!;
  const kind = guessType(item);
  const [zoom, setZoom] = React.useState(1);
  const [rotation, setRotation] = React.useState(0);

  const go = React.useCallback(
    (delta: number) => {
      setZoom(1);
      setRotation(0);
      setState((s) => (s ? { ...s, index: (s.index + delta + s.items.length) % s.items.length } : s));
    },
    [setState],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(z + 0.25, 5));
      else if (e.key === "-") setZoom((z) => Math.max(z - 0.25, 0.25));
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [go, onClose]);

  if (typeof document === "undefined") return null;

  const title = item.name || item.caption || "Media";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 border-b border-border/60 px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          {items.length > 1 && (
            <p className="text-xs text-muted-foreground">
              {index + 1} of {items.length}
            </p>
          )}
        </div>
        {kind === "image" && (
          <>
            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(z - 0.25, 0.25))}>
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-12 text-center text-xs  text-muted-foreground">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(z + 0.25, 5))}>
              <Plus className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Rotate" onClick={() => setRotation((r) => (r + 90) % 360)}>
              <RotateCw className="h-4 w-4" />
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          aria-label="Download"
          onClick={() => void downloadRemoteFile(item.url, item.name)}
        >
          <Download className="h-4 w-4" />
        </Button>

        <Button asChild variant="ghost" size="icon" className="h-9 w-9" aria-label="Open in new tab">
          <a href={item.url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Stage */}
      <div className="relative flex flex-1 items-center justify-center overflow-auto p-4">
        {items.length > 1 && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute left-3 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full shadow"
            aria-label="Previous"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}

        <div onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full">
          {kind === "image" && (
            <img
              src={item.url}
              alt={item.caption || item.name || "Media preview"}
              className={cn("max-h-[80vh] max-w-full select-none object-contain transition-transform")}
              style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
            />
          )}
          {kind === "video" && (
            <video src={item.url} controls autoPlay className="max-h-[80vh] max-w-full rounded-control" />
          )}
          {kind === "audio" && (
            <div className="rounded-control border border-border bg-card p-6">
              <audio src={item.url} controls autoPlay className="w-[min(80vw,420px)]" />
            </div>
          )}
        </div>

        {items.length > 1 && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute right-3 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full shadow"
            aria-label="Next"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {item.caption && (
        <div className="border-t border-border/60 px-4 py-2 text-sm text-muted-foreground" onClick={(e) => e.stopPropagation()}>
          {item.caption}
        </div>
      )}
    </div>,
    document.body,
  );
}
