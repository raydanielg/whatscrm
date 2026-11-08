import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useMergeContacts, type ContactRow, contactDisplayName, primaryEmail, primaryPhone } from "@/hooks/use-contacts";

export function ContactMergeDialog({
  open,
  onOpenChange,
  contacts,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contacts: ContactRow[];
}) {
  const [primaryId, setPrimaryId] = useState<string>(contacts[0]?.id ?? "");
  const merge = useMergeContacts();

  const run = async () => {
    try {
      const dupes = contacts.filter((c) => c.id !== primaryId).map((c) => c.id);
      await merge.mutateAsync({ primaryId, duplicateIds: dupes });
      toast.success(`Merged ${dupes.length + 1} contacts`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Merge failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && merge.isPending) return; onOpenChange(v); }}>
      <DialogContent
        onEscapeKeyDown={(e) => { if (merge.isPending) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (merge.isPending) e.preventDefault(); }}
        onInteractOutside={(e) => { if (merge.isPending) e.preventDefault(); }}
      >

        <DialogHeader>
          <DialogTitle>Merge {contacts.length} contacts</DialogTitle>
          <DialogDescription>
            The primary keeps its main identity. Phones, emails, tags, notes, and custom fields from the
            others are combined into it; the duplicates are archived (soft-deleted).
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={primaryId} onValueChange={setPrimaryId} className="space-y-2 mt-2">
          {contacts.map((c) => (
            <label key={c.id} htmlFor={`merge-${c.id}`} className="flex items-start gap-3 border rounded-control p-3 cursor-pointer hover:bg-muted/40">
              <RadioGroupItem id={`merge-${c.id}`} value={c.id} className="mt-1" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{contactDisplayName(c)}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {primaryEmail(c) ?? "—"} · {primaryPhone(c) ?? "—"}
                </p>
              </div>
            </label>
          ))}
        </RadioGroup>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={merge.isPending}>Cancel</Button>
          <Button onClick={run} disabled={merge.isPending || !primaryId}>Merge</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
