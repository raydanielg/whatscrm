import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { parseCsv, csvRowToContactInput, useBulkCreateContacts } from "@/hooks/use-contacts";


export function ContactImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Record<string, string>[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const bulkCreate = useBulkCreateContacts();

  const onPick = (f: File) => {
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCsv(String(reader.result ?? ""));
        setPreview(rows);
      } catch {
        toast.error("Failed to parse CSV");
      }
    };
    reader.readAsText(f);
  };

  const runImport = async () => {
    if (!preview || importing) return;
    setImporting(true);
    try {
      const inputs = preview.map((r) => csvRowToContactInput(r));
      const { inserted, failed, errors } = await bulkCreate.mutateAsync(inputs);
      if (inserted) toast.success(`Imported ${inserted} contact${inserted === 1 ? "" : "s"}${failed ? ` (${failed} failed)` : ""}`);
      if (failed && !inserted) toast.error(`Import failed: ${errors[0] ?? "Unknown error"}`);
      setPreview(null);
      setFileName("");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && importing) return; onOpenChange(v); }}>
      <DialogContent
        className="max-w-2xl"
        onEscapeKeyDown={(e) => { if (importing) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (importing) e.preventDefault(); }}
        onInteractOutside={(e) => { if (importing) e.preventDefault(); }}
      >

        <DialogHeader>
          <DialogTitle>Import contacts</DialogTitle>
          <DialogDescription>
            Upload a CSV. Recognized columns: first_name, last_name, display_name, email, phone, whatsapp,
            job_title, department, website, birthday, lead_status, customer_status, lifecycle_stage, tags
            (separated by | or ,), notes, address_line1, address_city, address_country.
          </DialogDescription>
        </DialogHeader>

        <div className="border-2 border-dashed rounded-control p-6 text-center">
          <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground mb-3">{fileName || "Drop a .csv file or click to browse"}</p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
          />
          <Button variant="secondary" onClick={() => inputRef.current?.click()}>Choose file</Button>
        </div>

        {preview && preview.length > 0 && (
          <div className="max-h-64 overflow-auto border rounded-control">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  {Object.keys(preview[0]).slice(0, 6).map((h) => (
                    <th key={h} className="text-left px-2 py-1.5 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    {Object.keys(preview[0]).slice(0, 6).map((h) => (
                      <td key={h} className="px-2 py-1 truncate max-w-[140px]">{r[h]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-xs text-muted-foreground p-2">
              Showing first 20 of {preview.length} rows.
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={importing}>Cancel</Button>
          <Button onClick={runImport} disabled={!preview || importing}>
            {importing ? "Importing" : `Import ${preview?.length ?? 0}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
