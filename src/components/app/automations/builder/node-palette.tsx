import * as React from "react";
import * as Icons from "lucide-react";
import { NODE_REGISTRY, type NodeDefinition } from "@/lib/workflows/node-registry";
import { Search } from "lucide-react";
import { ChannelIcon } from "@/components/app/inbox/channel-icon";
import { nodeChannel } from "./node-channel";
import { ScrollArea } from "@/components/ui/scroll-area";

const KIND_COLORS: Record<string, string> = {
  trigger: "text-emerald-600 bg-emerald-500/10",
  action: "text-sky-600 bg-sky-500/10",
  logic: "text-amber-600 bg-amber-500/10",
  ai: "text-fuchsia-600 bg-fuchsia-500/10",
};

export const NodePalette = React.memo(function NodePalette({ onAdd }: { onAdd: (def: NodeDefinition) => void }) {
  const [q, setQ] = React.useState("");
  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return NODE_REGISTRY;
    return NODE_REGISTRY.filter(
      (n) =>
        n.label.toLowerCase().includes(needle) ||
        n.description.toLowerCase().includes(needle) ||
        n.category.toLowerCase().includes(needle),
    );
  }, [q]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, NodeDefinition[]>();
    // Triggers get their own section at the top, so the entry point is easy to find.
    for (const n of filtered) {
      if (n.kind === "trigger") continue;
      const list = map.get(n.category) ?? [];
      list.push(n);
      map.set(n.category, list);
    }
    const triggers = filtered.filter((n) => n.kind === "trigger");
    const groups = Array.from(map.entries());
    return triggers.length > 0 ? [["Triggers", triggers] as const, ...groups] : groups;
  }, [filtered]);

  return (
    <aside className="w-64 shrink-0 border-r border-border bg-surface flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search nodes"
            className="w-full pl-8 pr-3 py-1.5 rounded-control border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>
      <ScrollArea type="hover" className="flex-1 min-h-0" viewportClassName="[&>div]:!block">
        <div className="p-2 space-y-3">
          {grouped.map(([cat, items]) => (
            <div key={cat}>
              <div className="px-2 pb-1 text-[11px]  text-muted-foreground font-semibold">{cat}</div>
              <div className="space-y-1">
                {items.map((n) => {
                  const Icon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[n.icon] || Icons.Box;
                  return (
                    <button
                      key={n.type}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/reactflow", n.type);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDoubleClick={() => onAdd(n)}
                      className="w-full flex items-start gap-2 p-2 rounded-control border border-transparent hover:border-border hover:bg-muted/50 text-left transition-all cursor-grab active:cursor-grabbing"
                      title="Drag to canvas or double-click to add"
                    >
                      {nodeChannel(n.type) ? (
                        // Real brand logo for channel nodes. Everything else keeps the simple icon.
                        <ChannelIcon channel={nodeChannel(n.type)} boxed className="w-7 h-7 shrink-0" />
                      ) : (
                        <div className={`w-7 h-7 rounded-control grid place-items-center shrink-0 ${KIND_COLORS[n.kind]}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{n.label}</div>
                        <div className="text-[11px] text-muted-foreground line-clamp-2">{n.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-8">No nodes found</div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
});
