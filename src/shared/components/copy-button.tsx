import { useState, useCallback } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { notify } from "./notify";

interface CopyButtonProps {
  value: string;
  label?: string;
  successMessage?: string;
  className?: string;
  size?: "sm" | "default" | "icon";
  variant?: "ghost" | "outline" | "secondary";
  silent?: boolean;
}

/**
 * Copies `value` to the clipboard. Announces success via toast unless
 * `silent`. Shows a check icon for 1.5s after copy. Icon-only variant
 * exposes `aria-label` from `label` or falls back to "Copy".
 */
export function CopyButton({
  value,
  label,
  successMessage = "Copied to clipboard",
  className,
  size = "icon",
  variant = "ghost",
  silent = false,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (!silent) notify.success(successMessage);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notify.error("Could not copy to clipboard");
    }
  }, [value, silent, successMessage]);

  const iconOnly = size === "icon" && !label;
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      onClick={onCopy}
      className={cn("gap-2", className)}
      aria-label={iconOnly ? "Copy" : undefined}
    >
      {copied ? (
        <Check className="h-4 w-4 text-success" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" aria-hidden="true" />
      )}
      {label ? <span>{copied ? "Copied" : label}</span> : null}
    </Button>
  );
}
