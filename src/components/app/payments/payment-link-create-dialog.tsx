import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { createPaymentLink, listProvidersFn } from '@/lib/payments/payment-links.functions';
import { ContactPicker, type PickedContact } from './contact-picker';
import { useTenantCurrency } from '@/hooks/use-currency';
import { usePlatformRuntime } from '@/hooks/use-platform-runtime';

export type PaymentLinkPrefill = {
  contactId?: string;
  orderId?: string;
  amount?: number;
  currency?: string;
  description?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
};

type ProviderInfo = { id: string; displayName: string; currencies: readonly string[]; supportsPartial: boolean; supportsRecurring: boolean };

export function resolvePaymentLinkCurrencies(
  enabledCurrencies: readonly string[],
  providerCurrencies: readonly string[] = [],
): string[] {
  const enabled = [...new Set(enabledCurrencies.map((value) => value.trim().toUpperCase()).filter(Boolean))];
  if (providerCurrencies.length === 0) return enabled;
  const supported = new Set(providerCurrencies.map((value) => value.toUpperCase()));
  return enabled.filter((currency) => supported.has(currency));
}

/** Reusable payment-link create dialog. Controlled `open` / `onOpenChange`. */
export function PaymentLinkCreateDialog({
  open,
  onOpenChange,
  workspaceId,
  prefill,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workspaceId: string;
  prefill?: PaymentLinkPrefill;
  onCreated?: (link: { id: string; token: string; url: string | null }) => void;
}) {
  const fnProviders = useServerFn(listProvidersFn);
  const providersQ = useQuery({
    queryKey: ['pl-providers', workspaceId],
    queryFn: () => fnProviders({ data: { workspaceId } }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New payment link</DialogTitle></DialogHeader>
        <CreateForm
          providers={(providersQ.data ?? []) as ProviderInfo[]}
          workspaceId={workspaceId}
          prefill={prefill}
          onCreated={(link) => { onCreated?.(link); onOpenChange(false); }}
        />
      </DialogContent>
    </Dialog>
  );
}

function CreateForm({
  providers, workspaceId, prefill, onCreated,
}: {
  providers: ProviderInfo[];
  workspaceId: string;
  prefill?: PaymentLinkPrefill;
  onCreated: (link: { id: string; token: string; url: string | null }) => void;
}) {
  const qc = useQueryClient();
  const fnCreate = useServerFn(createPaymentLink);
  const [provider, setProvider] = useState<string>('stripe');
  const [amount, setAmount] = useState(prefill?.amount ? String(prefill.amount) : '');
  const tenantCurrency = useTenantCurrency();
  const { config: platformConfig, loading: platformConfigLoading } = usePlatformRuntime();
  const [currency, setCurrency] = useState(prefill?.currency ?? tenantCurrency);
  const [description, setDescription] = useState(prefill?.description ?? '');
  const [expiresInDays, setExpiresInDays] = useState('30');
  const [allowPartial, setAllowPartial] = useState(false);
  const [minAmount, setMinAmount] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringInterval, setRecurringInterval] = useState<'day' | 'week' | 'month' | 'year'>('month');
  const [contactId, setContactId] = useState<string | null>(prefill?.contactId ?? null);
  const [name, setName] = useState(prefill?.customerName ?? '');
  const [email, setEmail] = useState(prefill?.customerEmail ?? '');
  const [phone, setPhone] = useState(prefill?.customerPhone ?? '');

  const current = providers.find((p) => p.id === provider);
  const availableCurrencies = useMemo(
    () => resolvePaymentLinkCurrencies(platformConfig.localization.enabledCurrencies, current?.currencies),
    [platformConfig.localization.enabledCurrencies, current?.currencies],
  );

  useEffect(() => {
    if (!platformConfigLoading && availableCurrencies.length > 0 && !availableCurrencies.includes(currency.toUpperCase())) {
      setCurrency(availableCurrencies.includes(tenantCurrency) ? tenantCurrency : availableCurrencies[0]);
    }
  }, [availableCurrencies, currency, platformConfigLoading, tenantCurrency]);

  const pickContact = (c: PickedContact | null) => {
    setContactId(c?.id ?? null);
    if (c) {
      if (!name) setName(c.name ?? '');
      if (!email) setEmail(c.email ?? '');
      if (!phone) setPhone(c.phone ?? '');
    }
  };

  const create = useMutation({
    mutationFn: () => fnCreate({
      data: {
        workspaceId,
        provider: provider as never,
        amount: Number(amount),
        currency: currency.toUpperCase(),
        description: description || undefined,
        contactId: contactId ?? undefined,
        orderId: prefill?.orderId ?? undefined,
        expiresAt: expiresInDays ? new Date(Date.now() + Number(expiresInDays) * 86400000).toISOString() : null,
        allowPartial,
        minAmount: allowPartial && minAmount ? Number(minAmount) : null,
        isRecurring,
        recurringInterval: isRecurring ? recurringInterval : null,
        customerName: name || null,
        customerEmail: email || null,
        customerPhone: phone || null,
      },
    }),
    onSuccess: (link) => {
      toast.success('Payment link created');
      qc.invalidateQueries({ queryKey: ['pl-list'] });
      onCreated(link);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="grid gap-3 max-h-[70vh] overflow-y-auto pr-1">
        <div>
          <Label>Provider</Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.displayName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Amount</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9" /></div>
          <div>
            <Label>Currency</Label>
            <Select value={currency} onValueChange={setCurrency} disabled={platformConfigLoading || availableCurrencies.length === 0}>
              <SelectTrigger className="h-9" aria-label="Currency">
                <SelectValue placeholder="No currency available" />
              </SelectTrigger>
              <SelectContent>
                {availableCurrencies.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}
              </SelectContent>
            </Select>
            {availableCurrencies.length === 0 && (
              <p className="mt-1 text-xs text-destructive">This provider has no currency enabled in Platform Settings.</p>
            )}
          </div>
        </div>
        <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>

        <div>
          <Label>Link to CRM contact</Label>
          <ContactPicker value={contactId} onPick={pickContact} />
          <div className="text-xs text-muted-foreground mt-1">Selecting a contact auto-fills the fields below.</div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" /></div>
          <div><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" /></div>
          <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9" /></div>
        </div>
        <div><Label>Expires in (days)</Label><Input type="number" value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} className="h-9" /></div>

        <div className="flex items-center justify-between rounded border p-2">
          <div>
            <Label>Allow partial payments</Label>
            <div className="text-xs text-muted-foreground">Customer can pay less than the full amount{current && !current.supportsPartial ? ' — not supported by this provider' : ''}</div>
          </div>
          <Switch checked={allowPartial} onCheckedChange={setAllowPartial} disabled={!current?.supportsPartial} />
        </div>
        {allowPartial && (
          <div><Label>Minimum amount</Label><Input type="number" step="0.01" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} className="h-9" /></div>
        )}

        <div className="flex items-center justify-between rounded border p-2">
          <div>
            <Label>Recurring</Label>
            <div className="text-xs text-muted-foreground">Charge automatically on interval{current && !current.supportsRecurring ? ' — not supported' : ''}</div>
          </div>
          <Switch checked={isRecurring} onCheckedChange={setIsRecurring} disabled={!current?.supportsRecurring} />
        </div>
        {isRecurring && (
          <div>
            <Label>Interval</Label>
            <Select value={recurringInterval} onValueChange={(v) => setRecurringInterval(v as never)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['day', 'week', 'month', 'year'] as const).map((i) => <SelectItem key={i} value={i} className="capitalize">{i}ly</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button onClick={() => create.mutate()} disabled={!amount || !currency || platformConfigLoading || availableCurrencies.length === 0 || create.isPending || !workspaceId}>
          {create.isPending ? 'Creating' : 'Create link'}
        </Button>
      </DialogFooter>
    </>
  );
}
