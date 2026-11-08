import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentWorkspace } from '@/hooks/use-workspace';
import type { Database } from '@/integrations/supabase/types';
import { nextDocumentNumber } from '@/lib/sales/sales.functions';
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";

export type QuoteRow = Database['public']['Tables']['quotes']['Row'];
export type QuoteInsert = Database['public']['Tables']['quotes']['Insert'];
export type QuoteUpdate = Database['public']['Tables']['quotes']['Update'];
export type QuoteLineItem = Database['public']['Tables']['quote_line_items']['Row'];
export type QuoteLineItemInsert = Database['public']['Tables']['quote_line_items']['Insert'];
export type QuoteStatus = QuoteRow['status'];

export type QuoteWithLines = QuoteRow & {
  line_items: QuoteLineItem[];
  contact?: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
  company?: { id: string; name: string } | null;
  deal?: { id: string; title: string } | null;
};

export type QuoteFilters = { search?: string; status?: QuoteStatus | 'all'; dealId?: string; contactId?: string; trashed?: boolean };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useQuotes(filters: QuoteFilters = {}) {
  const { active } = useCurrentWorkspace();
  const wsId = active?.id;
  return useQuery({
    queryKey: ['quotes', wsId, filters],
    enabled: !!wsId,
    queryFn: async (): Promise<QuoteRow[]> => {
      let q = sbAny(db).from('quotes').select('*').eq('workspace_id', wsId);
      q = filters.trashed ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null);
      if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
      if (filters.dealId) q = q.eq('deal_id', filters.dealId);
      if (filters.contactId) q = q.eq('contact_id', filters.contactId);
      if (filters.search?.trim()) {
        const s = filters.search.trim().replace(/[%,]/g, ' ');
        q = q.or([`quote_number.ilike.%${sanitizeSearchTerm(s)}%`, `title.ilike.%${sanitizeSearchTerm(s)}%`].join(','));
      }
      const { data, error } = await q.order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as QuoteRow[];
    },
  });
}

export function useQuote(id: string | undefined) {
  return useQuery({
    queryKey: ['quote', id],
    enabled: !!id,
    queryFn: async (): Promise<QuoteWithLines | null> => {
      const { data, error } = await db
        .from('quotes')
        .select(`*,
          line_items:quote_line_items(*),
          contact:contacts(id, first_name, last_name, email),
          company:companies(id, name),
          deal:deals(id, title)
        `)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const q = data as QuoteWithLines;
      q.line_items = [...(q.line_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
      return q;
    },
  });
}

export function useQuoteVersions(quoteId: string | undefined, rootId: string | null | undefined) {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ['quote-versions', quoteId, rootId],
    enabled: !!quoteId && !!active?.id,
    queryFn: async (): Promise<QuoteRow[]> => {
      const rid = rootId ?? quoteId!;
      const { data, error } = await db
        .from('quotes')
        .select('*')
        .eq('workspace_id', active!.id)
        .or(`id.eq.${rid},parent_quote_id.eq.${rid}`)
        .order('version', { ascending: false });
      if (error) throw error;
      return (data ?? []) as QuoteRow[];
    },
  });
}

export type QuoteFormInput = {
  id?: string;
  title: string;
  contact_id?: string | null;
  company_id?: string | null;
  deal_id?: string | null;
  currency: string;
  valid_until?: string | null;
  notes?: string | null;
  terms?: string | null;
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

export function computeTotals(lines: QuoteFormInput['lines']) {
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

export function useSaveQuote() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: QuoteFormInput) => {
      if (!active?.id) throw new Error('No workspace');
      const wsId = active.id;
      const totals = computeTotals(input.lines);

      let quoteId = input.id;
      let quoteNumber: string | undefined;

      if (!quoteId) {
        const { number } = await nextDocumentNumber({ data: { workspaceId: wsId, kind: 'quote' } });
        quoteNumber = number;
      }

      const payload: Partial<QuoteInsert> = {
        workspace_id: wsId,
        title: input.title,
        contact_id: input.contact_id ?? null,
        company_id: input.company_id ?? null,
        deal_id: input.deal_id ?? null,
        currency: input.currency,
        valid_until: input.valid_until ?? null,
        notes: input.notes ?? null,
        terms: input.terms ?? null,
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        tax_total: totals.tax_total,
        total: totals.total,
      };

      // One RPC transaction commits the header and every line together. A failed
      // delete/insert leaves the original document intact instead of half saved.
      const { data: savedId, error } = await sbAny(db).rpc('save_sales_document', {
        _kind: 'quote',
        _workspace_id: wsId,
        _document_id: quoteId ?? null,
        _header: { ...payload, quote_number: quoteNumber },
        _lines: input.lines,
      });
      if (error) throw error;
      if (!savedId) throw new Error('Document was not saved');
      return savedId as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
      qc.invalidateQueries({ queryKey: ['quote', id] });
    },
  });
}

