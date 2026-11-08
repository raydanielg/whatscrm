import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface DocumentLike {
  id: string;
  type: "invoice" | "credit_note" | "receipt" | "refund_receipt";
  status: string;
  number: string;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_address?: any;
  customer_tax_id?: string | null;
  currency: string;
  locale: string;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  tax_breakdown: Array<{ code: string; name: string; rate_percent: number; tax_cents: number; taxable_cents: number }>;
  line_items: Array<{ description: string; quantity: number; unit_amount_cents: number; tax_rate_id?: string | null }>;
  notes?: string | null;
  issued_at?: string | null;
  due_at?: string | null;
  created_at: string;
}

export interface TemplateLike {
  company_name?: string | null;
  company_logo_url?: string | null;
  company_address?: any;
  company_tax_id?: string | null;
  company_email?: string | null;
  company_phone?: string | null;
  company_website?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
  footer_note?: string | null;
  terms?: string | null;
}

function money(cents: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

function formatDate(iso: string | null | undefined, locale: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
}

const HEADINGS: Record<string, Record<DocumentLike["type"], string>> = {
  "en-US": { invoice: "INVOICE", credit_note: "CREDIT NOTE", receipt: "RECEIPT", refund_receipt: "REFUND RECEIPT" },
  "en-GB": { invoice: "INVOICE", credit_note: "CREDIT NOTE", receipt: "RECEIPT", refund_receipt: "REFUND RECEIPT" },
  "de-DE": { invoice: "RECHNUNG", credit_note: "GUTSCHRIFT", receipt: "QUITTUNG", refund_receipt: "ERSTATTUNGSBELEG" },
  "es-ES": { invoice: "FACTURA", credit_note: "NOTA DE CRÉDITO", receipt: "RECIBO", refund_receipt: "RECIBO DE REEMBOLSO" },
  "fr-FR": { invoice: "FACTURE", credit_note: "AVOIR", receipt: "REÇU", refund_receipt: "REÇU DE REMBOURSEMENT" },
  "pt-BR": { invoice: "FATURA", credit_note: "NOTA DE CRÉDITO", receipt: "RECIBO", refund_receipt: "RECIBO DE REEMBOLSO" },
  "it-IT": { invoice: "FATTURA", credit_note: "NOTA DI CREDITO", receipt: "RICEVUTA", refund_receipt: "RICEVUTA DI RIMBORSO" },
  "nb-NO": { invoice: "FAKTURA", credit_note: "KREDITNOTA", receipt: "KVITTERING", refund_receipt: "REFUSJONSKVITTERING" },
  "hi-IN": { invoice: "चालान", credit_note: "क्रेडिट नोट", receipt: "रसीद", refund_receipt: "रिफंड रसीद" },
  "ar-SA": { invoice: "فاتورة", credit_note: "إشعار دائن", receipt: "إيصال", refund_receipt: "إيصال استرداد" },
};

const LABELS: Record<string, Record<string, string>> = {
  "en-US": { bill_to: "Bill to", issued: "Issued", due: "Due", subtotal: "Subtotal", discount: "Discount", tax: "Tax", total: "Total", qty: "Qty", unit: "Unit price", amount: "Amount", desc: "Description", notes: "Notes", terms: "Terms" },
  "de-DE": { bill_to: "Rechnung an", issued: "Ausgestellt", due: "Fällig", subtotal: "Zwischensumme", discount: "Rabatt", tax: "Steuer", total: "Gesamt", qty: "Menge", unit: "Einzelpreis", amount: "Betrag", desc: "Beschreibung", notes: "Hinweise", terms: "Bedingungen" },
  "es-ES": { bill_to: "Facturar a", issued: "Emitido", due: "Vencimiento", subtotal: "Subtotal", discount: "Descuento", tax: "Impuesto", total: "Total", qty: "Cant.", unit: "Precio", amount: "Importe", desc: "Descripción", notes: "Notas", terms: "Términos" },
  "fr-FR": { bill_to: "Facturer à", issued: "Émis", due: "Échéance", subtotal: "Sous-total", discount: "Remise", tax: "Taxe", total: "Total", qty: "Qté", unit: "Prix", amount: "Montant", desc: "Description", notes: "Notes", terms: "Conditions" },
  "pt-BR": { bill_to: "Faturar para", issued: "Emitido", due: "Vencimento", subtotal: "Subtotal", discount: "Desconto", tax: "Imposto", total: "Total", qty: "Qtd", unit: "Preço", amount: "Valor", desc: "Descrição", notes: "Notas", terms: "Termos" },
  "it-IT": { bill_to: "Fatturare a", issued: "Emesso", due: "Scadenza", subtotal: "Subtotale", discount: "Sconto", tax: "Imposta", total: "Totale", qty: "Qtà", unit: "Prezzo", amount: "Importo", desc: "Descrizione", notes: "Note", terms: "Condizioni" },
  "nb-NO": { bill_to: "Faktureres til", issued: "Utstedt", due: "Forfall", subtotal: "Subtotal", discount: "Rabatt", tax: "MVA", total: "Sum", qty: "Antall", unit: "Pris", amount: "Beløp", desc: "Beskrivelse", notes: "Notater", terms: "Vilkår" },
};

function labels(locale: string) {
  return LABELS[locale] ?? LABELS["en-US"];
}
function heading(locale: string, type: DocumentLike["type"]) {
  return (HEADINGS[locale] ?? HEADINGS["en-US"])[type];
}

export function buildDocumentPdf(doc: DocumentLike, template: TemplateLike | null): jsPDF {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const w = pdf.internal.pageSize.getWidth();
  const primary = template?.primary_color ?? "#0066FF";
  const accent = template?.accent_color ?? "#0A0A0A";
  const L = labels(doc.locale);
  const heading_text = heading(doc.locale, doc.type);

  // Header band
  pdf.setFillColor(primary);
  pdf.rect(0, 0, w, 6, "F");

  pdf.setTextColor(accent);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.text(heading_text, 40, 50);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor("#666");
  pdf.text(`#${doc.number}`, 40, 68);

  // Company block (right)
  const rightX = w - 40;
  let y = 40;
  pdf.setTextColor(accent);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  if (template?.company_name) { pdf.text(template.company_name, rightX, y, { align: "right" }); y += 14; }
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor("#555");
  const addr = template?.company_address as { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string } | null;
  if (addr?.line1) { pdf.text(addr.line1, rightX, y, { align: "right" }); y += 12; }
  if (addr?.line2) { pdf.text(addr.line2, rightX, y, { align: "right" }); y += 12; }
  const cityLine = [addr?.city, addr?.state, addr?.postal_code].filter(Boolean).join(", ");
  if (cityLine) { pdf.text(cityLine, rightX, y, { align: "right" }); y += 12; }
  if (addr?.country) { pdf.text(addr.country, rightX, y, { align: "right" }); y += 12; }
  if (template?.company_tax_id) { pdf.text(`Tax ID: ${template.company_tax_id}`, rightX, y, { align: "right" }); y += 12; }
  if (template?.company_email) { pdf.text(template.company_email, rightX, y, { align: "right" }); y += 12; }
  if (template?.company_phone) { pdf.text(template.company_phone, rightX, y, { align: "right" }); y += 12; }

  // Bill-to + meta
  let cy = 110;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(accent);
  pdf.text(L.bill_to, 40, cy);
  cy += 14;
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor("#333");
  if (doc.customer_name) { pdf.text(doc.customer_name, 40, cy); cy += 12; }
  if (doc.customer_email) { pdf.text(doc.customer_email, 40, cy); cy += 12; }
  const caddr = doc.customer_address as any;
  if (caddr?.line1) { pdf.text(caddr.line1, 40, cy); cy += 12; }
  const ccity = [caddr?.city, caddr?.state, caddr?.postal_code, caddr?.country].filter(Boolean).join(", ");
  if (ccity) { pdf.text(ccity, 40, cy); cy += 12; }
  if (doc.customer_tax_id) { pdf.text(`Tax ID: ${doc.customer_tax_id}`, 40, cy); cy += 12; }

  // Meta right col
  const meta: Array<[string, string]> = [
    [L.issued, formatDate(doc.issued_at ?? doc.created_at, doc.locale)],
  ];
  if (doc.type === "invoice" && doc.due_at) meta.push([L.due, formatDate(doc.due_at, doc.locale)]);
  let my = 110;
  meta.forEach(([k, v]) => {
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(accent);
    pdf.text(k + ":", rightX - 100, my, { align: "left" });
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor("#333");
    pdf.text(v, rightX, my, { align: "right" });
    my += 14;
  });

  const tableStart = Math.max(cy, my) + 20;

  // Line items
  const currency = doc.currency;
  const rows = doc.line_items.map((it) => [
    it.description,
    String(it.quantity),
    money(it.unit_amount_cents, currency, doc.locale),
    money(Math.round(it.quantity * it.unit_amount_cents), currency, doc.locale),
  ]);

  autoTable(pdf, {
    startY: tableStart,
    head: [[L.desc, L.qty, L.unit, L.amount]],
    body: rows,
    styles: { fontSize: 10, cellPadding: 8, textColor: "#333" },
    headStyles: { fillColor: primary, textColor: "#fff", fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
    theme: "grid",
    tableLineColor: "#e5e5e5",
  });

  // Totals
  // @ts-expect-error jspdf-autotable adds lastAutoTable
  const endY = (pdf.lastAutoTable?.finalY ?? tableStart) + 20;
  let ty = endY;
  const totalX = rightX;
  const totalLabelX = totalX - 160;
  const addRow = (label: string, value: string, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(bold ? 12 : 10);
    pdf.setTextColor(bold ? accent : "#555");
    pdf.text(label, totalLabelX, ty);
    pdf.text(value, totalX, ty, { align: "right" });
    ty += bold ? 20 : 16;
  };
  const sign = doc.type === "credit_note" || doc.type === "refund_receipt" ? -1 : 1;
  addRow(L.subtotal, money(sign * doc.subtotal_cents / sign, currency, doc.locale));
  if (doc.discount_cents !== 0) addRow(L.discount, "-" + money(Math.abs(doc.discount_cents), currency, doc.locale));
  for (const t of doc.tax_breakdown ?? []) {
    addRow(`${t.name} (${t.rate_percent}%)`, money(t.tax_cents, currency, doc.locale));
  }
  addRow(L.total, money(doc.total_cents, currency, doc.locale), true);

  // Notes & terms
  if (doc.notes) {
    ty += 10;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(accent);
    pdf.text(L.notes, 40, ty);
    ty += 14;
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor("#555");
    const wrapped = pdf.splitTextToSize(doc.notes, w - 80);
    pdf.text(wrapped, 40, ty);
    ty += wrapped.length * 12;
  }
  if (template?.terms) {
    ty += 10;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(accent);
    pdf.text(L.terms, 40, ty);
    ty += 14;
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor("#555");
    const wrapped = pdf.splitTextToSize(template.terms, w - 80);
    pdf.text(wrapped, 40, ty);
  }

  // Footer
  pdf.setFontSize(8);
  pdf.setTextColor("#999");
  const footer = template?.footer_note ?? `${heading_text} · ${doc.number}`;
  pdf.text(footer, w / 2, pdf.internal.pageSize.getHeight() - 24, { align: "center" });

  return pdf;
}

export function downloadDocumentPdf(doc: DocumentLike, template: TemplateLike | null) {
  const pdf = buildDocumentPdf(doc, template);
  pdf.save(`${doc.number}.pdf`);
}

export function printDocumentPdf(doc: DocumentLike, template: TemplateLike | null) {
  const pdf = buildDocumentPdf(doc, template);
  const blob = pdf.output("bloburl");
  const w = window.open(blob as unknown as string, "_blank");
  if (w) {
    w.onload = () => {
      try { w.focus(); w.print(); } catch { /* ignore */ }
    };
  }
}
