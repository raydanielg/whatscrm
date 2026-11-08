import * as React from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import * as Icons from "lucide-react";
import { NODE_REGISTRY_BY_TYPE } from "@/lib/workflows/node-registry";
import { ChannelIcon } from "@/components/app/inbox/channel-icon";
import { nodeChannel } from "./node-channel";

export type WFNodeData = {
  type: string;
  label?: string;
  config: Record<string, unknown>;
  hasError?: boolean;
};

const KIND_STYLES: Record<string, string> = {
  trigger: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/40 text-emerald-600",
  action: "from-sky-500/20 to-sky-500/5 border-sky-500/40 text-sky-600",
  logic: "from-amber-500/20 to-amber-500/5 border-amber-500/40 text-amber-600",
  ai: "from-fuchsia-500/20 to-fuchsia-500/5 border-fuchsia-500/40 text-fuchsia-600",
};

export const CustomNode = React.memo(function CustomNode({ data, selected }: NodeProps<WFNodeData>) {
  const def = NODE_REGISTRY_BY_TYPE[data.type];
  const Icon = (def?.icon && (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[def.icon]) || Icons.Box;
  const kind = def?.kind ?? "action";
  const isTrigger = kind === "trigger";
  const tone = KIND_STYLES[kind];

  const accent = tone.split(" ").filter((c) => c.startsWith("from-")).join(" ");

  return (
    <div
      className={[
        "group relative w-[240px] rounded-control border bg-surface shadow-sm transition-all duration-200",
        "hover:-translate-y-px hover:shadow-md",
        selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-md" : "",
        data.hasError ? "border-rose-500/60" : "border-border",
      ].join(" ")}
    >
      {/* Inner wrapper clips the accent strip to the rounded corners. Handles stay outside it. */}
      <div className="overflow-hidden rounded-control">
        <div className={`h-1 w-full bg-gradient-to-r ${accent}`} />
        <div className="flex items-start gap-3 px-3.5 pt-3">
          {nodeChannel(data.type) ? (
            <ChannelIcon channel={nodeChannel(data.type)} boxed className="h-9 w-9 shrink-0" />
          ) : (
            <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-control border bg-gradient-to-br ${tone}`}>
              <Icon className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase  text-muted-foreground">
              {def?.category ?? kind}
            </div>
            <div className="truncate text-sm font-semibold leading-snug">{data.label || def?.label || data.type}</div>
          </div>
        </div>
        {def?.inputs?.slice(0, 2).map((f) => {
          const v = data.config?.[f.key];
          if (v === undefined || v === null || v === "") return null;
          return (
            <div key={f.key} className="truncate px-3.5 pt-1.5 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground/80">{f.label}:</span> {String(v)}
            </div>
          );
        })}
        <div className="flex items-center gap-1 px-3.5 pb-3 pt-2 text-[11px] text-muted-foreground/80">
          {data.hasError && <Icons.AlertCircle className="h-3 w-3 shrink-0 text-rose-500" />}
          <span className="truncate">{def?.description}</span>
        </div>
      </div>

      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-background !bg-primary"
        />
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
    </div>
  );
});
