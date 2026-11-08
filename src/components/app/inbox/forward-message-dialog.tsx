import { useMemo, useState } from "react";
import { Forward as ForwardIcon, Search as SearchIcon, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useConversations, type ConversationRow } from "@/hooks/use-conversations";
import {
  useForwardMessage,
  type MessageRow,
} from "@/hooks/use-messages";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: MessageRow | null;
  excludeConversationId?: string;
};

export function ForwardMessageDialog({
  open,
  onOpenChange,
  message,
  excludeConversationId,
}: Props) {
  const [q, setQ] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const { conversations } = useConversations({ search: q, filter: "all" });
  const forward = useForwardMessage();

  const filtered = useMemo(
    () =>
      conversations.filter(
        (c: ConversationRow) => c.id !== excludeConversationId,
      ),
    [conversations, excludeConversationId],
  );

  const handleForward = async (c: ConversationRow) => {
    if (!message) return;
    setSending(c.id);
    try {
      await forward(message, c.id);
      toast.success("Message forwarded");
      onOpenChange(false);
    } catch (e) {
      toast.error("Forward failed", { description: (e as Error).message });
    } finally {
      setSending(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Forward message</DialogTitle>
          <DialogDescription>
            Choose a conversation to forward this message to.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Search conversations"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
            aria-label="Search conversations to forward to"
          />
        </div>
        <ScrollArea className="h-72 rounded-control border border-border">
          <ul className="divide-y divide-border">
            {filtered.length === 0 ? (
              <li className="p-4 text-center text-sm text-muted-foreground">
                No conversations match.
              </li>
            ) : (
              filtered.slice(0, 40).map((c: ConversationRow) => {
                const name =
                  [c.contact?.first_name, c.contact?.last_name]
                    .filter(Boolean)
                    .join(" ") ||
                  c.contact?.phone ||
                  c.contact?.email ||
                  "Conversation";
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => handleForward(c)}
                      disabled={!!sending}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted focus:bg-muted focus:outline-none disabled:opacity-60"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {c.last_message_preview ?? "No messages yet"}
                        </div>
                      </div>
                      {sending === c.id ? (
                        <Send className="h-4 w-4 animate-pulse text-primary" />
                      ) : (
                        <ForwardIcon className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </ScrollArea>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
