import { WidgetCard, type WidgetCardProps } from "./widget-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency, formatRelativeTime } from "./format";
import type { ReactNode } from "react";
import { useTenantCurrency } from "@/hooks/use-currency";

/* ----------------------------- Recent Customers ---------------------------- */
export type CustomerItem = {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  joinedAt?: Date | string | number;
  plan?: string;
  status?: "active" | "trial" | "invited" | "churned";
};

const statusTone: Record<NonNullable<CustomerItem["status"]>, string> = {
  active: "bg-success-muted text-success",
  trial: "bg-info-muted text-info",
  invited: "bg-muted text-muted-foreground",
  churned: "bg-danger-muted text-danger",
};

export type RecentCustomersProps = Omit<WidgetCardProps, "children"> & {
  customers: CustomerItem[];
};

export function RecentCustomers({ customers, ...card }: RecentCustomersProps) {
  return (
    <WidgetCard {...card} bodyClassName="p-0">
      <ul className="divide-y divide-border/60">
        {customers.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-5 py-3">
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarImage src={c.avatarUrl} alt="" />
              <AvatarFallback className="text-xs">{c.name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">{c.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {c.email}
                {c.joinedAt && <> · joined {formatRelativeTime(c.joinedAt)}</>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {c.plan && <span className="text-xs text-muted-foreground">{c.plan}</span>}
              {c.status && (
                <Badge variant="secondary" className={cn("border-0", statusTone[c.status])}>
                  {c.status}
                </Badge>
              )}
            </div>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

/* --------------------------- Recent Conversations -------------------------- */
export type ConversationItem = {
  id: string;
  name: string;
  avatarUrl?: string;
  preview: string;
  timestamp: Date | string | number;
  unreadCount?: number;
  channel?: "email" | "chat" | "whatsapp" | "sms" | "voice" | ReactNode;
};

export type RecentConversationsProps = Omit<WidgetCardProps, "children"> & {
  conversations: ConversationItem[];
  onOpen?: (id: string) => void;
};

export function RecentConversations({ conversations, onOpen, ...card }: RecentConversationsProps) {
  return (
    <WidgetCard {...card} bodyClassName="p-0">
      <ul className="divide-y divide-border/60">
        {conversations.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onOpen?.(c.id)}
              className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-sunken/70"
            >
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarImage src={c.avatarUrl} alt="" />
                <AvatarFallback className="text-xs">{c.name.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{c.name}</span>
                  <time className="shrink-0 text-[11px] text-muted-foreground">
                    {formatRelativeTime(c.timestamp)}
                  </time>
                </div>
                <div className="flex items-center gap-2">
                  <span className="line-clamp-1 flex-1 text-xs text-muted-foreground">{c.preview}</span>
                  {c.unreadCount ? (
                    <span className="grid h-5 min-w-[20px] shrink-0 place-items-center rounded-control bg-accent px-1.5 text-[11px] font-semibold text-accent-foreground">
                      {c.unreadCount > 99 ? "99+" : c.unreadCount}
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

/* ------------------------------ Recent Deals ------------------------------ */
export type DealItem = {
  id: string;
  name: string;
  company?: string;
  amount: number;
  currency?: string;
  stage: string;
  probability?: number;
  owner?: { name: string; avatarUrl?: string };
  updatedAt?: Date | string | number;
};

export type RecentDealsProps = Omit<WidgetCardProps, "children"> & {
  deals: DealItem[];
  currency?: string;
};

export function RecentDeals({ deals, currency, ...card }: RecentDealsProps) {
  const tenantCurrency = useTenantCurrency();
  const fallback = currency ?? tenantCurrency;
  return (
    <WidgetCard {...card} bodyClassName="p-0">
      <ul className="divide-y divide-border/60">
        {deals.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">{d.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {d.company}
                {d.updatedAt && <> · {formatRelativeTime(d.updatedAt)}</>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-semibold  text-foreground">
                  {formatCurrency(d.amount, d.currency ?? fallback)}
                </div>
                {d.probability !== undefined && (
                  <div className="text-[11px] text-muted-foreground">{d.probability}% likely</div>
                )}
              </div>
              <Badge variant="secondary" className="border-0 bg-accent-muted text-accent">
                {d.stage}
              </Badge>
              {d.owner && (
                <Avatar className="h-7 w-7">
                  <AvatarImage src={d.owner.avatarUrl} alt="" />
                  <AvatarFallback className="text-[11px]">
                    {d.owner.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