export function useUpdateQuoteStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: QuoteStatus }) => {
      const patch: QuoteUpdate = { status };
      const now = new Date().toISOString();
      if (status === 'sent') patch.sent_at = now;
      if (status === 'accepted') patch.accepted_at = now;
      if (status === 'rejected') patch.rejected_at = now;
      if (status === 'viewed') patch.viewed_at = now;
      const { error } = await sbAny(db).from('quotes').update(patch).eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
      qc.invalidateQueries({ queryKey: ['quote', id] });
    },
  });
}

export function useDeleteQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny(db).from('quotes').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes'] }),
  });
}

export function useRestoreQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny(db).from('quotes').update({ deleted_at: null }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes'] }),
  });
}

/**
 * Hard-delete a quote that is already in the trash. Without this the recycle
 * bin only offered Restore, so soft-deleted rows could never actually be
 * removed. Guarded on `deleted_at` so an active quote can never be destroyed
 * by this path — it has to be trashed first.
 */
export function usePurgeQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // `select()` so we can tell a real delete from a no-op: the deleted_at
      // filter silently matches zero rows if the quote was restored elsewhere,
      // and without this the UI reported "permanently deleted" for a quote
      // that is still live.
      const { data, error } = await sbAny(db)
        .from('quotes')
        .delete()
        .eq('id', id)
        .not('deleted_at', 'is', null)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Quote was not deleted — it is no longer in the trash. Refresh and try again.');
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes'] }),
  });
}

/** Duplicate a quote as an independent new draft (fresh number, version 1, no parent). */
export function useDuplicateQuote() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (sourceId: string): Promise<string> => {
      if (!active?.id) throw new Error('No workspace');
      const wsId = active.id;
      const { data: src, error: e1 } = await db
        .from('quotes')
        .select('*, line_items:quote_line_items(*)')
        .eq('id', sourceId)
        .single();
      if (e1) throw e1;
      const { number } = await nextDocumentNumber({ data: { workspaceId: wsId, kind: 'quote' } });
      const insert: QuoteInsert = {
        workspace_id: wsId,
        quote_number: number,
        title: `${src.title} (Copy)`,
        currency: src.currency,
        contact_id: src.contact_id,
        company_id: src.company_id,
        deal_id: src.deal_id,
        notes: src.notes,
        terms: src.terms,
        valid_until: src.valid_until,
        subtotal: src.subtotal,
        discount_total: src.discount_total,
        tax_total: src.tax_total,
        total: src.total,
        version: 1,
        status: 'draft',
      };
      const { data: created, error: e2 } = await sbAny(db).from('quotes').insert(insert).select('id').single();
      if (e2) throw e2;
      const newId = created.id as string;
      if (src.line_items?.length) {
        const rows: QuoteLineItemInsert[] = src.line_items.map((l: QuoteLineItem, i: number) => ({
          workspace_id: wsId,
          quote_id: newId,
          product_id: l.product_id,
          name: l.name,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_pct: l.discount_pct,
          tax_rate: l.tax_rate,
          subtotal: l.subtotal,
          total: l.total,
          sort_order: i,
        }));
        await sbAny(db).from('quote_line_items').insert(rows);
      }
      return newId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes'] }),
  });
}


