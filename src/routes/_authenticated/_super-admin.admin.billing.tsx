import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2, Receipt, Search, CreditCard } from "lucide-react";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaymentsLedger } from "@/components/admin/billing/payments-ledger";
import { listAllInvoices } from "@/lib/billing/admin-invoices.functions";
import { useTenantCurrency } from "@/hooks/use-currency";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/billing")({
  head: () => ({
    meta: [{ title: "Super Admin — Billing" }, { name: "robots", content: "noindex" }],
  }),
  component: BillingPage,
});

const invoiceStatusTone: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  open: "bg-amber-500/10 text-amber-600",
  paid: "bg-emerald-500/10 text-emerald-600",
  void: "bg-muted text-muted-foreground",
  uncollectible: "bg-destructive/10 text-destructive",
};

function fmt(cents: number, currency: string, fallback: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || fallback,
  }).format(cents / 100);
}

function InvoicesTab() {
  const tenantCurrency = useTenantCurrency();
  const listFn = useServerFn(listAllInvoices);
  const [status, setStatus] = useState<string>("all");
  const [q, setQ] = useState("");

  const invoicesQ = useQuery({
    queryKey: ["billing", "invoices", status, q],
    queryFn: () =>
      listFn({ data: { status: status === "all" ? undefined : status, q: q.trim() || undefined } }),
  });
  const rows = invoicesQ.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search invoice number / org id"
            className="pl-8 h-9 w-72"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.keys(invoiceStatusTone).map((s) => (
              <SelectItem key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead className="text-right">Links</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoicesQ.isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin inline" /> Loading
                </TableCell>
              </TableRow>
            )}
            {invoicesQ.isError && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-destructive">
                  {(invoicesQ.error as Error).message}
                </TableCell>
              </TableRow>
            )}
            {!invoicesQ.isLoading && !invoicesQ.isError && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No invoices match these filters.
                </TableCell>
              </TableRow>
            )}
            {rows.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="text-xs font-mono">
                  {inv.number ?? inv.id.slice(0, 8)}
                </TableCell>
                <TableCell className="text-xs">
                  {inv.organizations?.name ?? inv.organization_id}
                </TableCell>
                <TableCell>
                  <div>{fmt(inv.total_cents, inv.currency, tenantCurrency)}</div>
                  {inv.amount_due_cents > 0 && (
                    <div className="text-[11px] text-amber-600">
                      {fmt(inv.amount_due_cents, inv.currency, tenantCurrency)} due
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {inv.due_at ? new Date(inv.due_at).toLocaleDateString() : "—"}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${
                      invoiceStatusTone[inv.status] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {inv.status}
                  </span>
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {inv.issued_at ? new Date(inv.issued_at).toLocaleDateString() : "—"}
                </TableCell>
                <TableCell className="text-right text-xs space-x-2">
                  {inv.hosted_url && (
                    <a
                      href={inv.hosted_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      View
                    </a>
                  )}
                  {inv.pdf_url && (
                    <a
                      href={inv.pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      PDF
                    </a>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function BillingPage() {
  return (
    <AdminPageShell
      title="Billing Management"
      description="Invoices and payments across every tenant — refund, retry, and reconcile from one place."
    >
      <Tabs defaultValue="payments">
        <TabsList>
          <TabsTrigger value="payments">
            <CreditCard className="w-3.5 h-3.5 mr-1.5" /> Payments
          </TabsTrigger>
          <TabsTrigger value="invoices">
            <FileText className="w-3.5 h-3.5 mr-1.5" /> Invoices
          </TabsTrigger>
        </TabsList>
        <TabsContent value="payments" className="mt-4">
          <PaymentsLedger />
        </TabsContent>
        <TabsContent value="invoices" className="mt-4">
          <InvoicesTab />
        </TabsContent>
      </Tabs>

      {/*
       * Credits, tax rates, and dunning have no backing server functions or
       * admin UI anywhere in this codebase yet (checked: `coupons` and
       * `tax_rates` tables exist and are referenced by billing_invoices, but
       * nothing reads/writes them from an admin surface, and dunning only
       * exists as scheduled `billing_notifications` rows with no console).
       * Building those out is its own feature project, not a stub-page fix —
       * flagged here rather than faked with empty placeholder tabs.
       */}
      <p className="text-xs text-muted-foreground mt-6">
        Credits, tax rates, and dunning management aren't built yet —{" "}
        <Receipt className="inline w-3 h-3" /> see the code comment above for what exists at the
        data layer today.
      </p>
    </AdminPageShell>
  );
}
