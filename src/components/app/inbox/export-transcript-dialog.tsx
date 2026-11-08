import { useState } from "react";
import { Download, FileText, Table2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  buildTranscriptCsv, buildTranscriptPdf, downloadBlob, fetchTranscript, transcriptFileName,
  type TranscriptMeta,
} from "@/lib/inbox/transcript-export";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meta: TranscriptMeta;
};

export function ExportTranscriptDialog({ open, onOpenChange, meta }: Props) {
  const [format, setFormat] = useState<"pdf" | "csv">("pdf");
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    setBusy(true);
    try {
      const messages = await fetchTranscript(meta.conversationId);
      if (!messages.length) {
        toast.info("Nothing to export", { description: "This conversation has no messages yet." });
        return;
      }
      if (format === "csv") {
        const csv = buildTranscriptCsv(messages, meta);
        downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), transcriptFileName(meta, "csv"));
      } else {
        const blob = await buildTranscriptPdf(messages, meta);
        downloadBlob(blob, transcriptFileName(meta, "pdf"));
      }
      toast.success(`Transcript exported (${messages.length} messages)`);
      onOpenChange(false);
    } catch (err) {
      toast.error("Export failed", {
        description: err instanceof Error ? err.message : "Could not build the transcript.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export transcript</DialogTitle>
          <DialogDescription>
            Download the full message history for {meta.contactName}.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={format}
          onValueChange={(v) => setFormat(v as "pdf" | "csv")}
          className="gap-3"
        >
          <Label
            htmlFor="fmt-pdf"
            className="flex items-start gap-3 rounded-control border p-3 cursor-pointer hover:bg-accent/50"
          >
            <RadioGroupItem value="pdf" id="fmt-pdf" className="mt-1" />
            <span className="space-y-0.5">
              <span className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4" /> PDF
              </span>
              <span className="block text-xs text-muted-foreground">
                Formatted, printable transcript with contact and channel details.
              </span>
            </span>
          </Label>
          <Label
            htmlFor="fmt-csv"
            className="flex items-start gap-3 rounded-control border p-3 cursor-pointer hover:bg-accent/50"
          >
            <RadioGroupItem value="csv" id="fmt-csv" className="mt-1" />
            <span className="space-y-0.5">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Table2 className="h-4 w-4" /> CSV
              </span>
              <span className="block text-xs text-muted-foreground">
                Spreadsheet-friendly rows including status, type and media links.
              </span>
            </span>
          </Label>
        </RadioGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {busy ? "Preparing" : "Download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
