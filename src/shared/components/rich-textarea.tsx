import { useCallback, useRef, useState } from "react";
import { Bold, Italic, Strikethrough, List, Eye, EyeOff } from "lucide-react";
import { FormattedText } from "@/components/app/inbox/formatted-text";
import { toggleWrap, togglePrefix, type FormatMarker } from "@/lib/inbox/rich-text";
import { cn } from "@/lib/utils";

/**
 * A textarea with a compact WhatsApp-marker formatting strip
 * (bold/italic/strike/bullet) and a preview toggle, for free-text fields —
 * descriptions, notes, comments — that benefit from the same lightweight
 * formatting the inbox message composer offers. Stored value stays plain
 * text with WhatsApp's own markers (`*bold*`, `_italic_`, ...), same as chat
 * messages, so any view that doesn't render it through `FormattedText` still
 * shows readable (if literal) text rather than broken markup.
 *
 * The toolbar is a header row inside the field's own border, not a separate
 * control above it, so the whole thing reads as one input.
 *
 * Use this for human-written narrative text (a description, a note, a
 * comment). Don't use it for code, JSON, URLs, tokens, or anything where the
 * exact characters matter and bold/italic markers would be unwanted noise.
 */
export function RichTextarea({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  rows = 3,
  disabled,
  required,
  maxLength,
  className,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  required?: boolean;
  maxLength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [showPreview, setShowPreview] = useState(false);

  const applyFormat = useCallback(
    (
      transform: (
        text: string,
        selectionStart: number,
        selectionEnd: number,
      ) => { text: string; selectionStart: number; selectionEnd: number },
    ) => {
      const el = ref.current;
      if (!el) return;
      const next = transform(value, el.selectionStart, el.selectionEnd);
      onChange(next.text);
      // The new value lands on the next render — restore the caret after it.
      requestAnimationFrame(() => {
        const node = ref.current;
        if (!node) return;
        node.focus();
        node.setSelectionRange(next.selectionStart, next.selectionEnd);
      });
    },
    [value, onChange],
  );

  const wrap = (marker: FormatMarker) => applyFormat((t, a, b) => toggleWrap(t, a, b, marker));
  const bullet = () => applyFormat((t, a, b) => togglePrefix(t, a, b, "- "));

  const buttons: Array<{ key: string; icon: typeof Bold; label: string; run: () => void }> = [
    { key: "bold", icon: Bold, label: "Bold", run: () => wrap("*") },
    { key: "italic", icon: Italic, label: "Italic", run: () => wrap("_") },
    { key: "strike", icon: Strikethrough, label: "Strikethrough", run: () => wrap("~") },
    { key: "bullet", icon: List, label: "Bulleted list", run: bullet },
  ];

  return (
    <div
      className={cn(
        "control-border overflow-hidden rounded-(--radius-control) transition-shadow",
        "focus-within:shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--ring)]",
        disabled && "opacity-50",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-2 py-1">
        <div className="flex items-center gap-0.5">
          {buttons.map(({ key, icon: Icon, label, run }) => (
            <button
              key={key}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={run}
              disabled={disabled || showPreview}
              title={label}
              aria-label={label}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-control text-muted-foreground",
                "transition-colors hover:bg-background hover:text-foreground",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              <Icon className="h-3 w-3" />
            </button>
          ))}
        </div>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShowPreview((v) => !v)}
          disabled={disabled || !value.trim()}
          aria-pressed={showPreview}
          aria-label={showPreview ? "Hide preview" : "Preview formatting"}
          title={showPreview ? "Hide preview" : "Preview formatting"}
          className={cn(
            "flex h-6 items-center gap-1 rounded-control px-2 text-[11px] font-medium text-muted-foreground",
            "transition-colors hover:bg-background hover:text-foreground",
            "disabled:pointer-events-none disabled:opacity-40",
            showPreview && "bg-background text-foreground",
          )}
        >
          {showPreview ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          Preview
        </button>
      </div>

      {showPreview ? (
        <div className="min-h-16 bg-background px-3 py-2 text-sm">
          <FormattedText text={value} />
        </div>
      ) : (
        <textarea
          id={id}
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          required={required}
          maxLength={maxLength}
          className={cn(
            "block w-full resize-y border-0 bg-background px-3 py-2 text-base",
            "placeholder:text-muted-foreground focus:outline-none focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          )}
        />
      )}
    </div>
  );
}
