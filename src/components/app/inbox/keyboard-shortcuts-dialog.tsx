import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SHORTCUTS: { section: string; items: { keys: string[]; desc: string }[] }[] = [
  {
    section: "Navigation",
    items: [
      { keys: ["J"], desc: "Next conversation" },
      { keys: ["K"], desc: "Previous conversation" },
      { keys: ["G", "I"], desc: "Go to Inbox" },
      { keys: ["G", "U"], desc: "Go to Unread" },
      { keys: ["G", "M"], desc: "Go to Mine" },
      { keys: ["G", "A"], desc: "Go to Archive" },
    ],
  },
  {
    section: "Conversation",
    items: [
      { keys: ["R"], desc: "Reply / focus composer" },
      { keys: ["N"], desc: "New internal note" },
      { keys: ["E"], desc: "Archive" },
      { keys: ["S"], desc: "Star / unstar" },
      { keys: ["P"], desc: "Pin / unpin" },
      { keys: ["#"], desc: "Move to trash" },
      { keys: ["!"], desc: "Mark as spam" },
      { keys: ["Shift", "R"], desc: "Resolve / reopen" },
      { keys: ["A"], desc: "Assign" },
    ],
  },
  {
    section: "Search & AI",
    items: [
      { keys: ["⌘", "K"], desc: "Search everything" },
      { keys: ["⌘", "/"], desc: "AI reply assistant" },
      { keys: ["⌘", "Enter"], desc: "Send message" },
      { keys: ["/"], desc: "Slash commands" },
    ],
  },
  {
    section: "Interface",
    items: [
      { keys: ["["], desc: "Toggle list" },
      { keys: ["]"], desc: "Toggle side panel" },
      { keys: ["⌘", "\\"], desc: "Toggle theme" },
      { keys: ["?"], desc: "Show shortcuts" },
      { keys: ["Esc"], desc: "Close / dismiss" },
    ],
  },
];

/** Global "?" shortcut cheat-sheet dialog. Mount once at the inbox root. */
export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {SHORTCUTS.map((sec) => (
            <div key={sec.section}>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                {sec.section}
              </h3>
              <ul className="space-y-1.5">
                {sec.items.map((it) => (
                  <li key={it.desc} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{it.desc}</span>
                    <span className="flex items-center gap-1">
                      {it.keys.map((k) => (
                        <kbd
                          key={k}
                          className="px-1.5 min-w-[24px] h-6 rounded border border-border bg-muted text-[11px] font-medium text-foreground grid place-items-center"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
