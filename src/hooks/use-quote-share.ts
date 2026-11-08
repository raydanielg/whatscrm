/**
 * Shareable quote links.
 *
 * One place that turns a deal (or a freshly captured Social Studio lead) into a
 * public quote URL — `/q/<token>` — so sales can send prospects the quote
 * without them needing a CRM login. Reuses the newest open quote when one
 * already exists for the record instead of piling up duplicate drafts.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentWorkspace } from '@/hooks/use-workspace';
import { nextDocumentNumber } from '@/lib/sales/sales.functions';
import { sbAny } from '@/lib/supabase/untyped';
import type { QuoteInsert } from '@/hooks/use-quotes';
import { useTenantCurrency } from "@/hooks/use-currency";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function buildQuoteUrl(token: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/q/${token}`;
}

export type QuoteSeed = {
  /** Link the quote to an existing deal (reused across shares). */
  dealId?: string | null;
  /** Link the quote to a lead-derived contact/company when known. */
  contactId?: string | null;
  companyId?: string | null;
  title: string;
  amount?: number | null;
  currency?: string | null;
  notes?: string | null;
};

export type SharedQuote = { quoteId: string; token: string; url: string; created: boolean };

async function ensureToken(quoteId: string): Promise<string> {
  const { data: existing } = await sbAny(db)
    .from('quotes')
    .select('public_token')
    .eq('id', quoteId)
    .single();
  if (existing?.public_token) return existing.public_token as string;
  const token = crypto.randomUUID().replace(/-/g, '');
  const { error } = await sbAny(db).from('quotes').update({ public_token: token }).eq('id', quoteId);
  if (error) throw error;
  return token;
}

/**
 * Get (or create) a shareable quote for a deal/lead and return its public URL.
 */
export function useShareQuoteLink() {
  const tenantCurrency = useTenantCurrency();
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (seed: QuoteSeed): Promise<SharedQuote> => {
      const wsId = active?.id;
      if (!wsId) throw new Error('No workspace selected');

      // Reuse an existing quote for the deal so a prospect keeps one stable link.
      if (seed.dealId) {
        const { data: found } = await sbAny(db)
          .from('quotes')
          .select('id')
          .eq('workspace_id', wsId)
          .eq('deal_id', seed.dealId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1);
        const existingId = found?.[0]?.id as string | undefined;
        if (existingId) {
          const token = await ensureToken(existingId);
          return { quoteId: existingId, token, url: buildQuoteUrl(token), created: false };
        }
      }

      const { number } = await nextDocumentNumber({ data: { workspaceId: wsId, kind: 'quote' } });
      const amount = Number(seed.amount ?? 0) || 0;
      const insert: QuoteInsert = {
        workspace_id: wsId,
        quote_number: number,
        title: seed.title.slice(0, 200),
        currency: seed.currency ?? tenantCurrency,
        contact_id: seed.contactId ?? null,
        company_id: seed.companyId ?? null,
        deal_id: seed.dealId ?? null,
        notes: seed.notes ?? null,
        subtotal: amount,
        discount_total: 0,
        tax_total: 0,
        total: amount,
        version: 1,
        status: 'draft',
      };
      const { data: created, error } = await sbAny(db).from('quotes').insert(insert).select('id').single();
      if (error) throw error;
      const quoteId = created.id as string;

      if (amount > 0) {
        await sbAny(db).from('quote_line_items').insert([
          {
            workspace_id: wsId,
            quote_id: quoteId,
            name: seed.title.slice(0, 200),
            quantity: 1,
            unit_price: amount,
            discount_pct: 0,
            tax_rate: 0,
            subtotal: amount,
            total: amount,
            sort_order: 0,
          },
        ]);
      }

      const token = await ensureToken(quoteId);
      return { quoteId, token, url: buildQuoteUrl(token), created: true };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

/** Copy helper that degrades gracefully when the clipboard API is blocked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
