import type { InvoiceWithLines } from "@/hooks/use-invoices";
import { INVOICE_STATUS_META } from "@/hooks/use-invoices";
import { useCurrencyFormatter } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { PRINTABLE_DOCUMENT_CLASS } from "@/lib/billing/document-print";

type Props = { invoice: InvoiceWithLines; workspaceName?: string };

export function InvoicePreview({ invoice, workspaceName }: Props) {
  const fmt = useCurrencyFormatter();
  const zonedDate = useZonedDateFormatter();
  const money = (n: number) => fmt(n, invoice.currency);
  const status = INVOICE_STATUS_META[invoice.status];
  const paid = Number(invoice.amount_paid || 0);
  const due = Number(invoice.amount_due || 0);

  return (
    // Shares the printable-root marker and the print rules in
    // `document-print.ts`, so invoices and quotes print identically.
    <div
      className={`invoice-preview ${PRINTABLE_DOCUMENT_CLASS} mx-auto max-w-3xl bg-white text-slate-900 shadow-xl rounded-control overflow-hidden print:shadow-none print:rounded-none`}
    >
      <div className="h-2 bg-gradient-to-r from-primary via-fuchsia-500 to-emerald-500" />
      <div className="p-10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-xs uppercase   text-slate-500">Invoice</div>
            <h1 className="text-3xl font-semibold mt-1">{invoice.invoice_number}</h1>
            <div className="mt-2 text-sm">
              <span
                className={`inline-block rounded-control px-2 py-0.5 text-xs font-medium ${status.tone}`}
              >
                {status.label}
              </span>
              {invoice.external_ref && (
                <span className="ml-2 text-slate-500">Ref {invoice.external_ref}</span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold">{workspaceName || "Your business"}</div>
            <div className="text-xs text-slate-500 mt-1">
              Issued {zonedDate(invoice.issue_date, { dateStyle: "short" })}
              {invoice.due_date && (
                <div>Due {zonedDate(invoice.due_date, { dateStyle: "short" })}</div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mt-8 text-sm">
          <div>
            <div className="text-xs  text-slate-500 mb-1">Billed to</div>
            <div className="font-medium">
              {invoice.contact
                ? [invoice.contact.first_name, invoice.contact.last_name]
                    .filter(Boolean)
                    .join(" ") || invoice.contact.email
                : invoice.company?.name || "—"}
            </div>
            {invoice.company && invoice.contact && (
              <div className="text-slate-600">{invoice.company.name}</div>
            )}
            {invoice.contact?.email && (
              <div className="text-slate-600">{invoice.contact.email}</div>
            )}
          </div>
          {invoice.deal && (
            <div>
              <div className="text-xs  text-slate-500 mb-1">Related deal</div>
              <div className="font-medium">{invoice.deal.title}</div>
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
            {invoice.line_items.map((l) => (
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

        <div className="mt-6 flex justify-end">
          <div className="w-72 text-sm">
            <Row label="Subtotal" value={money(Number(invoice.subtotal))} />
            <Row label="Discount" value={`− ${money(Number(invoice.discount_total))}`} />
            <Row label="Tax" value={money(Number(invoice.tax_total))} />
            <div className="mt-2 flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="">{money(Number(invoice.total))}</span>
            </div>
            {paid > 0 && (
              <>
                <Row label="Paid" value={`− ${money(paid)}`} />
                <div className="flex justify-between pt-1 font-semibold text-emerald-700">
                  <span>Balance due</span>
                  <span className="">{money(due)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {(invoice.notes || invoice.terms) && (
          <div className="mt-10 grid grid-cols-2 gap-6 text-xs text-slate-600">
            {invoice.notes && (
              <div>
                <div className="uppercase tracking-wider text-slate-500 mb-1">Notes</div>
                <div className="whitespace-pre-wrap">{invoice.notes}</div>
              </div>
            )}
            {invoice.terms && (
              <div>
                <div className="uppercase tracking-wider text-slate-500 mb-1">
                  Terms &amp; payment
                </div>
                <div className="whitespace-pre-wrap">{invoice.terms}</div>
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
