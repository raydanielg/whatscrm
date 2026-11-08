import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Upload, FileJson, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { WA_TRIGGER_LABEL } from "@/lib/messaging/wa-trigger-matching";
import {
  buildRuleSet,
  parseRuleSet,
  toInsertRow,
  downloadRuleSet,
  ruleSetFilename,
  type WaRuleSet,
} from "@/lib/messaging/wa-rule-transfer";
import { sbAny } from "@/lib/supabase/untyped";

type Instance = { id: string; phone_number: string | null; display_name?: string | null };

export function WaRulesTransfer({
  workspaceId,
  workspaceName,
  rules,
  instances,
  asMenuItems = false,
}: {
  workspaceId: string | null;
  workspaceName?: string | null;
  rules: Array<Record<string, unknown>>;
  instances: Instance[];
  /** Render the Export/Import triggers as DropdownMenuItem (for an overflow menu) instead of Button. */
  asMenuItems?: boolean;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [set, setSet] = useState<WaRuleSet | null>(null);
  const [sessionId, setSessionId] = useState<string>("__all__");
  const [enableOnImport, setEnableOnImport] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [suffix, setSuffix] = useState("");

  const existingNames = new Set(
    rules.map((r) =>
      String(r.name ?? "")
        .trim()
        .toLowerCase(),
    ),
  );

  function handleExport() {
    if (rules.length === 0) return toast.error("There are no rules to export");
    try {
      const payload = buildRuleSet(rules, { workspaceId, workspaceName });
      downloadRuleSet(payload, ruleSetFilename(workspaceName));
      toast.success(
        `Exported ${payload.rules.length} rule${payload.rules.length === 1 ? "" : "s"}`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 2_000_000) return toast.error("File is too large (max 2 MB)");
    try {
      const parsed = parseRuleSet(await file.text());
      setSet(parsed);
      setOpen(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const importing = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("No workspace selected");
      if (!set) throw new Error("Nothing to import");
      const selected = skipDuplicates
        ? set.rules.filter((r) => !existingNames.has(r.name.trim().toLowerCase()))
        : set.rules;
      if (selected.length === 0) throw new Error("Every rule in this file already exists here");
      const rows = selected.map((r) =>
        toInsertRow(r, {
          workspaceId,
          sessionId: sessionId === "__all__" ? null : sessionId,
          enabled: enableOnImport ? true : r.enabled,
          nameSuffix: suffix.trim() || undefined,
        }),
      );
      const { error } = await sbAny(supabase).from("whatsapp_auto_replies").insert(rows);
      if (error) throw error;
      return { imported: rows.length, skipped: set.rules.length - rows.length };
    },
    onSuccess: ({ imported, skipped }) => {
      qc.invalidateQueries({ queryKey: ["wa-auto-replies"] });
      toast.success(
        `Imported ${imported} rule${imported === 1 ? "" : "s"}${skipped ? ` · skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}` : ""}`,
      );
      setOpen(false);
      setSet(null);
      setSuffix("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicates = set
    ? set.rules.filter((r) => existingNames.has(r.name.trim().toLowerCase())).length
    : 0;
  const willImport = set ? set.rules.length - (skipDuplicates ? duplicates : 0) : 0;

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {asMenuItems ? (
        <>
          <DropdownMenuItem onClick={handleExport}>
            <Download className="h-4 w-4 " /> Export
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 " /> Import
          </DropdownMenuItem>
        </>
      ) : (
        <>
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 " /> Export
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 " /> Import
          </Button>
        </>
      )}

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setSet(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import auto-reply rules</DialogTitle>
            <DialogDescription>
              {set?.source_workspace_name
                ? `Rule set exported from “${set.source_workspace_name}”.`
                : "Review the rules before adding them to this workspace."}
            </DialogDescription>
          </DialogHeader>

          {set && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary" className="rounded-control gap-1">
                  <FileJson className="h-3 w-3" /> {set.rules.length} rule
                  {set.rules.length === 1 ? "" : "s"}
                </Badge>
                {duplicates > 0 && (
                  <Badge
                    variant="outline"
                    className="rounded-control gap-1 text-amber-600 border-amber-500/40"
                  >
                    <AlertTriangle className="h-3 w-3" /> {duplicates} name
                    {duplicates === 1 ? "" : "s"} already used here
                  </Badge>
                )}
                {set.exported_at && (
                  <span className="text-xs text-muted-foreground">
                    Exported {new Date(set.exported_at).toLocaleString()}
                  </span>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Assign to instance</Label>
                  <Select value={sessionId} onValueChange={setSessionId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Applies to all instances</SelectItem>
                      {instances.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.display_name || s.phone_number || s.id.slice(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Append to each name (optional)</Label>
                  <Input
                    value={suffix}
                    onChange={(e) => setSuffix(e.target.value)}
                    placeholder="e.g. (imported)"
                    maxLength={40}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-control border p-3">
                <div>
                  <p className="text-sm font-medium">Skip rules with a name that already exists</p>
                  <p className="text-xs text-muted-foreground">
                    Prevents duplicate rule sets in this workspace.
                  </p>
                </div>
                <Switch checked={skipDuplicates} onCheckedChange={setSkipDuplicates} />
              </div>

              <div className="flex items-center justify-between rounded-control border p-3">
                <div>
                  <p className="text-sm font-medium">Enable imported rules immediately</p>
                  <p className="text-xs text-muted-foreground">
                    Turn off to import them paused for review.
                  </p>
                </div>
                <Switch checked={enableOnImport} onCheckedChange={setEnableOnImport} />
              </div>

              <ScrollArea className="h-56 rounded-control border">
                <div className="divide-y">
                  {set.rules.map((r, i) => {
                    const dup = existingNames.has(r.name.trim().toLowerCase());
                    return (
                      <div key={i} className="p-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{r.name}</span>
                            <Badge variant="outline" className="rounded-control">
                              {WA_TRIGGER_LABEL[r.trigger_type]}
                            </Badge>
                          </div>
                          {r.keywords.length > 0 && (
                            <p className="mt-0.5 text-xs text-muted-foreground truncate">
                              {r.keywords.join(", ")}
                            </p>
                          )}
                        </div>
                        {dup && skipDuplicates && (
                          <Badge variant="outline" className="rounded-control shrink-0">
                            Skipped
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => importing.mutate()}
              disabled={importing.isPending || willImport === 0 || !workspaceId}
            >
              {importing.isPending
                ? "Importing"
                : `Import ${willImport} rule${willImport === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
