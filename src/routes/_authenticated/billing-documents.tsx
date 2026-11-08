import { requireWorkspaceRole } from "@/lib/rbac";
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  FileText,
  Plus,
  Printer,
  Download,
  Mail,
  Trash2,
  CheckCircle2,
  XCircle,
  Search,
  Palette,
  Loader2,
  Receipt,
  RefreshCw,
  FileMinus,
} from "lucide-react";
import { toast } from "sonner";

import { AppTopbar } from "@/components/app/app-topbar";
import { useActiveOrganization } from "@/hooks/use-organization";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DatePicker, fromDateString, toDateString } from "@/shared/components";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

import {
  listBillingDocuments,
  getBillingDocument,
  createBillingDocument,
  issueBillingDocument,
  voidBillingDocument,
  markDocumentSent,
  deleteBillingDocument,
  listDocumentTemplates,
  upsertDocumentTemplate,
  listTaxRates,
} from "@/lib/billing/documents.functions";
import {
  downloadDocumentPdf,
  printDocumentPdf,
  type DocumentLike,
  type TemplateLike,
} from "@/lib/billing/document-pdf";
import { useTenantCurrency } from "@/hooks/use-currency";
import { useTenantTimezone, useZonedDateFormatter } from "@/hooks/use-timezone";
import { formatInTimezone } from "@/lib/datetime/timezone";

export const Route = createFileRoute("/_authenticated/billing-documents")({
  beforeLoad: requireWorkspaceRole("owner", "admin"),
  staticData: { breadcrumb: "Billing Documents" },
  head: () => ({
    meta: [
      { title: "Billing Documents" },
      {
        name: "description",
        content:
          "Manage invoices, credit notes, receipts, and refund receipts with branded templates, tax rules, and localization.",
      },
    ],
  }),
  component: BillingDocumentsPage,
});

type DocType = "invoice" | "credit_note" | "receipt" | "refund_receipt";
const DOC_ICONS: Record<DocType, typeof FileText> = {
  invoice: FileText,
  credit_note: FileMinus,
  receipt: Receipt,
  refund_receipt: RefreshCw,
};
const DOC_LABELS: Record<DocType, string> = {
  invoice: "Invoices",
  credit_note: "Credit notes",
  receipt: "Receipts",
  refund_receipt: "Refund receipts",
};

const LOCALES = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "de-DE", label: "Deutsch" },
  { value: "es-ES", label: "Español" },
  { value: "fr-FR", label: "Français" },
  { value: "pt-BR", label: "Português (BR)" },
  { value: "it-IT", label: "Italiano" },
  { value: "nb-NO", label: "Norsk" },
  { value: "hi-IN", label: "हिन्दी" },
  { value: "ar-SA", label: "العربية" },
];

const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "ZAR",
  "INR",
  "NOK",
  "SEK",
  "AUD",
  "CAD",
  "BRL",
  "AED",
  "SGD",
  "JPY",
  "CHF",
  "NZD",
  "HKD",
  "MXN",
  "NGN",
  "KES",
  "GHS",
  "ZMW",
];

function money(cents: number, currency: string, locale = "en-US") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

function statusBadge(status: string) {
  const variants: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    issued: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    sent: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
    paid: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    void: "bg-red-500/15 text-red-600 dark:text-red-400",
    refunded: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  };
  return (
    <Badge className={variants[status] ?? ""} variant="outline">
      {status}
    </Badge>
  );
}

