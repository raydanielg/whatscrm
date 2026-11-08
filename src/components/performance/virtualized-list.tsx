import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

type Props<T> = {
  items: T[];
  estimateSize?: number;
  overscan?: number;
  className?: string;
  height?: number | string;
  renderItem: (item: T, index: number) => ReactNode;
  keyFor?: (item: T, index: number) => string | number;
};

/**
 * VirtualizedList — thin wrapper around @tanstack/react-virtual.
 * Renders only visible rows; safe for 100k+ item lists (inbox, contacts, audit logs).
 */
export function VirtualizedList<T>({
  items,
  estimateSize = 56,
  overscan = 8,
  className,
  height = 480,
  renderItem,
  keyFor,
}: Props<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  return (
    <div
      ref={parentRef}
      className={className}
      style={{ height, overflow: "auto", contain: "strict" }}
    >
      <div style={{ height: virt.getTotalSize(), width: "100%", position: "relative" }}>
        {virt.getVirtualItems().map((v) => {
          const item = items[v.index];
          return (
            <div
              key={keyFor ? keyFor(item, v.index) : v.key}
              data-index={v.index}
              ref={virt.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${v.start}px)`,
              }}
            >
              {renderItem(item, v.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
