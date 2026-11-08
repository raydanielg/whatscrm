import { WidgetCard, type WidgetCardProps } from "./widget-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency } from "./format";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { useTenantCurrency } from "@/hooks/use-currency";

export type SubscriptionCardProps = Omit<WidgetCardProps, "children"> & {
  planName: string;
  status?: "active" | "trialing" | "past_due" | "canceled";
  amount?: number;
  currency?: string;
  interval?: "month" | "year";
  seats?: { used: number; total: number };
  renewsAt?: Date | string;
  features?: string[];
  onManage?: () => void;
  onUpgrade?: () => void;
  cta?: ReactNode;
};

const statusStyles: Record<NonNullable<SubscriptionCardProps["status"]>, string> = {
  active: "bg-success-muted text-success",
  trialing: "bg-info-muted text-info",
  past_due: "bg-danger-muted text-danger",
  canceled: "bg-muted text-muted-foreground",
};

export function SubscriptionCard({
  planName,
  status = "active",
  amount,
  currency,
  interval = "month",
  seats,
  renewsAt,
  features,
  onManage,
  onUpgrade,
  cta,
  ...card
}: SubscriptionCardProps) {
  // The caller may omit `currency`; the tenant's fills in rather than dollars.
  const tenantCurrency = useTenantCurrency();
  const resolvedCurrency = currency ?? tenantCurrency;
  return (
    <WidgetCard {...card}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-display text-lg font-semibold text-foreground">{planName}</span>
            <Badge variant="secondary" className={cn("border-0", statusStyles[status])}>
              {status.replace("_", " ")}
            </Badge>
          </div>
          {amount !== undefined && (
            <div className="mt-1 text-sm text-muted-foreground">
              <span className="font-display text-2xl font-semibold  text-foreground">
                {formatCurrency(amount, resolvedCurrency)}
              </span>
              <span> / {interval}</span>
            </div>
          )}
        </div>
        {seats && (
          <div className="text-right text-xs text-muted-foreground">
            <div className="font-display text-lg font-semibold text-foreground ">
              {seats.used}<span className="text-sm font-normal text-muted-foreground"> / {seats.total}</span>
            </div>
            seats used
          </div>
        )}
      </div>

      {features && features.length > 0 && (
        <ul className="mt-4 grid gap-1.5">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-xs text-foreground">
              <Check className="h-3.5 w-3.5 text-success" aria-hidden />
              {f}
            </li>
          ))}
        </ul>
      )}

      {renewsAt && (
        <div className="mt-4 text-xs text-muted-foreground">
          Renews {new Date(renewsAt).toLocaleDateString()}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        {cta ?? (
          <>
            {onManage && (
              <Button variant="outline" size="sm" onClick={onManage}>
                Manage plan
              </Button>
            )}
            {onUpgrade && (
              <Button size="sm" onClick={onUpgrade}>
                Upgrade
              </Button>
            )}
          </>
        )}
      </div>
    </WidgetCard>
  );
}
