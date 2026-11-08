import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentWorkspace } from '@/hooks/use-workspace';
import type { Database } from '@/integrations/supabase/types';
import { nextDocumentNumber } from '@/lib/sales/sales.functions';
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";
import { useTenantCurrency } from "@/hooks/use-currency";

export type InvoiceRow = Database['public']['Tables']['invoices']['Row'];
export type InvoiceInsert = Database['public']['Tables']['invoices']['Insert'];
export type InvoiceUpdate = Database['public']['Tables']['invoices']['Update'];
export type InvoiceLineItem = Database['public']['Tables']['invoice_line_items']['Row'];
export type InvoiceLineItemInsert = Database['public']['Tables']['invoice_line_items']['Insert'];
export type InvoiceStatus = InvoiceRow['status'];
export type PaymentRow = Database['public']['Tables']['payments']['Row'];
export type PaymentInsert = Database['public']['Tables']['payments']['Insert'];
export type PaymentMethod = PaymentRow['method'];

export type InvoiceWithLines = InvoiceRow & {
  line_items: InvoiceLineItem[];
  contact?: { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null;
  company?: { id: string; name: string } | null;
  deal?: { id: string; title: string } | null;
};

export type InvoiceFilters = { search?: string; status?: InvoiceStatus | 'all'; dealId?: string; contactId?: string };

export type RecurringConfig = {
  enabled: boolean;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
  next_run?: string | null;
  until?: string | null;
  occurrences?: number | null;
};

export type ReminderEntry = { at: string; channel: 'email' | 'whatsapp' | 'sms' | 'manual'; note?: string | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const INVOICE_STATUS_META: Record<InvoiceStatus, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'bg-muted text-muted-foreground' },
  sent: { label: 'Sent', tone: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  viewed: { label: 'Viewed', tone: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400' },
  partial: { label: 'Partial', tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  paid: { label: 'Paid', tone: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  overdue: { label: 'Overdue', tone: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  void: { label: 'Void', tone: 'bg-muted text-muted-foreground line-through' },
  refunded: { label: 'Refunded', tone: 'bg-purple-500/15 text-purple-600 dark:text-purple-400' },
};

export function useInvoices(filters: InvoiceFilters = {}) {
  const { active } = useCurrentWorkspace();
  const wsId = active?.id;
  return useQuery({
    queryKey: ['invoices', wsId, filters],
    enabled: !!wsId,
    queryFn: async (): Promise<InvoiceRow[]> => {
      let q = sbAny(db).from('invoices').select('*').eq('workspace_id', wsId).is('deleted_at', null);
      if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
      if (filters.dealId) q = q.eq('deal_id', filters.dealId);
      if (filters.contactId) q = q.eq('contact_id', filters.contactId);
      if (filters.search?.trim()) {
        const s = filters.search.trim().replace(/[%,]/g, ' ');
        q = q.or([`invoice_number.ilike.%${sanitizeSearchTerm(s)}%`, `external_ref.ilike.%${sanitizeSearchTerm(s)}%`].join(','));
      }
      const { data, error } = await q.order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      // Auto-mark overdue for display consistency
      const now = new Date().toISOString().slice(0, 10);
      return (data ?? []).map((r: InvoiceRow) => {
        if (r.due_date && r.due_date < now && ['sent', 'viewed', 'partial'].includes(r.status) && Number(r.amount_due) > 0) {
          return { ...r, status: 'overdue' as InvoiceStatus };
        }
        return r;
      });
    },
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: ['invoice', id],
    enabled: !!id,
    queryFn: async (): Promise<InvoiceWithLines | null> => {
      const { data, error } = await db
        .from('invoices')
        .select(`*,
          line_items:invoice_line_items(*),
          contact:contacts(id, first_name, last_name, email, phone),
          company:companies(id, name),
          deal:deals(id, title)
        `)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const inv = data as InvoiceWithLines;
      inv.line_items = [...(inv.line_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
      return inv;
    },
  });
}

export function useInvoicePayments(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ['invoice-payments', invoiceId],
    enabled: !!invoiceId,
    queryFn: async (): Promise<PaymentRow[]> => {
      const { data, error } = await db
        .from('payments')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('paid_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PaymentRow[];
    },
  });
}

export type InvoiceFormInput = {
  id?: string;
  quote_id?: string | null;
  contact_id?: string | null;
  company_id?: string | null;
  deal_id?: string | null;
  currency: string;
  issue_date: string;
  due_date?: string | null;
  notes?: string | null;
  terms?: string | null;
  external_ref?: string | null;
  recurring?: RecurringConfig | null;
  lines: Array<{
    id?: string;
    product_id?: string | null;
    name: string;
    description?: string | null;
    quantity: number;
    unit_price: number;
    discount_pct: number;
    tax_rate: number;
  }>;
};

export function computeInvoiceTotals(lines: InvoiceFormInput['lines']) {
  let subtotal = 0, discount_total = 0, tax_total = 0;
  const items = lines.map((l) => {
    const gross = Number(l.quantity) * Number(l.unit_price);
    const disc = gross * (Number(l.discount_pct) / 100);
    const net = gross - disc;
    const tax = net * (Number(l.tax_rate) / 100);
    subtotal += gross;
    discount_total += disc;
    tax_total += tax;
    return { ...l, subtotal: gross, total: net + tax };
  });
  const total = subtotal - discount_total + tax_total;
  return { subtotal, discount_total, tax_total, total, items };
}

export function useSaveInvoice() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: InvoiceFormInput) => {
      if (!active?.id) throw new Error('No workspace');
      const wsId = active.id;
      const totals = computeInvoiceTotals(input.lines);

      let invoiceId = input.id;
      let invoiceNumber: string | undefined;

      if (!invoiceId) {
        const { number } = await nextDocumentNumber({ data: { workspaceId: wsId, kind: 'invoice' } });
        invoiceNumber = number;
      }

      // Merge this patch under the RPC document lock, preserving unrelated
      // custom fields and the authoritative payment balance.
      const cf = input.recurring === undefined ? {} : { recurring: input.recurring };

      const payload: Partial<InvoiceInsert> = {
        workspace_id: wsId,
        contact_id: input.contact_id ?? null,
        company_id: input.company_id ?? null,
        deal_id: input.deal_id ?? null,
        quote_id: input.quote_id ?? null,
        currency: input.currency,
        issue_date: input.issue_date,
        due_date: input.due_date ?? null,
        notes: input.notes ?? null,
        terms: input.terms ?? null,
        external_ref: input.external_ref ?? null,
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        tax_total: totals.tax_total,
        total: totals.total,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        custom_fields: cf as any,
      };

      // One RPC transaction commits the header and every line together. A failed
      // delete/insert leaves the original document intact instead of half saved.
      const { data: savedId, error } = await sbAny(db).rpc('save_sales_document', {
        _kind: 'invoice',
        _workspace_id: wsId,
        _document_id: invoiceId ?? null,
        _header: { ...payload, invoice_number: invoiceNumber },
        _lines: input.lines,
      });
      if (error) throw error;
      if (!savedId) throw new Error('Document was not saved');
      return savedId as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoice', id] });
    },
  });
}

export function useUpdateInvoiceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: InvoiceStatus }) => {
      const patch: InvoiceUpdate = { status };
      const now = new Date().toISOString();
      if (status === 'sent') patch.sent_at = now;
      if (status === 'viewed') patch.viewed_at = now;
      if (status === 'paid') patch.paid_at = now;
      if (status === 'void') patch.voided_at = now;
      const { error } = await sbAny(db).from('invoices').update(patch).eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoice', id] });
    },
  });
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny(db).from('invoices').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });
}

