import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentWorkspace } from '@/hooks/use-workspace';
import type { Database } from '@/integrations/supabase/types';
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";

export type ProductRow = Database['public']['Tables']['products']['Row'] & {
  images?: string[] | null;
  gallery?: string[] | null;
  videos?: string[] | null;
  category_id?: string | null;
  brand_id?: string | null;
  status?: string;
  parent_product_id?: string | null;
  is_variant?: boolean;
  variant_attributes?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  custom_fields?: Record<string, unknown>;
  tags?: string[] | null;
  barcode?: string | null;
  sale_price?: number | null;
  is_featured?: boolean;
  availability?: string;
  product_type?: string;
  low_stock_threshold?: number | null;
};
export type ProductInsert = Database['public']['Tables']['products']['Insert'];
export type ProductUpdate = Database['public']['Tables']['products']['Update'];

export type ProductCategoryRow = {
  id: string;
  workspace_id: string;
  name: string;
  slug: string | null;
  parent_id: string | null;
  color: string | null;
  icon: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ProductFilters = {
  search?: string;
  kind?: string;
  status?: string;
  categoryId?: string;
  favoritesOnly?: boolean;
  showArchived?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useProducts(filters: ProductFilters = {}) {
  const { active } = useCurrentWorkspace();
  const wsId = active?.id;
  return useQuery({
    queryKey: ['products', wsId, filters],
    enabled: !!wsId,
    queryFn: async (): Promise<ProductRow[]> => {
      let q = sbAny(db).from('products').select('*').eq('workspace_id', wsId).is('deleted_at', null);
      if (!filters.showArchived) q = q.neq('status', 'archived');
      if (filters.kind) q = q.eq('kind', filters.kind);
      if (filters.status) q = q.eq('status', filters.status);
      if (filters.categoryId) q = q.eq('category_id', filters.categoryId);
      if (filters.search?.trim()) {
        const s = filters.search.trim().replace(/[%,]/g, ' ');
        q = q.or([`name.ilike.%${sanitizeSearchTerm(s)}%`, `sku.ilike.%${sanitizeSearchTerm(s)}%`, `description.ilike.%${sanitizeSearchTerm(s)}%`].join(','));
      }
      const { data, error } = await q.order('name').limit(500);
      if (error) throw error;
      let rows = (data ?? []) as ProductRow[];
      if (filters.favoritesOnly) {
        const { data: favs } = await sbAny(db).from('product_favorites').select('product_id').eq('workspace_id', wsId);
        const set = new Set((favs ?? []).map((f: { product_id: string }) => f.product_id));
        rows = rows.filter((r) => set.has(r.id));
      }
      return rows;
    },
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ['product', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await sbAny(db).from('products').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data as ProductRow | null;
    },
  });
}

export function useProductCategories() {
  const { active } = useCurrentWorkspace();
  const wsId = active?.id;
  return useQuery({
    queryKey: ['product_categories', wsId],
    enabled: !!wsId,
    queryFn: async (): Promise<ProductCategoryRow[]> => {
      const { data, error } = await sbAny(db).from('product_categories').select('*').eq('workspace_id', wsId).order('sort_order').order('name');
      if (error) throw error;
      return (data ?? []) as ProductCategoryRow[];
    },
  });
}

export function useUpsertCategory() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: { id?: string; name: string; parent_id?: string | null; color?: string | null; icon?: string | null }) => {
      if (!active?.id) throw new Error('No workspace');
      const payload = { ...input, workspace_id: active.id };
      const q = input.id
        ? sbAny(db).from('product_categories').update(payload).eq('id', input.id).select('*').single()
        : sbAny(db).from('product_categories').insert(payload).select('*').single();
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product_categories'] }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny(db).from('product_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product_categories'] }),
  });
}

