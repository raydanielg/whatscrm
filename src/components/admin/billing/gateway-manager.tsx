import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard } from "lucide-react";

import { GatewaySettingsPanel } from "@/components/admin/billing/gateway-settings-panel";
import { GatewayPermissionNotice } from "@/components/admin/billing/gateway-permission-notice";
import { PaymentsLedger } from "@/components/admin/billing/payments-ledger";
import { listGateways } from "@/lib/billing/gateways.functions";

export function GatewayManager() {
  const gatewaysFn = useServerFn(listGateways);
  const gatewaysQ = useQuery({
    queryKey: ["billing", "gateways"],
    queryFn: () => gatewaysFn(),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-control bg-primary/10 text-primary grid place-items-center">
          <CreditCard className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-display font-semibold">Payment Gateways</h2>
          <p className="text-sm text-muted-foreground">
            Manage provider capabilities, payment history, refunds and retries.
          </p>
        </div>
      </header>

      {gatewaysQ.isError && <GatewayPermissionNotice error={gatewaysQ.error} />}

      {/* Provider add / configure / enable-disable grid */}
      {!gatewaysQ.isError && <GatewaySettingsPanel />}

      {/* Payments history — shared with the Billing admin page */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Payment history</h3>
        <PaymentsLedger />
      </section>
    </div>
  );
}
