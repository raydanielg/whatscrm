import { useEffect } from "react";

type Handlers = {
  onNext?: () => void;
  onPrev?: () => void;
  onReply?: () => void;
  onNote?: () => void;
  onArchive?: () => void;
  onStar?: () => void;
  onPin?: () => void;
  onResolve?: () => void;
  onAssign?: () => void;
  onSpam?: () => void;
  onTrash?: () => void;
  onToggleList?: () => void;
  onTogglePanel?: () => void;
  onGo?: (view: "all" | "unread" | "mine" | "archived") => void;
};

/**
 * Global inbox keyboard bindings — Gmail/Front-style single-key nav.
 * Skips when focus is in an input/textarea/contenteditable so composer
 * typing is never hijacked.
 */
export function useInboxKeyboardShortcuts(h: Handlers) {
  useEffect(() => {
    let gPending = false;
    let gTimeout: number | undefined;

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Two-stroke "G <letter>" navigation
      if (gPending) {
        gPending = false;
        window.clearTimeout(gTimeout);
        if (e.key === "i") return h.onGo?.("all");
        if (e.key === "u") return h.onGo?.("unread");
        if (e.key === "m") return h.onGo?.("mine");
        if (e.key === "a") return h.onGo?.("archived");
        return;
      }
      if (e.key === "g") {
        gPending = true;
        gTimeout = window.setTimeout(() => (gPending = false), 900);
        return;
      }

      switch (e.key) {
        case "j": h.onNext?.(); break;
        case "k": h.onPrev?.(); break;
        case "r": h.onReply?.(); break;
        case "n": h.onNote?.(); break;
        case "e": h.onArchive?.(); break;
        case "s": h.onStar?.(); break;
        case "p": h.onPin?.(); break;
        case "a": h.onAssign?.(); break;
        case "R": h.onResolve?.(); break;
        case "!": h.onSpam?.(); break;
        case "#": h.onTrash?.(); break;
        case "[": h.onToggleList?.(); break;
        case "]": h.onTogglePanel?.(); break;
        default: return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(gTimeout);
    };
  }, [h]);
}
