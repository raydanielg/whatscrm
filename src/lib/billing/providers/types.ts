/**
 * Billing Provider abstraction.
 *
 * Every payment gateway (Stripe, Paddle, Manual, future providers) implements
 * `BillingProvider`. The rest of the app talks to this interface only, so new
 * gateways can be added by dropping a new adapter into ./providers and
 * registering it in ./index.ts.
 */

export type BillingProviderId =
  | "stripe"
  | "paddle"
  | "manual"
  | "paypal"
  | "lemonsqueezy"
  | "razorpay"
  | "paystack"
  | "flutterwave"
  | "mollie"
  | "mercadopago"
  | "midtrans"
  | "custom"
  | (string & {});

export type Money = { amount_cents: number; currency: string };

export interface BillingAddress {
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postal_code?: string;
  country?: string;
}

export interface CustomerInput {
  organization_id: string;
  email?: string;
  name?: string;
  billing_address?: BillingAddress;
  tax_id?: string;
  metadata?: Record<string, unknown>;
}

export interface CustomerRef {
  provider: BillingProviderId;
  provider_customer_id: string;
}

export interface CheckoutSessionInput {
  organization_id: string;
  customer: CustomerRef;
  plan_code: string;
  quantity?: number;
  coupon_code?: string;
  trial_days?: number;
  success_url: string;
  cancel_url: string;
  metadata?: Record<string, unknown>;
}

export interface CheckoutSession {
  id: string;
  url: string;
  provider: BillingProviderId;
}

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "paused";

export interface SubscriptionSnapshot {
  provider: BillingProviderId;
  provider_subscription_id: string;
  provider_customer_id: string;
  status: SubscriptionStatus;
  plan_code: string;
  quantity: number;
  current_period_start: string;
  current_period_end: string;
  trial_ends_at?: string | null;
  cancel_at?: string | null;
  canceled_at?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface UsageReport {
  organization_id: string;
  subscription_id: string;
  meter_code: string;
  quantity: number;
  occurred_at: string;
  idempotency_key?: string;
}

export interface InvoicePreview {
  subtotal_cents: number;
  tax_cents: number;
  discount_cents: number;
  total_cents: number;
  currency: string;
  line_items: Array<{ description: string; amount_cents: number; quantity: number }>;
}

export interface WebhookVerifyInput {
  raw_body: string;
  signature: string | null;
  secret: string;
}

export interface WebhookEvent {
  provider: BillingProviderId;
  id: string;
  type: string;
  data: unknown;
}

/* -------------------------------------------------------------------------- */
/*  Payments — one-time / recurring charge tracking + refunds                 */
/* -------------------------------------------------------------------------- */

export type PaymentStatus =
  | "pending"
  | "processing"
  | "requires_action"
  | "succeeded"
  | "failed"
  | "canceled"
  | "refunded"
  | "partially_refunded";

export interface PaymentIntentInput {
  organization_id: string;
  customer: CustomerRef;
  amount_cents: number;
  currency: string;
  description?: string;
  invoice_id?: string;
  return_url?: string;
  /** Idempotency key so duplicate submits don't create double charges. */
  idempotency_key?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentIntent {
  provider: BillingProviderId;
  provider_payment_id: string;
  provider_intent_id?: string;
  status: PaymentStatus;
  amount_cents: number;
  currency: string;
  /** Provider-hosted URL to complete auth (3DS, wallet redirect, etc.) if needed. */
  next_action_url?: string;
  failure_code?: string;
  failure_message?: string;
  refunded_amount_cents?: number;
  metadata?: Record<string, unknown>;
}

export interface RefundInput {
  provider_payment_id: string;
  /** Omit for full refund; provide cents for partial. */
  amount_cents?: number;
  reason?: "requested_by_customer" | "duplicate" | "fraudulent" | "other";
  idempotency_key?: string;
  metadata?: Record<string, unknown>;
}

export interface Refund {
  provider: BillingProviderId;
  provider_refund_id: string;
  provider_payment_id: string;
  amount_cents: number;
  currency: string;
  status: "pending" | "succeeded" | "failed" | "canceled";
  reason?: string;
  created_at: string;
}

/**
 * Provider adapter contract. Adapters are stateless: all persistence happens
 * in the billing service layer that calls them.
 *
 * `supports.*` flags drive UI capability gating so the Gateway Manager can
 * hide actions a given adapter cannot perform.
 */
export interface BillingProvider {
  readonly id: BillingProviderId;
  readonly displayName: string;
  readonly supports: {
    checkout: boolean;
    customer_portal: boolean;
    usage_reporting: boolean;
    tax: boolean;
    coupons: boolean;
    payments: boolean;
    refunds: boolean;
    partial_refunds: boolean;
    webhooks: boolean;
  };

  createCustomer(input: CustomerInput): Promise<CustomerRef>;
  updateCustomer(ref: CustomerRef, patch: Partial<CustomerInput>): Promise<void>;

  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession>;
  createCustomerPortalSession(ref: CustomerRef, return_url: string): Promise<{ url: string }>;

  getSubscription(providerSubscriptionId: string): Promise<SubscriptionSnapshot>;
  cancelSubscription(providerSubscriptionId: string, at_period_end?: boolean): Promise<SubscriptionSnapshot>;
  updateSubscriptionQuantity(providerSubscriptionId: string, quantity: number): Promise<SubscriptionSnapshot>;

  reportUsage(input: UsageReport): Promise<void>;
  previewInvoice(providerSubscriptionId: string): Promise<InvoicePreview>;

  /* Payment operations */
  createPaymentIntent(input: PaymentIntentInput): Promise<PaymentIntent>;
  getPayment(providerPaymentId: string): Promise<PaymentIntent>;
  /**
   * Retry a previously failed payment. Providers that don't support explicit
   * retry re-create the intent using the original params.
   */
  retryPayment(providerPaymentId: string): Promise<PaymentIntent>;
  refundPayment(input: RefundInput): Promise<Refund>;

  verifyWebhook(input: WebhookVerifyInput): Promise<WebhookEvent>;
}

/** Thrown when a capability is not implemented by an adapter. */
export class BillingProviderUnsupported extends Error {
  constructor(provider: BillingProviderId, capability: string) {
    super(`Billing provider "${provider}" does not support: ${capability}`);
    this.name = "BillingProviderUnsupported";
  }
}
