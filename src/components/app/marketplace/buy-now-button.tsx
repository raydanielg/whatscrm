import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { startPluginCheckout } from "@/lib/marketplace/plugin-checkout.functions";
import { useTenantCurrency } from "@/hooks/use-currency";

/**
 * `currency` is the listing's own, resolved by the caller against the tenant —
 * this helper no longer substitutes dollars for a missing one.
 */
export function formatPluginPrice(
  priceCents: number,
  currency: string,
  pricingModel: string,
): string {
  if (!priceCents) return "Free";
  const amount = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(priceCents / 100);
  return pricingModel === "subscription" ? `${amount}/mo` : amount;
}

type Props = {
  pluginId: string;
  priceCents: number;
  currency: string;
  pricingModel: string;
  size?: "sm" | "default";
  className?: string;
  onFreeGranted?: () => void;
  disabled?: boolean;
  disabledReason?: string;
};

/** Buy-now → live Stripe Checkout. Free listings are granted without payment. */
export function BuyNowButton({
  pluginId,
  priceCents,
  currency,
  pricingModel,
  size = "default",
  className,
  onFreeGranted,
  disabled = false,
  disabledReason,
}: Props) {
  const tenantCurrency = useTenantCurrency();
  const checkout = useServerFn(startPluginCheckout);

  const buy = useMutation({
    mutationFn: () => checkout({ data: { pluginId, origin: window.location.origin } }),
    onSuccess: (res) => {
      if (res.free) {
        toast.success("License granted — this listing is free");
        onFreeGranted?.();
        return;
      }
      if (res.url) {
        window.location.href = res.url;
        return;
      }
      toast.error("Stripe did not return a checkout link");
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Could not start checkout"),
  });

  const label =
    priceCents > 0
      ? `Buy · ${formatPluginPrice(priceCents, currency || tenantCurrency, pricingModel)}`
      : "Get for free";

  return (
    <Button
      size={size}
      className={className}
      onClick={() => buy.mutate()}
      disabled={buy.isPending || disabled}
      title={disabledReason}
    >
      {buy.isPending ? (
        <Loader2 className="size-4 mr-2 animate-spin" />
      ) : (
        <CreditCard className="size-4 mr-2" />
      )}
      {buy.isPending ? "Opening checkout" : label}
    </Button>
  );
}
