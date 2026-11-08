import { useBrandName } from "@/hooks/use-brand-name";
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { NODE_REGISTRY_BY_TYPE } from "@/lib/workflows/node-registry";
import {
  Send,
  FileText,
  Timer,
  Tag,
  GitBranch,
  Headphones,
  Zap,
  Globe,
  MessageSquare,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export type QuickPreset = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tint: string;
  nodeType: string;
  config: Record<string, unknown>;
};

const PRESETS: QuickPreset[] = [
  {
    id: "send-wa",
    title: "Send WhatsApp message",
    description: "Send a session or template message to the contact.",
    icon: Send,
    tint: "text-emerald-600 bg-emerald-500/10",
    nodeType: "action.whatsapp.send_message",
    config: { contact_id: "{{contact.id}}", body: "" },
  },
  {
    id: "send-template",
    title: "Send WA template",
    description: "Send an approved template with variables.",
    icon: FileText,
    tint: "text-emerald-600 bg-emerald-500/10",
    nodeType: "action.whatsapp.send_template",
    config: { contact_id: "{{contact.id}}", variables: {} },
  },
  {
    id: "rest-send",
    title: "Send via REST API",
    description: "Call the WhatsApp Cloud API directly with a custom payload.",
    icon: Globe,
    tint: "text-sky-600 bg-sky-500/10",
    nodeType: "action.http.request",
    config: {
      method: "POST",
      url: "https://graph.facebook.com/v20.0/{{channel.phone_number_id}}/messages",
      headers: {
        Authorization: "Bearer {{channel.access_token}}",
        "Content-Type": "application/json",
      },
      body: {
        messaging_product: "whatsapp",
        to: "{{contact.phone}}",
        type: "text",
        text: { body: "Hello from {{brand.name}}" },
      },
    },
  },
  {
    id: "delay",
    title: "Wait / delay",
    description: "Pause the flow for a duration before continuing.",
    icon: Timer,
    tint: "text-amber-600 bg-amber-500/10",
    nodeType: "logic.delay",
    config: { duration: 5, unit: "minutes" },
  },
  {
    id: "add-tag",
    title: "Add tag to contact",
    description: "Tag the contact for segmentation and reporting.",
    icon: Tag,
    tint: "text-sky-600 bg-sky-500/10",
    nodeType: "action.contact.add_tag",
    config: { contact_id: "{{contact.id}}", tag: "" },
  },
  {
    id: "condition",
    title: "If / Else condition",
    description: "Branch the flow based on a variable or expression.",
    icon: GitBranch,
    tint: "text-amber-600 bg-amber-500/10",
    nodeType: "logic.if",
    config: { expression: "{{contact.tags}} contains 'vip'" },
  },
  {
    id: "handoff",
    title: "Handoff to human",
    description: "Pause the bot and route the chat to an agent or team.",
    icon: Headphones,
    tint: "text-sky-600 bg-sky-500/10",
    nodeType: "action.crm.handoff",
    config: { conversation_id: "{{conversation.id}}", priority: "normal", pause_bot: true },
  },
  {
    id: "assign",
    title: "Assign conversation",
    description: "Route the conversation to an agent or team.",
    icon: MessageSquare,
    tint: "text-sky-600 bg-sky-500/10",
    nodeType: "action.whatsapp.assign_conversation",
    config: { conversation_id: "{{conversation.id}}" },
  },
];

export function QuickAddPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (nodeType: string, label: string, config: Record<string, unknown>) => void;
}) {
  const brandName = useBrandName();
  const presets = React.useMemo(
    () =>
      PRESETS.map((preset) =>
        preset.id === "rest-send"
          ? {
              ...preset,
              config: {
                ...preset.config,
                body: {
                  ...(preset.config.body as Record<string, unknown>),
                  text: { body: `Hello from ${brandName}` },
                },
              },
            }
          : preset,
      ),
    [brandName],
  );
  const [q, setQ] = React.useState("");
  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return presets;
    return presets.filter(
      (p) =>
        p.title.toLowerCase().includes(needle) ||
        p.description.toLowerCase().includes(needle) ||
        p.nodeType.toLowerCase().includes(needle),
    );
  }, [presets, q]);

  const pick = (preset: QuickPreset) => {
    const def = NODE_REGISTRY_BY_TYPE[preset.nodeType];
    onPick(preset.nodeType, def?.label ?? preset.title, preset.config);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Zap className="w-4 h-4 text-primary" /> Quick add — WhatsApp CRM
          </DialogTitle>
          <DialogDescription className="text-xs">
            Common triggers &amp; actions preconfigured for WhatsApp automations. Click one to drop
            it on the canvas.
          </DialogDescription>
        </DialogHeader>
        <div className="pt-1">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search presets — send, delay, tag, condition, handoff"
            className="w-full px-3 py-2 text-sm rounded-control border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <ScrollArea type="hover" viewportClassName="max-h-[420px] [&>div]:!block">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {filtered.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  onClick={() => pick(p)}
                  className="text-left rounded-control border border-border bg-surface p-3 hover:border-primary/50 hover:bg-muted/40 transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-control grid place-items-center shrink-0 ${p.tint}`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{p.title}</div>
                      <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                        {p.description}
                      </div>
                      <div className="text-[11px] font-mono text-muted-foreground/70 mt-1 truncate">
                        {p.nodeType}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-full text-center text-xs text-muted-foreground py-10">
                No presets match “{q}”.
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
