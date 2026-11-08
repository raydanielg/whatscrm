/**
 * Payment Link Provider Abstraction Layer
 *
 * Supported providers: stripe, paypal, paddle, razorpay, paystack,
 * flutterwave, mollie, mercadopago, midtrans.
 *
 * Add a new provider by implementing PaymentLinkProvider and registering it
 * in `./index.ts`. No callers need to change.
 */

export const PAYMENT_PROVIDERS = [
  'stripe',
  'paypal',
  'paddle',
  'razorpay',
  'paystack',
  'flutterwave',
  'mollie',
  'mercadopago',
  'midtrans',
] as const;

export type PaymentProviderId = (typeof PAYMENT_PROVIDERS)[number];

export interface CreateLinkInput {
  amount: number;
  currency: string;
  description?: string;
  expiresAt?: string | null;
  allowPartial?: boolean;
  minAmount?: number | null;
  isRecurring?: boolean;
  recurringInterval?: 'day' | 'week' | 'month' | 'year' | null;
  recurringCount?: number | null;
  customerEmail?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  successUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateLinkResult {
  /** Provider's remote id (session/link id). */
  providerReference: string | null;
  /** Hosted checkout URL. Null falls back to internal /pay/$token. */
  hostedUrl: string | null;
  /** Extra data to persist under metadata. */
  metadata?: Record<string, unknown>;
}

export interface RefundInput {
  providerReference: string;
  amount: number;
  currency: string;
  reason?: string;
}

export interface RefundResult {
  refundReference: string | null;
  status: 'succeeded' | 'pending' | 'failed';
}

export interface PaymentLinkProvider {
  readonly id: PaymentProviderId;
  readonly displayName: string;
  /** Supported ISO currencies (uppercase). Empty = unrestricted. */
  readonly currencies: readonly string[];
  readonly supportsPartial: boolean;
  readonly supportsRecurring: boolean;
  readonly supportsRefunds: boolean;

  createLink(input: CreateLinkInput): Promise<CreateLinkResult>;
  refund?(input: RefundInput): Promise<RefundResult>;
}
