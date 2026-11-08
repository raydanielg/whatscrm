import { useMemo, useState } from "react";
import { Loader2, MessageSquarePlus, Search, UserPlus } from "lucide-react";
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
import { useChannelAccounts } from "@/hooks/use-channel-accounts";
import {
  contactDisplayName,
  contactInitials,
  primaryPhone,
  useCreateContact,
  useContacts,
  type ContactRow,
} from "@/hooks/use-contacts";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import type { ConversationRow } from "@/hooks/use-conversations";
import { supabase } from "@/integrations/supabase/client";
import { normalizePhone } from "@/lib/inbox/contact-display";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preferredAccountId?: string;
  onConversationReady: (conversation: ConversationRow) => void;
};

export function NewConversationDialog({
  open,
  onOpenChange,
  preferredAccountId,
  onConversationReady,
}: Props) {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  const [query, setQuery] = useState("");
  const [startingId, setStartingId] = useState<string | null>(null);
  const contacts = useContacts({ search: query, archived: false }, 50);
  const createContact = useCreateContact();
  const accountsQuery = useChannelAccounts(workspaceId);

  const account = useMemo(() => {
    const connected = (accountsQuery.data?.accounts ?? []).filter(
      (item) => item.status === "connected",
    );
    return (
      connected.find((item) => item.id === preferredAccountId) ??
      connected.find((item) => item.is_default) ??
      connected[0] ??
      null
    );
  }, [accountsQuery.data?.accounts, preferredAccountId]);

  const startConversation = async (contact: ContactRow) => {
    if (!workspaceId || !account || startingId) return;
    const recipient = contact.whatsapp || primaryPhone(contact);
    if (!recipient) {
      toast.error("This contact has no WhatsApp number");
      return;
    }

    setStartingId(contact.id);
    try {
      const existing = await supabase
        .from("conversations")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("contact_id", contact.id)
        .eq("channel", "whatsapp")
        .eq("channel_account_id", account.id)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing.error) throw existing.error;

      let conversation = existing.data;
      if (!conversation) {
        const created = await supabase
          .from("conversations")
          .insert({
            workspace_id: workspaceId,
            contact_id: contact.id,
            channel: "whatsapp",
            channel_account_id: account.id,
            status: "open",
            priority: "normal",
            subject: contactDisplayName(contact),
            metadata: { account_id: account.id, initiated_by: "agent" },
          })
          .select("*")
          .single();
        if (created.error) throw created.error;
        conversation = created.data;
      }

      onConversationReady({
        ...(conversation as unknown as ConversationRow),
        contact: {
          id: contact.id,
          first_name: contact.first_name,
          last_name: contact.last_name,
          display_name: contact.display_name ?? contact.name,
          phone: recipient,
          email: contact.email,
          avatar_url: contact.avatar_url,
          last_seen_at: contact.last_seen_at,
        },
      });
      setQuery("");
    } catch (error) {
      toast.error("Could not start conversation", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setStartingId(null);
    }
  };

  const rows = contacts.data ?? [];
  const isLoading = contacts.isLoading || accountsQuery.isLoading;
  const normalizedQueryPhone = normalizePhone(query);
  const isPhoneInput = /^\+[\d\s().-]+$/.test(query.trim());
  const canCreateFromPhone =
    isPhoneInput && !!normalizedQueryPhone && /^\+[1-9]\d{6,14}$/.test(normalizedQueryPhone);
  const hasExactPhoneMatch = rows.some((contact) => {
    const phones = [
      contact.whatsapp,
      contact.phone,
      ...(contact.phones ?? []).map((item) => item.number),
    ];
    return phones.some((phone) => normalizePhone(phone) === normalizedQueryPhone);
  });
  const showCreatePhone = canCreateFromPhone && !hasExactPhoneMatch;

  const createContactAndStart = async () => {
    if (!normalizedQueryPhone || !showCreatePhone || createContact.isPending || startingId) return;
    try {
      const contact = await createContact.mutateAsync({
        display_name: normalizedQueryPhone,
        name: normalizedQueryPhone,
        phone: normalizedQueryPhone,
        whatsapp: normalizedQueryPhone,
        phones: [{ label: "WhatsApp", number: normalizedQueryPhone, is_primary: true }],
        source: "inbox_new_conversation",
      });
      toast.success("Contact added", {
        description: `${normalizedQueryPhone} is ready in the inbox.`,
      });
      await startConversation(contact);
    } catch (error) {
      toast.error("Could not add contact", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
          <DialogDescription>
            Choose a contact to open or start a WhatsApp conversation
            {account ? ` from ${account.display_name}.` : "."}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a contact or enter +country code number"
            className="pl-9"
          />
          {query.trim() && !canCreateFromPhone && /\d/.test(query) && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              To add a new WhatsApp contact, enter the full number with country code (for example,
              +8801712345678).
            </p>
          )}
        </div>

        <ScrollArea className="h-72 rounded-control border border-border">
          {isLoading ? (
            <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading contacts
            </div>
          ) : !account ? (
            <div className="flex h-72 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
              <MessageSquarePlus className="h-6 w-6" />
              Connect a WhatsApp account before starting a conversation.
            </div>
          ) : rows.length === 0 && !showCreatePhone ? (
            <div className="flex h-72 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {query ? "No matching contacts found." : "No contacts are available."}
            </div>
          ) : (
            <ul className="divide-y divide-border" role="listbox" aria-label="Contacts">
              {showCreatePhone && (
                <li>
                  <button
                    type="button"
                    disabled={createContact.isPending || !!startingId}
                    onClick={createContactAndStart}
                    className="control-focus flex w-full cursor-pointer items-center gap-3 bg-primary/5 px-3 py-3 text-left hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      {createContact.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UserPlus className="h-4 w-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        Add {normalizedQueryPhone} and start conversation
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Creates a new WhatsApp contact in this workspace
                      </span>
                    </span>
                  </button>
                </li>
              )}
              {rows.map((contact) => {
                const name = contactDisplayName(contact);
                const phone = contact.whatsapp || primaryPhone(contact);
                const pending = startingId === contact.id;
                return (
                  <li key={contact.id}>
                    <button
                      type="button"
                      disabled={!phone || !!startingId}
                      onClick={() => startConversation(contact)}
                      className="control-focus flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Avatar className="h-9 w-9">
                        {contact.avatar_url && <AvatarImage src={contact.avatar_url} alt={name} />}
                        <AvatarFallback className="text-xs">
                          {contactInitials(contact)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {phone ?? "No WhatsApp number"}
                        </span>
                      </span>
                      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
