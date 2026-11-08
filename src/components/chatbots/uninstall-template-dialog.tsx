import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2, PowerOff, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type TemplateAction = "disable" | "uninstall";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  action: TemplateAction;
  botName: string;
  pending?: boolean;
  onConfirm: (reason: string) => Promise<void> | void;
}

/**
 * Confirmation dialog for disabling or uninstalling an installed template bot.
 * Captures an optional reason that is written to the audit trail.
 */
export function UninstallTemplateDialog({
  open,
  onOpenChange,
  action,
  botName,
  pending,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const isUninstall = action === "uninstall";
  const title = isUninstall ? "Uninstall template bot?" : "Disable template bot?";
  const description = isUninstall
    ? `"${botName}" will be moved to Trash and its template link kept for auditing. You can restore it later from Trash.`
    : `"${botName}" will be paused across every channel it is deployed to. You can re-enable it at any time.`;
  const label = isUninstall ? "Uninstall" : "Disable";
  const Icon = isUninstall ? Trash2 : PowerOff;

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "grid place-items-center h-9 w-9 rounded-control",
                isUninstall ? "bg-danger/10 text-danger" : "bg-amber-500/10 text-amber-600",
              )}
            >
              <AlertTriangle className="h-4 w-4" />
            </div>
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="uninstall-reason">
            Reason{" "}
            <span className="text-muted-foreground font-normal">
              (optional, recorded in audit log)
            </span>
          </Label>
          <RichTextarea
            id="uninstall-reason"
            rows={3}
            value={reason}
            onChange={(v) => setReason(v)}
            placeholder={
              isUninstall
                ? "e.g. Replacing with a newer template, no longer needed"
                : "e.g. Temporarily pausing while we refresh the knowledge base"
            }
            maxLength={500}
            disabled={pending}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={isUninstall ? "destructive" : "default"}
            onClick={() => onConfirm(reason.trim())}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Icon className="h-4 w-4 " />
            )}
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