// payments_sync_invoice updates balances/status in the payment transaction.
// Do not overwrite it with a second, stale client-side read/modify/write.

export function useRecordPayment() {
  const tenantCurrency = useTenantCurrency();
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (p: {
      invoice_id: string;
      amount: number;
      method: PaymentMethod;
      reference?: string | null;
      notes?: string | null;
      paid_at?: string | null;
      status?: PaymentRow['status'];
    }) => {
      if (!active?.id) throw new Error('No workspace');
      const { data: inv, error: invoiceError } = await sbAny(db).from('invoices').select('currency, contact_id, deal_id').eq('id', p.invoice_id).eq('workspace_id', active.id).single();
      if (invoiceError) throw invoiceError;
      if (!inv) throw new Error('Invoice not found');
      const row: PaymentInsert = {
        workspace_id: active.id,
        invoice_id: p.invoice_id,
        amount: p.amount,
        method: p.method,
        status: p.status ?? 'succeeded',
        reference: p.reference ?? null,
        notes: p.notes ?? null,
        paid_at: p.paid_at ?? new Date().toISOString(),
        currency: inv?.currency ?? tenantCurrency,
        contact_id: inv?.contact_id ?? null,
        deal_id: inv?.deal_id ?? null,
      };
      const { error } = await sbAny(db).from('payments').insert(row);
      if (error) throw error;
      return p.invoice_id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['invoice-payments', id] });
      qc.invalidateQueries({ queryKey: ['invoice', id] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, invoice_id }: { id: string; invoice_id: string }) => {
      const { error } = await sbAny(db).from('payments').delete().eq('id', id);
      if (error) throw error;
      return invoice_id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['invoice-payments', id] });
      qc.invalidateQueries({ queryKey: ['invoice', id] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useLogReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, entry }: { id: string; entry: ReminderEntry }) => {
      const { data: cur } = await sbAny(db).from('invoices').select('custom_fields').eq('id', id).single();
      const cf = ((cur?.custom_fields as Record<string, unknown>) ?? {}) as Record<string, unknown>;
      const reminders = Array.isArray(cf.reminders) ? (cf.reminders as ReminderEntry[]) : [];
      cf.reminders = [entry, ...reminders].slice(0, 100);
      const { error } = await sbAny(db).from('invoices').update({ custom_fields: cf }).eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => qc.invalidateQueries({ queryKey: ['invoice', id] }),
  });
}

export function useEnsureInvoiceShareToken() {
  return useMutation({
    mutationFn: async (id: string): Promise<string> => {
      const { data: existing } = await sbAny(db).from('invoices').select('public_token').eq('id', id).single();
      if (existing?.public_token) return existing.public_token as string;
      const token = crypto.randomUUID();
      const { error } = await sbAny(db).from('invoices').update({ public_token: token }).eq('id', id);
      if (error) throw error;
      return token;
    },
  });
}

export function readRecurring(inv: InvoiceRow | InvoiceWithLines | null | undefined): RecurringConfig | null {
  const cf = (inv?.custom_fields as Record<string, unknown> | undefined) ?? {};
  const r = cf.recurring as RecurringConfig | undefined;
  return r ?? null;
}

export function readReminders(inv: InvoiceRow | InvoiceWithLines | null | undefined): ReminderEntry[] {
  const cf = (inv?.custom_fields as Record<string, unknown> | undefined) ?? {};
  const r = cf.reminders;
  return Array.isArray(r) ? (r as ReminderEntry[]) : [];
}
