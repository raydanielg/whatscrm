/**
 * Named merge fields exposed in the template editor.
 *
 * These are canonical placeholders your app resolves at send time against a
 * recipient (contact, deal, order, campaign). They render as {{name}} tokens
 * inside template components so they survive round-tripping through the
 * WhatsApp Cloud API — Meta accepts positional or named placeholders in
 * `example.body_text` metadata.
 */

import type { LucideIcon } from "lucide-react";
import {
  User, Building2, ShoppingBag, DollarSign, Package, CalendarDays,
  Hash, MapPin, Link2, Ticket, ShieldCheck, Percent,
} from "lucide-react";

export interface MergeField {
  key: string;
  label: string;
  sample: string;
  icon: LucideIcon;
  group: "customer" | "company" | "commerce" | "deal" | "auth" | "campaign";
}

export const MERGE_FIELDS: MergeField[] = [
  { key: "customer_name",   label: "Customer name",     sample: "Alex Johnson",     icon: User,         group: "customer" },
  { key: "first_name",      label: "First name",        sample: "Alex",             icon: User,         group: "customer" },
  { key: "last_name",       label: "Last name",         sample: "Johnson",          icon: User,         group: "customer" },
  { key: "customer_email",  label: "Customer email",    sample: "alex@example.com", icon: User,         group: "customer" },
  { key: "customer_phone",  label: "Customer phone",    sample: "+1 555 0123",      icon: User,         group: "customer" },

  { key: "company_name",    label: "Company name",      sample: "Acme Inc.",        icon: Building2,    group: "company" },
  { key: "agent_name",      label: "Agent name",        sample: "Sarah",            icon: User,         group: "company" },
  { key: "support_url",     label: "Support URL",       sample: "https://acme.co/help", icon: Link2,    group: "company" },

  { key: "order_number",    label: "Order number",      sample: "#10245",           icon: ShoppingBag,  group: "commerce" },
  { key: "order_total",     label: "Order total",       sample: "$129.00",          icon: DollarSign,   group: "commerce" },
  { key: "order_status",    label: "Order status",      sample: "Shipped",          icon: Package,      group: "commerce" },
  { key: "tracking_number", label: "Tracking number",   sample: "1Z999AA10123456784", icon: Hash,        group: "commerce" },
  { key: "delivery_date",   label: "Delivery date",     sample: "Fri 24 Jul",       icon: CalendarDays, group: "commerce" },
  { key: "delivery_address",label: "Delivery address",  sample: "221B Baker St",    icon: MapPin,       group: "commerce" },

  { key: "deal_name",       label: "Deal name",         sample: "Enterprise plan",  icon: Ticket,       group: "deal" },
  { key: "deal_value",      label: "Deal value",        sample: "$12,000",          icon: DollarSign,   group: "deal" },
  { key: "deal_stage",      label: "Deal stage",        sample: "Proposal",         icon: Ticket,       group: "deal" },
  { key: "quote_number",    label: "Quote number",      sample: "Q-2026-018",       icon: Ticket,       group: "deal" },
  { key: "invoice_number",  label: "Invoice number",    sample: "INV-2026-042",     icon: Ticket,       group: "deal" },
  { key: "invoice_amount",  label: "Invoice amount",    sample: "$4,500",           icon: DollarSign,   group: "deal" },
  { key: "due_date",        label: "Due date",          sample: "31 Aug",           icon: CalendarDays, group: "deal" },

  { key: "otp_code",        label: "OTP code",          sample: "482913",           icon: ShieldCheck,  group: "auth" },
  { key: "verification_url",label: "Verification URL",  sample: "https://acme.co/v/abc", icon: Link2,   group: "auth" },
  { key: "expires_in",      label: "Expires in",        sample: "10 minutes",       icon: CalendarDays, group: "auth" },

  { key: "campaign_name",   label: "Campaign name",     sample: "Summer launch",    icon: Percent,      group: "campaign" },
  { key: "discount_code",   label: "Discount code",     sample: "SUMMER20",         icon: Percent,      group: "campaign" },
  { key: "discount_value",  label: "Discount value",    sample: "20% off",          icon: Percent,      group: "campaign" },
  { key: "cta_url",         label: "CTA URL",           sample: "https://acme.co/x",icon: Link2,        group: "campaign" },
];

export const MERGE_GROUP_LABELS: Record<MergeField["group"], string> = {
  customer: "Customer",
  company:  "Company & Agent",
  commerce: "Order & Delivery",
  deal:     "Deal / Quote / Invoice",
  auth:     "Authentication",
  campaign: "Campaign & CTA",
};

/** Build sample vars for the preview renderer. */
export function mergeFieldSamples(keys: string[] = MERGE_FIELDS.map((m) => m.key)): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of MERGE_FIELDS) if (keys.includes(f.key)) map[f.key] = f.sample;
  return map;
}
