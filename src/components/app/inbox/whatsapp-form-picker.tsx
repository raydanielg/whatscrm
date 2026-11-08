/**
 * Send a published WhatsApp Form (Meta Flow) into the current conversation.
 *
 * The picker writes a normal outbound message row with
 * `message_type = "interactive"` and the Flow payload in metadata, so the
 * existing outbound engine delivers it and the thread shows the send state.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { explainFlowError } from "@/lib/messaging/flow-error-messages";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useSendMessage } from "@/hooks/use-messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PublishedForm = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  flow_id: string | null;
  flow_json: unknown;
};

export interface WhatsAppFormPickerProps {
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WhatsAppFormPicker({ conversationId, open, onOpenChange }: WhatsAppFormPickerProps) {
  const { data: ws } = useCurrentWorkspace();
  const workspaceId = ws?.id;
  const send = useSendMessage();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bodyText, setBodyText] = useState("Please fill in this short form.");
  const [ctaLabel, setCtaLabel] = useState("Open form");
  const [sending, setSending] = useState(false);

  const forms = useQuery({
    queryKey: ["wa-forms-published", workspaceId],
    enabled: open && !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_forms")
        .select("id,name,category,description,flow_id,flow_json")
        .eq("workspace_id", workspaceId!)
        .eq("status", "PUBLISHED")
        .order("last_published_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PublishedForm[];
    },
  });

  const selected = useMemo(
    () => (forms.data ?? []).find((f) => f.id === selectedId) ?? null,
    [forms.data, selectedId],
  );

  async function sendForm() {
    if (!selected) return;
    if (!selected.flow_id) {
      toast.error("This form is not published yet", {
        description: "Publish the form in WhatsApp → Forms, then send it to the customer.",
      });
      return;
    }
    const body = bodyText.trim();
    if (!body) {
      toast.error("A message is required", {
        description: "Add a short message that will appear above the form button.",
      });
      return;
    }
    const flowJson = (selected.flow_json ?? {}) as Record<string, unknown>;
    const flowToken =
      typeof flowJson["flow_token"] === "string" && flowJson["flow_token"]
        ? (flowJson["flow_token"] as string)
        : `wf_${selected.id}`;

    setSending(true);
    try {
      await send.mutateAsync({
        conversationId,
        body,
        messageType: "interactive",
        metadata: {
          wa_form_id: selected.id,
          wa_form_name: selected.name,
          interactive: {
            type: "flow",
            body: { text: body.slice(0, 1024) },
            action: {
              name: "flow",
              parameters: {
                flow_message_version: "3",
                flow_token: flowToken,
                flow_id: selected.flow_id,
                flow_cta: (ctaLabel.trim() || "Open form").slice(0, 20),
                flow_action: "navigate",
                flow_action_payload: { screen: "FORM" },
              },
            },
          },
        },
      });
      toast.success(`"${selected.name}" sent`);
      onOpenChange(false);
    } catch (e) {
      const f = explainFlowError("send", e);
      toast.error(f.title, { description: f.description });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !sending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Send a WhatsApp form
          </DialogTitle>
          <DialogDescription>
            Pick a published form. Replies land in the form's submissions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {forms.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading forms
            </div>
          ) : (forms.data ?? []).length === 0 ? (
            <div className="rounded-control border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No published forms yet. Publish one in API Config → WhatsApp Forms.
            </div>
          ) : (
            <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
              {(forms.data ?? []).map((f) => {
                const active = f.id === selectedId;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedId(f.id)}
                    className={`w-full text-left rounded-control border p-3 transition-colors ${
                      active ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{f.name}</span>
                      <Badge variant="outline" className="text-[11px]">{f.category}</Badge>
                    </div>
                    {f.description && (
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {f.description}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="wa-form-body">Message</Label>
            <Textarea
              id="wa-form-body"
              rows={3}
              maxLength={1024}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wa-form-cta">Button label</Label>
            <Input
              id="wa-form-cta"
              maxLength={20}
              value={ctaLabel}
              onChange={(e) => setCtaLabel(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={sendForm} disabled={!selected || sending} className="gap-2">
            {sending && <Loader2 className="h-4 w-4 animate-spin" />}
            Send form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
