import { makeStubProvider } from './stub';
import type { PaymentLinkProvider, PaymentProviderId } from './types';

/**
 * Registry of payment link providers. Each entry advertises its capabilities
 * so the UI can filter what to show and the engine can validate inputs.
 *
 * Live SDK integrations should replace `makeStubProvider(...)` with a real
 * implementation of the PaymentLinkProvider interface. Callers never import
 * providers directly — always go through `getProvider(id)` below.
 */
const registry: Record<PaymentProviderId, PaymentLinkProvider> = {
  stripe: makeStubProvider({
    id: 'stripe',
    displayName: 'Stripe',
    supportsPartial: true,
    supportsRecurring: true,
    supportsRefunds: true,
  }),
  paypal: makeStubProvider({
    id: 'paypal',
    displayName: 'PayPal',
    supportsPartial: true,
    supportsRecurring: true,
    supportsRefunds: true,
  }),
  paddle: makeStubProvider({
    id: 'paddle',
    displayName: 'Paddle',
    supportsPartial: false,
    supportsRecurring: true,
    supportsRefunds: true,
  }),
  razorpay: makeStubProvider({
    id: 'razorpay',
    displayName: 'Razorpay',
    currencies: ['INR', 'USD'],
    supportsPartial: true,
    supportsRecurring: true,
    supportsRefunds: true,
  }),
  paystack: makeStubProvider({
    id: 'paystack',
    displayName: 'Paystack',
    currencies: ['NGN', 'GHS', 'ZAR', 'KES', 'USD'],
    supportsPartial: true,
    supportsRecurring: true,
    supportsRefunds: true,
  }),
  flutterwave: makeStubProvider({
    id: 'flutterwave',
    displayName: 'Flutterwave',
    currencies: ['NGN', 'GHS', 'KES', 'ZAR', 'USD', 'EUR', 'GBP'],
    supportsPartial: true,
    supportsRecurring: true,
    supportsRefunds: true,
  }),
  mollie: makeStubProvider({
    id: 'mollie',
    displayName: 'Mollie',
    currencies: ['EUR', 'USD', 'GBP'],
    supportsPartial: false,
    supportsRecurring: true,
    supportsRefunds: true,
  }),
  mercadopago: makeStubProvider({
    id: 'mercadopago',
    displayName: 'Mercado Pago',
    currencies: ['ARS', 'BRL', 'CLP', 'COP', 'MXN', 'PEN', 'UYU', 'USD'],
    supportsPartial: true,
    supportsRecurring: true,
    supportsRefunds: true,
  }),
  midtrans: makeStubProvider({
    id: 'midtrans',
    displayName: 'Midtrans',
    currencies: ['IDR'],
    supportsPartial: false,
    supportsRecurring: false,
    supportsRefunds: true,
  }),
};

export function getProvider(id: PaymentProviderId): PaymentLinkProvider {
  return registry[id];
}

export function listProviders(): PaymentLinkProvider[] {
  return Object.values(registry);
}

export * from './types';