/** Duplicate a quote as a new version (parent_quote_id). */
export function useCreateQuoteRevision() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (sourceId: string): Promise<string> => {
      if (!active?.id) throw new Error('No workspace');
      const wsId = active.id;
      const { data: src, error: e1 } = await db
        .from('quotes')
        .select('*, line_items:quote_line_items(*)')
        .eq('id', sourceId)
        .single();
      if (e1) throw e1;
      const rootId = src.parent_quote_id ?? src.id;
      const { data: siblings } = await db
        .from('quotes')
        .select('version')
        .eq('workspace_id', wsId)
        .or(`id.eq.${rootId},parent_quote_id.eq.${rootId}`);
      const maxV = Math.max(0, ...((siblings ?? []) as { version: number }[]).map((s) => s.version || 1));
      const { number } = await nextDocumentNumber({ data: { workspaceId: wsId, kind: 'quote' } });
      const insert: QuoteInsert = {
        workspace_id: wsId,
        quote_number: number,
        title: src.title,
        currency: src.currency,
        contact_id: src.contact_id,
        company_id: src.company_id,
        deal_id: src.deal_id,
        notes: src.notes,
        terms: src.terms,
        valid_until: src.valid_until,
        subtotal: src.subtotal,
        discount_total: src.discount_total,
        tax_total: src.tax_total,
        total: src.total,
        parent_quote_id: rootId,
        version: maxV + 1,
        status: 'draft',
      };
      const { data: created, error: e2 } = await sbAny(db).from('quotes').insert(insert).select('id').single();
      if (e2) throw e2;
      const newId = created.id as string;
      if (src.line_items?.length) {
        const rows: QuoteLineItemInsert[] = src.line_items.map((l: QuoteLineItem, i: number) => ({
          workspace_id: wsId,
          quote_id: newId,
          product_id: l.product_id,
          name: l.name,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_pct: l.discount_pct,
          tax_rate: l.tax_rate,
          subtotal: l.subtotal,
          total: l.total,
          sort_order: i,
        }));
        await sbAny(db).from('quote_line_items').insert(rows);
      }
      // mark source as revised
      await sbAny(db).from('quotes').update({ status: 'revised' }).eq('id', sourceId);
      return newId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes'] }),
  });
}

/** Generate/retrieve a public share token for a quote. */
export function useEnsureShareToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<string> => {
      const { data: existing } = await sbAny(db).from('quotes').select('public_token').eq('id', id).single();
      if (existing?.public_token) return existing.public_token as string;
      const token = crypto.randomUUID().replace(/-/g, '');
      const { error } = await sbAny(db).from('quotes').update({ public_token: token }).eq('id', id);
      if (error) throw error;
      return token;
    },
    onSuccess: (_t, id) => qc.invalidateQueries({ queryKey: ['quote', id] }),
  });
}

/** Approval workflow stored inside custom_fields.approval. */
export type ApprovalState = {
  status: 'not_requested' | 'pending' | 'approved' | 'rejected';
  requested_by?: string | null;
  requested_at?: string | null;
  decided_by?: string | null;
  decided_at?: string | null;
  reason?: string | null;
};

export function readApproval(q: QuoteRow | null | undefined): ApprovalState {
  const cf = (q?.custom_fields as Record<string, unknown> | null) ?? {};
  return (cf.approval as ApprovalState) ?? { status: 'not_requested' };
}

export function useSetApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, next }: { id: string; next: ApprovalState }) => {
      const { data: cur } = await sbAny(db).from('quotes').select('custom_fields').eq('id', id).single();
      const cf = { ...((cur?.custom_fields as Record<string, unknown>) ?? {}), approval: next };
      const { error } = await sbAny(db).from('quotes').update({ custom_fields: cf }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: ['quote', v.id] }),
  });
}

export const QUOTE_STATUS_META: Record<QuoteStatus, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'bg-muted text-muted-foreground' },
  sent: { label: 'Sent', tone: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  viewed: { label: 'Viewed', tone: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400' },
  accepted: { label: 'Accepted', tone: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  rejected: { label: 'Rejected', tone: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  expired: { label: 'Expired', tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  revised: { label: 'Revised', tone: 'bg-purple-500/15 text-purple-600 dark:text-purple-400' },
};
