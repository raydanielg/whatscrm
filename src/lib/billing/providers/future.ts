/**
 * Future gateway adapters — declared here so the abstraction layer, admin UI,
 * and registry treat them as first-class from day one. Each stub throws
 * `BillingProviderUnsupported` until its real implementation lands.
 *
 * Adding a new provider is a two-step swap:
 *   1. Implement the `BillingProvider` interface in a dedicated file.
 *   2. Export it here (or from providers/index.ts) in place of the stub.
 */

import { createStubProvider } from "./_stub";

/** PayPal — cards + PayPal wallet + Pay Later. */
export const paypalProvider = createStubProvider({
  id: "paypal",
  displayName: "PayPal",
  supports: { checkout: true, customer_portal: false, payments: true, refunds: true, partial_refunds: true, webhooks: true },
});

/** Lemon Squeezy — merchant-of-record for digital goods. */
export const lemonsqueezyProvider = createStubProvider({
  id: "lemonsqueezy",
  displayName: "Lemon Squeezy",
  supports: { checkout: true, customer_portal: true, tax: true, coupons: true, payments: true, refunds: true, webhooks: true },
});

/** Razorpay — India, UPI + cards. */
export const razorpayProvider = createStubProvider({
  id: "razorpay",
  displayName: "Razorpay",
  supports: { checkout: true, payments: true, refunds: true, partial_refunds: true, webhooks: true },
});

/** Paystack — Africa (Nigeria, Ghana, Kenya, South Africa). */
export const paystackProvider = createStubProvider({
  id: "paystack",
  displayName: "Paystack",
  supports: { checkout: true, payments: true, refunds: true, partial_refunds: true, webhooks: true },
});

/** Flutterwave — Africa + global payouts. */
export const flutterwaveProvider = createStubProvider({
  id: "flutterwave",
  displayName: "Flutterwave",
  supports: { checkout: true, payments: true, refunds: true, partial_refunds: true, webhooks: true },
});

/** Mollie — European cards + local payment methods (iDEAL, Bancontact, SEPA). */
export const mollieProvider = createStubProvider({
  id: "mollie",
  displayName: "Mollie",
  supports: { checkout: true, customer_portal: true, payments: true, refunds: true, partial_refunds: true, webhooks: true },
});

/** Mercado Pago — Latin America. */
export const mercadopagoProvider = createStubProvider({
  id: "mercadopago",
  displayName: "Mercado Pago",
  supports: { checkout: true, payments: true, refunds: true, partial_refunds: true, webhooks: true },
});

/** Midtrans — Indonesia + Southeast Asia. */
export const midtransProvider = createStubProvider({
  id: "midtrans",
  displayName: "Midtrans",
  supports: { checkout: true, payments: true, refunds: true, partial_refunds: true, webhooks: true },
});

/** Custom Gateway — customer-supplied endpoint + HMAC webhook. */
export const customProvider = createStubProvider({
  id: "custom",
  displayName: "Custom Gateway",
  supports: { checkout: true, payments: true, refunds: true, partial_refunds: true, webhooks: true },
});
