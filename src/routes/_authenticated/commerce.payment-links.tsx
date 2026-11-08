import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Copy,
  Ban,
  MessageCircle,
  Mail,
  Phone,
  RefreshCcw,
  Clock,
  DollarSign,
  ExternalLink,
  CheckCircle2,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import {
  listPaymentLinks,
  getPaymentLinkDetail,
  shareLinkEvent,
  cancelPaymentLink,
  refundPaymentLink,
  markPaymentReceived,
} from "@/lib/payments/payment-links.functions";
import { PaymentLinkCreateDialog } from "@/components/app/payments/payment-link-create-dialog";

import { useCurrencyFormatter } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
export const Route = createFileRoute("/_authenticated/commerce/payment-links")({
  component: LinksPage,
  staticData: { breadcrumb: "Payment Links" },
  head: () => ({ meta: [{ title: "Payment Links — Commerce" }] }),
});

type LinkRow = {
  id: string;
  token: string;
  provider: string;
  amount: number;
  currency: string;
  description: string | null;
  status: string;
  url: string | null;
  expires_at: string | null;
  paid_at: string | null;
  allow_partial: boolean;
  paid_amount: number;
  refunded_amount: number;
  is_recurring: boolean;
  recurring_interval: string | null;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  created_at: string;
};

function statusVariant(s: string): "default" | "secondary" | "outline" | "destructive" {
  if (s === "paid") return "default";
  if (s === "partially_paid") return "secondary";
  if (s === "cancelled" || s === "refunded" || s === "expired") return "destructive";
  return "outline";
}

