import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Check, Printer, X, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { getPublicQuote, signPublicQuote, type PublicQuote } from '@/lib/sales/public-quote.functions';
import { useCurrencyFormatter } from '@/hooks/use-currency';
import { printDocument } from '@/lib/print-document';
import { PRINTABLE_DOCUMENT_CLASS, quoteFileName } from '@/lib/billing/document-print';

export const Route = createFileRoute('/q/$token')({
  component: PublicQuotePage,
  head: () => ({
    meta: [
      { title: 'Your quote · Review and sign' },
      { name: 'description', content: 'Review the itemised quote, accept it with your signature, and download a signed PDF copy.' },
      { property: 'og:title', content: 'Your quote · Review and sign' },
      { property: 'og:description', content: 'Review the itemised quote, accept it with your signature, and download a signed PDF copy.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
});

function PublicQuotePage() {
  // A public quote renders in the currency it was raised in; the platform
  // default only fills in when the quote has none.
  const fmt = useCurrencyFormatter();
  const { token } = Route.useParams();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['public-quote', token],
    queryFn: () => getPublicQuote({ data: { token } }),
  });

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [signature, setSignature] = useState('');

  const sign = useMutation({
    mutationFn: (accept: boolean) =>
      signPublicQuote({ data: { token, fullName, email, signature: accept ? signature : fullName, accept } }),
    onSuccess: (_r, accept) => {
      toast.success(accept ? 'Quote accepted — thank you!' : 'Quote declined');
      void refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <main className="min-h-screen bg-muted/30 p-6">
        <div className="max-w-3xl mx-auto space-y-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-muted/30 grid place-items-center p-6">
        <Card className="p-8 text-center space-y-2 max-w-md">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground" />
          <h1 className="font-medium">Quote link not found</h1>
          <p className="text-sm text-muted-foreground">
            This link may have expired or been revoked. Please ask your contact for a new one.
          </p>
        </Card>
      </main>
    );
  }

  const q: PublicQuote = data;
  const money = (n: number) => fmt(n, q.currency);
  const settled = q.status === 'accepted' || q.status === 'rejected';
  // Prints the document card alone. `window.print()` here used to print the
  // whole page, which is why the customer's PDF looked like a screenshot.
  const downloadPdf = () => {
    void printDocument(`.${PRINTABLE_DOCUMENT_CLASS}`, { title: quoteFileName(q.quote_number) })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Could not prepare the PDF'));
  };

  return (
    <main className="min-h-screen bg-muted/30 py-8 px-4 print:bg-white print:p-0">
      <div className="max-w-3xl mx-auto space-y-6">
        {/*
          The document boundary. Only this card is cloned into the print frame,
          so the page background, the accept/sign panel and anything added here
          later stay out of the customer's PDF by construction.
        */}
        <Card className={`${PRINTABLE_DOCUMENT_CLASS} p-8 bg-background print:shadow-none print:border-0`}>
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="text-xs uppercase   text-muted-foreground">Quote</div>
              <h1 className="text-2xl font-semibold mt-1">{q.title}</h1>
              <div className="mt-1 text-sm text-muted-foreground">
                {q.quote_number} · v{q.version}
              </div>
            </div>
            <div className="text-right">
              <div className="font-medium">{q.workspace_name ?? 'Your supplier'}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Issued {new Date(q.created_at).toLocaleDateString()}
                {q.valid_until && <div>Valid until {new Date(q.valid_until).toLocaleDateString()}</div>}
              </div>
              <Badge variant="outline" className="mt-2 capitalize">{q.status}</Badge>
            </div>
          </div>

          <Separator className="my-6" />

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2">Description</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Unit</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {q.line_items.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="py-2 pr-4">{l.description}</td>
                  <td className="py-2 text-right ">{l.quantity}</td>
                  <td className="py-2 text-right ">{money(l.unit_price)}</td>
                  <td className="py-2 text-right ">{money(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="print-keep-together mt-6 ml-auto w-full max-w-xs space-y-1 text-sm">
            <Row label="Subtotal" value={money(q.subtotal)} />
            {q.discount_total > 0 && <Row label="Discount" value={`- ${money(q.discount_total)}`} />}
            {q.tax_total > 0 && <Row label="Tax" value={money(q.tax_total)} />}
            <Separator className="my-2" />
            <div className="flex justify-between font-semibold text-base">
              <span>Total</span>
              <span className="">{money(q.total)}</span>
            </div>
          </div>

          {q.notes && <p className="mt-6 text-sm text-muted-foreground whitespace-pre-line">{q.notes}</p>}
          {q.terms && (
            <>
              <Separator className="my-6" />
              <div className="text-xs text-muted-foreground whitespace-pre-line">{q.terms}</div>
            </>
          )}

          {q.signature && (
            <div className="print-keep-together mt-6 rounded-control border border-emerald-500/40 bg-emerald-500/10 p-4">
              <div className="text-sm font-medium">Accepted &amp; signed</div>
              <div className="mt-1 font-serif text-2xl italic">{q.signature.signature}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {q.signature.name} · {new Date(q.signature.signed_at).toLocaleString()}
              </div>
            </div>
          )}
        </Card>

        <Card className="p-6 no-print space-y-4">
          {settled ? (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="text-sm text-muted-foreground">
                This quote has been {q.status}. You can still download a copy for your records.
              </p>
              <Button variant="outline" onClick={downloadPdf}>
                <Printer className="h-4 w-4 " /> Download PDF
              </Button>
            </div>
          ) : (
            <>
              <div>
                <h2 className="font-medium">Accept this quote</h2>
                <p className="text-sm text-muted-foreground">
                  Type your full name as your electronic signature. This is legally binding acceptance of the terms above.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="q-name">Full name</Label>
                  <Input id="q-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Smith" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="q-email">Email (optional)</Label>
                  <Input id="q-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="q-sig">Signature</Label>
                  <Input
                    id="q-sig"
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                    placeholder="Type your name to sign"
                    className="font-serif text-xl italic"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={fullName.trim().length < 2 || signature.trim().length < 2 || sign.isPending}
                  onClick={() => sign.mutate(true)}
                >
                  <Check className="h-4 w-4 " /> Accept &amp; sign
                </Button>
                <Button
                  variant="outline"
                  disabled={fullName.trim().length < 2 || sign.isPending}
                  onClick={() => sign.mutate(false)}
                >
                  <X className="h-4 w-4 " /> Decline
                </Button>
                <Button variant="ghost" onClick={downloadPdf}>
                  <Printer className="h-4 w-4 " /> Download PDF
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="">{value}</span>
    </div>
  );
}
