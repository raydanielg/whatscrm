import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

const tokenSchema = z.object({ token: z.string().min(8).max(128) });

const signSchema = z.object({
  token: z.string().min(8).max(128),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  signature: z.string().trim().min(2).max(120),
  accept: z.boolean(),
});

export type PublicQuote = {
  id: string;
  quote_number: string;
  title: string;
  status: string;
  version: number;
  currency: string | null;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  total: number;
  notes: string | null;
  terms: string | null;
  valid_until: string | null;
  created_at: string;
  workspace_name: string | null;
  line_items: Array<{
    id: string;
    description: string | null;
    quantity: number;
    unit_price: number;
    total: number;
    sort_order: number;
  }>;
  signature: { name: string; signed_at: string; signature: string } | null;
};

const QUOTE_COLUMNS =
  'id, workspace_id, quote_number, title, status, version, currency, subtotal, tax_total, discount_total, total, notes, terms, valid_until, created_at, custom_fields';

/** Public, token-gated read of a shared quote. Marks a sent quote as viewed. */
export const getPublicQuote = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }): Promise<PublicQuote | null> => {
    const { supabaseAdmin } = await import('@/lib/demo/admin-write-guard.server');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    const { data: quote, error } = await db
      .from('quotes')
      .select(QUOTE_COLUMNS)
      .eq('public_token', data.token)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!quote) return null;

    const { data: lines } = await db
      .from('quote_line_items')
      .select('id, description, quantity, unit_price, total, sort_order')
      .eq('quote_id', quote.id)
      .order('sort_order', { ascending: true });

    if (quote.status === 'sent') {
      await db.from('quotes').update({ status: 'viewed', viewed_at: new Date().toISOString() }).eq('id', quote.id);
      quote.status = 'viewed';
    }

    const { data: ws } = await db
      .from('workspaces')
      .select('name')
      .eq('id', quote.workspace_id)
      .maybeSingle();

    const cf = (quote.custom_fields ?? {}) as Record<string, unknown>;
    const sig = (cf['signature'] ?? null) as PublicQuote['signature'];

    return {
      id: quote.id,
      quote_number: quote.quote_number,
      title: quote.title,
      status: quote.status,
      version: quote.version,
      currency: quote.currency,
      subtotal: Number(quote.subtotal ?? 0),
      tax_total: Number(quote.tax_total ?? 0),
      discount_total: Number(quote.discount_total ?? 0),
      total: Number(quote.total ?? 0),
      notes: quote.notes,
      terms: quote.terms,
      valid_until: quote.valid_until,
      created_at: quote.created_at,
      workspace_name: ws?.name ?? null,
      line_items: (lines ?? []).map((l: Record<string, unknown>) => ({
        id: String(l['id']),
        description: (l['description'] as string | null) ?? null,
        quantity: Number(l['quantity'] ?? 0),
        unit_price: Number(l['unit_price'] ?? 0),
        total: Number(l['total'] ?? 0),
        sort_order: Number(l['sort_order'] ?? 0),
      })),
      signature: sig,
    };
  });

/** Public accept (with typed signature) or decline of a shared quote. */
export const signPublicQuote = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => signSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/lib/demo/admin-write-guard.server');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    const { data: quote } = await db
      .from('quotes')
      .select('id, workspace_id, status, custom_fields, deal_id')
      .eq('public_token', data.token)
      .is('deleted_at', null)
      .maybeSingle();
    if (!quote) throw new Error('This quote link is no longer valid.');
    if (['accepted', 'rejected', 'expired'].includes(quote.status)) {
      throw new Error(`This quote has already been ${quote.status}.`);
    }

    const signedAt = new Date().toISOString();
    const cf = { ...((quote.custom_fields as Record<string, unknown>) ?? {}) };
    if (data.accept) {
      cf['signature'] = {
        name: data.fullName,
        email: data.email || null,
        signature: data.signature,
        signed_at: signedAt,
      };
    } else {
      cf['declined'] = { name: data.fullName, at: signedAt };
    }

    const { error } = await db
      .from('quotes')
      .update({
        status: data.accept ? 'accepted' : 'rejected',
        custom_fields: cf,
        ...(data.accept ? { accepted_at: signedAt } : { rejected_at: signedAt }),
      })
      .eq('id', quote.id);
    if (error) throw new Error(error.message);

    return { ok: true, status: data.accept ? 'accepted' : 'rejected', signed_at: signedAt };
  });
