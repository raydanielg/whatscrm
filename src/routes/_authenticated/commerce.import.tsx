import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useRef, useState } from 'react';
import { AppTopbar } from '@/components/app/app-topbar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Upload, Download, FileSpreadsheet, CheckCircle2, XCircle, Loader2, AlertTriangle, Play, RotateCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentWorkspace } from '@/hooks/use-workspace';
import {
  parseCsv, toCsv,
  PRODUCT_HEADERS, PRODUCT_TEMPLATE, COLLECTION_HEADERS, COLLECTION_TEMPLATE,
  validateProductRow, validateCollectionRow,
  type ValidatedRow, type ProductParsed, type CollectionParsed,
} from '@/lib/commerce/csv-import';
import { sbAny } from "@/lib/supabase/untyped";
import { useTenantCurrency } from '@/hooks/use-currency';

export const Route = createFileRoute('/_authenticated/commerce/import')({
  component: CatalogImportPage,
  staticData: { breadcrumb: 'Catalog Import' },
  head: () => ({
    meta: [
      { title: 'Catalog CSV Import' },
      { name: 'description', content: 'Bulk import and update catalog products and collections from CSV with validation and per-row sync status.' },
    ],
  }),
});

type SyncStatus = 'pending' | 'syncing' | 'created' | 'updated' | 'skipped' | 'error';
type RowState<T> = ValidatedRow<T> & { status: SyncStatus; message?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function StatusBadge({ s }: { s: SyncStatus }) {
  const map: Record<SyncStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    pending:  { label: 'Pending',  cls: 'bg-muted text-foreground', icon: <span className="h-2 w-2 rounded-full bg-muted-foreground" /> },
    syncing:  { label: 'Syncing',  cls: 'bg-primary/10 text-primary', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    created:  { label: 'Created',  cls: 'bg-emerald-500/15 text-emerald-600', icon: <CheckCircle2 className="h-3 w-3" /> },
    updated:  { label: 'Updated',  cls: 'bg-blue-500/15 text-blue-600', icon: <CheckCircle2 className="h-3 w-3" /> },
    skipped:  { label: 'Skipped',  cls: 'bg-amber-500/15 text-amber-600', icon: <AlertTriangle className="h-3 w-3" /> },
    error:    { label: 'Error',    cls: 'bg-destructive/15 text-destructive', icon: <XCircle className="h-3 w-3" /> },
  };
  const m = map[s];
  return <Badge variant="outline" className={`gap-1 ${m.cls}`}>{m.icon}{m.label}</Badge>;
}

function CatalogImportPage() {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  const [tab, setTab] = useState<'products' | 'collections'>('products');

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <AppTopbar title="Catalog CSV Import" />
      <div className="flex-1 overflow-auto p-6">
        <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
          <Card className="p-4 flex items-start gap-3">
            <FileSpreadsheet className="h-5 w-5 text-primary mt-0.5" />
            <div className="flex-1 text-sm text-muted-foreground">
              Upload a CSV to create or update products and collections. Existing rows are matched by
              <code className="mx-1 px-1 rounded bg-muted">sku</code> for products and
              <code className="mx-1 px-1 rounded bg-muted">name</code> for collections. Each row is validated and
              synced individually so you can retry failures without re-running the whole file.
            </div>
            <Button asChild variant="outline" size="sm"><Link to="/commerce">Back to Commerce</Link></Button>
          </Card>

          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="collections">Collections</TabsTrigger>
            </TabsList>
            <TabsContent value="products" className="mt-4">
              <ProductsImportPanel workspaceId={workspaceId} />
            </TabsContent>
            <TabsContent value="collections" className="mt-4">
              <CollectionsImportPanel workspaceId={workspaceId} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function useFilePicker(onFile: (f: File) => void) {
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      type="file"
      accept=".csv,text/csv"
      className="hidden"
      onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); if (ref.current) ref.current.value = ''; }}
    />
  );
  return { input, open: () => ref.current?.click() };
}

