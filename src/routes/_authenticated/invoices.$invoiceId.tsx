import { printDocument } from "@/lib/print-document";
import { invoiceFileName } from "@/lib/billing/document-print";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { ActionBar } from "@/components/app/action-bar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Pencil,
  Printer,
  Share2,
  Send,
  DollarSign,
  Trash2,
  History,
  Receipt,
  Mail,
  MessageCircle,
  Bell,
  Repeat,
  Ban,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import {
  useInvoice,
  useInvoicePayments,
  useUpdateInvoiceStatus,
  useEnsureInvoiceShareToken,
  useDeletePayment,
  useLogReminder,
  INVOICE_STATUS_META,
  readRecurring,
  readReminders,
  type InvoiceStatus,
} from "@/hooks/use-invoices";
import { InvoiceFormDialog } from "@/components/app/invoices/invoice-form-dialog";
import { InvoicePreview } from "@/components/app/invoices/invoice-preview";
import { RecordPaymentDialog } from "@/components/app/invoices/record-payment-dialog";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useTenantCurrency } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/invoices/$invoiceId")({
  component: InvoiceDetail,
  staticData: { breadcrumb: "Invoice" },
  head: () => ({ meta: [{ title: "Invoice" }] }),
});

function InvoiceDetail() {
  const { invoiceId } = Route.useParams();
  const navigate = useNavigate();
  const { active: workspace } = useCurrentWorkspace();
  const { data: invoice, isLoading } = useInvoice(invoiceId);
  const tenantCurrency = useTenantCurrency();
  const zonedDate = useZonedDateFormatter();
  const { data: payments } = useInvoicePayments(invoiceId);
  const setStatus = useUpdateInvoiceStatus();
  const ensureToken = useEnsureInvoiceShareToken();
  const deletePayment = useDeletePayment();
  const logReminder = useLogReminder();

  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [reminderNote, setReminderNote] = useState("");

  const recurring = useMemo(() => readRecurring(invoice), [invoice]);
  const reminders = useMemo(() => readReminders(invoice), [invoice]);

  const changeStatus = async (s: InvoiceStatus) => {
    try {
      await setStatus.mutateAsync({ id: invoiceId, status: s });
      toast.success(`Marked as ${s}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const share = async () => {
    try {
      const token = await ensureToken.mutateAsync(invoiceId);
      const url = `${window.location.origin}/i/${token}`;
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied");
      return url;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    }
  };

  const emailInvoice = async () => {
    if (!invoice) return;
    const url = await share();
    const to = invoice.contact?.email ?? "";
    const subject = encodeURIComponent(
      `Invoice ${invoice.invoice_number} from ${workspace?.name ?? "us"}`,
    );
    const body = encodeURIComponent(
      `Hi ${invoice.contact?.first_name ?? "there"},\n\nPlease find your invoice ${invoice.invoice_number} for ${money(Number(invoice.total))} attached.${url ? `\n\nView online: ${url}` : ""}\n\nDue ${invoice.due_date ? zonedDate(invoice.due_date, { dateStyle: "short" }) : "on receipt"}.\n\nThank you,\n${workspace?.name ?? ""}`,
    );
    window.open(`mailto:${to}?subject=${subject}&body=${body}`, "_blank");
    await logReminder.mutateAsync({
      id: invoiceId,
      entry: { at: new Date().toISOString(), channel: "email", note: "Invoice sent by email" },
    });
    if (invoice.status === "draft") await changeStatus("sent");
  };

  const whatsappInvoice = async () => {
    if (!invoice) return;
    const url = await share();
    const phone = (invoice.contact?.phone || "").replace(/[^\d+]/g, "");
    const text = encodeURIComponent(
      `Hi ${invoice.contact?.first_name ?? "there"}, here is your invoice ${invoice.invoice_number} for ${money(Number(invoice.total))}.${url ? ` View: ${url}` : ""}`,
    );
    window.open(
      phone
        ? `https://wa.me/${phone.replace(/^\+/, "")}?text=${text}`
        : `https://wa.me/?text=${text}`,
      "_blank",
    );
    await logReminder.mutateAsync({
      id: invoiceId,
      entry: {
        at: new Date().toISOString(),
        channel: "whatsapp",
        note: "Invoice sent via WhatsApp",
      },
    });
    if (invoice.status === "draft") await changeStatus("sent");
  };

  const sendReminder = async (channel: "email" | "whatsapp" | "manual") => {
    try {
      await logReminder.mutateAsync({
        id: invoiceId,
        entry: { at: new Date().toISOString(), channel, note: reminderNote || null },
      });
      setReminderNote("");
      toast.success("Reminder logged");
      if (channel === "email") void emailInvoice();
      else if (channel === "whatsapp") void whatsappInvoice();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const download = () => {
    void printDocument(".invoice-preview", {
      title: invoiceFileName(invoice?.invoice_number),
    }).catch((e) => toast.error(e.message));
  };

  // Invoices written before a currency was stored fall back to the tenant's
  // currency, never a hardcoded USD — see use-currency.ts.
  const money = (n: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: invoice?.currency || tenantCurrency,
    }).format(n || 0);

  if (isLoading || !invoice) {
    return (
      <div className="flex flex-col h-full">
        <AppTopbar title="Invoice" />
        <div className="p-6 space-y-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-96 w-full max-w-3xl mx-auto" />
        </div>
      </div>
    );
  }

  const meta = INVOICE_STATUS_META[invoice.status];
  const balance = Number(invoice.amount_due || 0);
  const paid = Number(invoice.amount_paid || 0);
  const total = Number(invoice.total || 0);

  return (
    <div className="flex flex-col h-full">
      <AppTopbar
        title={invoice.invoice_number}
        subtitle={invoice.contact?.email || workspace?.name}
        actions={
          <ActionBar
            primary={[
              balance > 0 && invoice.status !== "void" && (
                <Button key="record-payment" size="sm" onClick={() => setPayOpen(true)}>
                  <DollarSign className="h-4 w-4 " /> Record payment
                </Button>
              ),
              invoice.status === "draft" && (
                <Button key="send" size="sm" onClick={() => changeStatus("sent")}>
                  <Send className="h-4 w-4 " /> Send
                </Button>
              ),
            ]}
            overflow={[
              <DropdownMenuItem key="edit" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4 mr-2" /> Edit
              </DropdownMenuItem>,
              <DropdownMenuItem key="download" onClick={download}>
                <Printer className="h-4 w-4 mr-2" /> Download PDF
              </DropdownMenuItem>,
              <DropdownMenuItem key="share" onClick={share}>
                <Share2 className="h-4 w-4 mr-2" /> Share link
              </DropdownMenuItem>,
              <DropdownMenuItem key="email" onClick={emailInvoice}>
                <Mail className="h-4 w-4 mr-2" /> Email
              </DropdownMenuItem>,
              <DropdownMenuItem key="whatsapp" onClick={whatsappInvoice}>
                <MessageCircle className="h-4 w-4 mr-2" /> WhatsApp
              </DropdownMenuItem>,
              invoice.status !== "void" && invoice.status !== "paid" && (
                <DropdownMenuItem key="void" onClick={() => changeStatus("void")}>
                  <Ban className="h-4 w-4 mr-2" /> Void
                </DropdownMenuItem>
              ),
            ]}
          />
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="no-print flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/invoices" })}>
            <ArrowLeft className="h-4 w-4 " /> Back
          </Button>
          <Badge variant="outline" className={meta.tone}>
            {meta.label}
          </Badge>
          {recurring?.enabled && (
            <Badge variant="outline" className="gap-1">
              <Repeat className="h-3 w-3" />
              {recurring.frequency}
            </Badge>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Card className="p-4">
            <div className="text-xs  text-muted-foreground">Total</div>
            <div className="text-xl font-semibold  mt-1">{money(total)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs  text-muted-foreground">Paid</div>
            <div className="text-xl font-semibold  mt-1 text-emerald-600">
              {money(paid)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs  text-muted-foreground">Balance</div>
            <div
              className={`text-xl font-semibold  mt-1 ${balance > 0 ? "text-red-600" : "text-emerald-600"}`}
            >
              {money(balance)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs  text-muted-foreground">Due date</div>
            <div className="text-xl font-semibold mt-1">
              {invoice.due_date ? zonedDate(invoice.due_date, { dateStyle: "short" }) : "—"}
            </div>
          </Card>
        </div>

        <Tabs defaultValue="preview" className="no-print">
          <TabsList>
            <TabsTrigger value="preview">
              <Receipt className="h-4 w-4 " /> Preview
            </TabsTrigger>
            <TabsTrigger value="payments">
              <DollarSign className="h-4 w-4 " /> Payments ({payments?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="reminders">
              <Bell className="h-4 w-4 " /> Reminders
            </TabsTrigger>
            <TabsTrigger value="timeline">
              <History className="h-4 w-4 " /> Timeline
            </TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="mt-4">
            <InvoicePreview invoice={invoice} workspaceName={workspace?.name} />
          </TabsContent>

          <TabsContent value="payments" className="mt-4">
            <Card className="p-4 space-y-3">
              {(payments?.length ?? 0) === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  No payments recorded yet.
                </div>
              ) : (
                <div className="divide-y">
                  {payments!.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 py-3">
                      <CheckCircle2
                        className={`h-4 w-4 ${p.status === "succeeded" ? "text-emerald-600" : "text-muted-foreground"}`}
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium ">
                          {money(Number(p.amount))}{" "}
                          <span className="text-xs text-muted-foreground ml-1 uppercase">
                            {p.method.replace("_", " ")}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {p.paid_at &&
                            zonedDate(p.paid_at, { dateStyle: "medium", timeStyle: "short" })}
                          {p.reference && ` · Ref ${p.reference}`}
                        </div>
                        {p.notes && (
                          <div className="text-xs mt-1 text-muted-foreground italic">{p.notes}</div>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={async () => {
                          if (!confirm("Delete this payment record?")) return;
                          try {
                            await deletePayment.mutateAsync({ id: p.id, invoice_id: invoiceId });
                            toast.success("Payment removed");
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {balance > 0 && (
                <div>
                  <Separator className="my-3" />
                  <Button onClick={() => setPayOpen(true)}>
                    <DollarSign className="h-4 w-4 " /> Record another payment
                  </Button>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="reminders" className="mt-4">
            <Card className="p-4 space-y-3 max-w-2xl">
              <div className="text-sm text-muted-foreground">
                Send a payment reminder to the customer. Reminders are logged on this invoice.
              </div>
              <Textarea
                placeholder="Optional note for the reminder log"
                value={reminderNote}
                onChange={(e) => setReminderNote(e.target.value)}
                rows={2}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => sendReminder("email")}
                  disabled={!invoice.contact?.email}
                >
                  <Mail className="h-4 w-4 " /> Email reminder
                </Button>
                <Button size="sm" variant="outline" onClick={() => sendReminder("whatsapp")}>
                  <MessageCircle className="h-4 w-4 " /> WhatsApp reminder
                </Button>
                <Button size="sm" variant="ghost" onClick={() => sendReminder("manual")}>
                  <Bell className="h-4 w-4 " /> Log manual reminder
                </Button>
              </div>
              <Separator />
              <div>
                <div className="text-xs  text-muted-foreground mb-2">History</div>
                {reminders.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No reminders sent yet.</div>
                ) : (
                  <div className="space-y-2">
                    {reminders.map((r, i) => (
                      <div key={i} className="text-sm flex items-start gap-2">
                        <Bell className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
                        <div>
                          <div className="capitalize">
                            {r.channel} ·{" "}
                            <span className="text-muted-foreground">
                              {zonedDate(r.at, { dateStyle: "medium", timeStyle: "short" })}
                            </span>
                          </div>
                          {r.note && (
                            <div className="text-xs text-muted-foreground italic">{r.note}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="timeline" className="mt-4">
            <Card className="p-4">
              <ol className="relative border-l pl-6 space-y-4">
                <TimelineItem label="Created" at={invoice.created_at} />
                {invoice.sent_at && <TimelineItem label="Sent" at={invoice.sent_at} />}
                {invoice.viewed_at && <TimelineItem label="Viewed" at={invoice.viewed_at} />}
                {(payments ?? []).map((p) => (
                  <TimelineItem
                    key={p.id}
                    label={`Payment ${money(Number(p.amount))} (${p.method.replace("_", " ")})`}
                    at={p.paid_at ?? p.created_at}
                    tone="text-emerald-600"
                  />
                ))}
                {reminders.map((r, i) => (
                  <TimelineItem
                    key={`r-${i}`}
                    label={`Reminder via ${r.channel}`}
                    at={r.at}
                    tone="text-amber-600"
                  />
                ))}
                {invoice.paid_at && (
                  <TimelineItem label="Paid in full" at={invoice.paid_at} tone="text-emerald-700" />
                )}
                {invoice.voided_at && (
                  <TimelineItem label="Voided" at={invoice.voided_at} tone="text-red-600" />
                )}
              </ol>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Print-only view */}
        <div className="hidden print:block">
          <InvoicePreview invoice={invoice} workspaceName={workspace?.name} />
        </div>
      </div>

      <InvoiceFormDialog open={editOpen} onOpenChange={setEditOpen} invoice={invoice} />
      <RecordPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        invoiceId={invoiceId}
        maxAmount={balance}
        currency={invoice.currency}
      />
    </div>
  );
}

function TimelineItem({ label, at, tone }: { label: string; at: string; tone?: string }) {
  const zonedDate = useZonedDateFormatter();
  return (
    <li className="ml-2">
      <div className="absolute -left-1.5 h-3 w-3 rounded-full bg-primary/70 border-2 border-background" />
      <div className={`text-sm font-medium ${tone ?? ""}`}>{label}</div>
      <div className="text-xs text-muted-foreground">
        {zonedDate(at, { dateStyle: "medium", timeStyle: "short" })}
      </div>
    </li>
  );
}
