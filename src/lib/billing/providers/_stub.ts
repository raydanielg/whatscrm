/**
 * Shared stub factory for not-yet-implemented gateway adapters.
 *
 * Every future provider (PayPal, Lemon Squeezy, Razorpay, Paystack,
 * Flutterwave, Mollie, Mercado Pago, Midtrans, Custom) uses this to satisfy
 * the `BillingProvider` contract with clear errors on unsupported calls,
 * while still declaring which capabilities the real provider will support.
 * Fill in real methods incrementally without touching call sites.
 */

import type { BillingProvider, BillingProviderId } from "./types";
import { BillingProviderUnsupported } from "./types";

export interface StubOptions {
  id: BillingProviderId;
  displayName: string;
  supports?: Partial<BillingProvider["supports"]>;
}

const OFF: BillingProvider["supports"] = {
  checkout: false,
  customer_portal: false,
  usage_reporting: false,
  tax: false,
  coupons: false,
  payments: false,
  refunds: false,
  partial_refunds: false,
  webhooks: false,
};

export function createStubProvider(opts: StubOptions): BillingProvider {
  const fail = (cap: string): never => {
    throw new BillingProviderUnsupported(opts.id, cap);
  };
  return {
    id: opts.id,
    displayName: opts.displayName,
    supports: { ...OFF, ...opts.supports },
    createCustomer: async () => fail("createCustomer"),
    updateCustomer: async () => fail("updateCustomer"),
    createCheckoutSession: async () => fail("createCheckoutSession"),
    createCustomerPortalSession: async () => fail("createCustomerPortalSession"),
    getSubscription: async () => fail("getSubscription"),
    cancelSubscription: async () => fail("cancelSubscription"),
    updateSubscriptionQuantity: async () => fail("updateSubscriptionQuantity"),
    reportUsage: async () => fail("reportUsage"),
    previewInvoice: async () => fail("previewInvoice"),
    verifyWebhook: async () => fail("verifyWebhook"),
    createPaymentIntent: async () => fail("createPaymentIntent"),
    getPayment: async () => fail("getPayment"),
    retryPayment: async () => fail("retryPayment"),
    refundPayment: async () => fail("refundPayment"),
  };
}
