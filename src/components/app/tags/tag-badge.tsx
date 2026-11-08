import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Wand2, Star, X } from "lucide-react";
import type { TagRow } from "@/hooks/use-tags";

interface Props {
  tag: TagRow;
  onRemove?: () => void;
  className?: string;
  size?: "sm" | "md";
}

/** Reusable tag badge showing color, name, and optional smart / AI indicators. */
export function TagBadge({ tag, onRemove, className, size = "sm" }: Props) {
  const color = tag.color || "#6366f1";
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 border-transparent font-medium",
        size === "sm" ? "text-xs py-0.5" : "text-sm",
        className
      )}
      style={{
        backgroundColor: `${color}1a`,
        color,
        borderColor: `${color}55`,
      }}
    >
      {tag.is_favorite && <Star className="h-3 w-3 fill-current" />}
      {tag.is_smart && <Wand2 className="h-3 w-3" />}
      {tag.is_ai_generated && <Sparkles className="h-3 w-3" />}
      <span>{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hover:text-destructive"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </Badge>
  );
}
