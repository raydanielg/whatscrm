import { TEMPLATES, type ChatbotFlowTemplate } from "@/lib/chatbots/flow-types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sparkles } from "lucide-react";

export function ChatbotTemplatesDialog({
  open, onOpenChange, onPick,
}: { open: boolean; onOpenChange: (v: boolean) => void; onPick: (t: ChatbotFlowTemplate) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Templates</DialogTitle>
          <DialogDescription>Start from a pre-built flow. You can customize everything after.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => onPick(t)}
              className="text-left rounded-control border border-border bg-surface p-4 hover:border-primary/60 hover:shadow-md transition-all group"
            >
              <div className="font-semibold text-sm mb-1 group-hover:text-primary">{t.name}</div>
              <div className="text-xs text-muted-foreground line-clamp-3">{t.description}</div>
              <div className="mt-3 text-[11px] uppercase text-muted-foreground">
                {t.flow.nodes.length} nodes · {t.flow.edges.length} connections
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