export function useUpsertProduct() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: Partial<ProductRow> & { name: string; id?: string }) => {
      if (!active?.id) throw new Error('No workspace');
      const { id, ...rest } = input;
      const payload = { ...rest, workspace_id: active.id };
      const q = id
        ? sbAny(db).from('products').update(payload).eq('id', id).select('*').single()
        : sbAny(db).from('products').insert(payload).select('*').single();
      const { data, error } = await q;
      if (error) throw error;
      return data as ProductRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['product'] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny(db).from('products').update({ deleted_at: new Date().toISOString(), status: 'archived' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useFavorites() {
  const { active } = useCurrentWorkspace();
  const wsId = active?.id;
  return useQuery({
    queryKey: ['product_favorites', wsId],
    enabled: !!wsId,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await sbAny(db).from('product_favorites').select('product_id').eq('workspace_id', wsId);
      if (error) throw error;
      return new Set((data ?? []).map((f: { product_id: string }) => f.product_id));
    },
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async ({ productId, favored }: { productId: string; favored: boolean }) => {
      if (!active?.id) throw new Error('No workspace');
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error('Not authenticated');
      if (favored) {
        await sbAny(db).from('product_favorites').delete().eq('product_id', productId).eq('user_id', uid);
      } else {
        await sbAny(db).from('product_favorites').insert({ product_id: productId, user_id: uid, workspace_id: active.id });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product_favorites'] }),
  });
}

export function useProductVariants(parentId: string | undefined) {
  return useQuery({
    queryKey: ['product_variants', parentId],
    enabled: !!parentId,
    queryFn: async (): Promise<ProductRow[]> => {
      const { data, error } = await sbAny(db).from('products').select('*').eq('parent_product_id', parentId).is('deleted_at', null).order('name');
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });
}

export type BundleItemRow = {
  id: string;
  bundle_id: string;
  product_id: string;
  quantity: number;
  discount_pct: number;
  sort_order: number;
};

export function useBundleItems(bundleId: string | undefined) {
  return useQuery({
    queryKey: ['bundle_items', bundleId],
    enabled: !!bundleId,
    queryFn: async (): Promise<BundleItemRow[]> => {
      const { data, error } = await sbAny(db).from('product_bundle_items').select('*').eq('bundle_id', bundleId).order('sort_order');
      if (error) throw error;
      return (data ?? []) as BundleItemRow[];
    },
  });
}

export function useAddBundleItem() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: { bundle_id: string; product_id: string; quantity?: number; discount_pct?: number }) => {
      if (!active?.id) throw new Error('No workspace');
      const { error } = await sbAny(db).from('product_bundle_items').insert({ ...input, workspace_id: active.id });
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['bundle_items', v.bundle_id] }),
  });
}

export function useRemoveBundleItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; bundleId: string }) => {
      const { error } = await sbAny(db).from('product_bundle_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['bundle_items', v.bundleId] }),
  });
}

export type ProductAttachmentRow = {
  id: string;
  product_id: string;
  name: string;
  url: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export function useProductAttachments(productId: string | undefined) {
  return useQuery({
    queryKey: ['product_attachments', productId],
    enabled: !!productId,
    queryFn: async (): Promise<ProductAttachmentRow[]> => {
      const { data, error } = await sbAny(db).from('product_attachments').select('*').eq('product_id', productId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProductAttachmentRow[];
    },
  });
}

export function useAddProductAttachment() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: { product_id: string; name: string; url: string; mime_type?: string; size_bytes?: number }) => {
      if (!active?.id) throw new Error('No workspace');
      const { error } = await sbAny(db).from('product_attachments').insert({ ...input, workspace_id: active.id });
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['product_attachments', v.product_id] }),
  });
}

export function useDeleteProductAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; productId: string }) => {
      const { error } = await sbAny(db).from('product_attachments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['product_attachments', v.productId] }),
  });
}