function BillingDocumentsPage() {
  const tz = useTenantTimezone();
  const { active: org } = useActiveOrganization();
  const qc = useQueryClient();
  const [tab, setTab] = useState<DocType>("invoice");
  const [search, setSearch] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [openTpl, setOpenTpl] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listFn = useServerFn(listBillingDocuments);
  const tplListFn = useServerFn(listDocumentTemplates);
  const ratesFn = useServerFn(listTaxRates);

  const documents = useQuery({
    queryKey: ["billing-documents", org?.id, tab, search],
    enabled: !!org?.id,
    queryFn: () =>
      listFn({ data: { organization_id: org!.id, type: tab, search: search || undefined } }),
  });

  const templates = useQuery({
    queryKey: ["billing-doc-templates", org?.id],
    enabled: !!org?.id,
    queryFn: () => tplListFn({ data: { organization_id: org!.id } }),
  });

  const taxRates = useQuery({ queryKey: ["tax-rates"], queryFn: () => ratesFn() });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["billing-documents"] });
    qc.invalidateQueries({ queryKey: ["billing-doc-templates"] });
  };

  return (
    <div className="flex flex-col h-full">
      <AppTopbar title="Billing Documents" subtitle="Invoices, credit notes, receipts & refunds" />
      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search number, customer, email"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpenTpl(true)}>
              <Palette className="h-4 w-4" /> Templates
            </Button>
            <Button onClick={() => setOpenNew(true)}>
              <Plus className="h-4 w-4" /> New document
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as DocType)}>
          <TabsList>
            {(Object.keys(DOC_LABELS) as DocType[]).map((t) => {
              const Icon = DOC_ICONS[t];
              return (
                <TabsTrigger key={t} value={t} className="gap-2">
                  <Icon className="h-4 w-4" /> {DOC_LABELS[t]}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {(Object.keys(DOC_LABELS) as DocType[]).map((t) => (
            <TabsContent key={t} value={t} className="mt-4">
              <Card className="p-0 overflow-hidden">
                {documents.isLoading ? (
                  <div className="py-16 text-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 mx-auto animate-spin" />
                  </div>
                ) : (documents.data ?? []).length === 0 ? (
                  <div className="py-16 text-center text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No {DOC_LABELS[t].toLowerCase()} yet.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Number</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Issued</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="w-[100px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(documents.data ?? []).map((d: any) => (
                        <TableRow
                          key={d.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedId(d.id)}
                        >
                          <TableCell className="font-mono font-medium">{d.number}</TableCell>
                          <TableCell>
                            <div className="font-medium">{d.customer_name ?? "—"}</div>
                            {d.customer_email && (
                              <div className="text-xs text-muted-foreground">
                                {d.customer_email}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatInTimezone(
                              d.issued_at ?? d.created_at,
                              tz,
                              { dateStyle: "medium" },
                              d.locale,
                            )}
                          </TableCell>
                          <TableCell>{statusBadge(d.status)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {money(d.total_cents, d.currency, d.locale)}
                          </TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {openNew && org && (
        <NewDocumentDialog
          open={openNew}
          onOpenChange={setOpenNew}
          organizationId={org.id}
          defaultType={tab}
          templates={templates.data ?? []}
          taxRates={taxRates.data ?? []}
          onCreated={() => {
            setOpenNew(false);
            refresh();
          }}
        />
      )}
      {openTpl && org && (
        <TemplatesDialog
          open={openTpl}
          onOpenChange={setOpenTpl}
          organizationId={org.id}
          templates={templates.data ?? []}
          onChanged={refresh}
        />
      )}
      {selectedId && (
        <DocumentDetail id={selectedId} onClose={() => setSelectedId(null)} onChanged={refresh} />
      )}
    </div>
  );
}

// -------------------- New Document Dialog --------------------

interface LineDraft {
  description: string;
  quantity: number;
  unit_amount_cents: number;
  tax_rate_id?: string | null;
}

function NewDocumentDialog({
  open,
  onOpenChange,
  organizationId,
  defaultType,
  templates,
  taxRates,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  defaultType: DocType;
  templates: any[];
  taxRates: any[];
  onCreated: () => void;
}) {
  const [type, setType] = useState<DocType>(defaultType);
  const [templateId, setTemplateId] = useState<string>(
    templates.find((t) => t.is_default)?.id ?? "",
  );
  const tenantCurrency = useTenantCurrency();
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerTaxId, setCustomerTaxId] = useState("");
  const [currency, setCurrency] = useState(tenantCurrency);
  // Sync currency when org data loads asynchronously (useState initial value
  // is captured at first render before the org query resolves).
  useEffect(() => {
    setCurrency(tenantCurrency);
  }, [tenantCurrency]);
  const [locale, setLocale] = useState("en-US");
  const [notes, setNotes] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [discount, setDiscount] = useState(0);
  const [taxExempt, setTaxExempt] = useState(false);
  const [items, setItems] = useState<LineDraft[]>([
    { description: "", quantity: 1, unit_amount_cents: 0, tax_rate_id: null },
  ]);

  const createFn = useServerFn(createBillingDocument);
  const issueFn = useServerFn(issueBillingDocument);

  const totals = useMemo(() => {
    let sub = 0;
    let tax = 0;
    for (const it of items) {
      const line = Math.round(it.quantity * it.unit_amount_cents);
      sub += line;
      if (!taxExempt && it.tax_rate_id) {
        const r = taxRates.find((t) => t.id === it.tax_rate_id);
        if (r) tax += Math.round((line * Number(r.rate_percent)) / 100);
      }
    }
    return { sub, tax, total: sub - discount + tax };
  }, [items, discount, taxExempt, taxRates]);

  const create = useMutation({
    mutationFn: async (issue: boolean) => {
      const doc = await createFn({
        data: {
          organization_id: organizationId,
          type,
          template_id: templateId || undefined,
          customer_name: customerName || undefined,
          customer_email: customerEmail || undefined,
          customer_tax_id: customerTaxId || undefined,
          currency,
          locale,
          discount_cents: discount,
          line_items: items
            .filter((i) => i.description)
            .map((i) => ({
              description: i.description,
              quantity: Number(i.quantity),
              unit_amount_cents: Number(i.unit_amount_cents),
              tax_rate_id: i.tax_rate_id || undefined,
            })),
          notes: notes || undefined,
          due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
          tax_exempt: taxExempt,
        },
      });
      if (issue) await issueFn({ data: { id: (doc as any).id } });
      return doc;
    },
    onSuccess: () => {
      toast.success("Document created");
      onCreated();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New billing document</DialogTitle>
          <DialogDescription>
            Create an invoice, credit note, receipt, or refund receipt with tax and localization.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Document type</Label>
            <Select value={type} onValueChange={(v) => setType(v as DocType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="invoice">Invoice</SelectItem>
                <SelectItem value="credit_note">Credit note</SelectItem>
                <SelectItem value="receipt">Receipt</SelectItem>
                <SelectItem value="refund_receipt">Refund receipt</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="No template (auto number)" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {t.is_default ? " • default" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Customer name</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Customer email</Label>
            <Input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Customer Tax ID (VAT/GST)</Label>
            <Input value={customerTaxId} onChange={(e) => setCustomerTaxId(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Due date</Label>
            <DatePicker value={fromDateString(dueAt)} onChange={(d) => setDueAt(toDateString(d))} />
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Locale</Label>
            <Select value={locale} onValueChange={setLocale}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2 mt-2">
          <div className="flex items-center justify-between">
            <Label>Line items</Label>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                id="tax-exempt"
                checked={taxExempt}
                onCheckedChange={(v) => setTaxExempt(v === true)}
              />
              <Label htmlFor="tax-exempt" className="font-normal text-xs text-muted-foreground">
                Tax exempt
              </Label>
            </div>
          </div>
          <div className="border rounded-control divide-y">
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 p-2 items-center">
                <Input
                  className="col-span-5"
                  placeholder="Description"
                  value={it.description}
                  onChange={(e) =>
                    setItems((s) =>
                      s.map((r, i) => (i === idx ? { ...r, description: e.target.value } : r)),
                    )
                  }
                />
                <Input
                  className="col-span-1"
                  type="number"
                  min={0}
                  step="0.01"
                  value={it.quantity}
                  onChange={(e) =>
                    setItems((s) =>
                      s.map((r, i) => (i === idx ? { ...r, quantity: Number(e.target.value) } : r)),
                    )
                  }
                />
                <Input
                  className="col-span-2"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Unit price"
                  value={(it.unit_amount_cents / 100).toString()}
                  onChange={(e) =>
                    setItems((s) =>
                      s.map((r, i) =>
                        i === idx
                          ? { ...r, unit_amount_cents: Math.round(Number(e.target.value) * 100) }
                          : r,
                      ),
                    )
                  }
                />
                <Select
                  value={it.tax_rate_id ?? "none"}
                  onValueChange={(v) =>
                    setItems((s) =>
                      s.map((r, i) =>
                        i === idx ? { ...r, tax_rate_id: v === "none" ? null : v } : r,
                      ),
                    )
                  }
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="No tax" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No tax</SelectItem>
                    {taxRates.map((r: any) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name} ({Number(r.rate_percent)}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="ghost"
                  className="col-span-1"
                  onClick={() => setItems((s) => s.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setItems((s) => [
                ...s,
                { description: "", quantity: 1, unit_amount_cents: 0, tax_rate_id: null },
              ])
            }
          >
            <Plus className="h-4 w-4 " /> Add line
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-2">
          <div className="space-y-2">
            <Label>Discount</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={(discount / 100).toString()}
              onChange={(e) => setDiscount(Math.round(Number(e.target.value) * 100))}
            />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <div className="border-t pt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{money(totals.sub, currency, locale)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span>-{money(discount, currency, locale)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax</span>
            <span>{money(totals.tax, currency, locale)}</span>
          </div>
          <div className="flex justify-between font-semibold text-base pt-1">
            <span>Total</span>
            <span>{money(totals.total, currency, locale)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            disabled={create.isPending}
            onClick={() => create.mutate(false)}
          >
            Save as draft
          </Button>
          <Button disabled={create.isPending} onClick={() => create.mutate(true)}>
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create & issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------------- Templates Dialog --------------------

function TemplatesDialog({
  open,
  onOpenChange,
  organizationId,
  templates,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  templates: any[];
  onChanged: () => void;
}) {
  // An invoice template is created in the tenant currency, not dollars.
  const tenantCurrency = useTenantCurrency();
  const [editing, setEditing] = useState<any>(
    templates[0] ?? {
      organization_id: organizationId,
      name: "Default",
      is_default: true,
      document_type: "invoice",
      primary_color: "#0066FF",
      accent_color: "#0A0A0A",
      number_prefix: "INV-",
      number_padding: 5,
      currency: tenantCurrency,
      locale: "en-US",
    },
  );
  const upsertFn = useServerFn(upsertDocumentTemplate);

  const save = useMutation({
    mutationFn: () => upsertFn({ data: { ...editing, organization_id: organizationId } }),
    onSuccess: () => {
      toast.success("Template saved");
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Document templates</DialogTitle>
          <DialogDescription>
            Brand your invoices and receipts. Set colors, logo, addresses, and numbering.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-4">
          <div className="col-span-1 border rounded-control p-2 space-y-1">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setEditing(t)}
                className={`w-full text-left px-2 py-1.5 rounded text-sm ${editing?.id === t.id ? "bg-muted" : "hover:bg-muted/50"}`}
              >
                <div className="font-medium truncate">{t.name}</div>
                {t.is_default && <div className="text-[11px] text-muted-foreground">Default</div>}
              </button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() =>
                setEditing({
                  organization_id: organizationId,
                  name: "New template",
                  is_default: false,
                  document_type: "invoice",
                  primary_color: "#0066FF",
                  accent_color: "#0A0A0A",
                  number_prefix: "INV-",
                  number_padding: 5,
                  currency: tenantCurrency,
                  locale: "en-US",
                })
              }
            >
              <Plus className="h-4 w-4" /> New
            </Button>
          </div>

          <div className="col-span-3 grid grid-cols-2 gap-3">
            <div className="space-y-2 col-span-2">
              <Label>Template name</Label>
              <Input
                value={editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Company name</Label>
              <Input
                value={editing.company_name ?? ""}
                onChange={(e) => setEditing({ ...editing, company_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Company email</Label>
              <Input
                value={editing.company_email ?? ""}
                onChange={(e) => setEditing({ ...editing, company_email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Company phone</Label>
              <Input
                value={editing.company_phone ?? ""}
                onChange={(e) => setEditing({ ...editing, company_phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input
                value={editing.company_website ?? ""}
                onChange={(e) => setEditing({ ...editing, company_website: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Tax ID</Label>
              <Input
                value={editing.company_tax_id ?? ""}
                onChange={(e) => setEditing({ ...editing, company_tax_id: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Logo URL</Label>
              <Input
                value={editing.company_logo_url ?? ""}
                onChange={(e) => setEditing({ ...editing, company_logo_url: e.target.value })}
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Address (JSON)</Label>
              <Textarea
                rows={3}
                value={JSON.stringify(editing.company_address ?? {}, null, 2)}
                onChange={(e) => {
                  try {
                    setEditing({ ...editing, company_address: JSON.parse(e.target.value) });
                  } catch {
                    /* ignore */
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Primary color</Label>
              <Input
                type="color"
                value={editing.primary_color ?? "#0066FF"}
                onChange={(e) => setEditing({ ...editing, primary_color: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Accent color</Label>
              <Input
                type="color"
                value={editing.accent_color ?? "#0A0A0A"}
                onChange={(e) => setEditing({ ...editing, accent_color: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Number prefix</Label>
              <Input
                value={editing.number_prefix ?? "INV-"}
                onChange={(e) => setEditing({ ...editing, number_prefix: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Number padding</Label>
              <Input
                type="number"
                value={editing.number_padding ?? 5}
                onChange={(e) => setEditing({ ...editing, number_padding: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Footer note</Label>
              <Input
                value={editing.footer_note ?? ""}
                onChange={(e) => setEditing({ ...editing, footer_note: e.target.value })}
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Terms</Label>
              <Textarea
                rows={3}
                value={editing.terms ?? ""}
                onChange={(e) => setEditing({ ...editing, terms: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2 col-span-2 text-sm">
              <Checkbox
                id="is-default-template"
                checked={!!editing.is_default}
                onCheckedChange={(v) => setEditing({ ...editing, is_default: v === true })}
              />
              <Label htmlFor="is-default-template" className="font-normal">
                Set as default template
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------------- Document Detail Sheet --------------------

function DocumentDetail({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const zonedDate = useZonedDateFormatter();
  const getFn = useServerFn(getBillingDocument);
  const issueFn = useServerFn(issueBillingDocument);
  const voidFn = useServerFn(voidBillingDocument);
  const emailFn = useServerFn(markDocumentSent);
  const delFn = useServerFn(deleteBillingDocument);

  const q = useQuery({ queryKey: ["billing-doc", id], queryFn: () => getFn({ data: { id } }) });
  const [emailTo, setEmailTo] = useState("");
  const [openEmail, setOpenEmail] = useState(false);

  const doc = q.data?.document as DocumentLike | undefined;
  const template = q.data?.template as TemplateLike | null | undefined;
  const history = q.data?.history ?? [];

  const issue = useMutation({
    mutationFn: () => issueFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Issued");
      q.refetch();
      onChanged();
    },
  });
  const voidM = useMutation({
    mutationFn: () => voidFn({ data: { id, reason: "voided from UI" } }),
    onSuccess: () => {
      toast.success("Voided");
      q.refetch();
      onChanged();
    },
  });
  const email = useMutation({
    mutationFn: () => emailFn({ data: { id, to_email: emailTo } }),
    onSuccess: () => {
      toast.success("Email logged");
      setOpenEmail(false);
      q.refetch();
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const del = useMutation({
    mutationFn: () => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      onClose();
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{doc ? `${doc.number}` : "Loading"}</SheetTitle>
        </SheetHeader>
        {doc && (
          <div className="space-y-4 mt-4">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadDocumentPdf(doc, template ?? null)}
              >
                <Download className="h-4 w-4" /> Download PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => printDocumentPdf(doc, template ?? null)}
              >
                <Printer className="h-4 w-4" /> Print
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEmailTo(doc.customer_email ?? "");
                  setOpenEmail(true);
                }}
              >
                <Mail className="h-4 w-4" /> Email
              </Button>
              {doc.status === "draft" && (
                <Button size="sm" onClick={() => issue.mutate()} disabled={issue.isPending}>
                  <CheckCircle2 className="h-4 w-4" /> Issue
                </Button>
              )}
              {["issued", "sent"].includes(doc.status) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => voidM.mutate()}
                  disabled={voidM.isPending}
                >
                  <XCircle className="h-4 w-4" /> Void
                </Button>
              )}
              {doc.status === "draft" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => del.mutate()}
                  disabled={del.isPending}
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              )}
            </div>

            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground uppercase">
                    {doc.type.replace(/_/g, " ")}
                  </div>
                  <div className="font-mono font-semibold">{doc.number}</div>
                </div>
                {statusBadge(doc.status)}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs">Customer</div>
                  <div>{doc.customer_name ?? "—"}</div>
                  <div className="text-muted-foreground">{doc.customer_email}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Total</div>
                  <div className="text-xl font-semibold">
                    {money(doc.total_cents, doc.currency, doc.locale)}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {doc.line_items.map((it, i) => (
                    <TableRow key={i}>
                      <TableCell>{it.description}</TableCell>
                      <TableCell className="text-right">{it.quantity}</TableCell>
                      <TableCell className="text-right">
                        {money(it.unit_amount_cents, doc.currency, doc.locale)}
                      </TableCell>
                      <TableCell className="text-right">
                        {money(
                          Math.round(it.quantity * it.unit_amount_cents),
                          doc.currency,
                          doc.locale,
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            <Card className="p-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{money(doc.subtotal_cents, doc.currency, doc.locale)}</span>
              </div>
              {doc.discount_cents !== 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span>{money(doc.discount_cents, doc.currency, doc.locale)}</span>
                </div>
              )}
              {(doc.tax_breakdown ?? []).map((t, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t.name} ({t.rate_percent}%)
                  </span>
                  <span>{money(t.tax_cents, doc.currency, doc.locale)}</span>
                </div>
              ))}
              <div className="flex justify-between font-semibold text-base pt-1 border-t">
                <span>Total</span>
                <span>{money(doc.total_cents, doc.currency, doc.locale)}</span>
              </div>
            </Card>

            <div>
              <h4 className="text-sm font-semibold mb-2">Activity</h4>
              <ScrollArea className="h-40 border rounded-control p-2">
                {(history as any[]).length === 0 && (
                  <div className="text-xs text-muted-foreground">No activity yet.</div>
                )}
                {(history as any[]).map((h) => (
                  <div key={h.id} className="text-xs py-1 border-b last:border-b-0">
                    <span className="font-medium capitalize">{h.action}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {zonedDate(h.created_at, { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </div>
                ))}
              </ScrollArea>
            </div>
          </div>
        )}

        <Dialog open={openEmail} onOpenChange={setOpenEmail}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Email document</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Recipient email</Label>
              <Input type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                The document will be marked as sent and logged in activity.
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpenEmail(false)}>
                Cancel
              </Button>
              <Button onClick={() => email.mutate()} disabled={!emailTo || email.isPending}>
                Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
