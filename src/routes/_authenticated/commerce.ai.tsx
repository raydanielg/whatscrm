import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { AppTopbar } from '@/components/app/app-topbar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Search, ShoppingCart, TrendingUp, Users, Package, MessageCircle, DollarSign, Send } from 'lucide-react';
import { useCurrentWorkspace } from '@/hooks/use-workspace';
import {
  getProductRecommendations,
  shoppingAssistantReply,
  naturalLanguageSearch,
  predictRevenue,
  listAbandonedCarts,
  draftAbandonedCartRecovery,
} from '@/lib/commerce/ai-commerce.functions';
import { toast } from 'sonner';
import { useTenantCurrency } from "@/hooks/use-currency";

export const Route = createFileRoute('/_authenticated/commerce/ai')({
  component: AiCommercePage,
  staticData: { breadcrumb: 'AI Commerce' },
  head: () => ({
    meta: [
      { title: 'AI Commerce' },
      { name: 'description', content: 'AI-powered recommendations, search, forecasting, and cart recovery for your commerce store.' },
    ],
  }),
});

type ChatMsg = { role: 'user' | 'assistant'; content: string; productIds?: string[] };

function AiCommercePage() {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id ?? '';

  return (
    <>
      <AppTopbar title="AI Commerce" />
      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <p className="text-sm text-muted-foreground">
            AI-powered merchandising: recommendations, search, forecasts, and abandoned cart recovery — grounded in your live catalog and order history.
          </p>
        </div>

        <Tabs defaultValue="recommend" className="space-y-4">
          <TabsList className="flex-wrap  ">
            <TabsTrigger value="recommend"><Package className="h-4 w-4 " />Recommendations</TabsTrigger>
            <TabsTrigger value="assistant"><MessageCircle className="h-4 w-4 " />Shopping Assistant</TabsTrigger>
            <TabsTrigger value="search"><Search className="h-4 w-4 " />Smart Search</TabsTrigger>
            <TabsTrigger value="forecast"><TrendingUp className="h-4 w-4 " />Revenue Forecast</TabsTrigger>
            <TabsTrigger value="abandoned"><ShoppingCart className="h-4 w-4 " />Cart Recovery</TabsTrigger>
          </TabsList>

          <TabsContent value="recommend"><RecommendationsTab workspaceId={workspaceId} /></TabsContent>
          <TabsContent value="assistant"><AssistantTab workspaceId={workspaceId} /></TabsContent>
          <TabsContent value="search"><SearchTab workspaceId={workspaceId} /></TabsContent>
          <TabsContent value="forecast"><ForecastTab workspaceId={workspaceId} /></TabsContent>
          <TabsContent value="abandoned"><AbandonedCartsTab workspaceId={workspaceId} /></TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function RecommendationsTab({ workspaceId }: { workspaceId: string }) {
  const [seed, setSeed] = useState('');
  const [contactId, setContactId] = useState('');
  const runFn = useServerFn(getProductRecommendations);
  const mut = useMutation({
    mutationFn: () => runFn({ data: {
      workspaceId,
      seedProductIds: seed.split(',').map((s) => s.trim()).filter(Boolean),
      contactId: contactId.trim() || null,
      goal: 'all',
      limit: 6,
    } }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-5 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input placeholder="Seed product IDs (comma separated)" value={seed} onChange={(e) => setSeed(e.target.value)} />
        <Input placeholder="Customer contact ID (optional)" value={contactId} onChange={(e) => setContactId(e.target.value)} />
        <Button onClick={() => mut.mutate()} disabled={!workspaceId || mut.isPending}>
          <Sparkles className="h-4 w-4 " />{mut.isPending ? 'Analyzing' : 'Generate recommendations'}
        </Button>
      </div>
      {mut.isPending && <Skeleton className="h-40 w-full" />}
      {mut.data && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground italic">{mut.data.narrative}</p>
          <RecommendationBlock title="Recommended for customer" items={mut.data.primary} />
          <RecommendationBlock title="Upsells" items={mut.data.upsell} />
          <RecommendationBlock title="Cross-sells" items={mut.data.crossSell} />
          <RecommendationBlock title="Frequently bought together" items={mut.data.frequentlyBoughtTogether} />
        </div>
      )}
    </Card>
  );
}

function RecommendationBlock({ title, items }: { title: string; items: Array<{ productId: string; name: string; price: number; reason: string; score: number }> }) {
  if (!items?.length) return null;
  return (
    <div>
      <h4 className="font-semibold mb-2">{title}</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {items.map((r) => (
          <div key={r.productId} className="border rounded-control p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground mt-1">{r.reason}</div>
              </div>
              <Badge variant="outline">{r.score}</Badge>
            </div>
            <div className="text-sm mt-2">${Number(r.price).toFixed(2)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssistantTab({ workspaceId }: { workspaceId: string }) {
  const [history, setHistory] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [contactId, setContactId] = useState('');
  const reply = useServerFn(shoppingAssistantReply);
  const mut = useMutation({
    mutationFn: async (msg: string) => reply({ data: {
      workspaceId,
      contactId: contactId.trim() || null,
      message: msg,
      history: history.map((h) => ({ role: h.role, content: h.content })),
    } }),
    onSuccess: (res) => setHistory((h) => [...h, { role: 'assistant', content: res.reply, productIds: res.suggestedProductIds }]),
    onError: (e: Error) => toast.error(e.message),
  });

  const send = () => {
    const msg = input.trim();
    if (!msg) return;
    setHistory((h) => [...h, { role: 'user', content: msg }]);
    setInput('');
    mut.mutate(msg);
  };

  return (
    <Card className="p-5 space-y-3">
      <Input placeholder="Customer contact ID (optional)" value={contactId} onChange={(e) => setContactId(e.target.value)} />
      <div className="border rounded-control h-96 overflow-y-auto p-3 space-y-2 bg-muted/20">
        {history.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Ask anything — the assistant grounds answers in your catalog.</p>}
        {history.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[80%] rounded-control px-3 py-2 text-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-background border'}`}>
              <div className="whitespace-pre-wrap">{m.content}</div>
              {!!m.productIds?.length && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.productIds.map((id) => <Badge key={id} variant="secondary" className="text-xs">{id.slice(0, 8)}</Badge>)}
                </div>
              )}
            </div>
          </div>
        ))}
        {mut.isPending && <div className="text-xs text-muted-foreground">Thinking</div>}
      </div>
      <div className="flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Ask about products" />
        <Button onClick={send} disabled={mut.isPending || !input.trim()}><Send className="h-4 w-4" /></Button>
      </div>
    </Card>
  );
}

function SearchTab({ workspaceId }: { workspaceId: string }) {
  const [query, setQuery] = useState('');
  const search = useServerFn(naturalLanguageSearch);
  const mut = useMutation({
    mutationFn: () => search({ data: { workspaceId, query, limit: 12 } }),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="p-5 space-y-4">
      <div className="flex gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder='e.g. "waterproof running shoes under $100 for wide feet"' />
        <Button onClick={() => mut.mutate()} disabled={!query.trim() || mut.isPending}>
          <Search className="h-4 w-4 " />Search
        </Button>
      </div>
      {mut.isPending && <Skeleton className="h-24 w-full" />}
      {mut.data && (
        <div className="space-y-3">
          <div className="text-sm"><span className="font-semibold">Interpretation:</span> {mut.data.interpretedQuery}</div>
          <div className="flex flex-wrap gap-1">
            {(mut.data.filters.keywords ?? []).map((k) => <Badge key={k} variant="outline">{k}</Badge>)}
            {mut.data.filters.priceMin != null && <Badge variant="outline">≥ ${mut.data.filters.priceMin}</Badge>}
            {mut.data.filters.priceMax != null && <Badge variant="outline">≤ ${mut.data.filters.priceMax}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{mut.data.explanation}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {mut.data.productIds.map((id) => (
              <div key={id} className="border rounded-control p-3 text-sm font-mono">{id.slice(0, 12)}</div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function ForecastTab({ workspaceId }: { workspaceId: string }) {
  const [period, setPeriod] = useState(30);
  const forecast = useServerFn(predictRevenue);
  const mut = useMutation({
    mutationFn: () => forecast({ data: { workspaceId, periodDays: period } }),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="p-5 space-y-4">
      <div className="flex gap-2">
        <Select value={String(period)} onValueChange={(v) => setPeriod(Number(v))}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Next 7 days</SelectItem>
            <SelectItem value="30">Next 30 days</SelectItem>
            <SelectItem value="90">Next quarter</SelectItem>
            <SelectItem value="365">Next year</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => mut.mutate()} disabled={!workspaceId || mut.isPending}>
          <DollarSign className="h-4 w-4 " />Forecast
        </Button>
      </div>
      {mut.isPending && <Skeleton className="h-32 w-full" />}
      {mut.data && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Worst case" value={fmt(mut.data.worstCase, mut.data.currency)} />
            <Metric label="Commit" value={fmt(mut.data.commit, mut.data.currency)} highlight />
            <Metric label="Best case" value={fmt(mut.data.bestCase, mut.data.currency)} />
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={mut.data.growthPercent >= 0 ? 'default' : 'destructive'}>
              <TrendingUp className="h-3 w-3 " />{mut.data.growthPercent.toFixed(1)}% growth
            </Badge>
            <span className="text-sm text-muted-foreground">{mut.data.periodLabel}</span>
          </div>
          <p className="text-sm">{mut.data.narrative}</p>
          <ul className="text-sm list-disc pl-5 space-y-1">
            {mut.data.drivers.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-control border ${highlight ? 'bg-primary/5 border-primary/40' : ''}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function fmt(n: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n); } catch { return `${currency} ${n.toFixed(2)}`; }
}

function AbandonedCartsTab({ workspaceId }: { workspaceId: string }) {
  const tenantCurrency = useTenantCurrency();
  const listFn = useServerFn(listAbandonedCarts);
  const draftFn = useServerFn(draftAbandonedCartRecovery);
  const { data, isLoading } = useQuery({
    queryKey: ['abandoned-carts', workspaceId],
    enabled: !!workspaceId,
    queryFn: () => listFn({ data: { workspaceId } }),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [channel, setChannel] = useState<'whatsapp' | 'email' | 'sms'>('whatsapp');
  const [draft, setDraft] = useState<{ subject?: string; body: string } | null>(null);
  const draftMut = useMutation({
    mutationFn: (cartId: string) => draftFn({ data: { workspaceId, cartId, channel, tone: 'friendly', offerIncentive: true } }),
    onSuccess: (res) => setDraft({ subject: res.subject, body: res.body }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Carts idle for more than an hour with items still in them.</div>
        <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {isLoading && <Skeleton className="h-24 w-full" />}
      {!isLoading && (!data || data.length === 0) && (
        <p className="text-sm text-muted-foreground py-6 text-center">No abandoned carts right now — nice.</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(data ?? []).map((c) => {
          const contact = c.contacts as { name?: string | null; display_name?: string | null; email?: string | null } | null;
          const items = (c.commerce_cart_items ?? []) as Array<{ quantity: number; unit_price: number; products?: { name?: string } | null }>;
          const subtotal = items.reduce((s, i) => s + Number(i.unit_price) * Number(i.quantity), 0);
          return (
            <div key={c.id} className="border rounded-control p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium flex items-center gap-1"><Users className="h-3 w-3" />{contact?.display_name ?? contact?.name ?? 'Guest'}</div>
                <Badge variant="outline">{fmt(subtotal, (c.currency as string) ?? tenantCurrency)}</Badge>
              </div>
              <ul className="text-xs text-muted-foreground list-disc pl-4">
                {items.slice(0, 3).map((i, idx) => <li key={idx}>{i.products?.name ?? 'Item'} × {i.quantity}</li>)}
              </ul>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={draftMut.isPending && selected === c.id}
                onClick={() => { setSelected(c.id); setDraft(null); draftMut.mutate(c.id); }}
              >
                <Sparkles className="h-3 w-3 " />{draftMut.isPending && selected === c.id ? 'Drafting' : 'Draft recovery message'}
              </Button>
              {selected === c.id && draft && (
                <div className="space-y-2 pt-2 border-t">
                  {draft.subject && <Input readOnly value={draft.subject} className="text-xs" />}
                  <Textarea readOnly value={draft.body} className="text-xs h-32" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
