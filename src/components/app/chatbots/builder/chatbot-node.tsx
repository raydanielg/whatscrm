import * as React from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { NODE_DEF_BY_TYPE, type ChatbotNodeType } from "@/lib/chatbots/flow-types";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChatbotNodeData = {
  type: ChatbotNodeType;
  label?: string;
  config: Record<string, unknown>;
  hasError?: boolean;
  selected?: boolean;
};

function preview(type: ChatbotNodeType, config: Record<string, unknown>): string | null {
  switch (type) {
    case "message":
    case "question":
    case "button":
    case "quick_reply":
      return (config.text as string) ?? null;
    case "condition":
      return `${config.variable ?? "?"} ${config.operator ?? "="} ${config.value ?? ""}`;
    case "delay":
      return `${config.seconds ?? 0}s`;
    case "webhook":
      return (config.url as string) ?? null;
    case "ai":
      return (config.prompt as string) ?? null;
    default:
      return null;
  }
}

export const ChatbotFlowNode = React.memo(function ChatbotFlowNode(props: NodeProps<ChatbotNodeData>) {
  const { data, selected } = props;
  const def = NODE_DEF_BY_TYPE[data.type];
  if (!def) return null;
  const Icon = def.icon;
  const p = preview(data.type, data.config);
  const showTarget = def.kind !== "trigger";
  const showSource = def.kind !== "terminal";

  return (
    <div
      className={cn(
        "group relative rounded-control border bg-surface shadow-sm min-w-[210px] max-w-[260px] transition-all",
        "hover:shadow-md",
        selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "border-border",
        data.hasError && "border-destructive/60",
      )}
    >
      {showTarget && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-2.5 !h-2.5 !bg-muted-foreground/70 !border-2 !border-background"
        />
      )}
      <div className={cn("flex items-center gap-2 px-3 py-2 border-b border-border rounded-t-xl", def.color)}>
        <Icon className="w-3.5 h-3.5" />
        <div className="text-xs font-semibold flex-1 truncate">{data.label ?? def.label}</div>
        {data.hasError && <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
      </div>
      {p && (
        <div className="px-3 py-2 text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">{p}</div>
      )}
      {data.type === "button" && Array.isArray(data.config.buttons) && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {(data.config.buttons as string[]).slice(0, 4).map((b, i) => (
            <span key={i} className="text-[11px] px-1.5 py-0.5 rounded border border-border bg-background">{b}</span>
          ))}
        </div>
      )}
      {data.type === "quick_reply" && Array.isArray(data.config.replies) && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {(data.config.replies as string[]).slice(0, 4).map((b, i) => (
            <span key={i} className="text-[11px] px-1.5 py-0.5 rounded-control border border-border bg-background">{b}</span>
          ))}
        </div>
      )}
      {data.type === "condition" && (
        <>
          <Handle id="true" type="source" position={Position.Right} style={{ top: "40%" }} className="!w-2.5 !h-2.5 !bg-emerald-500 !border-2 !border-background" />
          <Handle id="false" type="source" position={Position.Right} style={{ top: "70%" }} className="!w-2.5 !h-2.5 !bg-rose-500 !border-2 !border-background" />
          <div className="px-3 pb-2 flex justify-between text-[11px] text-muted-foreground">
            <span>true ↑</span><span>false ↓</span>
          </div>
        </>
      )}
      {showSource && data.type !== "condition" && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-background"
        />
      )}
    </div>
  );
});
