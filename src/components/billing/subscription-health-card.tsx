/**
 * SubscriptionHealthCard — compact status snapshot of the active org's
 * subscription. Highlights trial expiry, past-due, grace period, and
 * cancellation. Data is realtime-friendly (uses the shared
 * `my-subscription` query key so mutations elsewhere refresh it).
 */
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { AlertTriangle, CheckCircle2, Clock, CreditCard, Pause, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveOrganization } from "@/hooks/use-organization";
import { getMySubscription } from "@/lib/billing/plans.functions";

interface Sub {
  status?: string;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
  grace_period_ends_at?: string | null;
  suspended_at?: string | null;
  plan?: { name?: string; tier?: string } | null;
}

interface StatusMeta {
  label: string;
  tone: "default" | "secondary" | "destructive" | "outline";
  icon: ReactNode;
  detail?: string;
}

export function SubscriptionHealthCard({ compact = false }: { compact?: boolean }) {
  const { active } = useActiveOrganization();
  const fetchSub = useServerFn(getMySubscription);
  const q = useQuery({
    queryKey: ["my-subscription", active?.id],
    queryFn: () => fetchSub({ data: { organization_id: active!.id } }),
    enabled: !!active?.id,
    staleTime: 30_000,
  });

  if (q.isLoading) return <Skeleton className="h-32 w-full" />;
  const sub = (q.data as Sub | null) ?? null;
  const meta = describe(sub);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <span className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden />
            Subscription
          </span>
          <Badge variant={meta.tone} className="gap-1 capitalize">
            {meta.icon}
            {meta.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-lg font-semibold">{sub?.plan?.name ?? "No plan"}</p>
          {meta.detail && <p className="text-xs text-muted-foreground">{meta.detail}</p>}
        </div>
        {!compact && (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/portal">Manage billing</Link>
            </Button>
            {sub?.status !== "active" && (
              <Button asChild size="sm" variant="outline">
                <Link to="/portal">Upgrade</Link>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function describe(sub: Sub | null): StatusMeta {
  if (!sub) return { label: "None", tone: "outline", icon: <AlertTriangle className="h-3 w-3" aria-hidden /> };
  const now = Date.now();

  if (sub.suspended_at) {
    return { label: "Suspended", tone: "destructive", icon: <ShieldAlert className="h-3 w-3" aria-hidden />, detail: "Access is restricted until payment is received." };
  }
  if (sub.grace_period_ends_at && new Date(sub.grace_period_ends_at).getTime() > now) {
    return {
      label: "Grace period",
      tone: "destructive",
      icon: <ShieldAlert className="h-3 w-3" aria-hidden />,
      detail: `Grace ends in ${formatDistanceToNowStrict(new Date(sub.grace_period_ends_at))}`,
    };
  }
  if (sub.status === "trialing" && sub.trial_ends_at) {
    return {
      label: "Trial",
      tone: "secondary",
      icon: <Clock className="h-3 w-3" aria-hidden />,
      detail: `Trial ends in ${formatDistanceToNowStrict(new Date(sub.trial_ends_at))}`,
    };
  }
  if (sub.status === "past_due") {
    return { label: "Past due", tone: "destructive", icon: <AlertTriangle className="h-3 w-3" aria-hidden />, detail: "A recent payment failed. We'll retry automatically." };
  }
  if (sub.status === "paused") {
    return { label: "Paused", tone: "secondary", icon: <Pause className="h-3 w-3" aria-hidden />, detail: "Subscription is paused." };
  }
  if (sub.status === "canceled") {
    return { label: "Canceled", tone: "outline", icon: <AlertTriangle className="h-3 w-3" aria-hidden /> };
  }
  if (sub.status === "active") {
    const renew = sub.current_period_end ? `Renews in ${formatDistanceToNowStrict(new Date(sub.current_period_end))}` : undefined;
    const detail = sub.cancel_at_period_end ? "Cancels at period end." : renew;
    return { label: "Active", tone: "default", icon: <CheckCircle2 className="h-3 w-3" aria-hidden />, detail };
  }
  return { label: sub.status ?? "Unknown", tone: "outline", icon: <AlertTriangle className="h-3 w-3" aria-hidden /> };
}
