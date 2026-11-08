/**
 * FeatureGate — declarative capability gating.
 *
 *   <FeatureGate feature="ai.reply_assistant">
 *     <AIReplyButton />
 *   </FeatureGate>
 *
 *   <FeatureGate feature="automations.enabled" fallback={<UpsellCard feature="Automations" />}>
 *     <AutomationBuilder />
 *   </FeatureGate>
 */
import { Link } from "@tanstack/react-router";
import { Lock, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import { usePlanFeatures } from "@/hooks/use-plan-features";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface FeatureGateProps {
  feature: string;
  fallback?: ReactNode;
  /** When true, render nothing while the subscription is still loading. */
  hideWhileLoading?: boolean;
  children: ReactNode;
}

export function FeatureGate({ feature, fallback, hideWhileLoading, children }: FeatureGateProps) {
  const { loading, hasFeature } = usePlanFeatures();
  if (loading) return hideWhileLoading ? null : <>{children}</>;
  if (hasFeature(feature)) return <>{children}</>;
  return <>{fallback ?? <FeatureUpsell feature={feature} />}</>;
}

export function FeatureUpsell({ feature }: { feature: string }) {
  return (
    <Card className="border-dashed" role="status" aria-live="polite">
      <CardContent className="flex flex-col items-start gap-3 p-6">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
          Not included in your plan
        </div>
        <p className="text-sm text-muted-foreground">
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{feature}</code> requires a higher plan.
        </p>
        <Button asChild size="sm">
          <Link to="/portal">
            <Sparkles className="h-4 w-4" aria-hidden /> Upgrade plan
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
