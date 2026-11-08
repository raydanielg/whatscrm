import { ShieldAlert } from "lucide-react";

import { Card } from "@/components/ui/card";
import { GATEWAY_FORBIDDEN_MESSAGE } from "@/lib/billing/gateways.functions";

/** True when an error came from the platform-staff gateway permission check. */
export function isGatewayForbidden(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes(GATEWAY_FORBIDDEN_MESSAGE) ||
    /forbidden/i.test(message) ||
    /permission denied/i.test(message)
  );
}

/**
 * Explicit, non-cryptic notice shown instead of raw "permission denied" noise
 * when a non-staff account opens gateway settings.
 */
export function GatewayPermissionNotice({ error }: { error: unknown }) {
  const forbidden = isGatewayForbidden(error);
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");

  return (
    <Card className="p-4 flex items-start gap-3 border-destructive/40 bg-destructive/5">
      <ShieldAlert className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
      <div className="space-y-1 min-w-0">
        <p className="text-sm font-medium text-destructive">
          {forbidden ? "Restricted to platform staff" : "Couldn't load gateways"}
        </p>
        <p className="text-xs text-muted-foreground">
          {forbidden
            ? "Payment gateway credentials (secret names, publishable keys and webhook URLs) are visible to super admins only. Ask a platform administrator if you need access."
            : message}
        </p>
      </div>
    </Card>
  );
}
