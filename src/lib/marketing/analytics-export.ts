import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Metrics, TrendPoint } from "@/hooks/use-campaign-analytics";

type TopRow = {
  name: string;
  status: string;
  sent: number;
  delivered: number;
  replied: number;
  clicked: number;
  conversions: number;
  revenue: number;
};

const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtCur = (n: number) => `$${n.toFixed(2)}`;

function objectRows(rows: readonly object[]): unknown[][] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]!);
  return [headers, ...rows.map((row) => headers.map((header) => Reflect.get(row, header)))];
}

export async function exportAnalyticsXlsx(opts: {
  range: string;
  metrics: Metrics;
  trend: TrendPoint[];
  top: TopRow[];
  audience: { date: string; total: number; added: number }[];
}) {
  const wb = new ExcelJS.Workbook();

  const summary = [
    ["Metric", "Value"],
    ["Range", opts.range],
    ["Generated", new Date().toISOString()],
    [],
    ["Sent Messages", opts.metrics.sent],
    ["Delivered", opts.metrics.delivered],
    ["Read", opts.metrics.read],
    ["Failed", opts.metrics.failed],
    ["Response Rate", fmtPct(opts.metrics.responseRate)],
    ["Click Rate", fmtPct(opts.metrics.clickRate)],
    ["Conversion Rate", fmtPct(opts.metrics.conversionRate)],
    ["Opt-outs", opts.metrics.optedOut],
    ["Revenue", fmtCur(opts.metrics.revenue)],
    ["Cost", fmtCur(opts.metrics.cost)],
    ["Cost per Campaign", fmtCur(opts.metrics.costPerCampaign)],
    ["Active Campaigns", opts.metrics.activeCampaigns],
    ["Total Campaigns", opts.metrics.totalCampaigns],
  ];
  wb.addWorksheet("Summary").addRows(summary);

  wb.addWorksheet("Engagement Trend").addRows(objectRows(opts.trend));

  wb.addWorksheet("Top Campaigns").addRows(
    objectRows(
      opts.top.map((t) => ({
        Campaign: t.name,
        Status: t.status,
        Sent: t.sent,
        Delivered: t.delivered,
        Replied: t.replied,
        Clicked: t.clicked,
        Conversions: t.conversions,
        Revenue: t.revenue,
      })),
    ),
  );

  wb.addWorksheet("Audience Growth").addRows(objectRows(opts.audience));

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `campaign-analytics-${opts.range}-${Date.now()}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportAnalyticsPdf(opts: {
  range: string;
  metrics: Metrics;
  trend: TrendPoint[];
  top: TopRow[];
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const now = new Date().toLocaleString();
  doc.setFontSize(18);
  doc.text("Campaign Analytics", 40, 50);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Range: ${opts.range}    Generated: ${now}`, 40, 68);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 88,
    head: [["KPI", "Value"]],
    body: [
      ["Sent Messages", opts.metrics.sent.toLocaleString()],
      ["Delivered", opts.metrics.delivered.toLocaleString()],
      ["Read", opts.metrics.read.toLocaleString()],
      ["Failed", opts.metrics.failed.toLocaleString()],
      ["Response Rate", fmtPct(opts.metrics.responseRate)],
      ["Click Rate", fmtPct(opts.metrics.clickRate)],
      ["Conversion Rate", fmtPct(opts.metrics.conversionRate)],
      ["Opt-outs", opts.metrics.optedOut.toLocaleString()],
      ["Revenue Generated", fmtCur(opts.metrics.revenue)],
      ["Cost", fmtCur(opts.metrics.cost)],
      ["Cost per Campaign", fmtCur(opts.metrics.costPerCampaign)],
    ],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [30, 41, 59] },
  });

  autoTable(doc, {
    head: [["Campaign", "Status", "Sent", "Delivered", "Replied", "Clicked", "Conv.", "Revenue"]],
    body: opts.top.map((t) => [
      t.name,
      t.status,
      t.sent.toLocaleString(),
      t.delivered.toLocaleString(),
      t.replied.toLocaleString(),
      t.clicked.toLocaleString(),
      t.conversions.toLocaleString(),
      fmtCur(t.revenue),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 41, 59] },
    margin: { top: 40 },
  });

  doc.save(`campaign-analytics-${opts.range}-${Date.now()}.pdf`);
}
