/**
 * Cross-tenant payment ledger — search/filter, refund, retry, and sync
 * payment attempts against their provider. Extracted out of `GatewayManager`
 * so the Billing admin page (previously an empty-state stub) can show the
 * same real, working payments list without duplicating ~200 lines of state
 * and markup.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Undo2, Search, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { listGateways } from "@/lib/billing/gateways.functions";
import {
  listPayments,
  refundPayment,
  retryPayment,
  syncPaymentStatus,
} from "@/lib/billing/payments.functions";
import { useTenantCurrency } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

type PaymentRow = {
  id: string;
  organization_id: string;
  provider: string;
  provider_payment_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  failure_message: string | null;
  retry_count: number | null;
  refunded_amount_cents: number | null;
  created_at: string;
};

const statusVariant: Record<string, { label: string; tone: string }> = {
  succeeded: { label: "Succeeded", tone: "bg-emerald-500/10 text-emerald-600" },
  processing: { label: "Processing", tone: "bg-blue-500/10 text-blue-600" },
  pending: { label: "Pending", tone: "bg-amber-500/10 text-amber-600" },
  requires_action: { label: "Requires action", tone: "bg-amber-500/10 text-amber-600" },
  failed: { label: "Failed", tone: "bg-destructive/10 text-destructive" },
  canceled: { label: "Canceled", tone: "bg-muted text-muted-foreground" },
  refunded: { label: "Refunded", tone: "bg-purple-500/10 text-purple-600" },
  partially_refunded: { label: "Partial refund", tone: "bg-purple-500/10 text-purple-600" },
};

/** `fallback` is required so an empty gateway currency cannot quietly mean dollars. */
function fmt(cents: number, currency: string, fallback: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || fallback,
  }).format(cents / 100);
}

export function PaymentsLedger() {
  const tenantCurrency = useTenantCurrency();
  const zonedDate = useZonedDateFormatter();
  const qc = useQueryClient();
  const gatewaysFn = useServerFn(listGateways);
  const listFn = useServerFn(listPayments);
  const refundFn = useServerFn(refundPayment);
  const retryFn = useServerFn(retryPayment);
  const syncFn = useServerFn(syncPaymentStatus);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [refunding, setRefunding] = useState<PaymentRow | null>(null);
  const [refundAmount, setRefundAmount] = useState<string>("");

  const gatewaysQ = useQuery({
    queryKey: ["billing", "gateways"],
    queryFn: () => gatewaysFn(),
  });
  const gateways = gatewaysQ.data ?? [];

  const paymentsQ = useQuery({
    queryKey: ["billing", "payments", statusFilter, providerFilter],
    queryFn: () =>
      listFn({
        data: {
          limit: 100,
          status: statusFilter === "all" ? undefined : statusFilter,
          provider: providerFilter === "all" ? undefined : providerFilter,
        },
      }),
  });

  const rows = useMemo(() => {
    const all: PaymentRow[] = (paymentsQ.data?.rows ?? []) as PaymentRow[];
    if (!q.trim()) return all;
    const needle = q.trim().toLowerCase();
    return all.filter(
      (r) =>
        r.provider_payment_id?.toLowerCase().includes(needle) ||
        r.organization_id?.toLowerCase().includes(needle),
    );
  }, [paymentsQ.data, q]);

  const refundMut = useMutation({
    mutationFn: (vars: { payment_id: string; amount_cents?: number }) =>
      refundFn({ data: { ...vars, reason: "requested_by_customer" } }),
    onSuccess: (res) => {
      toast.success(res.fully_refunded ? "Refund completed" : "Partial refund issued");
      setRefunding(null);
      setRefundAmount("");
      qc.invalidateQueries({ queryKey: ["billing", "payments"] });
    },
    onError: (e: Error) => toast.error(`Refund failed: ${e.message}`),
  });

  const retryMut = useMutation({
    mutationFn: (payment_id: string) => retryFn({ data: { payment_id } }),
    onSuccess: (res) => {
      toast.success(`Retry status: ${res.status}`);
      qc.invalidateQueries({ queryKey: ["billing", "payments"] });
    },
    onError: (e: Error) => toast.error(`Retry failed: ${e.message}`),
  });

  const syncMut = useMutation({
    mutationFn: (payment_id: string) => syncFn({ data: { payment_id } }),
    onSuccess: () => {
      toast.success("Synced from provider");
      qc.invalidateQueries({ queryKey: ["billing", "payments"] });
    },
    onError: (e: Error) => toast.error(`Sync failed: ${e.message}`),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search payment / org id"
            className="pl-8 h-9 w-64"
          />
        </div>
        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All providers</SelectItem>
            {gateways.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.keys(statusVariant).map((s) => (
              <SelectItem key={s} value={s}>
                {statusVariant[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Retries</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paymentsQ.isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin inline" />
                  Loading
                </TableCell>
              </TableRow>
            )}
            {!paymentsQ.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No payments match these filters.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const s = statusVariant[r.status] ?? { label: r.status, tone: "bg-muted" };
              const canRefund = r.status === "succeeded" || r.status === "partially_refunded";
              const canRetry = r.status === "failed" || r.status === "requires_action";
              return (
                <TableRow key={r.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {zonedDate(r.created_at, { dateStyle: "medium", timeStyle: "short" })}
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="font-medium">{r.provider}</div>
                    <div className="text-muted-foreground truncate max-w-[180px]">
                      {r.provider_payment_id}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{fmt(r.amount_cents, r.currency, tenantCurrency)}</div>
                    {!!r.refunded_amount_cents && (
                      <div className="text-[11px] text-muted-foreground">
                        − {fmt(r.refunded_amount_cents, r.currency, tenantCurrency)} refunded
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${s.tone}`}
                    >
                      {s.label}
                    </span>
                    {r.failure_message && (
                      <div className="text-[11px] text-destructive mt-0.5 max-w-[220px] truncate">
                        {r.failure_message}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{r.retry_count ?? 0}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => syncMut.mutate(r.id)}
                      disabled={syncMut.isPending}
                      title="Sync from provider"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                    {canRetry && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => retryMut.mutate(r.id)}
                        disabled={retryMut.isPending}
                      >
                        Retry
                      </Button>
                    )}
                    {canRefund && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRefunding(r);
                          setRefundAmount("");
                        }}
                      >
                        <Undo2 className="w-3.5 h-3.5 " />
                        Refund
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!refunding} onOpenChange={(o) => !o && setRefunding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund payment</DialogTitle>
          </DialogHeader>
          {refunding && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Original amount</span>
                <span>{fmt(refunding.amount_cents, refunding.currency, tenantCurrency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Already refunded</span>
                <span>
                  {fmt(refunding.refunded_amount_cents ?? 0, refunding.currency, tenantCurrency)}
                </span>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Refund amount ({refunding.currency}). Leave blank for full refund.
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Full refund"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRefunding(null)}>
              Cancel
            </Button>
            <Button
              disabled={refundMut.isPending}
              onClick={() => {
                if (!refunding) return;
                const cents = refundAmount ? Math.round(parseFloat(refundAmount) * 100) : undefined;
                refundMut.mutate({ payment_id: refunding.id, amount_cents: cents });
              }}
            >
              {refundMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Confirm refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