// ------- Brands -------
export type BrandRow = {
  id: string;
  workspace_id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export function useBrands() {
  const { active } = useCurrentWorkspace();
  const wsId = active?.id;
  return useQuery({
    queryKey: ['commerce_brands', wsId],
    enabled: !!wsId,
    queryFn: async (): Promise<BrandRow[]> => {
      const { data, error } = await sbAny(db).from('commerce_brands').select('*').eq('workspace_id', wsId).order('name');
      if (error) throw error;
      return (data ?? []) as BrandRow[];
    },
  });
}

export function useUpsertBrand() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: Partial<BrandRow> & { name: string; id?: string }) => {
      if (!active?.id) throw new Error('No workspace');
      const { id, ...rest } = input;
      const payload = { ...rest, workspace_id: active.id };
      const q = id
        ? sbAny(db).from('commerce_brands').update(payload).eq('id', id).select('*').single()
        : sbAny(db).from('commerce_brands').insert(payload).select('*').single();
      const { data, error } = await q;
      if (error) throw error;
      return data as BrandRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commerce_brands'] }),
  });
}

export function useDeleteBrand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny(db).from('commerce_brands').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commerce_brands'] }),
  });
}

// ------- Variants (dedicated) -------
export type VariantRow = {
  id: string;
  workspace_id: string;
  product_id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  options: Record<string, string>;
  price: number | null;
  sale_price: number | null;
  cost: number | null;
  stock_quantity: number;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export function useVariants(productId: string | undefined) {
  return useQuery({
    queryKey: ['product_variants_v2', productId],
    enabled: !!productId,
    queryFn: async (): Promise<VariantRow[]> => {
      const { data, error } = await sbAny(db).from('product_variants').select('*').eq('product_id', productId).order('created_at');
      if (error) throw error;
      return (data ?? []) as VariantRow[];
    },
  });
}

export function useUpsertVariant() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: Partial<VariantRow> & { product_id: string; name: string; id?: string }) => {
      if (!active?.id) throw new Error('No workspace');
      const { id, ...rest } = input;
      const payload = { ...rest, workspace_id: active.id };
      const q = id
        ? sbAny(db).from('product_variants').update(payload).eq('id', id).select('*').single()
        : sbAny(db).from('product_variants').insert(payload).select('*').single();
      const { data, error } = await q;
      if (error) throw error;
      return data as VariantRow;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['product_variants_v2', v.product_id] }),
  });
}

export function useDeleteVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; productId: string }) => {
      const { error } = await sbAny(db).from('product_variants').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['product_variants_v2', v.productId] }),
  });
}

// CSV Import / Export
export function productsToCsv(rows: ProductRow[]): string {
  const cols = ['name', 'sku', 'barcode', 'kind', 'product_type', 'category', 'price', 'sale_price', 'cost', 'currency', 'tax_rate', 'is_taxable', 'stock_quantity', 'track_inventory', 'low_stock_threshold', 'unit', 'availability', 'is_featured', 'status', 'description'];
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const header = cols.join(',');
  const body = rows.map((r) => cols.map((c) => escape((r as Record<string, unknown>)[c])).join(',')).join('\n');
  return `${header}\n${body}`;
}

export function parseProductsCsv(text: string): Array<Partial<ProductRow>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const numFields = new Set(['price', 'sale_price', 'tax_rate', 'stock_quantity', 'cost', 'low_stock_threshold']);
  const boolFields = new Set(['is_taxable', 'track_inventory', 'is_featured']);
  return lines.slice(1).map((line) => {
    const cells: string[] = [];
    let cur = ''; let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { quoted = false; }
        else cur += ch;
      } else {
        if (ch === ',') { cells.push(cur); cur = ''; }
        else if (ch === '"' && cur === '') { quoted = true; }
        else cur += ch;
      }
    }
    cells.push(cur);
    const rec: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      const v = (cells[i] ?? '').trim();
      if (v === '') return;
      if (numFields.has(h)) rec[h] = Number(v);
      else if (boolFields.has(h)) rec[h] = /^(true|1|yes)$/i.test(v);
      else rec[h] = v;
    });
    return rec as Partial<ProductRow>;
  });
}
