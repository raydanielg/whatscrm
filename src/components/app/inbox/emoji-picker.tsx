import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type EmojiEntry = { char: string; keywords: string[] };

const CATEGORIES: { name: string; emojis: EmojiEntry[] }[] = [
  {
    name: "Smileys",
    emojis: [
      { char: "😀", keywords: ["grin", "happy", "smile"] },
      { char: "😁", keywords: ["beam", "grin"] },
      { char: "😂", keywords: ["laugh", "joy", "tears"] },
      { char: "🤣", keywords: ["rofl", "laugh"] },
      { char: "😊", keywords: ["blush", "smile"] },
      { char: "😍", keywords: ["love", "hearts", "eyes"] },
      { char: "😘", keywords: ["kiss"] },
      { char: "😎", keywords: ["cool", "sunglasses"] },
      { char: "🤔", keywords: ["think", "hmm"] },
      { char: "😅", keywords: ["sweat", "smile"] },
      { char: "😉", keywords: ["wink"] },
      { char: "🙂", keywords: ["smile"] },
      { char: "😢", keywords: ["cry", "sad"] },
      { char: "😭", keywords: ["cry", "sob"] },
      { char: "😡", keywords: ["angry", "mad"] },
      { char: "😱", keywords: ["shock", "scream"] },
      { char: "🥳", keywords: ["party", "celebrate"] },
      { char: "😴", keywords: ["sleep", "tired"] },
    ],
  },
  {
    name: "Gestures",
    emojis: [
      { char: "👍", keywords: ["thumbs", "up", "yes", "ok"] },
      { char: "👎", keywords: ["thumbs", "down", "no"] },
      { char: "👏", keywords: ["clap", "applause"] },
      { char: "🙏", keywords: ["please", "thanks", "pray"] },
      { char: "💪", keywords: ["strong", "muscle"] },
      { char: "🤝", keywords: ["handshake", "deal"] },
      { char: "👀", keywords: ["eyes", "look"] },
      { char: "🤞", keywords: ["fingers", "cross", "luck"] },
      { char: "🖐", keywords: ["hand", "hi"] },
      { char: "✋", keywords: ["stop", "hi"] },
    ],
  },
  {
    name: "Symbols",
    emojis: [
      { char: "🔥", keywords: ["fire", "lit"] },
      { char: "❤️", keywords: ["heart", "love"] },
      { char: "💯", keywords: ["hundred", "perfect"] },
      { char: "🎉", keywords: ["party", "celebrate", "tada"] },
      { char: "✅", keywords: ["check", "done", "ok"] },
      { char: "❌", keywords: ["x", "wrong", "no"] },
      { char: "⭐", keywords: ["star"] },
      { char: "💡", keywords: ["idea", "light", "bulb"] },
      { char: "🚀", keywords: ["rocket", "launch"] },
      { char: "🌟", keywords: ["star", "sparkle"] },
      { char: "⚡", keywords: ["fast", "zap", "bolt"] },
      { char: "🏆", keywords: ["trophy", "win"] },
    ],
  },
  {
    name: "Objects",
    emojis: [
      { char: "☕", keywords: ["coffee"] },
      { char: "📎", keywords: ["paperclip", "attach"] },
      { char: "📌", keywords: ["pin"] },
      { char: "📅", keywords: ["calendar", "date"] },
      { char: "📞", keywords: ["phone", "call"] },
      { char: "📧", keywords: ["mail", "email"] },
      { char: "💬", keywords: ["chat", "message"] },
      { char: "🛒", keywords: ["cart", "shop"] },
      { char: "💳", keywords: ["card", "pay"] },
      { char: "🎁", keywords: ["gift"] },
    ],
  },
];

export function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return CATEGORIES;
    return CATEGORIES.map((c) => ({
      ...c,
      emojis: c.emojis.filter((e) =>
        e.keywords.some((k) => k.includes(term)) || e.char === term,
      ),
    })).filter((c) => c.emojis.length > 0);
  }, [q]);

  return (
    <div className="w-72">
      <div className="p-2 border-b border-border">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search emoji"
          className="h-9"
          autoFocus
        />
      </div>
      <ScrollArea className="h-64">
        <div className="p-2 space-y-3">
          {filtered.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-4">
              No emoji found.
            </div>
          )}
          {filtered.map((cat) => (
            <div key={cat.name}>
              <div className="text-[11px] font-medium  text-muted-foreground mb-1 px-1">
                {cat.name}
              </div>
              <div className="grid grid-cols-8 gap-0.5">
                {cat.emojis.map((e) => (
                  <button
                    key={e.char}
                    type="button"
                    className="text-xl hover:bg-muted rounded p-1 transition-colors"
                    onClick={() => onSelect(e.char)}
                  >
                    {e.char}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
