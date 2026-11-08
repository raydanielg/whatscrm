/**
 * Template preview — fill every {{variable}} and see exactly how the message
 * will render in WhatsApp before inserting or sending it.
 *
 * Works for both official WhatsApp Cloud templates (component JSON) and local
 * saved replies (plain body text with {{named}} tokens).
 */

import { useEffect, useMemo, useState } from "react";
import {
  Eye,
  Send,
  CornerDownLeft,
  AlertTriangle,
  Sparkles,
  Bookmark,
  Plus,
  X,
} from "lucide-react";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { mergeFieldSamples } from "@/components/app/whatsapp/merge-fields";
import {
  SOURCE_LABEL,
  loadLastUsedValues,
  saveLastUsedValues,
  suggestVariableValues,
  type ContactLike,
  type Suggestion,
} from "@/lib/messaging/variable-autosuggest";
import {
  applyPreset,
  deletePreset,
  loadPresets,
  savePreset,
  type TemplatePreset,
} from "@/lib/messaging/template-presets";
import {
  findFormatIssues,
  validateTemplateParameters,
  type TemplateParamComponent,
} from "@/lib/messaging/template-parameter-validation";
import {
  buildTemplateSendPayload,
  type TemplateComponent,
  type TemplateSendPayload,
} from "@/lib/messaging/template-send-payload";

export type { TemplateComponent as PreviewComponent };

const TOKEN_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;

export type TemplatePreviewTarget = {
  id: string;
  name: string;
  language?: string;
  category?: string;
  /** Official Meta component JSON, when available. */
  components?: TemplateComponent[] | null;
  /** Fallback plain body (saved replies). */
  body?: string;
};

function toComponents(t: TemplatePreviewTarget): TemplateComponent[] {
  if (Array.isArray(t.components) && t.components.length > 0) return t.components;
  return t.body ? [{ type: "BODY", text: t.body }] : [];
}

type TokenMap = {
  tokens: string[];
  componentOf: Record<string, TemplateParamComponent>;
  urlTokens: string[];
  texts: string[];
};

function collectTokens(components: TemplateComponent[]): TokenMap {
  const seen: string[] = [];
  const componentOf: Record<string, TemplateParamComponent> = {};
  const urlTokens: string[] = [];
  const texts: string[] = [];

  const scan = (text: string | undefined, kind: TemplateParamComponent, isUrl = false) => {
    if (!text) return;
    texts.push(text);
    for (const m of text.matchAll(TOKEN_RE)) {
      const token = m[1];
      if (!seen.includes(token)) seen.push(token);
      componentOf[token] ??= kind;
      if (isUrl && !urlTokens.includes(token)) urlTokens.push(token);
    }
  };

  for (const c of components) {
    const kind = (String(c.type ?? "").toUpperCase() as TemplateParamComponent) || "UNKNOWN";
    const known: TemplateParamComponent[] = ["HEADER", "BODY", "FOOTER", "BUTTON"];
    scan(c.text, known.includes(kind) ? kind : "UNKNOWN");
    for (const b of c.buttons ?? []) {
      scan(b.text, "BUTTON");
      scan(b.url, "BUTTON", true);
    }
  }
  return { tokens: seen, componentOf, urlTokens, texts };
}

function fill(text: string, values: Record<string, string>): string {
  return text.replace(TOKEN_RE, (_m, key: string) => {
    const v = values[key];
    return v && v.trim() ? v : `{{${key}}}`;
  });
}

/** Very small subset of WhatsApp markdown: *bold*, _italic_, ~strike~. */
function formatWa(text: string) {
  const nodes: React.ReactNode[] = [];
  const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const inner = m[0].slice(1, -1);
    if (m[0][0] === "*") nodes.push(<strong key={i++}>{inner}</strong>);
    else if (m[0][0] === "_") nodes.push(<em key={i++}>{inner}</em>);
    else nodes.push(<s key={i++}>{inner}</s>);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export type TemplatePreviewDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template: TemplatePreviewTarget | null;
  /** Values already known from the conversation (contact name, order, ). */
  contextVars?: Record<string, string | undefined | null>;
  /** Selected contact / CRM record used to auto-suggest parameter values. */
  contact?: ContactLike;
  onInsert?: (rendered: string, values: Record<string, string>) => void;
  onSend?: (
    rendered: string,
    values: Record<string, string>,
    payload: TemplateSendPayload | null,
  ) => void | Promise<void>;
};

