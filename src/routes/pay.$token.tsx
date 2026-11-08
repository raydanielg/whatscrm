import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CreditCard, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/pay/$token')({
  component: PayPage,
  head: () => ({ meta: [{ title: 'Secure Payment' }, { name: 'robots', content: 'noindex' }] }),
});

function PayPage() {
  const { token } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ['pay-link', token],
    queryFn: async () => {
      // Public payment links are read through a SECURITY DEFINER helper that
      // returns only non-sensitive fields for one exact token (no customer PII).
      const { data, error } = await (supabase as any)
        .rpc('get_public_payment_link', { _token: token });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) ?? null;
    },

  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="max-w-md w-full p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <CreditCard className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">Secure Payment</h1>
        </div>

        {isLoading && <Skeleton className="h-32 w-full" />}
        {!isLoading && !data && (
          <p className="text-center text-sm text-muted-foreground">This payment link was not found or has expired.</p>
        )}
        {data && (
          <>
            <div className="text-center">
              <div className="text-3xl font-bold">{data.currency} {Number(data.amount).toFixed(2)}</div>
              {data.description && <p className="text-sm text-muted-foreground mt-2">{data.description}</p>}
              <Badge className="mt-3" variant={data.status === 'active' ? 'default' : 'secondary'}>{data.status}</Badge>
            </div>
            <Button className="w-full" size="lg" disabled={data.status !== 'active'}>
              Pay with {data.provider === 'stripe' ? 'Stripe' : data.provider === 'paddle' ? 'Paddle' : 'Card'}
            </Button>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-3 w-3" />
              <span>Payments are encrypted and processed securely.</span>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
