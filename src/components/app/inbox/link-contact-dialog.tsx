import { useMemo, useState } from "react";
import { Loader2, Search, UserPlus, Check } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import {
  useContactSearch,
  useRelinkConversationContact,
  useCreateContactAndLink,
  type ContactSearchResult,
} from "@/hooks/use-contact-linking";
import type { ConversationRow } from "@/hooks/use-conversations";
import {
  formatPhoneNumber,
  resolveContactDisplayName,
  resolveContactInitials,
} from "@/lib/inbox/contact-display";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversation: ConversationRow | null;
  onLinked?: (contactId: string) => void;
};

/**
 * Contact picker + search dialog to re-link an "Unknown contact" conversation
 * (or fix a mis-matched one) to an existing CRM contact — with an inline
 * "Create new" fallback pre-filled from the conversation's channel identity.
 */
export function LinkContactDialog({ open, onOpenChange, conversation, onLinked }: Props) {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;

  const [tab, setTab] = useState<"search" | "create">("search");
  const [q, setQ] = useState("");
  const search = useContactSearch(workspaceId, q, open);
  const relink = useRelinkConversationContact(workspaceId);
  const createFn = useCreateContactAndLink(workspaceId);

  const channelPhone = useMemo(() => {
    const c = conversation?.contact as { phone?: string | null; whatsapp?: string | null } | null | undefined;
    return c?.phone ?? c?.whatsapp ?? null;
  }, [conversation]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState(channelPhone ?? "");
  const [email, setEmail] = useState("");

  // Reset when reopened for a different conversation.
  useMemo(() => {
    if (open) {
      setQ("");
      setTab("search");
      setFirstName("");
      setLastName("");
      setPhone(channelPhone ?? "");
      setEmail("");
    }
  }, [open, conversation?.id, channelPhone]);

  if (!conversation) return null;

  const currentContactId = conversation.contact_id;

  const handlePick = async (contact: ContactSearchResult) => {
    if (contact.id === currentContactId) {
      onOpenChange(false);
      return;
    }
    try {
      await relink.mutateAsync({ conversationId: conversation.id, contactId: contact.id });
      toast.success("Conversation linked", {
        description: resolveContactDisplayName(contact),
      });
      onLinked?.(contact.id);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error("Failed to link contact", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  const handleCreate = async () => {
    if (!firstName && !lastName && !phone && !email) {
      toast.error("Enter at least a name, phone, or email");
      return;
    }
    try {
      const res = await createFn.mutateAsync({
        conversationId: conversation.id,
        first_name: firstName || null,
        last_name: lastName || null,
        phone: phone || null,
        email: email || null,
      });
      toast.success("Contact created and linked");
      onLinked?.(res.id);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error("Failed to create contact", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  const results = search.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link conversation to a contact</DialogTitle>
          <DialogDescription>
            Search the CRM directory or create a new contact. The current
            conversation will be re-linked immediately.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "search" | "create")}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="search">
              <Search className="h-3.5 w-3.5 mr-1.5" /> Find existing
            </TabsTrigger>
            <TabsTrigger value="create">
              <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Create new
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-2 mt-3">
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
                <div className="flex flex-col items-center justify-center h-72 text-sm text-muted-foreground gap-2">
                  <span>{q ? "No matching contacts" : "Start typing to search"}</span>
                  {q && (
                    <Button size="sm" variant="outline" onClick={() => setTab("create")}>
                      <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Create "{q}"
                    </Button>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-border" role="listbox">
                  {results.map((c) => {
                    const name = resolveContactDisplayName(c);
                    const initials = resolveContactInitials(c);
                    const isCurrent = c.id === currentContactId;
                    const sub = [c.email, formatPhoneNumber(c.phone ?? c.whatsapp)]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          disabled={relink.isPending}
                          onClick={() => handlePick(c)}
                          className={cn(
                            "flex items-center gap-3 w-full text-left px-3 py-2 hover:bg-accent focus:bg-accent outline-none",
                            isCurrent && "bg-muted/50",
                          )}
                        >
                          <Avatar className="h-9 w-9">
                            {c.avatar_url && <AvatarImage src={c.avatar_url} alt={name} />}
                            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{name}</div>
                            {sub && (
                              <div className="text-xs text-muted-foreground truncate">{sub}</div>
                            )}
                          </div>
                          {isCurrent && (
                            <span className="text-[11px] font-medium text-muted-foreground inline-flex items-center gap-1">
                              <Check className="h-3 w-3" /> Current
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="create" className="space-y-3 mt-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="lc-first">First name</Label>
                <Input id="lc-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lc-last">Last name</Label>
                <Input id="lc-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="lc-phone">Phone / WhatsApp</Label>
              <Input id="lc-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lc-email">Email</Label>
              <Input id="lc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createFn.isPending}>
                {createFn.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Create and link
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