export function TemplatePreviewDialog({
  open,
  onOpenChange,
  template,
  contextVars,
  contact,
  onInsert,
  onSend,
}: TemplatePreviewDialogProps) {
  const formatZoned = useZonedDateFormatter();
  const components = useMemo(() => (template ? toComponents(template) : []), [template]);
  const tokenMap = useMemo(() => collectTokens(components), [components]);
  const tokens = tokenMap.tokens;
  const [values, setValues] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<Record<string, Suggestion["source"]>>({});

  /* Reusable parameter presets for this template. */
  const [presets, setPresets] = useState<TemplatePreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);

  const samples = useMemo(() => mergeFieldSamples(), []);

  /** Suggestions from conversation context → contact/CRM → last used values. */
  const suggestions = useMemo(() => {
    if (!open || !template) return {} as Record<string, Suggestion>;
    return suggestVariableValues({
      tokens,
      contextVars,
      contact,
      lastUsed: loadLastUsedValues(template.id),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template?.id, tokens, contextVars, contact]);

  const suggestedCount = Object.keys(suggestions).length;

  // Pre-fill before the editor is usable, so the user only fixes what's left.
  useEffect(() => {
    if (!open || !template) return;
    const next: Record<string, string> = {};
    const nextSources: Record<string, Suggestion["source"]> = {};
    for (const t of tokens) {
      const s = suggestions[t];
      next[t] = s?.value ?? "";
      if (s) nextSources[t] = s.source;
    }
    setValues(next);
    setSources(nextSources);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template?.id, suggestions]);

  const applySuggestions = (overwrite: boolean) => {
    setValues((v) => {
      const next = { ...v };
      for (const [k, s] of Object.entries(suggestions)) {
        if (overwrite || !next[k]?.trim()) next[k] = s.value;
      }
      return next;
    });
    setSources((s) => ({
      ...s,
      ...Object.fromEntries(Object.entries(suggestions).map(([k, v]) => [k, v.source])),
    }));
  };

  const setValue = (token: string, value: string) => {
    setValues((v) => ({ ...v, [token]: value }));
    setSources((s) => {
      const next = { ...s };
      delete next[token];
      return next;
    });
  };

  // Load saved presets whenever the dialog opens for a template.
  useEffect(() => {
    if (!open || !template) return;
    setPresets(loadPresets(template.id));
    setPresetName("");
    setSavingPreset(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template?.id]);

  const usePreset = (preset: TemplatePreset) => {
    setValues((v) => applyPreset(tokens, v, preset));
    setSources((s) => {
      const next = { ...s };
      for (const t of tokens) if (preset.values[t]?.trim()) delete next[t];
      return next;
    });
  };

  const handleSavePreset = () => {
    if (!template) return;
    setPresets(savePreset(template.id, presetName, values));
    setPresetName("");
    setSavingPreset(false);
  };

  const handleDeletePreset = (presetId: string) => {
    if (!template) return;
    setPresets(deletePreset(template.id, presetId));
  };

  const remember = (vals: Record<string, string>) => saveLastUsedValues(template?.id, vals);

  /** Unsupported placeholder syntax in the template text itself. */
  const formatIssues = useMemo(() => findFormatIssues(tokenMap.texts), [tokenMap.texts]);

  /** Per-variable inline errors (required, unsupported format, bad value). */
  const { errors, valid } = useMemo(
    () =>
      validateTemplateParameters({
        tokens,
        values,
        componentOf: tokenMap.componentOf,
        urlTokens: tokenMap.urlTokens,
      }),
    [tokens, values, tokenMap],
  );

  const errorCount = Object.keys(errors).length;
  const blocked = !valid || formatIssues.length > 0;

  const header = components.find((c) => String(c.type).toUpperCase() === "HEADER");
  const bodyC = components.find((c) => String(c.type).toUpperCase() === "BODY");
  const footer = components.find((c) => String(c.type).toUpperCase() === "FOOTER");
  const buttons = components.find((c) => String(c.type).toUpperCase() === "BUTTONS")?.buttons ?? [];

  const renderedPlain = [header?.text, bodyC?.text, footer?.text]
    .filter(Boolean)
    .map((t) => fill(t as string, values))
    .join("\n\n")
    .trim();

  const payload = useMemo(() => {
    if (!template || !template.components || template.components.length === 0) return null;
    return buildTemplateSendPayload(
      { name: template.name, language: template.language, components: template.components },
      values,
    );
  }, [template, values]);

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4" /> Preview · {template.name}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 flex-wrap">
            {template.category && (
              <Badge variant="outline" className="h-4 px-1 text-[11px]">
                {template.category.toLowerCase()}
              </Badge>
            )}
            {template.language && (
              <Badge variant="outline" className="h-4 px-1 text-[11px] font-mono">
                {template.language}
              </Badge>
            )}
            <span>Fill the parameters to see the exact message.</span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-2">
          {/* Parameters */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-muted-foreground ">
                Parameters ({tokens.length})
              </div>
              {tokens.length > 0 && suggestedCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => applySuggestions(true)}
                  title="Fill from contact, CRM fields or last used values"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Auto-fill {suggestedCount}
                </Button>
              )}
            </div>

            {tokens.length > 0 && (
              <div className="space-y-2 rounded-control border bg-muted/30 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Bookmark className="h-3.5 w-3.5" />
                    Presets
                  </div>
                  {!savingPreset && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={Object.values(values).every((v) => !v?.trim())}
                      onClick={() => setSavingPreset(true)}
                    >
                      <Plus className="h-3.5 w-3.5" /> Save current
                    </Button>
                  )}
                </div>

                {savingPreset && (
                  <div className="flex items-center gap-2">
                    <Input
                      autoFocus
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSavePreset();
                        }
                        if (e.key === "Escape") setSavingPreset(false);
                      }}
                      placeholder="Preset name (e.g. VIP onboarding)"
                      className="h-8 text-sm"
                    />
                    <Button
                      size="sm"
                      className="h-8"
                      disabled={!presetName.trim()}
                      onClick={handleSavePreset}
                    >
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8"
                      onClick={() => setSavingPreset(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}

                {presets.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    No presets yet — fill the values and save them to reuse next time.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {presets.map((p) => (
                      <span
                        key={p.id}
                        className="group inline-flex items-center rounded-full border bg-background pl-2 pr-1 text-xs"
                      >
                        <button
                          type="button"
                          className="py-1 pr-1 hover:text-primary"
                          onClick={() => usePreset(p)}
                          title={Object.entries(p.values)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join("\n")}
                        >
                          {p.name}
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete preset ${p.name}`}
                          className="rounded-full p-0.5 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeletePreset(p.id)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tokens.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This template has no variables — it sends exactly as shown.
              </p>
            ) : (
              <ScrollArea className="max-h-[300px] pr-3">
                <div className="space-y-3">
                  {tokens.map((t) => (
                    <div key={t} className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Label htmlFor={`var-${t}`} className="text-xs font-mono">
                          {"{{" + t + "}}"}
                        </Label>
                        {sources[t] && values[t]?.trim() && (
                          <Badge variant="secondary" className="h-4 px-1 text-[11px] gap-0.5">
                            <Sparkles className="h-3 w-3" />
                            {SOURCE_LABEL[sources[t]!]}
                          </Badge>
                        )}
                      </div>
                      <Input
                        id={`var-${t}`}
                        value={values[t] ?? ""}
                        onChange={(e) => setValue(t, e.target.value)}
                        placeholder={samples[t] ? `e.g. ${samples[t]}` : `Value for ${t}`}
                        aria-invalid={errors[t] ? true : undefined}
                        aria-describedby={errors[t] ? `var-${t}-error` : undefined}
                        className={
                          errors[t]
                            ? "border-destructive focus-visible:ring-destructive/40"
                            : undefined
                        }
                      />
                      {errors[t] && (
                        <p
                          id={`var-${t}-error`}
                          role="alert"
                          className="text-[11px] text-destructive flex items-start gap-1.5"
                        >
                          <AlertTriangle className="h-3 w-3 mt-px shrink-0" />
                          {errors[t]}
                        </p>
                      )}

                      {!values[t]?.trim() && suggestions[t] && (
                        <button
                          type="button"
                          className="text-[11px] text-primary hover:underline"
                          onClick={() => {
                            setValues((v) => ({ ...v, [t]: suggestions[t]!.value }));
                            setSources((s) => ({ ...s, [t]: suggestions[t]!.source }));
                          }}
                        >
                          Use “{suggestions[t]!.value}” ({SOURCE_LABEL[suggestions[t]!.source]})
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
            {formatIssues.length > 0 && (
              <div className="rounded-control border border-destructive/40 bg-destructive/5 p-2.5 space-y-1.5">
                <p className="text-[11px] font-medium text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Unsupported variable format in this template
                </p>
                {formatIssues.map((issue) => (
                  <p key={issue.raw} className="text-[11px] text-destructive/90">
                    <code className="font-mono">{issue.raw}</code> — {issue.reason}
                  </p>
                ))}
              </div>
            )}
            {formatIssues.length === 0 && errorCount > 0 && (
              <p className="text-[11px] text-destructive flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
                {errorCount} parameter{errorCount > 1 ? "s" : ""} need
                {errorCount > 1 ? "" : "s"} attention — sending is blocked until every value is
                valid.
              </p>
            )}
          </div>

          {/* Live bubble */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground ">Preview</div>
            <div className="rounded-control bg-muted/60 p-4">
              <div className="ml-auto max-w-[92%] rounded-control rounded-tr-sm bg-primary/10 border border-primary/20 px-3 py-2 shadow-sm">
                {header?.text && (
                  <div className="text-sm font-semibold mb-1 whitespace-pre-wrap break-words">
                    {formatWa(fill(header.text, values))}
                  </div>
                )}
                {header && !header.text && header.format && (
                  <div className="mb-2 rounded-control bg-muted h-20 flex items-center justify-center text-[11px] text-muted-foreground uppercase">
                    {header.format} header
                  </div>
                )}
                {bodyC?.text && (
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {formatWa(fill(bodyC.text, values))}
                  </div>
                )}
                {footer?.text && (
                  <div className="mt-1.5 text-[11px] text-muted-foreground whitespace-pre-wrap break-words">
                    {fill(footer.text, values)}
                  </div>
                )}
                <div className="mt-1 text-[11px] text-muted-foreground text-right">
                  {formatZoned(new Date(), { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              {buttons.length > 0 && (
                <div className="ml-auto max-w-[92%] mt-1 space-y-1">
                  {buttons.map((b, i) => (
                    <div
                      key={i}
                      className="rounded-control border border-primary/20 bg-background px-3 py-1.5 text-center text-sm text-primary"
                    >
                      {fill(String(b.text ?? ""), values)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {onInsert && (
            <Button
              variant="outline"
              disabled={formatIssues.length > 0}
              title={
                formatIssues.length > 0
                  ? "This template uses an unsupported variable format."
                  : undefined
              }
              onClick={() => {
                if (formatIssues.length > 0) return;
                remember(values);
                onInsert(renderedPlain, values);
                onOpenChange(false);
              }}
            >
              <CornerDownLeft className="h-4 w-4" /> Insert
            </Button>
          )}
          {onSend && (
            <Button
              disabled={blocked}
              title={blocked ? "Fix the highlighted parameter errors before sending." : undefined}
              onClick={() => {
                if (blocked) return;
                remember(values);
                void onSend(renderedPlain, values, payload);
                onOpenChange(false);
              }}
            >
              <Send className="h-4 w-4" /> Send now
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
