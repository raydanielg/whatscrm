import { useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  MessageSquare,
  Paperclip,
  Phone,
  User,
} from "lucide-react";
import {
  useAdvancedSearch,
  type SearchHit,
  type SearchKind,
} from "@/hooks/use-inbox-organization";

const KIND_META: Record<
  SearchKind,
  { label: string; icon: typeof MessageSquare; group: string }
> = {
  conversation: { label: "Conversation", icon: MessageSquare, group: "Conversations" },
  message: { label: "Message", icon: FileText, group: "Messages" },
  contact: { label: "Contact", icon: User, group: "Customers" },
  attachment: { label: "Attachment", icon: Paperclip, group: "Attachments" },
};

export function AdvancedSearchDialog({
  open,
  onOpenChange,
  onSelectHit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelectHit?: (hit: SearchHit) => void;
}) {
  const [q, setQ] = useState("");
  const { data: hits = [], isFetching } = useAdvancedSearch(q);

  const grouped: Record<string, SearchHit[]> = {};
  for (const h of hits) {
    const g = KIND_META[h.kind]?.group ?? "Other";
    (grouped[g] ??= []).push(h);
  }

  const isPhoneQuery = /^\+?\d[\d\s\-()]{2,}$/.test(q.trim());

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search messages, customers, phone, attachments"
        value={q}
        onValueChange={setQ}
      />
      <CommandList>
        {q.trim().length < 2 ? (
          <CommandEmpty>Type at least 2 characters to search.</CommandEmpty>
        ) : isFetching && hits.length === 0 ? (
          <CommandEmpty>Searching</CommandEmpty>
        ) : hits.length === 0 ? (
          <CommandEmpty>
            No matches for “{q}”.
            {isPhoneQuery && (
              <div className="text-xs text-muted-foreground mt-1">
                Tip: phone numbers are matched loosely; try more digits.
              </div>
            )}
          </CommandEmpty>
        ) : (
          Object.entries(grouped).map(([group, entries], idx) => (
            <div key={group}>
              {idx > 0 && <CommandSeparator />}
              <CommandGroup heading={group}>
                {entries.map((h) => {
                  const Icon = KIND_META[h.kind].icon;
                  return (
                    <CommandItem
                      key={`${h.kind}-${h.id}`}
                      value={`${h.kind}-${h.id}-${h.title ?? ""}`}
                      onSelect={() => {
                        onSelectHit?.(h);
                        onOpenChange(false);
                      }}
                      className="gap-2"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm">{h.title || "Untitled"}</div>
                        {h.snippet && (
                          <div className="truncate text-xs text-muted-foreground">
                            {h.snippet}
                          </div>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[11px] shrink-0">
                        {KIND_META[h.kind].label}
                      </Badge>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </div>
          ))
        )}
        {isPhoneQuery && q.trim().length >= 2 && (
          <div className="px-3 py-1.5 text-[11px] text-muted-foreground flex items-center gap-1 border-t border-border">
            <Phone className="h-3 w-3" /> Phone lookup active
          </div>
        )}
      </CommandList>
    </CommandDialog>
  );
}
