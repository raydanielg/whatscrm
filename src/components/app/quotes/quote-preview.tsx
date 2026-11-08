import type { QuoteWithLines } from "@/hooks/use-quotes";
import { QUOTE_STATUS_META } from "@/hooks/use-quotes";
import { useTenantBrand } from "@/hooks/use-tenant-brand";
import { useCurrencyFormatter } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { PRINTABLE_DOCUMENT_CLASS } from "@/lib/billing/document-print";

type Props = { quote: QuoteWithLines; workspaceName?: string };

export function QuotePreview({ quote, workspaceName }: Props) {
  const brand = useTenantBrand();
  const sellerName = brand.isCustom ? brand.name : workspaceName || brand.name;
  const fmt = useCurrencyFormatter();
  const zonedDate = useZonedDateFormatter();
  const money = (n: number) => fmt(n, quote.currency);
  const status = QUOTE_STATUS_META[quote.status];

  return (
    // `quote-document` is the shared printable-root marker; `quote-preview` is
    // kept so existing selectors and styles keep working. The print rules live
    // in `document-print.ts` rather than inline here, so the internal preview
    // and the customer-facing page cannot drift apart again.
    <div
      className={`quote-preview ${PRINTABLE_DOCUMENT_CLASS} mx-auto max-w-3xl bg-white text-slate-900 shadow-xl rounded-control overflow-hidden print:shadow-none print:rounded-none`}
    >
      <div className="h-2 bg-gradient-to-r from-primary via-fuchsia-500 to-emerald-500" />
      <div className="p-10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-xs uppercase   text-slate-500">Quote</div>
            <h1 className="text-3xl font-semibold mt-1">{quote.title}</h1>
            <div className="mt-2 text-sm text-slate-500">
              {quote.quote_number} · v{quote.version}
              <span
                className={`ml-2 inline-block rounded-control px-2 py-0.5 text-xs font-medium ${status.tone}`}
              >
                {status.label}
              </span>
            </div>
          </div>
          <div className="text-right">
            {brand.logoUrl ? (
              <img
                src={brand.logoUrl}
                alt={`${sellerName} logo`}
                className="h-9 ml-auto object-contain"
              />
            ) : null}
            <div className="text-lg font-semibold">{sellerName}</div>
            <div className="text-xs text-slate-500 mt-1">
              Issued {zonedDate(quote.created_at, { dateStyle: "short" })}
              {quote.valid_until && (
                <div>Valid until {zonedDate(quote.valid_until, { dateStyle: "short" })}</div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mt-8 text-sm">
          <div>
            <div className="text-xs  text-slate-500 mb-1">Billed to</div>
            <div className="font-medium">
              {quote.contact
                ? [quote.contact.first_name, quote.contact.last_name].filter(Boolean).join(" ") ||
                  quote.contact.email
                : quote.company?.name || "—"}
            </div>
            {quote.company && quote.contact && (
              <div className="text-slate-600">{quote.company.name}</div>
            )}
            {quote.contact?.email && <div className="text-slate-600">{quote.contact.email}</div>}
          </div>
          {quote.deal && (
            <div>
              <div className="text-xs  text-slate-500 mb-1">Related deal</div>
              <div className="font-medium">{quote.deal.title}</div>
            </div>
          )}
        </div>

        <table className="w-full mt-8 text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs  text-slate-500">
              <th className="py-2">Description</th>
              <th className="py-2 text-right w-16">Qty</th>
              <th className="py-2 text-right w-24">Unit</th>
              <th className="py-2 text-right w-16">Disc</th>
              <th className="py-2 text-right w-16">Tax</th>
              <th className="py-2 text-right w-28">Amount</th>
            </tr>
          </thead>
          <tbody>
            {quote.line_items.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 align-top">
                <td className="py-3">
                  <div className="font-medium">{l.name}</div>
                  {l.description && (
                    <div className="text-slate-500 text-xs mt-0.5 whitespace-pre-wrap">
                      {l.description}
                    </div>
                  )}
                </td>
                <td className="py-3 text-right ">{Number(l.quantity)}</td>
                <td className="py-3 text-right ">{money(Number(l.unit_price))}</td>
                <td className="py-3 text-right ">{Number(l.discount_pct)}%</td>
                <td className="py-3 text-right ">{Number(l.tax_rate)}%</td>
                <td className="py-3 text-right  font-medium">
                  {money(Number(l.total))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="print-keep-together mt-6 flex justify-end">
          <div className="w-72 text-sm">
            <Row label="Subtotal" value={money(Number(quote.subtotal))} />
            <Row label="Discount" value={`− ${money(Number(quote.discount_total))}`} />
            <Row label="Tax" value={money(Number(quote.tax_total))} />
            <div className="mt-2 flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="">{money(Number(quote.total))}</span>
            </div>
          </div>
        </div>

        {(quote.notes || quote.terms) && (
          <div className="mt-10 grid grid-cols-2 gap-6 text-xs text-slate-600">
            {quote.notes && (
              <div>
                <div className="uppercase tracking-wider text-slate-500 mb-1">Notes</div>
                <div className="whitespace-pre-wrap">{quote.notes}</div>
              </div>
            )}
            {quote.terms && (
              <div>
                <div className="uppercase tracking-wider text-slate-500 mb-1">Terms</div>
                <div className="whitespace-pre-wrap">{quote.terms}</div>
              </div>
            )}
          </div>
        )}

        <div className="mt-12 text-center text-[11px] uppercase   text-slate-400">
          Thank you for your business
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-slate-500">{label}</span>
      <span className="">{value}</span>
    </div>
  );
}
