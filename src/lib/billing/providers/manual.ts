/**
 * Manual invoice adapter — for enterprise customers paying by bank transfer.
 *
 * Persists a lightweight customer/subscription record. Charge collection is
 * offline; the CRM issues invoices manually and marks them paid. Useful as
 * a fallback when no gateway is configured yet.
 */

import type {
  BillingProvider,
  CheckoutSession,
  CheckoutSessionInput,
  CustomerInput,
  CustomerRef,
  InvoicePreview,
  PaymentIntent,
  PaymentIntentInput,
  Refund,
  RefundInput,
  SubscriptionSnapshot,
  WebhookEvent,
} from "./types";
import { platformDefaultCurrency } from "@/lib/currency/resolve.server";

/**
 * This adapter's interface methods receive no organization, so the platform
 * default is the most specific currency reachable from here. Previously every
 * one of them asserted "USD".
 */
async function platformCurrency(): Promise<string> {
  return (await platformDefaultCurrency()) ?? "USD";
}

export const manualProvider: BillingProvider = {
  id: "manual",
  displayName: "Manual Invoicing",
  supports: {
    checkout: false, customer_portal: false, usage_reporting: true, tax: true, coupons: true,
    payments: true, refunds: true, partial_refunds: true, webhooks: false,
  },

  async createCustomer(input: CustomerInput): Promise<CustomerRef> {
    return { provider: "manual", provider_customer_id: `man_${input.organization_id}` };
  },

  async updateCustomer(): Promise<void> {
    /* no-op */
  },

  async createCheckoutSession(_input: CheckoutSessionInput): Promise<CheckoutSession> {
    throw new Error(
      "Manual invoicing does not use hosted checkout. Create the subscription server-side and issue an invoice from the CRM.",
    );
  },

  async createCustomerPortalSession() {
    throw new Error("Manual invoicing has no customer portal.");
  },

  async getSubscription(id: string): Promise<SubscriptionSnapshot> {
    throw new Error(`Manual provider cannot fetch subscription ${id}; read from the database.`);
  },

  async cancelSubscription(id: string): Promise<SubscriptionSnapshot> {
    throw new Error(`Manual provider cancel must be performed by an admin update on subscriptions.${id}`);
  },

  async updateSubscriptionQuantity(id: string): Promise<SubscriptionSnapshot> {
    throw new Error(`Manual provider quantity update is a plain DB update on subscriptions.${id}`);
  },

  async reportUsage(): Promise<void> {
    /* usage recorded in usage_events; billed at manual invoice time */
  },

  async previewInvoice(): Promise<InvoicePreview> {
    return {
      subtotal_cents: 0,
      tax_cents: 0,
      discount_cents: 0,
      total_cents: 0,
      // The BillingProvider interface passes no tenant scope to these methods,
      // so the platform default is the most specific currency available. It at
      // least matches a self-hosted install that does not run in dollars.
      currency: await platformCurrency(),
      line_items: [],
    };
  },

  async verifyWebhook(): Promise<WebhookEvent> {
    throw new Error("Manual invoicing has no webhooks.");
  },

  async createPaymentIntent(input: PaymentIntentInput): Promise<PaymentIntent> {
    // Manual mode records a pending payment; admin marks it succeeded when funds land.
    return {
      provider: "manual",
      provider_payment_id: `man_pay_${input.idempotency_key ?? crypto.randomUUID()}`,
      status: "pending",
      amount_cents: input.amount_cents,
      currency: input.currency,
      metadata: input.metadata,
    };
  },

  async getPayment(providerPaymentId: string): Promise<PaymentIntent> {
    // Persistence lives in billing_payment_attempts; the engine hydrates from there.
    return {
      provider: "manual",
      provider_payment_id: providerPaymentId,
      status: "pending",
      amount_cents: 0,
      currency: await platformCurrency(),
    };
  },

  async retryPayment(providerPaymentId: string): Promise<PaymentIntent> {
    // Manual retries are simply "mark for follow-up" — no gateway call.
    return {
      provider: "manual",
      provider_payment_id: providerPaymentId,
      status: "pending",
      amount_cents: 0,
      currency: await platformCurrency(),
    };
  },

  async refundPayment(input: RefundInput): Promise<Refund> {
    return {
      provider: "manual",
      provider_refund_id: `man_ref_${crypto.randomUUID()}`,
      provider_payment_id: input.provider_payment_id,
      amount_cents: input.amount_cents ?? 0,
      // RefundInput carries no currency, so the payment's own is not reachable
      // from here; the platform default beats a hardcoded dollar.
      currency: await platformCurrency(),
      status: "succeeded",
      reason: input.reason,
      created_at: new Date().toISOString(),
    };
  },
};
