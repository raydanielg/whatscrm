import * as React from "react";
import { NODE_DEFS, type ChatbotNodeDef } from "@/lib/chatbots/flow-types";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

export function ChatbotNodePalette({ onAdd }: { onAdd: (def: ChatbotNodeDef) => void }) {
  const [q, setQ] = React.useState("");
  const filtered = NODE_DEFS.filter(
    (d) =>
      d.label.toLowerCase().includes(q.toLowerCase()) ||
      d.description.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="w-60 border-r border-border bg-surface flex flex-col shrink-0">
      <div className="p-3 border-b border-border">
        <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Nodes</div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="w-full pl-7 pr-2 h-9 text-xs rounded-control border border-input bg-background"
          />
        </div>
      </div>
      <ScrollArea type="hover" className="flex-1 min-h-0" viewportClassName="[&>div]:!block">
        <div className="p-2 space-y-1">
          {filtered.map((d) => {
            const Icon = d.icon;
            return (
              <div
                key={d.type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/reactflow", d.type);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => onAdd(d)}
                className={cn(
                  "group cursor-grab active:cursor-grabbing rounded-control border border-border bg-background",
                  "hover:border-primary/40 hover:shadow-sm px-2.5 py-2 flex items-start gap-2 transition-all",
                )}
              >
                <div className={cn("w-7 h-7 rounded-control grid place-items-center shrink-0", d.color)}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">{d.label}</div>
                  <div className="text-[11px] text-muted-foreground line-clamp-2">{d.description}</div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
      <div className="p-2 border-t border-border text-[11px] text-muted-foreground">
        Drag onto the canvas or click to add
      </div>
    </div>
  );
}
