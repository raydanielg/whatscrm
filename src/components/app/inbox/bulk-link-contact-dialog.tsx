import { useMemo, useState } from "react";
import { Loader2, Search, Check, Link2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import {
  useContactSearch,
  useBulkRelinkConversations,
  type ContactSearchResult,
} from "@/hooks/use-contact-linking";
import {
  formatPhoneNumber,
  resolveContactDisplayName,
  resolveContactInitials,
} from "@/lib/inbox/contact-display";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversationIds: string[];
  onLinked?: (contactId: string, count: number) => void;
};

/**
 * Bulk contact picker — re-links many "Unknown contact" conversations to the
 * same CRM contact in one action.
 */
export function BulkLinkContactDialog({
  open,
  onOpenChange,
  conversationIds,
  onLinked,
}: Props) {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  const [q, setQ] = useState("");
  const search = useContactSearch(workspaceId, q, open);
  const bulkRelink = useBulkRelinkConversations(workspaceId);

  // Reset search when dialog opens.
  useMemo(() => {
    if (open) setQ("");
  }, [open]);

  const results = search.data ?? [];
  const count = conversationIds.length;

  const handlePick = async (contact: ContactSearchResult) => {
    if (count === 0) return;
    try {
      const res = await bulkRelink.mutateAsync({
        conversationIds,
        contactId: contact.id,
      });
      toast.success(
        `Linked ${res.count} conversation${res.count === 1 ? "" : "s"}`,
        { description: resolveContactDisplayName(contact) },
      );
      onLinked?.(contact.id, res.count);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error("Failed to link conversations", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Link {count} conversation{count === 1 ? "" : "s"} to a contact
          </DialogTitle>
          <DialogDescription>
            All selected conversations will be re-linked to the contact you
            pick. This is useful for merging "Unknown contact" threads into a
            single CRM record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search by name, phone or email"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8"
            />
          </div>
          <ScrollArea className="h-72 rounded-control border border-border">
            {search.isLoading ? (
              <div className="flex items-center justify-center h-72 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Searching
              </div>
            ) : results.length === 0 ? (
              <div className="flex items-center justify-center h-72 text-sm text-muted-foreground">
                {q ? "No matching contacts" : "Start typing to search"}
              </div>
            ) : (
              <ul className="divide-y divide-border" role="listbox">
                {results.map((c) => {
                  const name = resolveContactDisplayName(c);
                  const initials = resolveContactInitials(c);
                  const sub = [c.email, formatPhoneNumber(c.phone ?? c.whatsapp)]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        disabled={bulkRelink.isPending}
                        onClick={() => handlePick(c)}
                        className={cn(
                          "flex items-center gap-3 w-full text-left px-3 py-2 hover:bg-accent focus:bg-accent outline-none disabled:opacity-60",
                        )}
                      >
                        <Avatar className="h-9 w-9">
                          {c.avatar_url && <AvatarImage src={c.avatar_url} alt={name} />}
                          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{name}</div>
                          {sub && (
                            <div className="text-xs text-muted-foreground truncate">
                              {sub}
                            </div>
                          )}
                        </div>
                        {bulkRelink.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <Check className="h-4 w-4 opacity-0 group-hover:opacity-100 text-muted-foreground" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
          <p className="text-[11px] text-muted-foreground">
            Tip: use the "Unknown" filter to select all unlinked conversations
            first, then apply a single contact here.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
