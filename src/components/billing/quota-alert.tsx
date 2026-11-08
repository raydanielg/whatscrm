/**
 * QuotaAlert — approaching-limit banner for a specific meter.
 *
 * Consumers pass the meter code plus the current usage (usually loaded from
 * `getUsageForPeriod` server fn). We compare against the plan limit and only
 * render once we're within the warning band (>=80%) or already exceeded.
 *
 *   <QuotaAlert meterCode="messages_sent" used={usage.messages_sent} />
 */
import { Link } from "@tanstack/react-router";
import { AlertTriangle, TrendingUp } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { usePlanFeatures } from "@/hooks/use-plan-features";

interface QuotaAlertProps {
  meterCode: string;
  used: number;
  label?: string;
  /** Override plan lookup — useful for admin previews. */
  limit?: number | null;
}

export function QuotaAlert({ meterCode, used, label, limit }: QuotaAlertProps) {
  const { checkQuota, getLimit } = usePlanFeatures();
  const effectiveLimit = limit === undefined ? getLimit(meterCode) : limit;
  if (effectiveLimit === null) return null; // unlimited

  const check = checkQuota(meterCode, used, 0);
  if (!check.approaching && check.allowed) return null;

  const critical = !check.allowed;
  const pct = Math.round(check.usage_ratio * 100);
  const displayLabel = label ?? meterCode.replaceAll("_", " ");

  return (
    <Alert variant={critical ? "destructive" : "default"} role="status">
      {critical ? (
        <AlertTriangle className="h-4 w-4" aria-hidden />
      ) : (
        <TrendingUp className="h-4 w-4" aria-hidden />
      )}
      <AlertTitle className="capitalize">
        {critical ? `${displayLabel} limit reached` : `${displayLabel} usage is high`}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <span aria-label={`${used} of ${effectiveLimit} used`}>
            {used.toLocaleString()} / {effectiveLimit?.toLocaleString()} ({pct}%)
          </span>
          <Button asChild size="sm" variant={critical ? "secondary" : "outline"}>
            <Link to="/portal">Upgrade</Link>
          </Button>
        </div>
        <Progress value={pct} aria-label={`${displayLabel} usage`} />
      </AlertDescription>
    </Alert>
  );
}
