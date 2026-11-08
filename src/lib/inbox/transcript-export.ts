import { supabase } from "@/integrations/supabase/client";
import { sbAny } from "@/lib/supabase/untyped";

export type TranscriptMessage = {
  created_at: string;
  direction: string;
  message_type: string;
  status: string;
  body: string | null;
  media_url: string | null;
  is_internal: boolean;
  from_address: string | null;
  to_address: string | null;
  sent_by: string | null;
  sender_name: string | null;
};

export type TranscriptMeta = {
  conversationId: string;
  channel: string;
  contactName: string;
  subject?: string | null;
};

const PAGE = 500;

/** Fetches the full message history for a conversation (RLS scoped to the caller). */
export async function fetchTranscript(conversationId: string): Promise<TranscriptMessage[]> {
  const rows: TranscriptMessage[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("messages")
      .select(
        "created_at, direction, message_type, status, body, media_url, is_internal, from_address, to_address, sent_by",
      )
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as unknown as Array<
      Omit<TranscriptMessage, "sender_name"> & { sent_by: string | null }
    >;
    for (const m of batch) {
      rows.push({
        sent_by: m.sent_by,
        created_at: m.created_at,
        direction: m.direction,
        message_type: m.message_type,
        status: m.status,
        body: m.body,
        media_url: m.media_url,
        is_internal: m.is_internal,
        from_address: m.from_address,
        to_address: m.to_address,
        sender_name: null,
      });
    }
    if (batch.length < PAGE) break;
  }
  await hydrateSenderNames(rows);
  return rows;
}

async function hydrateSenderNames(rows: TranscriptMessage[]): Promise<void> {
  const ids = Array.from(new Set(rows.map((r) => r.sent_by).filter((v): v is string => !!v)));
  if (!ids.length) return;
  const { data } = await sbAny(supabase).from("profiles").select("id, display_name").in("id", ids);
  const byId = new Map((data ?? []).map((p) => [p.id, p.display_name]));
  for (const r of rows) {
    if (r.sent_by) r.sender_name = byId.get(r.sent_by) ?? null;
  }
}

function fmt(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

function senderLabel(m: TranscriptMessage, contactName: string): string {
  if (m.is_internal) return `${m.sender_name ?? "Agent"} (internal note)`;
  if (m.direction === "inbound") return contactName;
  return m.sender_name ?? "Agent";
}

function bodyText(m: TranscriptMessage): string {
  const parts: string[] = [];
  if (m.body) parts.push(m.body);
  if (m.media_url) parts.push(`[${m.message_type}] ${m.media_url}`);
  if (!parts.length) parts.push(`[${m.message_type}]`);
  return parts.join(" ");
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildTranscriptCsv(messages: TranscriptMessage[], meta: TranscriptMeta): string {
  const header = ["Timestamp", "Sender", "Direction", "Type", "Status", "Internal", "Message", "Media URL"];
  const lines = [header.map(csvCell).join(",")];
  for (const m of messages) {
    lines.push(
      [
        fmt(m.created_at),
        senderLabel(m, meta.contactName),
        m.direction,
        m.message_type,
        m.status,
        m.is_internal ? "yes" : "no",
        m.body ?? "",
        m.media_url ?? "",
      ]
        .map((v) => csvCell(String(v)))
        .join(","),
    );
  }
  return lines.join("\r\n");
}

export async function buildTranscriptPdf(
  messages: TranscriptMessage[],
  meta: TranscriptMeta,
): Promise<Blob> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableMod as unknown as { default: (doc: unknown, opts: unknown) => void }).default;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFontSize(16);
  doc.text("Conversation transcript", 40, 48);
  doc.setFontSize(10);
  doc.text(
    [
      `Contact: ${meta.contactName}`,
      `Channel: ${meta.channel}`,
      meta.subject ? `Subject: ${meta.subject}` : `Conversation: ${meta.conversationId}`,
      `Messages: ${messages.length}`,
      `Exported: ${new Date().toLocaleString()}`,
    ],
    40,
    68,
  );

  autoTable(doc, {
    startY: 140,
    head: [["Time", "Sender", "Message", "Status"]],
    body: messages.map((m) => [fmt(m.created_at), senderLabel(m, meta.contactName), bodyText(m), m.status]),
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [216, 28, 32], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 90 },
      2: { cellWidth: 260 },
      3: { cellWidth: 60 },
    },
    margin: { left: 40, right: 40 },
  });

  return doc.output("blob") as Blob;
}

export function transcriptFileName(meta: TranscriptMeta, ext: "csv" | "pdf"): string {
  const safe = meta.contactName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "conversation";
  const date = new Date().toISOString().slice(0, 10);
  return `transcript-${safe}-${date}.${ext}`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