function Toolbar({
  onOpen, onTemplate, onRun, onRetry, running, canRun, canRetry,
}: {
  onOpen: () => void; onTemplate: () => void; onRun: () => void; onRetry: () => void;
  running: boolean; canRun: boolean; canRetry: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <Button size="sm" variant="outline" onClick={onOpen}><Upload className="h-4 w-4 " />Choose CSV</Button>
      <Button size="sm" variant="outline" onClick={onTemplate}><Download className="h-4 w-4 " />Template</Button>
      <div className="flex-1" />
      <Button size="sm" variant="outline" onClick={onRetry} disabled={!canRetry || running}>
        <RotateCw className="h-4 w-4 " />Retry failed
      </Button>
      <Button size="sm" onClick={onRun} disabled={!canRun || running}>
        {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 " />}
        Run import
      </Button>
    </div>
  );
}

function Summary({ rows }: { rows: Array<{ status: SyncStatus; errors: unknown[] }> }) {
  const stats = useMemo(() => {
    const s = { total: rows.length, invalid: 0, ok: 0, err: 0, pending: 0 };
    for (const r of rows) {
      if (r.errors.length) s.invalid++;
      else if (r.status === 'created' || r.status === 'updated') s.ok++;
      else if (r.status === 'error') s.err++;
      else s.pending++;
    }
    return s;
  }, [rows]);
  const pct = stats.total ? Math.round(((stats.ok + stats.err + stats.invalid) / stats.total) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
        {[
          { l: 'Rows', v: stats.total, c: 'text-foreground' },
          { l: 'Pending', v: stats.pending, c: 'text-muted-foreground' },
          { l: 'Invalid', v: stats.invalid, c: 'text-amber-600' },
          { l: 'Success', v: stats.ok, c: 'text-emerald-600' },
          { l: 'Errors', v: stats.err, c: 'text-destructive' },
        ].map((k) => (
          <div key={k.l} className="rounded-control border p-2">
            <div className="text-xs text-muted-foreground">{k.l}</div>
            <div className={`text-2xl font-bold ${k.c}`}>{k.v}</div>
          </div>
        ))}
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}

// ============ Products ============

function ProductsImportPanel({ workspaceId }: { workspaceId?: string }) {
  // Imported rows without a currency column take the tenant currency, not USD.
  const tenantCurrency = useTenantCurrency();
  const [rows, setRows] = useState<Array<RowState<ProductParsed>>>([]);
  const [fileName, setFileName] = useState<string>('');
  const [running, setRunning] = useState(false);

  const { input, open } = useFilePicker(async (f) => {
    setFileName(f.name);
    const text = await f.text();
    const { rows: parsed } = parseCsv(text);
    if (!parsed.length) { toast.error('No rows found in CSV'); return; }
    const validated: Array<RowState<ProductParsed>> = parsed.map((r, i) => ({
      ...validateProductRow(r, i),
      status: 'pending',
    }));
    setRows(validated);
    const invalid = validated.filter((r) => r.errors.length).length;
    toast.success(`Parsed ${validated.length} rows${invalid ? ` (${invalid} invalid)` : ''}`);
  });

  const runOnce = async (idx: number) => {
    if (!workspaceId) return;
    const row = rows[idx];
    if (!row?.parsed) return;
    setRows((cur) => cur.map((r, i) => i === idx ? { ...r, status: 'syncing', message: undefined } : r));
    try {
      const p = row.parsed;
      // Resolve category by name (create if missing)
      let categoryId: string | null = null;
      if (p.category) {
        const { data: cat } = await sbAny(db).from('product_categories')
          .select('id').eq('workspace_id', workspaceId).eq('name', p.category).maybeSingle();
        if (cat?.id) categoryId = cat.id;
        else {
          const { data: created } = await sbAny(db).from('product_categories')
            .insert({ workspace_id: workspaceId, name: p.category }).select('id').single();
          categoryId = created?.id ?? null;
        }
      }

      const payload: Record<string, unknown> = {
        workspace_id: workspaceId,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        kind: p.kind,
        category_id: categoryId,
        price: p.price ?? 0,
        sale_price: p.sale_price,
        cost: p.cost,
        currency: p.currency ?? tenantCurrency,
        tax_rate: p.tax_rate,
        is_taxable: p.is_taxable ?? false,
        stock_quantity: p.stock_quantity,
        track_inventory: p.track_inventory ?? false,
        low_stock_threshold: p.low_stock_threshold,
        unit: p.unit,
        availability: p.availability,
        is_featured: p.is_featured ?? false,
        status: p.status ?? 'active',
        description: p.description,
      };
      // Strip nulls to preserve defaults on insert
      Object.keys(payload).forEach((k) => payload[k] === null && delete payload[k]);

      let action: SyncStatus = 'created';
      let existingId: string | null = null;
      if (p.sku) {
        const { data: found } = await sbAny(db).from('products')
          .select('id').eq('workspace_id', workspaceId).eq('sku', p.sku).is('deleted_at', null).maybeSingle();
        existingId = found?.id ?? null;
      }
      if (existingId) {
        const { error } = await sbAny(db).from('products').update(payload).eq('id', existingId);
        if (error) throw error;
        action = 'updated';
      } else {
        const { error } = await sbAny(db).from('products').insert(payload);
        if (error) throw error;
        action = 'created';
      }
      setRows((cur) => cur.map((r, i) => i === idx ? { ...r, status: action } : r));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setRows((cur) => cur.map((r, i) => i === idx ? { ...r, status: 'error', message: msg } : r));
    }
  };

  const runAll = async (onlyIdx?: number[]) => {
    if (!workspaceId) { toast.error('No workspace selected'); return; }
    const targets = onlyIdx ?? rows.map((_, i) => i).filter((i) => rows[i].parsed && rows[i].status !== 'created' && rows[i].status !== 'updated');
    if (!targets.length) { toast.info('Nothing to sync'); return; }
    setRunning(true);
    // Mark invalid rows as skipped
    setRows((cur) => cur.map((r) => r.errors.length ? { ...r, status: 'skipped', message: r.errors.map((e) => `${e.field}: ${e.message}`).join('; ') } : r));
    for (const i of targets) await runOnce(i);
    setRunning(false);
    toast.success('Import complete');
  };

  const failedIdx = rows.map((r, i) => (r.status === 'error' ? i : -1)).filter((i) => i >= 0);
  const canRun = rows.some((r) => r.parsed && r.status === 'pending');

  const exportReport = () => {
    if (!rows.length) return;
    const hdrs = ['index', 'status', 'message', 'errors', ...PRODUCT_HEADERS];
    const out = rows.map((r) => ({
      index: r.index + 1,
      status: r.status,
      message: r.message ?? '',
      errors: r.errors.map((e) => `${e.field}: ${e.message}`).join(' | '),
      ...r.raw,
    }));
    download(`products-import-report-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(hdrs, out));
  };

  return (
    <div className="space-y-3">
      {input}
      <Card className="p-4 space-y-3">
        <Toolbar
          onOpen={open}
          onTemplate={() => download('products-template.csv', PRODUCT_TEMPLATE)}
          onRun={() => runAll()}
          onRetry={() => runAll(failedIdx)}
          running={running}
          canRun={canRun}
          canRetry={failedIdx.length > 0}
        />
        {fileName && (
          <div className="text-xs text-muted-foreground flex items-center justify-between">
            <span>File: <span className="text-foreground">{fileName}</span></span>
            {rows.length > 0 && (
              <Button size="sm" variant="ghost" onClick={exportReport}>
                <Download className="h-4 w-4 " />Download report
              </Button>
            )}
          </div>
        )}
        {rows.length > 0 && <Summary rows={rows} />}
      </Card>

      {rows.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-2 w-12">#</th>
                  <th className="text-left p-2 w-32">Status</th>
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2">SKU</th>
                  <th className="text-left p-2">Kind</th>
                  <th className="text-right p-2">Price</th>
                  <th className="text-left p-2">Issues</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={`border-t ${r.errors.length ? 'bg-destructive/5' : ''}`}>
                    <td className="p-2 text-muted-foreground">{r.index + 1}</td>
                    <td className="p-2"><StatusBadge s={r.status} /></td>
                    <td className="p-2 font-medium">{r.raw.name || <span className="text-destructive">—</span>}</td>
                    <td className="p-2 text-muted-foreground">{r.raw.sku || '—'}</td>
                    <td className="p-2 text-muted-foreground capitalize">{r.raw.kind || 'product'}</td>
                    <td className="p-2 text-right ">{r.raw.price || '—'}</td>
                    <td className="p-2 text-xs">
                      {r.errors.length > 0 && (
                        <div className="text-destructive">{r.errors.map((e) => `${e.field}: ${e.message}`).join('; ')}</div>
                      )}
                      {r.warnings.length > 0 && (
                        <div className="text-amber-600">{r.warnings.map((e) => `${e.field}: ${e.message}`).join('; ')}</div>
                      )}
                      {r.message && !r.errors.length && (
                        <div className="text-destructive">{r.message}</div>
                      )}
                    </td>
                    <td className="p-2 text-right">
                      {r.parsed && r.status !== 'syncing' && (
                        <Button size="sm" variant="ghost" onClick={() => runOnce(i)} disabled={running}>Retry</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ============ Collections ============

function CollectionsImportPanel({ workspaceId }: { workspaceId?: string }) {
  const [rows, setRows] = useState<Array<RowState<CollectionParsed>>>([]);
  const [fileName, setFileName] = useState('');
  const [running, setRunning] = useState(false);

  const { input, open } = useFilePicker(async (f) => {
    setFileName(f.name);
    const text = await f.text();
    const { rows: parsed } = parseCsv(text);
    if (!parsed.length) { toast.error('No rows found in CSV'); return; }
    const validated = parsed.map((r, i) => ({ ...validateCollectionRow(r, i), status: 'pending' as SyncStatus }));
    setRows(validated);
    const invalid = validated.filter((r) => r.errors.length).length;
    toast.success(`Parsed ${validated.length} collections${invalid ? ` (${invalid} invalid)` : ''}`);
  });

  const runOne = async (idx: number) => {
    if (!workspaceId) return;
    const row = rows[idx];
    if (!row?.parsed) return;
    setRows((cur) => cur.map((r, i) => i === idx ? { ...r, status: 'syncing', message: undefined } : r));
    try {
      const c = row.parsed;
      const { data: existing } = await sbAny(db).from('wa_catalog_collections')
        .select('id').eq('workspace_id', workspaceId).eq('name', c.name).maybeSingle();
      const payload = {
        workspace_id: workspaceId,
        name: c.name,
        description: c.description,
        cover_url: c.cover_url,
        is_featured: c.is_featured,
        sort_order: c.sort_order,
      };
      let colId: string;
      let action: SyncStatus = 'created';
      if (existing?.id) {
        const { error } = await sbAny(db).from('wa_catalog_collections').update(payload).eq('id', existing.id);
        if (error) throw error;
        colId = existing.id;
        action = 'updated';
      } else {
        const { data: created, error } = await sbAny(db).from('wa_catalog_collections').insert(payload).select('id').single();
        if (error) throw error;
        colId = created.id;
      }

      let missingSkus: string[] = [];
      if (c.product_skus.length) {
        const { data: prods } = await sbAny(db).from('products')
          .select('id, sku').eq('workspace_id', workspaceId).in('sku', c.product_skus).is('deleted_at', null);
        const found = new Map<string, string>();
        (prods ?? []).forEach((p: { id: string; sku: string | null }) => { if (p.sku) found.set(p.sku, p.id); });
        missingSkus = c.product_skus.filter((s) => !found.has(s));

        await sbAny(db).from('wa_catalog_collection_items').delete().eq('collection_id', colId);
        const items = c.product_skus
          .map((s, i) => ({ collection_id: colId, product_id: found.get(s), workspace_id: workspaceId, sort_order: i }))
          .filter((x) => !!x.product_id);
        if (items.length) {
          const { error } = await sbAny(db).from('wa_catalog_collection_items').insert(items);
          if (error) throw error;
        }
      }

      const msg = missingSkus.length ? `Unknown SKUs skipped: ${missingSkus.join(', ')}` : undefined;
      setRows((cur) => cur.map((r, i) => i === idx ? { ...r, status: action, message: msg } : r));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setRows((cur) => cur.map((r, i) => i === idx ? { ...r, status: 'error', message: msg } : r));
    }
  };

  const runAll = async (onlyIdx?: number[]) => {
    if (!workspaceId) { toast.error('No workspace selected'); return; }
    const targets = onlyIdx ?? rows.map((_, i) => i).filter((i) => rows[i].parsed && rows[i].status !== 'created' && rows[i].status !== 'updated');
    if (!targets.length) { toast.info('Nothing to sync'); return; }
    setRunning(true);
    setRows((cur) => cur.map((r) => r.errors.length ? { ...r, status: 'skipped', message: r.errors.map((e) => `${e.field}: ${e.message}`).join('; ') } : r));
    for (const i of targets) await runOne(i);
    setRunning(false);
    toast.success('Import complete');
  };

  const failedIdx = rows.map((r, i) => (r.status === 'error' ? i : -1)).filter((i) => i >= 0);
  const canRun = rows.some((r) => r.parsed && r.status === 'pending');

  const exportReport = () => {
    if (!rows.length) return;
    const hdrs = ['index', 'status', 'message', 'errors', ...COLLECTION_HEADERS];
    const out = rows.map((r) => ({
      index: r.index + 1,
      status: r.status,
      message: r.message ?? '',
      errors: r.errors.map((e) => `${e.field}: ${e.message}`).join(' | '),
      ...r.raw,
    }));
    download(`collections-import-report-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(hdrs, out));
  };

  return (
    <div className="space-y-3">
      {input}
      <Card className="p-4 space-y-3">
        <Toolbar
          onOpen={open}
          onTemplate={() => download('collections-template.csv', COLLECTION_TEMPLATE)}
          onRun={() => runAll()}
          onRetry={() => runAll(failedIdx)}
          running={running}
          canRun={canRun}
          canRetry={failedIdx.length > 0}
        />
        {fileName && (
          <div className="text-xs text-muted-foreground flex items-center justify-between">
            <span>File: <span className="text-foreground">{fileName}</span></span>
            {rows.length > 0 && (
              <Button size="sm" variant="ghost" onClick={exportReport}>
                <Download className="h-4 w-4 " />Download report
              </Button>
            )}
          </div>
        )}
        {rows.length > 0 && <Summary rows={rows} />}
      </Card>

      {rows.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-2 w-12">#</th>
                  <th className="text-left p-2 w-32">Status</th>
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2">Products</th>
                  <th className="text-left p-2">Featured</th>
                  <th className="text-left p-2">Issues</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={`border-t ${r.errors.length ? 'bg-destructive/5' : ''}`}>
                    <td className="p-2 text-muted-foreground">{r.index + 1}</td>
                    <td className="p-2"><StatusBadge s={r.status} /></td>
                    <td className="p-2 font-medium">{r.raw.name || <span className="text-destructive">—</span>}</td>
                    <td className="p-2 text-muted-foreground">{r.parsed?.product_skus.length ?? 0}</td>
                    <td className="p-2 text-muted-foreground">{r.raw.is_featured || '—'}</td>
                    <td className="p-2 text-xs">
                      {r.errors.length > 0 && (
                        <div className="text-destructive">{r.errors.map((e) => `${e.field}: ${e.message}`).join('; ')}</div>
                      )}
                      {r.message && (
                        <div className={r.status === 'error' ? 'text-destructive' : 'text-amber-600'}>{r.message}</div>
                      )}
                    </td>
                    <td className="p-2 text-right">
                      {r.parsed && r.status !== 'syncing' && (
                        <Button size="sm" variant="ghost" onClick={() => runOne(i)} disabled={running}>Retry</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
