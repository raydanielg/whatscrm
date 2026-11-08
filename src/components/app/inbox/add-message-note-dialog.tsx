import { useEffect, useState } from "react";
import { StickyNote, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { useCreateNote } from "@/hooks/use-collaboration";
import { stripFormatting } from "@/lib/inbox/rich-text";
import type { MessageRow } from "@/hooks/use-messages";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The message to quote in the note. The dialog stays closed while this is null. */
  message: MessageRow | null;
};

function quoteFromMessage(m: MessageRow): string {
  const body = m.body ? stripFormatting(m.body).trim() : "";
  return body ? `Re: "${body}"\n\n` : "";
}

/** Internal note seeded from a message, posted to the conversation's team notes
 * (same store as the Collaboration panel's Notes tab). */
export function AddMessageNoteDialog({ open, onOpenChange, message }: Props) {
  const [body, setBody] = useState("");
  const create = useCreateNote(message?.conversation_id, message?.workspace_id);

  // Re-seed the draft each time the dialog opens for a (possibly different)
  // message, rather than on every keystroke.
  useEffect(() => {
    if (open && message) setBody(quoteFromMessage(message));
  }, [open, message]);

  const canSubmit = !!message && body.trim().length > 0 && !create.isPending;

  const submit = () => {
    if (!canSubmit) return;
    create.mutate(
      { body: body.trim() },
      {
        onSuccess: () => {
          toast.success("Internal note added");
          onOpenChange(false);
        },
        onError: (e) => {
          const msg = (e as { message?: string } | null)?.message;
          toast.error(msg ? `Failed to add note: ${msg}` : "Failed to add note");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md min-w-0 w-[calc(100vw-2rem)] sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StickyNote className="h-4 w-4" />
            Add note
          </DialogTitle>
          <DialogDescription>
            Post an internal note about this message. Only your team can see it.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <RichTextarea
            value={body}
            onChange={setBody}
            rows={5}
            placeholder="Write an internal note use @name to mention a teammate"
          />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {create.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Post note
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
