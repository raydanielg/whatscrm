import * as React from "react";
import * as Icons from "lucide-react";
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "@/lib/workflows/templates";
import { X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export function TemplateGallery({
  open,
  onClose,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (tpl: WorkflowTemplate) => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm animate-fade-in grid place-items-center p-4">
      <div className="w-full max-w-3xl max-h-[85vh] rounded-control border border-border bg-surface shadow-2xl overflow-hidden animate-scale-in flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-base font-semibold">Workflow templates</div>
            <div className="text-xs text-muted-foreground">Start from a proven pattern or build from scratch.</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted" aria-label="Close templates">
            <X className="w-4 h-4" />
          </button>
        </div>
        <ScrollArea type="hover" viewportClassName="max-h-[calc(85vh-6rem)] [&>div]:!block">
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {WORKFLOW_TEMPLATES.map((tpl) => {
              const Icon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[tpl.icon] || Icons.Workflow;
              return (
                <button
                  key={tpl.id}
                  onClick={() => onApply(tpl)}
                  className="text-left group rounded-control border border-border bg-background p-3 hover:border-primary/40 hover:shadow-md transition-all hover-scale"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-control bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 text-primary grid place-items-center">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px]  text-muted-foreground font-medium">{tpl.category}</div>
                      <div className="text-sm font-semibold truncate">{tpl.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tpl.description}</div>
                      <div className="mt-2 text-[11px] text-muted-foreground">{tpl.graph.nodes.length} nodes</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
