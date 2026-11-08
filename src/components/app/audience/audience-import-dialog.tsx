import { useRef, useState } from "react";
import { Upload, FileText } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { parseCSV, useImportContacts } from "@/hooks/use-audience";

export function AudienceImportDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [filename, setFilename] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const importMut = useImportContacts();

  const onFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCSV(text);
    setRows(parsed);
    setFilename(file.name);
  };

  const doImport = () => {
    importMut.mutate(rows, {
      onSuccess: (n) => {
        toast.success(`Imported ${n} contacts`);
        setOpen(false);
        setRows([]);
        setFilename("");
      },
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" className="gap-1">
            <Upload className="h-4 w-4" /> Import CSV
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import contacts from CSV</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Recognized columns: <code className="text-xs">display_name, first_name, last_name, email, phone,
            whatsapp, tags (pipe-separated), lifecycle_stage, lead_status, customer_status, country, city,
            language, timezone</code>. Rows are matched on <code>phone</code> to avoid duplicates.
          </p>
          <div
            className="border-2 border-dashed rounded-control p-6 text-center cursor-pointer hover:bg-muted/50"
            onClick={() => inputRef.current?.click()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) void onFile(f);
            }}
            onDragOver={(e) => e.preventDefault()}
          >
            <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            {filename ? (
              <p className="text-sm">
                <strong>{filename}</strong> — {rows.length} rows detected
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Click or drop a .csv file</p>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          {rows.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Preview: {rows.slice(0, 3).map((r) => r.display_name || r.email || r.phone).join(", ")}
              {rows.length > 3 ? `  +${rows.length - 3} more` : ""}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={rows.length === 0 || importMut.isPending} onClick={doImport}>
            {importMut.isPending ? "Importing" : `Import ${rows.length} rows`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
