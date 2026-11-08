import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Receipt, Trash2, Repeat, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  useInvoices,
  useDeleteInvoice,
  INVOICE_STATUS_META,
  readRecurring,
  type InvoiceStatus,
} from "@/hooks/use-invoices";
import { useTenantCurrency } from "@/hooks/use-currency";
import { useSalesRealtime } from "@/hooks/use-sales-realtime";
import { InvoiceFormDialog } from "@/components/app/invoices/invoice-form-dialog";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/invoices/")({
  component: InvoicesPage,
  staticData: { breadcrumb: "Invoices" },
  head: () => ({
    meta: [
      { title: "Invoices" },
      {
        name: "description",
        content:
          "Create, send and reconcile customer invoices with taxes, discounts, recurring billing, and payment tracking.",
      },
    ],
  }),
});

function InvoicesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InvoiceStatus | "all">("all");
  const [open, setOpen] = useState(false);
  const { data: invoices, isLoading } = useInvoices({ search, status });
  const del = useDeleteInvoice();
  useSalesRealtime();

  const totalOutstanding = (invoices ?? []).reduce((s, i) => s + Number(i.amount_due || 0), 0);
  const totalOverdue = (invoices ?? [])
    .filter((i) => i.status === "overdue")
    .reduce((s, i) => s + Number(i.amount_due || 0), 0);
  // Rows written before a currency was stored fall back to the tenant's
  // currency, never a hardcoded USD — see use-currency.ts.
  const tenantCurrency = useTenantCurrency();
  const displayCurrency = invoices?.[0]?.currency || tenantCurrency;
  const money = (n: number) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency: displayCurrency }).format(
      n || 0,
    );
  const zonedDate = useZonedDateFormatter();

  return (
    <div className="flex flex-col h-full">
      <AppTopbar
        title="Invoices"
        subtitle="Bill customers and track payments"
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 " /> New invoice
          </Button>
        }
      />
      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="p-4">
            <div className="text-xs  text-muted-foreground">Outstanding</div>
            <div className="text-2xl font-semibold mt-1 ">
              {money(totalOutstanding)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs  text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" /> Overdue
            </div>
            <div className="text-2xl font-semibold mt-1  text-red-600">
              {money(totalOverdue)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs  text-muted-foreground">Invoices</div>
            <div className="text-2xl font-semibold mt-1 ">{invoices?.length ?? 0}</div>
          </Card>
        </div>

        <Card className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by number or reference"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as InvoiceStatus | "all")}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(INVOICE_STATUS_META).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>

        <Card className="overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b text-xs  text-muted-foreground">
            <div className="col-span-2">Number</div>
            <div className="col-span-2">Issue</div>
            <div className="col-span-2">Due</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2 text-right">Total</div>
            <div className="col-span-1 text-right">Due</div>
            <div className="col-span-1"></div>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (invoices?.length ?? 0) === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No invoices yet. Create your first invoice.</p>
            </div>
          ) : (
            <div>
              {invoices!.map((inv) => {
                const meta = INVOICE_STATUS_META[inv.status];
                const totalFmt = new Intl.NumberFormat(undefined, {
                  style: "currency",
                  currency: inv.currency || tenantCurrency,
                }).format(Number(inv.total));
                const dueFmt = new Intl.NumberFormat(undefined, {
                  style: "currency",
                  currency: inv.currency || tenantCurrency,
                }).format(Number(inv.amount_due));
                const recurring = readRecurring(inv);
                return (
                  <Link
                    key={inv.id}
                    to="/invoices/$invoiceId"
                    params={{ invoiceId: inv.id }}
                    className="grid grid-cols-12 gap-2 items-center px-4 py-3 border-b hover:bg-muted/40 transition-colors"
                  >
                    <div className="col-span-2 font-mono text-sm flex items-center gap-1">
                      {inv.invoice_number}
                      {recurring?.enabled && (
                        <Repeat className="h-3 w-3 text-muted-foreground" aria-label="Recurring" />
                      )}
                    </div>
                    <div className="col-span-2 text-sm text-muted-foreground">
                      {zonedDate(inv.issue_date, { dateStyle: "short" })}
                    </div>
                    <div className="col-span-2 text-sm text-muted-foreground">
                      {inv.due_date ? zonedDate(inv.due_date, { dateStyle: "short" }) : "—"}
                    </div>
                    <div className="col-span-2">
                      <span
                        className={`inline-block rounded-control px-2 py-0.5 text-xs font-medium ${meta.tone}`}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <div className="col-span-2 text-right ">{totalFmt}</div>
                    <div className="col-span-1 text-right  text-sm">{dueFmt}</div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={async (e) => {
                          e.preventDefault();
                          if (!confirm("Delete this invoice?")) return;
                          try {
                            await del.mutateAsync(inv.id);
                            toast.success("Invoice deleted");
                          } catch (err) {
                            toast.error((err as Error).message);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <InvoiceFormDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
