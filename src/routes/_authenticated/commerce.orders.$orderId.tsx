import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ArrowLeft,
  Package,
  CreditCard,
  Truck,
  User,
  FileText,
  StickyNote,
  Clock,
  CheckCircle2,
  CircleDashed,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  getOrder,
  updateOrderStatus,
  createPaymentLink,
  addOrderNote,
  listOrderInvoices,
  getOrderContact,
  ORDER_STATUSES,
} from "@/lib/commerce/commerce.functions";
import { useCurrentWorkspace } from "@/hooks/use-workspace";

import { useCurrencyFormatter } from "@/hooks/use-currency";
import { useTenantCurrency } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
export const Route = createFileRoute("/_authenticated/commerce/orders/$orderId")({
  component: OrderDetail,
  staticData: { breadcrumb: "Order" },
});

type OrderStatus = (typeof ORDER_STATUSES)[number];

const TIMELINE: { key: OrderStatus; label: string; field: string }[] = [
  { key: "pending", label: "Pending", field: "placed_at" },
  { key: "confirmed", label: "Confirmed", field: "placed_at" },
  { key: "processing", label: "Processing", field: "placed_at" },
  { key: "packed", label: "Packed", field: "placed_at" },
  { key: "shipped", label: "Shipped", field: "shipped_at" },
  { key: "delivered", label: "Delivered", field: "delivered_at" },
];

const SHIPPING_PROVIDERS = [
  "UPS",
  "FedEx",
  "DHL",
  "USPS",
  "PostNord",
  "Bring",
  "GLS",
  "Aramex",
  "Royal Mail",
  "Other",
];

