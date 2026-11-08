import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, Loader2 } from "lucide-react";

import { createCheckoutSession } from "@/lib/billing/billing.functions";
import { listPurchasablePlans } from "@/lib/billing/plan-gateways.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Plan = {
  id: string;
  code: string;
  name: string;
  price_cents: number;
  currency: string;
  interval: string;
  providers: string[];
};

function fmt(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

/**
 * Self-service plan change. Only plans that a super admin has linked to an
 * enabled payment gateway can be purchased — the server resolves the gateway
 * and its external price at checkout time.
 */
export function PlanCheckoutPanel({
  organizationId,
  workspaceId,
  currentPlanCode,
  canManage,
}: {
  organizationId: string;
  workspaceId: string | null;
  currentPlanCode?: string | null;
  canManage: boolean;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const checkout = useServerFn(createCheckoutSession);
  const fetchPlans = useServerFn(listPurchasablePlans);

  const plans = useQuery({
    queryKey: ["plans", "purchasable", workspaceId],
    queryFn: async () =>
      (await fetchPlans({ data: { workspace_id: workspaceId } })) as unknown as Plan[],
  });


  async function buy(plan: Plan) {
    setPending(plan.code);
    try {
      const origin = window.location.origin;
      const res = await checkout({
        data: {
          organization_id: organizationId,
          workspace_id: workspaceId,
          plan_code: plan.code,
          success_url: `${origin}/settings/billing?checkout=success`,
          cancel_url: `${origin}/settings/billing?checkout=cancelled`,
        },
      });
      if (res?.url) window.open(res.url, "_blank", "noopener");
      else toast.error("The gateway did not return a checkout URL.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start checkout.");
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change plan</CardTitle>
        <CardDescription>
          Plans are purchased through the payment gateway linked to them by the platform team.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {plans.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading plans</p>
        ) : (plans.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No plans available.</p>
        ) : (
          (plans.data ?? []).map((p) => {
            const providers = p.providers ?? [];
            const isCurrent = currentPlanCode === p.code;
            const purchasable = p.price_cents > 0 && providers.length > 0;
            return (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-control border p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{p.name}</span>
                    {isCurrent && <Badge variant="secondary">Current</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.price_cents === 0 ? "Free" : `${fmt(p.price_cents, p.currency)} / ${p.interval}`}
                    {providers.length > 0 && <> · via {providers.join(", ")}</>}
                  </div>
                </div>

                {p.price_cents === 0 ? null : !purchasable ? (
                  <Badge variant="outline">No gateway linked</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant={isCurrent ? "outline" : "default"}
                    disabled={!canManage || pending === p.code}
                    onClick={() => void buy(p)}
                  >
                    {pending === p.code ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4" />
                    )}
                    {isCurrent ? "Renew" : "Upgrade"}
                  </Button>
                )}
              </div>
            );
          })
        )}
        {!canManage && (
          <p className="text-xs text-muted-foreground">
            Only workspace owners and admins can change the plan.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
