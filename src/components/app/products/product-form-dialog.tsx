import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextarea } from '@/shared/components/rich-textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Trash2, ImagePlus, X } from 'lucide-react';
import { useTenantCurrency } from '@/hooks/use-currency';
import {
  useProductCategories, useUpsertProduct, useProducts, useProductAttachments,
  useAddProductAttachment, useDeleteProductAttachment, useBundleItems, useAddBundleItem, useRemoveBundleItem,
  useBrands, useVariants, useUpsertVariant, useDeleteVariant,
  type ProductRow, type VariantRow,
} from '@/hooks/use-products';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product?: ProductRow | null;
};

const DEFAULT_FORM: Partial<ProductRow> = {
  kind: 'product',
  product_type: 'physical',
  name: '',
  sku: '',
  barcode: '',
  price: 0,
  sale_price: null,
  currency: 'USD',
  tax_rate: 0,
  is_taxable: false,
  track_inventory: false,
  stock_quantity: 0,
  low_stock_threshold: 0,
  unit: 'unit',
  status: 'active',
  availability: 'in_stock',
  is_featured: false,
  description: '',
  category_id: null,
  brand_id: null,
  images: [],
  gallery: [],
  videos: [],
  tags: [],
  attributes: {},
  custom_fields: {},
};

export function ProductFormDialog({ open, onOpenChange, product }: Props) {
  // A new product is priced in the tenant's currency, not dollars. DEFAULT_FORM
  // is module scope so the override happens here, where the hook can be read.
  const tenantCurrency = useTenantCurrency();
  const upsert = useUpsertProduct();
  const { data: cats } = useProductCategories();
  const { data: brands } = useBrands();
  const { data: allProducts } = useProducts({});
  const isEdit = !!product?.id;

  const [form, setForm] = useState<Partial<ProductRow>>({ ...DEFAULT_FORM, currency: tenantCurrency });
  const [imageInput, setImageInput] = useState('');
  const [videoInput, setVideoInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [attrKey, setAttrKey] = useState('');
  const [attrVal, setAttrVal] = useState('');
  const [cfKey, setCfKey] = useState('');
  const [cfVal, setCfVal] = useState('');

  useEffect(() => {
    if (open) {
      setForm(
        product
          ? { ...DEFAULT_FORM, ...product, currency: product.currency ?? tenantCurrency }
          : { ...DEFAULT_FORM, currency: tenantCurrency },
      );
      setImageInput(''); setVideoInput(''); setTagInput('');
      setAttrKey(''); setAttrVal(''); setCfKey(''); setCfVal('');
    }
  }, [open, product, tenantCurrency]);

  const set = <K extends keyof ProductRow>(k: K, v: ProductRow[K]) => setForm((p) => ({ ...p, [k]: v }));
  const images = (form.images as string[] | undefined) ?? [];
  const gallery = (form.gallery as string[] | undefined) ?? [];
  const videos = (form.videos as string[] | undefined) ?? [];
  const tags = (form.tags as string[] | undefined) ?? [];
  const attrs = (form.attributes as Record<string, unknown> | undefined) ?? {};
  const customFields = (form.custom_fields as Record<string, unknown> | undefined) ?? {};

  const submit = async () => {
    if (!form.name?.trim()) { toast.error('Name is required'); return; }
    if (form.name.length > 200) { toast.error('Name too long'); return; }
    try {
      await upsert.mutateAsync({
        ...(product?.id ? { id: product.id } : {}),
        ...form,
        name: form.name.trim(),
      } as Partial<ProductRow> & { name: string });
      toast.success(isEdit ? 'Product updated' : 'Product created');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit product' : 'New product'}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general">
          <TabsList className="flex-wrap  ">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="pricing">Pricing & Tax</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="media">Media</TabsTrigger>
            <TabsTrigger value="attributes">Attributes</TabsTrigger>
            <TabsTrigger value="tags">Tags</TabsTrigger>
            <TabsTrigger value="custom">Custom fields</TabsTrigger>
            {isEdit && <TabsTrigger value="variants">Variants</TabsTrigger>}
            {isEdit && form.kind === 'bundle' && <TabsTrigger value="bundle">Bundle items</TabsTrigger>}
            {isEdit && <TabsTrigger value="attachments">Attachments</TabsTrigger>}
          </TabsList>

          <TabsContent value="general" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Name *</Label>
                <Input value={form.name ?? ''} maxLength={200} onChange={(e) => set('name', e.target.value)} />
              </div>
              <div>
                <Label>Kind</Label>
                <Select value={form.kind ?? 'product'} onValueChange={(v) => set('kind', v as ProductRow['kind'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product">Product</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                    <SelectItem value="subscription">Subscription</SelectItem>
                    <SelectItem value="bundle">Bundle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.product_type ?? 'physical'} onValueChange={(v) => set('product_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="physical">Physical</SelectItem>
                    <SelectItem value="digital">Digital</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status ?? 'active'} onValueChange={(v) => set('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Availability</Label>
                <Select value={form.availability ?? 'in_stock'} onValueChange={(v) => set('availability', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_stock">In stock</SelectItem>
                    <SelectItem value="out_of_stock">Out of stock</SelectItem>
                    <SelectItem value="preorder">Preorder</SelectItem>
                    <SelectItem value="discontinued">Discontinued</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>SKU</Label>
                <Input value={form.sku ?? ''} maxLength={80} onChange={(e) => set('sku', e.target.value)} />
              </div>
              <div>
                <Label>Barcode</Label>
                <Input value={form.barcode ?? ''} maxLength={80} onChange={(e) => set('barcode', e.target.value)} placeholder="EAN / UPC / ISBN" />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category_id ?? 'none'} onValueChange={(v) => set('category_id', v === 'none' ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Uncategorized" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Uncategorized</SelectItem>
                    {(cats ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Brand</Label>
                <Select value={form.brand_id ?? 'none'} onValueChange={(v) => set('brand_id', v === 'none' ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="No brand" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No brand</SelectItem>
                    {(brands ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 flex items-center gap-3">
                <Switch checked={!!form.is_featured} onCheckedChange={(v) => set('is_featured', v)} />
                <Label>Featured product</Label>
              </div>
              {form.kind !== 'bundle' && (
                <div className="col-span-2">
                  <Label>Parent product (variant of)</Label>
                  <Select value={form.parent_product_id ?? 'none'} onValueChange={(v) => {
                    const parent = v === 'none' ? null : v;
                    set('parent_product_id', parent);
                    set('is_variant', !!parent);
                  }}>
                    <SelectTrigger><SelectValue placeholder="None (standalone)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (standalone)</SelectItem>
                      {(allProducts ?? []).filter((p) => p.id !== product?.id && !p.is_variant).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="col-span-2">
                <Label>Description</Label>
                <RichTextarea value={form.description ?? ''} maxLength={4000} rows={5} onChange={(value) => set('description', value)} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="pricing" className="space-y-4 pt-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Price</Label>
                <Input type="number" step="0.01" value={form.price ?? 0} onChange={(e) => set('price', Number(e.target.value))} />
              </div>
              <div>
                <Label>Sale price</Label>
                <Input type="number" step="0.01" value={form.sale_price ?? ''} onChange={(e) => set('sale_price', e.target.value === '' ? null : Number(e.target.value))} placeholder="Optional" />
              </div>
              <div>
                <Label>Cost price</Label>
                <Input type="number" step="0.01" value={form.cost ?? 0} onChange={(e) => set('cost', Number(e.target.value))} />
              </div>
              <div>
                <Label>Currency</Label>
                <Input value={form.currency ?? tenantCurrency} maxLength={4} onChange={(e) => set('currency', e.target.value.toUpperCase())} />
              </div>
              <div>
                <Label>Unit</Label>
                <Input value={form.unit ?? ''} onChange={(e) => set('unit', e.target.value)} placeholder="unit, hour, month" />
              </div>
              <div>
                <Label>Tax rate (%)</Label>
                <Input type="number" step="0.01" value={form.tax_rate ?? 0} onChange={(e) => set('tax_rate', Number(e.target.value))} />
              </div>
              <div className="flex items-center gap-3 pt-6 col-span-3">
                <Switch checked={!!form.is_taxable} onCheckedChange={(v) => set('is_taxable', v)} />
                <Label>Taxable</Label>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="inventory" className="space-y-4 pt-4">
            <div className="flex items-center gap-3">
              <Switch checked={!!form.track_inventory} onCheckedChange={(v) => set('track_inventory', v)} />
              <Label>Track inventory</Label>
            </div>
            {form.track_inventory && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Stock quantity</Label>
                  <Input type="number" value={form.stock_quantity ?? 0} onChange={(e) => set('stock_quantity', Number(e.target.value))} />
                </div>
                <div>
                  <Label>Low stock threshold</Label>
                  <Input type="number" value={form.low_stock_threshold ?? 0} onChange={(e) => set('low_stock_threshold', Number(e.target.value))} />
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="media" className="space-y-6 pt-4">
            <MediaListEditor label="Images / gallery" placeholder="https://image.jpg" items={images} onChange={(v) => set('images', v as unknown as ProductRow['images'])} input={imageInput} setInput={setImageInput} preview="image" />
            <MediaListEditor label="Additional gallery" placeholder="https://image.jpg" items={gallery} onChange={(v) => setForm((p) => ({ ...p, gallery: v }))} input={''} setInput={() => {}} preview="image" inlineInput />
            <MediaListEditor label="Videos" placeholder="https://youtu.be/... or https://cdn/video.mp4" items={videos} onChange={(v) => setForm((p) => ({ ...p, videos: v }))} input={videoInput} setInput={setVideoInput} preview="video" />
          </TabsContent>

          <TabsContent value="attributes" className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">Key/value attributes like Color: Red, Material: Cotton, Warranty: 2 years.</p>
            <div className="flex gap-2">
              <Input placeholder="Attribute name" value={attrKey} onChange={(e) => setAttrKey(e.target.value)} />
              <Input placeholder="Value" value={attrVal} onChange={(e) => setAttrVal(e.target.value)} />
              <Button type="button" onClick={() => {
                const k = attrKey.trim(); const v = attrVal.trim();
                if (!k || !v) return;
                set('attributes', { ...attrs, [k]: v } as unknown as ProductRow['attributes']);
                setAttrKey(''); setAttrVal('');
              }}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-1">
              {Object.entries(attrs).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded-control border px-3 py-2 text-sm">
                  <div><span className="font-medium">{k}:</span> {String(v)}</div>
                  <Button size="icon" variant="ghost" onClick={() => {
                    const next = { ...attrs }; delete next[k];
                    set('attributes', next as unknown as ProductRow['attributes']);
                  }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              {Object.keys(attrs).length === 0 && <div className="text-sm text-muted-foreground">No attributes yet.</div>}
            </div>
          </TabsContent>

          <TabsContent value="tags" className="space-y-4 pt-4">
            <div className="flex gap-2">
              <Input placeholder="Add tag" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const t = tagInput.trim();
                    if (t && !tags.includes(t)) set('tags', [...tags, t] as unknown as ProductRow['tags']);
                    setTagInput('');
                  }
                }} />
              <Button type="button" onClick={() => {
                const t = tagInput.trim();
                if (t && !tags.includes(t)) set('tags', [...tags, t] as unknown as ProductRow['tags']);
                setTagInput('');
              }}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1">
                  {t}
                  <button className="ml-1" onClick={() => set('tags', tags.filter((x) => x !== t) as unknown as ProductRow['tags'])}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {tags.length === 0 && <div className="text-sm text-muted-foreground">No tags yet.</div>}
            </div>
          </TabsContent>

          <TabsContent value="custom" className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">Custom fields specific to your workflow.</p>
            <div className="flex gap-2">
              <Input placeholder="Field name" value={cfKey} onChange={(e) => setCfKey(e.target.value)} />
              <Input placeholder="Value" value={cfVal} onChange={(e) => setCfVal(e.target.value)} />
              <Button type="button" onClick={() => {
                const k = cfKey.trim(); const v = cfVal.trim();
                if (!k) return;
                set('custom_fields', { ...customFields, [k]: v } as unknown as ProductRow['custom_fields']);
                setCfKey(''); setCfVal('');
              }}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-1">
              {Object.entries(customFields).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded-control border px-3 py-2 text-sm">
                  <div><span className="font-medium">{k}:</span> {String(v)}</div>
                  <Button size="icon" variant="ghost" onClick={() => {
                    const next = { ...customFields }; delete next[k];
                    set('custom_fields', next as unknown as ProductRow['custom_fields']);
                  }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              {Object.keys(customFields).length === 0 && <div className="text-sm text-muted-foreground">No custom fields yet.</div>}
            </div>
          </TabsContent>

          {isEdit && <VariantsEditor productId={product!.id} />}
          {isEdit && form.kind === 'bundle' && <BundleEditor bundleId={product!.id} />}
          {isEdit && <AttachmentsEditor productId={product!.id} />}
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={upsert.isPending}>{isEdit ? 'Save changes' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MediaListEditor({
  label, placeholder, items, onChange, input, setInput, preview, inlineInput,
}: {
  label: string; placeholder: string; items: string[];
  onChange: (v: string[]) => void;
  input: string; setInput: (v: string) => void;
  preview: 'image' | 'video'; inlineInput?: boolean;
}) {
  const [local, setLocal] = useState('');
  const value = inlineInput ? local : input;
  const setValue = inlineInput ? setLocal : setInput;
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
        <Button type="button" variant="secondary" onClick={() => {
          const u = value.trim();
          if (!u) return;
          try { new URL(u); } catch { toast.error('Invalid URL'); return; }
          onChange([...items, u]);
          setValue('');
        }}><ImagePlus className="h-4 w-4" /></Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {items.map((url, i) => (
          <div key={`${url}-${i}`} className="relative group aspect-square rounded-control border overflow-hidden bg-muted">
            {preview === 'image' ? (
              <img src={url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="p-2 text-xs break-all">{url}</div>
            )}
            <Button size="icon" variant="destructive" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition"
              onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function VariantsEditor({ productId }: { productId: string }) {
  const { data: variants } = useVariants(productId);
  const upsert = useUpsertVariant();
  const del = useDeleteVariant();
  const [draft, setDraft] = useState<Partial<VariantRow>>({ name: '', sku: '', price: null, stock_quantity: 0, options: {} });
  const [optKey, setOptKey] = useState('');
  const [optVal, setOptVal] = useState('');

  const opts = (draft.options as Record<string, string>) ?? {};

  return (
    <TabsContent value="variants" className="space-y-4 pt-4">
      <div className="rounded-control border p-3 space-y-2">
        <div className="grid grid-cols-4 gap-2">
          <Input placeholder="Variant name *" value={draft.name ?? ''} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          <Input placeholder="SKU" value={draft.sku ?? ''} onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))} />
          <Input type="number" step="0.01" placeholder="Price" value={draft.price ?? ''} onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value === '' ? null : Number(e.target.value) }))} />
          <Input type="number" placeholder="Stock" value={draft.stock_quantity ?? 0} onChange={(e) => setDraft((d) => ({ ...d, stock_quantity: Number(e.target.value) }))} />
        </div>
        <div className="flex gap-2">
          <Input placeholder="Option (e.g. Color)" value={optKey} onChange={(e) => setOptKey(e.target.value)} />
          <Input placeholder="Value (e.g. Red)" value={optVal} onChange={(e) => setOptVal(e.target.value)} />
          <Button type="button" variant="secondary" onClick={() => {
            const k = optKey.trim(); const v = optVal.trim();
            if (!k || !v) return;
            setDraft((d) => ({ ...d, options: { ...(d.options as Record<string, string> ?? {}), [k]: v } }));
            setOptKey(''); setOptVal('');
          }}><Plus className="h-4 w-4" /></Button>
        </div>
        {Object.keys(opts).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {Object.entries(opts).map(([k, v]) => (
              <Badge key={k} variant="secondary">{k}: {v}</Badge>
            ))}
          </div>
        )}
        <Button size="sm" onClick={async () => {
          if (!draft.name?.trim()) { toast.error('Variant name required'); return; }
          await upsert.mutateAsync({ ...draft, product_id: productId, name: draft.name.trim() } as Partial<VariantRow> & { product_id: string; name: string });
          setDraft({ name: '', sku: '', price: null, stock_quantity: 0, options: {} });
          toast.success('Variant added');
        }}><Plus className="h-4 w-4 " /> Add variant</Button>
      </div>
      <div className="space-y-1">
        {(variants ?? []).map((v) => (
          <div key={v.id} className="flex items-center justify-between rounded-control border px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="font-medium truncate">{v.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {v.sku ? `SKU ${v.sku} • ` : ''}
                {v.price != null ? `${v.price} • ` : ''}
                Stock {v.stock_quantity}
                {Object.keys(v.options ?? {}).length > 0 ? ` • ${Object.entries(v.options).map(([k, x]) => `${k}: ${x}`).join(', ')}` : ''}
              </div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => del.mutate({ id: v.id, productId })}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        {(variants ?? []).length === 0 && <div className="text-sm text-muted-foreground">No variants yet.</div>}
      </div>
    </TabsContent>
  );
}

function BundleEditor({ bundleId }: { bundleId: string }) {
  const { data: items } = useBundleItems(bundleId);
  const { data: products } = useProducts({});
  const add = useAddBundleItem();
  const remove = useRemoveBundleItem();
  const [pid, setPid] = useState<string>('');
  const [qty, setQty] = useState<number>(1);
  const map = new Map((products ?? []).map((p) => [p.id, p]));

  return (
    <TabsContent value="bundle" className="space-y-4 pt-4">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label>Add product</Label>
          <Select value={pid} onValueChange={setPid}>
            <SelectTrigger><SelectValue placeholder="Choose product" /></SelectTrigger>
            <SelectContent>
              {(products ?? []).filter((p) => p.id !== bundleId && p.kind !== 'bundle').map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-24">
          <Label>Qty</Label>
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
        </div>
        <Button onClick={async () => {
          if (!pid) return;
          await add.mutateAsync({ bundle_id: bundleId, product_id: pid, quantity: qty });
          setPid(''); setQty(1);
        }}><Plus className="h-4 w-4" /></Button>
      </div>
      <div className="space-y-1">
        {(items ?? []).map((it) => {
          const p = map.get(it.product_id);
          return (
            <div key={it.id} className="flex items-center justify-between rounded-control border px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{p?.name ?? 'Unknown'}</div>
                <div className="text-xs text-muted-foreground">Qty {it.quantity}</div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove.mutate({ id: it.id, bundleId })}><Trash2 className="h-4 w-4" /></Button>
            </div>
          );
        })}
        {(items ?? []).length === 0 && <div className="text-sm text-muted-foreground">No items in this bundle yet.</div>}
      </div>
    </TabsContent>
  );
}

function AttachmentsEditor({ productId }: { productId: string }) {
  const { data: atts } = useProductAttachments(productId);
  const add = useAddProductAttachment();
  const remove = useDeleteProductAttachment();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  return (
    <TabsContent value="attachments" className="space-y-4 pt-4">
      <div className="grid grid-cols-2 gap-2 items-end">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Label>URL</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
          </div>
          <Button onClick={async () => {
            const n = name.trim(); const u = url.trim();
            if (!n || !u) return;
            try { new URL(u); } catch { toast.error('Invalid URL'); return; }
            await add.mutateAsync({ product_id: productId, name: n, url: u });
            setName(''); setUrl('');
          }}><Plus className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="space-y-1">
        {(atts ?? []).map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-control border px-3 py-2 text-sm">
            <a href={a.url} target="_blank" rel="noreferrer noopener" className="font-medium hover:underline truncate">{a.name}</a>
            <Button size="icon" variant="ghost" onClick={() => remove.mutate({ id: a.id, productId })}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        {(atts ?? []).length === 0 && <div className="text-sm text-muted-foreground">No attachments yet.</div>}
      </div>
    </TabsContent>
  );
}