function LinksPage() {
  const money = useCurrencyFormatter();
  const zonedDate = useZonedDateFormatter();
  const { active } = useCurrentWorkspace();
  const qc = useQueryClient();
  const fnList = useServerFn(listPaymentLinks);
  const fnCancel = useServerFn(cancelPaymentLink);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [openCreate, setOpenCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const linksQ = useQuery({
    queryKey: ["pl-list", active?.id, statusFilter, search],
    enabled: !!active?.id,
    queryFn: () =>
      fnList({ data: { workspaceId: active!.id, status: statusFilter as never, search } }),
  });

  const rows = (linksQ.data ?? []) as LinkRow[];
  const stats = useMemo(() => {
    const total = rows.length;
    const activeCount = rows.filter((r) => r.status === "active").length;
    const paid = rows.filter((r) => r.status === "paid" || r.status === "partially_paid");
    const collected = paid.reduce(
      (s, r) => s + Number(r.paid_amount) - Number(r.refunded_amount),
      0,
    );
    return { total, active: activeCount, paidCount: paid.length, collected };
  }, [rows]);

  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkCancel = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds);
      const eligible = rows.filter((r) => ids.includes(r.id) && r.status === "active");
      if (!eligible.length) throw new Error("No active links selected");
      await Promise.all(
        eligible.map((r) => fnCancel({ data: { linkId: r.id, workspaceId: active!.id } })),
      );
      return eligible.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} link${n === 1 ? "" : "s"} cancelled`);
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["pl-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = () => {
    const list = selectedIds.size ? rows.filter((r) => selectedIds.has(r.id)) : rows;
    if (!list.length) {
      toast.info("Nothing to export");
      return;
    }
    const headers = [
      "id",
      "created_at",
      "status",
      "provider",
      "amount",
      "currency",
      "paid_amount",
      "refunded_amount",
      "customer_name",
      "customer_email",
      "customer_phone",
      "description",
      "expires_at",
      "url",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
    };
    const body = list.map((r) =>
      [
        r.id,
        r.created_at,
        r.status,
        r.provider,
        r.amount,
        r.currency,
        r.paid_amount,
        r.refunded_amount,
        r.customer_name,
        r.customer_email,
        r.customer_phone,
        r.description,
        r.expires_at,
        r.url ?? (typeof window !== "undefined" ? `${window.location.origin}/pay/${r.token}` : ""),
      ]
        .map(esc)
        .join(","),
    );
    const csv = [headers.join(","), ...body].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payment-links-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <AppTopbar
        title="Payment Links"
        actions={
          <>
            <Button variant="outline" className="h-9" onClick={exportCsv}>
              <Download className="h-4 w-4 " />
              Export CSV
            </Button>
            <Button className="h-9" onClick={() => setOpenCreate(true)} disabled={!active?.id}>
              <Plus className="h-4 w-4 " />
              New payment link
            </Button>
          </>
        }
      />
      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Kpi
            label="Total links"
            value={stats.total.toString()}
            icon={<DollarSign className="h-4 w-4" />}
          />
          <Kpi
            label="Active"
            value={stats.active.toString()}
            icon={<Clock className="h-4 w-4" />}
          />
          <Kpi
            label="Paid"
            value={stats.paidCount.toString()}
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
          <Kpi
            label="Net collected"
            value={money(stats.collected, rows[0]?.currency)}
            icon={<DollarSign className="h-4 w-4" />}
          />
        </div>

        <Card className="p-3 flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search description, customer"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs h-9"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["all", "active", "paid", "partially_paid", "expired", "cancelled", "refunded"].map(
                (s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s.replaceAll("_", " ")}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          {selectedIds.size > 0 && (
            <>
              <Badge variant="secondary">{selectedIds.size} selected</Badge>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => bulkCancel.mutate()}
                disabled={bulkCancel.isPending}
              >
                <Ban className="h-3.5 w-3.5 " />
                Cancel selected
              </Button>
            </>
          )}
        </Card>

        {active?.id && (
          <PaymentLinkCreateDialog
            open={openCreate}
            onOpenChange={setOpenCreate}
            workspaceId={active.id}
            onCreated={() => qc.invalidateQueries({ queryKey: ["pl-list"] })}
          />
        )}

        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 w-8">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Paid</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Expires</th>
                <th className="px-3 py-2 w-1"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t hover:bg-muted/20 cursor-pointer"
                  onClick={() => setSelectedId(r.id)}
                >
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(r.id)}
                      onCheckedChange={() => toggleOne(r.id)}
                      aria-label={`Select ${r.description ?? r.id}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium truncate max-w-[240px]">{r.description || "—"}</div>
                    {r.is_recurring && (
                      <Badge variant="outline" className="mt-0.5">
                        Recurring · {r.recurring_interval}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.customer_name || r.customer_email || r.customer_phone || "—"}
                  </td>
                  <td className="px-3 py-2 capitalize">{r.provider}</td>
                  <td className="px-3 py-2 font-medium">{money(r.amount, r.currency)}</td>
                  <td className="px-3 py-2">
                    {money(Number(r.paid_amount) - Number(r.refunded_amount), r.currency)}
                    {r.refunded_amount > 0 && (
                      <div className="text-xs text-muted-foreground">
                        -{money(r.refunded_amount, r.currency)} refunded
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={statusVariant(r.status)} className="capitalize">
                      {r.status.replaceAll("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.expires_at ? zonedDate(r.expires_at, { dateStyle: "short" }) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        void copyLink(r.token);
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground">
                    No payment links yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <DetailDialog
        linkId={selectedId}
        workspaceId={active?.id ?? ""}
        onClose={() => setSelectedId(null)}
        onChange={() => qc.invalidateQueries({ queryKey: ["pl-list"] })}
      />
    </>
  );
}

function Kpi({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className="p-4 flex items-center justify-between">
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
      </div>
      <div className="text-muted-foreground">{icon}</div>
    </Card>
  );
}

function payUrl(token: string) {
  return `${window.location.origin}/pay/${token}`;
}

async function copyLink(token: string) {
  await navigator.clipboard.writeText(payUrl(token));
  toast.success("Link copied");
}

function DetailDialog({
  linkId,
  workspaceId,
  onClose,
  onChange,
}: {
  linkId: string | null;
  workspaceId: string;
  onClose: () => void;
  onChange: () => void;
}) {
  const money = useCurrencyFormatter();
  const zonedDate = useZonedDateFormatter();
  const fnDetail = useServerFn(getPaymentLinkDetail);
  const fnShare = useServerFn(shareLinkEvent);
  const fnCancel = useServerFn(cancelPaymentLink);
  const fnRefund = useServerFn(refundPaymentLink);
  const fnMark = useServerFn(markPaymentReceived);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["pl-detail", linkId],
    enabled: !!linkId,
    queryFn: () => fnDetail({ data: { linkId: linkId! } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["pl-detail", linkId] });
    onChange();
  };

  const share = useMutation({
    mutationFn: (channel: "whatsapp" | "email" | "sms" | "copy") =>
      fnShare({ data: { linkId: linkId!, workspaceId, channel } }),
    onSuccess: () => invalidate(),
  });
  const cancel = useMutation({
    mutationFn: () => fnCancel({ data: { linkId: linkId!, workspaceId } }),
    onSuccess: () => {
      toast.success("Link cancelled");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const refund = useMutation({
    mutationFn: (amount: number) => fnRefund({ data: { linkId: linkId!, workspaceId, amount } }),
    onSuccess: () => {
      toast.success("Refund recorded");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const mark = useMutation({
    mutationFn: (amount: number) => fnMark({ data: { linkId: linkId!, workspaceId, amount } }),
    onSuccess: () => {
      toast.success("Payment recorded");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const link = q.data?.link as LinkRow | undefined;
  const events = (q.data?.events ?? []) as {
    id: string;
    event_type: string;
    channel: string | null;
    amount: number | null;
    currency: string | null;
    created_at: string;
    metadata: Record<string, unknown>;
  }[];
  const [refundAmt, setRefundAmt] = useState("");
  const [markAmt, setMarkAmt] = useState("");

  if (!linkId) return null;

  const url = link ? payUrl(link.token) : "";
  const shareText = link
    ? `Payment request${link.description ? ` — ${link.description}` : ""}: ${url}`
    : "";

  const doShare = async (channel: "whatsapp" | "email" | "sms" | "copy") => {
    if (!link) return;
    if (channel === "copy") {
      await navigator.clipboard.writeText(url);
      toast.success("Copied");
    }
    if (channel === "whatsapp") {
      const to = (link.customer_phone ?? "").replace(/\D/g, "");
      window.open(
        `https://wa.me/${to}?text=${encodeURIComponent(shareText)}`,
        "_blank",
        "noopener,noreferrer",
      );
    }
    if (channel === "email") {
      const subject = encodeURIComponent(
        `Payment request${link.description ? ` — ${link.description}` : ""}`,
      );
      const body = encodeURIComponent(shareText);
      window.location.href = `mailto:${link.customer_email ?? ""}?subject=${subject}&body=${body}`;
    }
    if (channel === "sms") {
      window.location.href = `sms:${link.customer_phone ?? ""}?&body=${encodeURIComponent(shareText)}`;
    }
    share.mutate(channel);
  };

  return (
    <Dialog
      open={!!linkId}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Payment link</DialogTitle>
        </DialogHeader>
        {!link ? (
          <div className="py-8 text-center text-muted-foreground">Loading</div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant={statusVariant(link.status)} className="capitalize">
                {link.status.replaceAll("_", " ")}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {link.provider}
              </Badge>
              {link.is_recurring && (
                <Badge variant="outline">Recurring · {link.recurring_interval}</Badge>
              )}
              {link.allow_partial && <Badge variant="outline">Partial allowed</Badge>}
              <div className="ml-auto text-2xl font-semibold">
                {money(link.amount, link.currency)}
              </div>
            </div>

            <Card className="p-3 flex items-center gap-2">
              <Input readOnly value={url} className="h-9 font-mono text-xs" />
              <Button size="sm" variant="outline" onClick={() => void doShare("copy")}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void doShare("whatsapp")}
                disabled={!link.customer_phone}
              >
                <MessageCircle className="h-3.5 w-3.5 " />
                WhatsApp
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void doShare("email")}
                disabled={!link.customer_email}
              >
                <Mail className="h-3.5 w-3.5 " />
                Email
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void doShare("sms")}
                disabled={!link.customer_phone}
              >
                <Phone className="h-3.5 w-3.5 " />
                SMS
              </Button>
              {link.url && (
                <Button size="sm" variant="outline" asChild>
                  <a href={link.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
            </Card>

            <Tabs defaultValue="timeline">
              <TabsList>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="collect">Record payment</TabsTrigger>
                <TabsTrigger value="refund">Refund</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
              </TabsList>

              <TabsContent value="timeline" className="space-y-2">
                {events.length === 0 && (
                  <div className="text-sm text-muted-foreground py-4">No events yet</div>
                )}
                {events.map((e) => (
                  <div key={e.id} className="flex items-start gap-3 rounded border p-2">
                    <div className="mt-0.5 h-2 w-2 rounded-full bg-primary" />
                    <div className="flex-1">
                      <div className="text-sm font-medium capitalize">
                        {e.event_type.replaceAll("_", " ")}
                        {e.channel ? ` · ${e.channel}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {zonedDate(e.created_at, { dateStyle: "medium", timeStyle: "short" })}
                        {e.amount
                          ? ` · ${money(Number(e.amount), e.currency ?? link.currency)}`
                          : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="collect" className="space-y-2">
                <div className="text-sm text-muted-foreground">
                  Manually record a payment received outside the hosted checkout.
                </div>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={markAmt}
                      onChange={(e) => setMarkAmt(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <Button
                    onClick={() => mark.mutate(Number(markAmt))}
                    disabled={!markAmt || mark.isPending}
                  >
                    Record
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Outstanding:{" "}
                  {money(
                    Math.max(0, Number(link.amount) - Number(link.paid_amount)),
                    link.currency,
                  )}
                </div>
              </TabsContent>

              <TabsContent value="refund" className="space-y-2">
                <div className="text-sm text-muted-foreground">
                  Refundable:{" "}
                  {money(Number(link.paid_amount) - Number(link.refunded_amount), link.currency)}
                </div>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={refundAmt}
                      onChange={(e) => setRefundAmt(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <Button
                    variant="destructive"
                    onClick={() => refund.mutate(Number(refundAmt))}
                    disabled={!refundAmt || refund.isPending}
                  >
                    <RefreshCcw className="h-3.5 w-3.5 " />
                    Refund
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="details" className="text-sm space-y-1">
                <Row label="Customer" value={link.customer_name || "—"} />
                <Row label="Email" value={link.customer_email || "—"} />
                <Row label="Phone" value={link.customer_phone || "—"} />
                <Row label="Description" value={link.description || "—"} />
                <Row
                  label="Created"
                  value={zonedDate(link.created_at, { dateStyle: "medium", timeStyle: "short" })}
                />
                <Row
                  label="Expires"
                  value={
                    link.expires_at
                      ? zonedDate(link.expires_at, { dateStyle: "medium", timeStyle: "short" })
                      : "—"
                  }
                />
                <Row label="Paid" value={money(Number(link.paid_amount), link.currency)} />
                <Row label="Refunded" value={money(Number(link.refunded_amount), link.currency)} />
              </TabsContent>
            </Tabs>
          </div>
        )}
        <DialogFooter>
          {link && link.status === "active" && (
            <Button
              variant="destructive"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
            >
              <Ban className="h-3.5 w-3.5 " />
              Cancel link
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b py-1">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
