import { Fragment } from "react";

import { parseRichText, type BlockNode, type InlineNode } from "@/lib/inbox/rich-text";
import { cn } from "@/lib/utils";

function renderInline(nodes: InlineNode[], keyPrefix: string) {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (node.type) {
      case "text":
        return <Fragment key={key}>{node.value}</Fragment>;
      case "bold":
        return (
          <strong key={key} className="font-semibold">
            {renderInline(node.children, key)}
          </strong>
        );
      case "italic":
        return (
          <em key={key} className="italic">
            {renderInline(node.children, key)}
          </em>
        );
      case "strike":
        return (
          <span key={key} className="line-through">
            {renderInline(node.children, key)}
          </span>
        );
      case "mono":
        return (
          <code
            key={key}
            className="rounded-control bg-foreground/10 px-1 py-px font-mono text-[0.92em]"
          >
            {node.value}
          </code>
        );
      case "link":
        return (
          <a
            key={key}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="underline underline-offset-2 hover:opacity-80"
            onClick={(e) => e.stopPropagation()}
          >
            {node.value}
          </a>
        );
    }
  });
}

function renderBlock(block: BlockNode, key: string) {
  switch (block.type) {
    case "code":
      return (
        <pre
          key={key}
          className="my-1 overflow-x-auto rounded-control bg-foreground/10 px-2 py-1.5 font-mono text-[0.85em] leading-relaxed"
        >
          {block.value}
        </pre>
      );
    case "quote":
      return (
        <div key={key} className="my-0.5 border-l-2 border-current/40 pl-2 opacity-90">
          {renderInline(block.children, key)}
        </div>
      );
    case "bullet":
      return (
        <div key={key} className="flex gap-1.5">
          <span aria-hidden className="select-none opacity-70">
            •
          </span>
          <span className="min-w-0 flex-1">{renderInline(block.children, key)}</span>
        </div>
      );
    case "ordered":
      return (
        <div key={key} className="flex gap-1.5">
          <span aria-hidden className="select-none tabular-nums opacity-70">
            {block.marker}
          </span>
          <span className="min-w-0 flex-1">{renderInline(block.children, key)}</span>
        </div>
      );
    case "paragraph":
      // An empty line still has to take up its blank row.
      return (
        <div key={key} className="min-h-[1em] whitespace-pre-wrap">
          {renderInline(block.children, key)}
        </div>
      );
  }
}

/**
 * Renders a message body with WhatsApp-style formatting — `*bold*`,
 * `_italic_`, `~strike~`, `` `mono` ``, ``` blocks, `>` quotes, lists and
 * autolinked URLs. The text itself is never altered; this only styles it.
 */
export function FormattedText({
  text,
  className,
}: {
  text: string | null | undefined;
  className?: string;
}) {
  if (!text) return null;
  const blocks = parseRichText(text);
  return (
    <div className={cn("break-words [overflow-wrap:anywhere]", className)}>
      {blocks.map((block, i) => renderBlock(block, `b${i}`))}
    </div>
  );
}
