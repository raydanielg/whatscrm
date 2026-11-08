/**
 * AI Commerce panel embedded in the Omnichannel Inbox.
 * Agents can generate product recommendations and drop them into the chat composer.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, Copy, ShoppingCart, TrendingUp } from 'lucide-react';
import {
  getProductRecommendations,
  predictPurchase,
  analyzeCustomerPreferences,
} from '@/lib/commerce/ai-commerce.functions';
import { toast } from 'sonner';

interface Props {
  workspaceId: string;
  contactId: string | null;
  onInsert?: (text: string) => void;
}

export function AiCommercePanel({ workspaceId, contactId, onInsert }: Props) {
  const recsFn = useServerFn(getProductRecommendations);
  const predictFn = useServerFn(predictPurchase);
  const prefsFn = useServerFn(analyzeCustomerPreferences);

  const [recs, setRecs] = useState<Awaited<ReturnType<typeof recsFn>> | null>(null);

  const recsMut = useMutation({
    mutationFn: () => recsFn({ data: { workspaceId, contactId, seedProductIds: [], goal: 'all', limit: 4 } }),
    onSuccess: setRecs,
    onError: (e: Error) => toast.error(e.message),
  });
  const predictMut = useMutation({
    mutationFn: () => predictFn({ data: { workspaceId, contactId: contactId! } }),
    onError: (e: Error) => toast.error(e.message),
  });
  const prefsMut = useMutation({
    mutationFn: () => prefsFn({ data: { workspaceId, contactId: contactId! } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const insertRec = (r: { name: string; price: number; reason: string }) => {
    const text = `${r.name} — $${r.price.toFixed(2)}\n${r.reason}`;
    if (onInsert) onInsert(text);
    else {
      navigator.clipboard.writeText(text).catch(() => {});
      toast.success('Copied to clipboard');
    }
  };

  return (
    <div className="space-y-3">
      <Card className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium flex items-center gap-1"><ShoppingCart className="h-4 w-4" />Recommendations</div>
          <Button size="sm" variant="outline" onClick={() => recsMut.mutate()} disabled={recsMut.isPending}>
            <Sparkles className="h-3 w-3 " />{recsMut.isPending ? '' : 'Generate'}
          </Button>
        </div>
        {recsMut.isPending && <Skeleton className="h-24 w-full" />}
        {recs && (
          <div className="space-y-2">
            {[...recs.primary, ...recs.crossSell].slice(0, 4).map((r) => (
              <div key={r.productId} className="border rounded p-2 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{r.name}</span>
                  <Badge variant="outline">${r.price.toFixed(2)}</Badge>
                </div>
                <div className="text-muted-foreground">{r.reason}</div>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => insertRec(r)}>
                  <Copy className="h-3 w-3 " />Insert
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {contactId && (
        <>
          <Card className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium flex items-center gap-1"><TrendingUp className="h-4 w-4" />Purchase prediction</div>
              <Button size="sm" variant="outline" onClick={() => predictMut.mutate()} disabled={predictMut.isPending}>
                {predictMut.isPending ? '' : 'Predict'}
              </Button>
            </div>
            {predictMut.data && (
              <div className="text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <Badge>{predictMut.data.probability}% in {predictMut.data.timeframe}</Badge>
                  <span className="text-muted-foreground">confidence: {predictMut.data.confidence}</span>
                </div>
                <div className="text-muted-foreground">{predictMut.data.narrative}</div>
              </div>
            )}
          </Card>

          <Card className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Customer preferences</div>
              <Button size="sm" variant="outline" onClick={() => prefsMut.mutate()} disabled={prefsMut.isPending}>
                {prefsMut.isPending ? '' : 'Analyze'}
              </Button>
            </div>
            {prefsMut.data && (
              <div className="text-xs space-y-1">
                <div>{prefsMut.data.personaSummary}</div>
                <div className="flex flex-wrap gap-1 pt-1">
                  {prefsMut.data.interests.slice(0, 6).map((i) => <Badge key={i} variant="secondary">{i}</Badge>)}
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
