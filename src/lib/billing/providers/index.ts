/**
 * Billing provider registry.
 *
 * To add a new gateway:
 *   1. Implement `BillingProvider` in a new file under this directory.
 *   2. Register it in the `providers` map below.
 *   3. Ensure any required secrets are added via `add_secret`.
 *
 * Consumers call `getBillingProvider(id)` and interact only with the
 * `BillingProvider` interface — never with a specific gateway SDK.
 */

import {
  customProvider,
  flutterwaveProvider,
  lemonsqueezyProvider,
  mercadopagoProvider,
  midtransProvider,
  mollieProvider,
  paypalProvider,
  paystackProvider,
  razorpayProvider,
} from "./future";
import { manualProvider } from "./manual";
import { paddleProvider } from "./paddle";
import { stripeProvider } from "./stripe";
import type { BillingProvider, BillingProviderId } from "./types";

const providers: Record<string, BillingProvider> = {
  stripe: stripeProvider,
  paddle: paddleProvider,
  manual: manualProvider,
  paypal: paypalProvider,
  lemonsqueezy: lemonsqueezyProvider,
  razorpay: razorpayProvider,
  paystack: paystackProvider,
  flutterwave: flutterwaveProvider,
  mollie: mollieProvider,
  mercadopago: mercadopagoProvider,
  midtrans: midtransProvider,
  custom: customProvider,
};

export function getBillingProvider(id: BillingProviderId): BillingProvider {
  const provider = providers[id];
  if (!provider) {
    throw new Error(`Unknown billing provider: ${id}. Registered: ${Object.keys(providers).join(", ")}`);
  }
  return provider;
}

export function listBillingProviders(): Array<Pick<BillingProvider, "id" | "displayName" | "supports">> {
  return Object.values(providers).map((p) => ({
    id: p.id,
    displayName: p.displayName,
    supports: p.supports,
  }));
}

export function getDefaultBillingProvider(): BillingProvider {
  return stripeProvider;
}

export type { BillingProvider, BillingProviderId } from "./types";
export * from "./types";