function OrderDetail() {
  const tenantCurrency = useTenantCurrency();
  const money = useCurrencyFormatter({ locale: "en-US" });
  const zonedDate = useZonedDateFormatter();
  const { orderId } = Route.useParams();
  const { active } = useCurrentWorkspace();
  const qc = useQueryClient();

  const fnGet = useServerFn(getOrder);
  const fnUpdate = useServerFn(updateOrderStatus);
  const fnLink = useServerFn(createPaymentLink);
  const fnNote = useServerFn(addOrderNote);
  const fnInvoices = useServerFn(listOrderInvoices);
  const fnContact = useServerFn(getOrderContact);

  const { data, isLoading } = useQuery({
    queryKey: ["commerce-order", orderId],
    queryFn: () => fnGet({ data: { orderId } }),
  });

  const order = data?.order as
    | {
        id: string;
        order_number: string;
        workspace_id: string;
        contact_id: string | null;
        status: OrderStatus;
        payment_status: string;
        fulfillment_status: string;
        currency: string;
        subtotal: number;
        tax: number;
        discount: number;
        shipping: number;
        total: number;
        tracking_number: string | null;
        tracking_url: string | null;
        shipping_provider: string | null;
        shipping_address: Record<string, string> | null;
        billing_address: Record<string, string> | null;
        notes: string | null;
        channel: string | null;
        placed_at: string | null;
        paid_at: string | null;
        shipped_at: string | null;
        delivered_at: string | null;
        cancelled_at: string | null;
        returned_at: string | null;
        refunded_at: string | null;
        created_at: string;
        applied_promotions?: Array<{
          promotion_id: string;
          name: string;
          code: string | null;
          amount_off_cents: number;
          free_shipping: boolean;
          discount_type: string;
        }>;
      }
    | undefined;

  const invoicesQ = useQuery({
    queryKey: ["commerce-order-invoices", orderId],
    queryFn: () => fnInvoices({ data: { orderId } }),
    enabled: !!order,
  });
  const contactQ = useQuery({
    queryKey: ["commerce-order-contact", order?.contact_id],
    queryFn: () => fnContact({ data: { contactId: order!.contact_id! } }),
    enabled: !!order?.contact_id,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["commerce-order", orderId] });

  const update = useMutation({
    mutationFn: (patch: {
      orderId: string;
      workspaceId: string;
      status?: OrderStatus;
      paymentStatus?: "unpaid" | "paid" | "partially_paid" | "refunded";
      fulfillmentStatus?:
        "unfulfilled" | "processing" | "packed" | "shipped" | "delivered" | "returned";
      trackingNumber?: string;
      trackingUrl?: string;
      shippingProvider?: string;
    }) => fnUpdate({ data: patch }),
    onSuccess: () => {
      invalidate();
      toast.success("Order updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const genLink = useMutation({
    mutationFn: () =>
      fnLink({
        data: {
          workspaceId: active!.id,
          orderId,
          contactId: order?.contact_id ?? undefined,
          amount: Number(order?.total ?? 0),
          currency: order?.currency ?? tenantCurrency,
          description: `Payment for order ${order?.order_number}`,
        },
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Payment link created");
    },
  });

  const addNote = useMutation({
    mutationFn: (v: { note: string; isCustomerVisible: boolean }) =>
      fnNote({
        data: { orderId, workspaceId: order!.workspace_id, ...v },
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Note added");
      setNote("");
    },
  });

  const [tracking, setTracking] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [provider, setProvider] = useState<string>("");
  const [note, setNote] = useState("");
  const [noteVisible, setNoteVisible] = useState(false);

  if (isLoading)
    return (
      <div className="p-6">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  if (!order) return <div className="p-6">Order not found</div>;

  const timestamps: Record<string, string | null> = {
    pending: order.placed_at ?? order.created_at,
    confirmed: order.placed_at,
    processing: order.placed_at,
    packed: order.placed_at,
    shipped: order.shipped_at,
    delivered: order.delivered_at,
  };
  const currentIdx = TIMELINE.findIndex((s) => s.key === order.status);
  const terminal =
    order.status === "cancelled" || order.status === "returned" || order.status === "refunded";

  const events = data?.events ?? [];
  const notes = events.filter((e) => e.event_type === "note");
  const statusEvents = events.filter((e) => e.event_type !== "note");

  return (
    <>
      <AppTopbar title={`Order ${order.order_number}`} />
      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="flex items-center justify-between gap-4">
          <Button asChild variant="ghost" size="sm">
            <Link to="/commerce/orders">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to orders
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="capitalize">
              {order.status}
            </Badge>
            <Badge
              variant={order.payment_status === "paid" ? "default" : "secondary"}
              className="capitalize"
            >
              {order.payment_status.replaceAll("_", " ")}
            </Badge>
            {order.channel && (
              <Badge variant="outline" className="capitalize">
                {order.channel}
              </Badge>
            )}
          </div>
        </div>

        {/* Timeline */}
        <Card className="p-4">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4" />
            Order timeline
          </h3>
          {terminal ? (
            <div className="flex items-center gap-2 text-sm">
              {order.status === "cancelled" && <XCircle className="h-5 w-5 text-red-500" />}
              {order.status === "returned" && <RotateCcw className="h-5 w-5 text-amber-500" />}
              {order.status === "refunded" && <RotateCcw className="h-5 w-5 text-red-500" />}
              <span className="capitalize font-medium">{order.status}</span>
              <span className="text-muted-foreground">
                {(order.cancelled_at || order.returned_at || order.refunded_at) &&
                  zonedDate(order.cancelled_at ?? order.returned_at ?? order.refunded_at!, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
              </span>
            </div>
          ) : (
            <ol className="grid grid-cols-2 md:grid-cols-6 gap-2">
              {TIMELINE.map((s, i) => {
                const done = i <= currentIdx;
                const active = i === currentIdx;
                return (
                  <li
                    key={s.key}
                    className={`rounded-control border p-3 ${active ? "border-primary bg-primary/5" : done ? "border-emerald-300 bg-emerald-50" : "border-border"}`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      {done ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      {s.label}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {done && timestamps[s.key]
                        ? zonedDate(timestamps[s.key]!, { dateStyle: "short" })
                        : "—"}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
            <Select
              value={order.status}
              onValueChange={(v) =>
                update.mutate({
                  orderId,
                  workspaceId: order.workspace_id,
                  status: v as OrderStatus,
                })
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Items + totals */}
          <Card className="p-4 md:col-span-2 space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Package className="h-4 w-4" />
              Items
            </h3>
            <div className="divide-y">
              {data?.items.map((i) => {
                const meta = (i.metadata ?? {}) as { discount_cents?: number };
                const lineDiscount = Number(meta.discount_cents ?? 0) / 100;
                return (
                  <div key={i.id} className="flex justify-between py-2 text-sm">
                    <div>
                      <div>
                        {i.name} <span className="text-muted-foreground">× {i.quantity}</span>
                      </div>
                      {i.sku && (
                        <div className="text-[11px] text-muted-foreground">SKU {i.sku}</div>
                      )}
                      {lineDiscount > 0 && (
                        <div className="text-[11px] text-emerald-600">
                          Discount −{money(lineDiscount, order.currency)}
                        </div>
                      )}
                    </div>
                    <span>{money(i.total, order.currency)}</span>
                  </div>
                );
              })}
            </div>
            {(order.applied_promotions ?? []).length > 0 && (
              <div className="pt-3 border-t space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Applied promotions</div>
                {(order.applied_promotions ?? []).map((p) => (
                  <div
                    key={p.promotion_id}
                    className="flex items-center justify-between text-[11px]"
                  >
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="capitalize">
                        {p.code ?? "auto"}
                      </Badge>
                      <span className="truncate">{p.name}</span>
                    </div>
                    <span className="text-emerald-600 font-medium">
                      {p.free_shipping
                        ? "Free shipping"
                        : `−${money(p.amount_off_cents / 100, order.currency)}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-3 border-t space-y-1 text-sm">
              <Row label="Subtotal" value={money(order.subtotal, order.currency)} />
              <Row label="Tax" value={money(order.tax, order.currency)} />
              <Row label="Shipping" value={money(order.shipping, order.currency)} />
              <Row label="Discount" value={`− ${money(order.discount, order.currency)}`} />
              <div className="flex justify-between font-semibold pt-2 border-t">
                <span>Total</span>
                <span>{money(order.total, order.currency)}</span>
              </div>
            </div>
          </Card>

          {/* Customer (CRM) */}
          <Card className="p-4 space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <User className="h-4 w-4" />
              Customer
            </h3>
            {contactQ.data ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={contactQ.data.avatar_url ?? undefined} />
                    <AvatarFallback>
                      {(
                        contactQ.data.display_name ||
                        `${contactQ.data.first_name ?? ""} ${contactQ.data.last_name ?? ""}`
                      )
                        .trim()
                        .charAt(0) || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {contactQ.data.display_name ??
                        (`${contactQ.data.first_name ?? ""} ${contactQ.data.last_name ?? ""}`.trim() ||
                          "Customer")}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {contactQ.data.email ?? contactQ.data.phone ?? "—"}
                    </div>
                  </div>
                </div>
                <Badge variant="outline" className="capitalize">
                  {contactQ.data.lifecycle_stage}
                </Badge>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link to="/contacts/$contactId" params={{ contactId: contactQ.data.id }}>
                    View in CRM
                  </Link>
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Guest checkout</p>
            )}
          </Card>
        </div>

        {/* Shipping + Payment side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4 space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Shipping &amp; tracking
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Provider</label>
                <Select
                  value={provider || order.shipping_provider || ""}
                  onValueChange={setProvider}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {SHIPPING_PROVIDERS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Fulfillment</label>
                <Select
                  value={order.fulfillment_status}
                  onValueChange={(v) =>
                    update.mutate({
                      orderId,
                      workspaceId: order.workspace_id,
                      fulfillmentStatus: v as
                        | "unfulfilled"
                        | "processing"
                        | "packed"
                        | "shipped"
                        | "delivered"
                        | "returned",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "unfulfilled",
                      "processing",
                      "packed",
                      "shipped",
                      "delivered",
                      "returned",
                    ].map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Input
              placeholder="Tracking number"
              value={tracking || order.tracking_number || ""}
              onChange={(e) => setTracking(e.target.value)}
            />
            <Input
              placeholder="Tracking URL (https://...)"
              value={trackingUrl || order.tracking_url || ""}
              onChange={(e) => setTrackingUrl(e.target.value)}
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                update.mutate({
                  orderId,
                  workspaceId: order.workspace_id,
                  trackingNumber: tracking || order.tracking_number || undefined,
                  trackingUrl: (trackingUrl || order.tracking_url || undefined) as
                    string | undefined,
                  shippingProvider: (provider || order.shipping_provider || undefined) as
                    string | undefined,
                })
              }
            >
              Save shipping details
            </Button>
            {order.shipping_address && (
              <div className="pt-3 border-t text-xs text-muted-foreground">
                <div className="font-medium text-foreground mb-1">Ship to</div>
                <div>
                  {order.shipping_address.street1}
                  {order.shipping_address.street2 ? `, ${order.shipping_address.street2}` : ""}
                </div>
                <div>
                  {order.shipping_address.city}, {order.shipping_address.region ?? ""}{" "}
                  {order.shipping_address.postal_code}
                </div>
                <div>{order.shipping_address.country}</div>
              </div>
            )}
          </Card>

          <Card className="p-4 space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Payment
            </h3>
            <Select
              value={order.payment_status}
              onValueChange={(v) =>
                update.mutate({
                  orderId,
                  workspaceId: order.workspace_id,
                  paymentStatus: v as "unpaid" | "paid" | "partially_paid" | "refunded",
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["unpaid", "paid", "partially_paid", "refunded"].map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="w-full"
              onClick={() => genLink.mutate()}
              disabled={genLink.isPending}
            >
              Generate payment link
            </Button>
            {(data?.paymentLinks.length ?? 0) > 0 && (
              <div className="space-y-1 pt-2 border-t">
                <div className="text-xs font-medium">Links</div>
                {data?.paymentLinks.map((l) => (
                  <div key={l.id} className="flex items-center justify-between text-xs">
                    <Badge
                      variant={
                        l.status === "paid"
                          ? "default"
                          : l.status === "active"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {l.status}
                    </Badge>
                    <span className="font-mono">/pay/{l.token.slice(0, 10)}</span>
                    <span>{money(l.amount, l.currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Tabs: notes / invoices / activity */}
        <Card className="p-4">
          <Tabs defaultValue="notes">
            <TabsList>
              <TabsTrigger value="notes">
                <StickyNote className="h-3.5 w-3.5 " />
                Notes ({notes.length})
              </TabsTrigger>
              <TabsTrigger value="invoices">
                <FileText className="h-3.5 w-3.5 " />
                Invoices &amp; receipts
              </TabsTrigger>
              <TabsTrigger value="activity">
                <Clock className="h-3.5 w-3.5 " />
                History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="notes" className="space-y-3 pt-3">
              <Textarea
                rows={2}
                placeholder="Add an internal note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex items-center justify-between">
                <div className="text-xs flex items-center gap-2 text-muted-foreground">
                  <Checkbox
                    id="note-visible-to-customer"
                    checked={noteVisible}
                    onCheckedChange={(v) => setNoteVisible(v === true)}
                  />
                  <Label
                    htmlFor="note-visible-to-customer"
                    className="font-normal text-xs text-muted-foreground"
                  >
                    Visible to customer
                  </Label>
                </div>
                <Button
                  size="sm"
                  disabled={!note.trim() || addNote.isPending}
                  onClick={() => addNote.mutate({ note, isCustomerVisible: noteVisible })}
                >
                  Add note
                </Button>
              </div>
              <div className="divide-y">
                {notes.length === 0 && (
                  <p className="text-sm text-muted-foreground">No notes yet.</p>
                )}
                {notes.map((n) => (
                  <div key={n.id} className="py-2 text-sm">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {(n.metadata as { customer_visible?: boolean } | null)?.customer_visible
                          ? "Customer visible"
                          : "Internal"}
                      </span>
                      <span>
                        {zonedDate(n.created_at, { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    </div>
                    <div>{n.description}</div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="invoices" className="pt-3">
              {invoicesQ.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="space-y-2">
                  {(invoicesQ.data ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No invoices linked to this order.
                    </p>
                  )}
                  {(invoicesQ.data ?? []).map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between p-3 rounded-control border text-sm"
                    >
                      <div>
                        <div className="font-medium">{inv.invoice_number}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {inv.status} · issued{" "}
                          {inv.issue_date ? zonedDate(inv.issue_date, { dateStyle: "short" }) : "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{money(inv.total, inv.currency)}</span>
                        {inv.public_token && (
                          <Button asChild size="sm" variant="outline">
                            <a
                              href={`/invoice/${inv.public_token}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="activity" className="pt-3">
              <div className="space-y-2">
                {statusEvents.length === 0 && (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                )}
                {statusEvents.map((e) => (
                  <div
                    key={e.id}
                    className="flex justify-between text-sm py-2 border-b last:border-0"
                  >
                    <span>{e.description ?? e.event_type}</span>
                    <span className="text-muted-foreground">
                      {zonedDate(e.created_at, { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
