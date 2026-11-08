// Sales CRM shared types. Keep in sync with supabase types.
export type ProductKind = 'product' | 'service' | 'subscription' | 'bundle';
export type QuoteStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired' | 'revised';
export type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'partial' | 'paid' | 'overdue' | 'void' | 'refunded';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded' | 'cancelled';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'stripe' | 'paypal' | 'crypto' | 'check' | 'other';
export type GoalPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type GoalMetric = 'revenue' | 'deals_won' | 'deals_created' | 'activities' | 'calls' | 'meetings' | 'custom';

export interface LineItemInput {
  product_id?: string | null;
  name: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  discount_pct?: number;
  tax_rate?: number;
  sort_order?: number;
}

export interface SalesOverviewMetrics {
  open_deals_value: number;
  won_this_month: number;
  outstanding_invoices: number;
  overdue_invoices: number;
  quotes_pending: number;
  currency: string;
}
