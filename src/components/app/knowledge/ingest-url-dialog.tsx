import { useState } from "react";
import { Link as LinkIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useIngestKbFromUrl } from "@/hooks/use-kb";

export function IngestUrlDialog({
  workspaceId, open, onOpenChange,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [url, setUrl] = useState("");
  const [autoPublish, setAutoPublish] = useState(false);
  const ingest = useIngestKbFromUrl();

  const submit = async () => {
    if (!url.trim()) return;
    try {
      await ingest.mutateAsync({ workspaceId, url: url.trim(), autoPublish });
      setUrl("");
      onOpenChange(false);
    } catch { /* toast via hook */ }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!ingest.isPending) onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="h-4 w-4" /> Ingest from URL
          </DialogTitle>
          <DialogDescription>
            Fetch a web page, extract its main text, and store it as a knowledge article.
            The article is then embedded and available for RAG retrieval.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="kb-url">Page URL</Label>
            <Input
              id="kb-url"
              type="url"
              placeholder="https://example.com/help/getting-started"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex items-center justify-between rounded-control border p-3">
            <div>
              <div className="text-sm font-medium">Publish immediately</div>
              <div className="text-xs text-muted-foreground">
                Otherwise saved as draft.
              </div>
            </div>
            <Switch checked={autoPublish} onCheckedChange={setAutoPublish} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={ingest.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!url.trim() || ingest.isPending}>
            {ingest.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
            Ingest
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
