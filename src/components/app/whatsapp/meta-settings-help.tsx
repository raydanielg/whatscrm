/**
 * In-dialog help panel for Meta WhatsApp settings.
 *
 * Concise, plain-language explanation of every field in the connect/edit
 * dialogs plus the token permissions, each with a "Where to find this" link
 * into the correct Meta surface.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, HelpCircle, KeyRound, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

/** Wizard step a help topic belongs to, plus the field to preselect. */
export type MetaHelpField =
  | "phoneNumberId"
  | "wabaId"
  | "businessId"
  | "accessTokenSecretName"
  | "appSecretName"
  | "verifyToken";

export interface MetaHelpTarget {
  /** Matching step in the setup wizard. */
  wizardStep: "prereq" | "webhook" | "ids" | "secrets";
  field: MetaHelpField;
}

export type MetaHelpJumpHandler = (target: MetaHelpTarget) => void;

interface HelpItem {
  field: string;
  what: string;
  where: string;
  href: string;
  target: MetaHelpTarget;
  jumpLabel?: string;
}

const FIELDS: HelpItem[] = [

  {
    field: "Phone number ID",
    what: "Meta's internal ID for the WhatsApp number that sends and receives messages. Not the phone number itself.",
    where: "Meta App Dashboard → WhatsApp → API Setup → 'Phone number ID'",
    href: "https://developers.facebook.com/apps/",
    target: { wizardStep: "ids", field: "phoneNumberId" },
  },
  {
    field: "WABA ID",
    what: "Your WhatsApp Business Account ID. It groups your numbers, templates and message limits.",
    where: "Meta App Dashboard → WhatsApp → API Setup, or Business Settings → Accounts → WhatsApp Accounts",
    href: "https://business.facebook.com/settings/whatsapp-business-accounts",
    target: { wizardStep: "ids", field: "wabaId" },
  },
  {
    field: "Business ID",
    what: "Optional. Your Meta Business portfolio ID — useful when you manage several businesses.",
    where: "Business Settings → Business Info → 'Business ID'",
    href: "https://business.facebook.com/settings/info",
    target: { wizardStep: "ids", field: "businessId" },
  },
  {
    field: "Access token name",
    what: "The name of the secret in Cloud → Secrets that stores your permanent System User token. Never the token itself.",
    where: "Business Settings → Users → System Users → Generate new token",
    href: "https://business.facebook.com/settings/system-users",
    target: { wizardStep: "secrets", field: "accessTokenSecretName" },
  },
  {
    field: "App secret name",
    what: "The name of the secret holding your Meta App Secret. Used to verify that incoming webhooks really come from Meta.",
    where: "Meta App Dashboard → Settings → Basic → 'App secret' → Show",
    href: "https://developers.facebook.com/apps/",
    target: { wizardStep: "secrets", field: "appSecretName" },
  },
  {
    field: "Verify token",
    what: "A random password you choose. Meta echoes it back once when it first calls your webhook URL — it must match on both sides.",
    where: "Meta App Dashboard → WhatsApp → Configuration → Webhook → Edit",
    href: "https://developers.facebook.com/apps/",
    target: { wizardStep: "webhook", field: "verifyToken" },
  },
];

const PERMISSIONS: HelpItem[] = [
  {
    field: "whatsapp_business_messaging",
    what: "Lets the platform send and receive messages and media on your number.",
    where: "Business Settings → System Users → Generate new token → permissions list",
    href: "https://business.facebook.com/settings/system-users",
    target: { wizardStep: "secrets", field: "accessTokenSecretName" },
    jumpLabel: "Go to token step",
  },
  {
    field: "whatsapp_business_management",
    what: "Lets the platform read and manage your WABA: templates, phone numbers, business profile and webhook subscriptions.",
    where: "Business Settings → System Users → Generate new token → permissions list",
    href: "https://business.facebook.com/settings/system-users",
    target: { wizardStep: "secrets", field: "accessTokenSecretName" },
    jumpLabel: "Go to token step",
  },
  {
    field: "business_management",
    what: "Optional. Only needed if you also want the platform to read your business portfolio assets.",
    where: "Business Settings → System Users → Generate new token → permissions list",
    href: "https://business.facebook.com/settings/system-users",
    target: { wizardStep: "secrets", field: "accessTokenSecretName" },
    jumpLabel: "Go to token step",
  },
];

function HelpRow({ item, onJump }: { item: HelpItem; onJump?: MetaHelpJumpHandler }) {
  return (
    <div className="space-y-1">
      <p className="font-medium text-foreground">{item.field}</p>
      <p className="text-muted-foreground">{item.what}</p>
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={item.href}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          Where to find this
          <ExternalLink className="w-3 h-3" />
        </a>
        {onJump && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            onClick={() => onJump(item.target)}
          >
            <Target className="w-3 h-3" />
            {item.jumpLabel ?? "Take me to this field"}
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">{item.where}</p>
    </div>
  );
}


export function MetaSettingsHelpPanel({
  defaultOpen = false,
  onJump,
}: {
  defaultOpen?: boolean;
  /** When provided, each topic gets a one-click jump to the matching field/step. */
  onJump?: MetaHelpJumpHandler;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 p-3 text-sm font-medium hover:text-foreground"
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <HelpCircle className="w-4 h-4 text-muted-foreground" />
        Help — what each Meta setting means
        {!open && (
          <Badge variant="outline" className="ml-auto text-[11px]">
            {FIELDS.length + PERMISSIONS.length} topics
          </Badge>
        )}
      </button>

      {open && (
        <div className="max-h-72 space-y-4 overflow-y-auto border-t border-border p-3 text-xs leading-relaxed">
          {FIELDS.map((item) => (
            <HelpRow key={item.field} item={item} onJump={onJump} />
          ))}

          <Separator />

          <p className="flex items-center gap-2 font-medium text-foreground">
            <KeyRound className="w-3.5 h-3.5" />
            Token permissions
          </p>
          {PERMISSIONS.map((item) => (
            <HelpRow key={item.field} item={item} onJump={onJump} />
          ))}


          <p className="text-muted-foreground">
            No permissions shown when generating a token? Assign the app and the WhatsApp account
            to the System User first (Business Settings → System Users → Add assets).
          </p>
        </div>
      )}
    </div>
  );
}

/** DOM id convention shared by the dialogs and the setup wizard. */
export const metaFieldId = (field: MetaHelpField) => `meta-field-${field}`;

/** Focus + highlight the input matching a help topic, if it is on screen. */
export function focusMetaField(field: MetaHelpField) {
  if (typeof document === "undefined") return false;
  const el = document.getElementById(metaFieldId(field)) as HTMLInputElement | null;
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.focus();
  el.select?.();
  return true;
}
