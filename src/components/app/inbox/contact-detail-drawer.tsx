import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, Phone, MessageCircle, Copy, Check, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useCustomerProfile } from "@/hooks/use-customer-profile";
import type { ConversationRow } from "@/hooks/use-conversations";
import {
  formatPhoneNumber,
  normalizePhone,
  pickContactPhone,
  resolveContactDisplayName,
  resolveContactInitials,
} from "@/lib/inbox/contact-display";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: ConversationRow | null;
};

export function ContactDetailDrawer({ open, onOpenChange, conversation }: Props) {
  const { data: contact, isLoading } = useCustomerProfile(conversation?.contact_id ?? undefined);
  const displayName = resolveContactDisplayName(contact, conversation?.contact);
  const initials = resolveContactInitials(contact, conversation?.contact);

  const convContact = conversation?.contact as
    | { phone?: string | null; whatsapp?: string | null; email?: string | null; display_name?: string | null }
    | null
    | undefined;
  const phoneRaw = pickContactPhone(contact, convContact);
  const phone = formatPhoneNumber(phoneRaw);
  const phoneE164 = normalizePhone(phoneRaw);
  const email = contact?.email ?? convContact?.email ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-4 border-b border-border flex flex-row items-center justify-between gap-2 space-y-0">
          <SheetTitle className="mb-0 text-base">Contact details</SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Close contact details">
              <X className="h-4 w-4" />
            </Button>
          </SheetClose>
          <SheetDescription className="sr-only">
            Phone number, display name, and resolved email for this conversation.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              {contact?.avatar_url && <AvatarImage src={contact.avatar_url} alt={displayName} />}
              <AvatarFallback className="text-sm font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              {isLoading && !contact ? (
                <Skeleton className="h-4 w-32" />
              ) : (
                <div className="text-sm font-semibold truncate">{displayName}</div>
              )}
              {contact?.job_title && (
                <div className="text-xs text-muted-foreground truncate">{contact.job_title}</div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <DetailRow
              icon={<Phone className="h-4 w-4" />}
              label="Phone"
              value={phone}
              copyValue={phoneE164 ?? phoneRaw ?? undefined}
              hrefValue={phoneE164 ?? undefined}
              hrefPrefix="tel:"
            />
            <DetailRow
              icon={<MessageCircle className="h-4 w-4" />}
              label="Display name"
              value={contact?.display_name ?? convContact?.display_name ?? null}
            />
            <DetailRow
              icon={<Mail className="h-4 w-4" />}
              label="Email"
              value={email}
              copyValue={email ?? undefined}
              hrefPrefix="mailto:"
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({
  icon,
  label,
  value,
  copyValue,
  hrefValue,
  hrefPrefix,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
  copyValue?: string;
  hrefValue?: string;
  hrefPrefix?: string;
}) {
  const [copied, setCopied] = useState(false);
  const hasValue = !!(value && value.trim());
  const onCopy = async () => {
    if (!copyValue) return;
    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error("Copy failed");
    }
  };
  return (
    <div className="flex items-start gap-2 rounded-control border border-border bg-muted/30 px-3 py-2">
      <div className="text-muted-foreground mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
        {hasValue ? (
          hrefPrefix ? (
            <a
              href={`${hrefPrefix}${hrefValue ?? copyValue ?? value}`}
              className="text-sm font-medium truncate block hover:underline"
            >
              {value}
            </a>
          ) : (
            <div className="text-sm font-medium truncate">{value}</div>
          )
        ) : (
          <div className="text-sm text-muted-foreground italic">Not available</div>
        )}
      </div>
      {hasValue && copyValue && (
        <Button variant="ghost" size="icon" className="shrink-0" onClick={onCopy} aria-label={`Copy ${label}`}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      )}
    </div>
  );
}
