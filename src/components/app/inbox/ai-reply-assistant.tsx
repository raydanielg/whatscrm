import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles,
  Wand2,
  Languages,
  Scissors,
  Maximize2,
  CheckCircle2,
  SpellCheck,
  MessageSquarePlus,
  ArrowRight,
  RefreshCw,
  Loader2,
  Copy,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { aiReplyAssistant, type ReplyAction } from "@/lib/ai/reply-assistant.functions";
import { replyAssistantErrorMessage } from "@/lib/ai/reply-error";

interface Props {
  conversationId: string;
  draft: string;
  onApply: (text: string) => void;
  disabled?: boolean;
  /** When set, the trigger renders as a labelled row (for overflow menus) instead of an icon button. */
  triggerLabel?: string;
}

const TONE_ACTIONS: Array<{ id: ReplyAction; label: string; icon: React.ElementType }> = [
  { id: "tone_professional", label: "Professional", icon: Sparkles },
  { id: "tone_friendly", label: "Friendly", icon: Sparkles },
  { id: "tone_formal", label: "Formal", icon: Sparkles },
  { id: "tone_casual", label: "Casual", icon: Sparkles },
];

const EDIT_ACTIONS: Array<{ id: ReplyAction; label: string; icon: React.ElementType }> = [
  { id: "shorten", label: "Shorten", icon: Scissors },
  { id: "expand", label: "Detailed", icon: Maximize2 },
  { id: "improve", label: "Improve writing", icon: Wand2 },
  { id: "grammar", label: "Fix grammar", icon: SpellCheck },
  { id: "rewrite", label: "Rewrite", icon: RefreshCw },
  { id: "continue", label: "Continue writing", icon: ArrowRight },
];

const LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Italian",
  "Arabic",
  "Hindi",
  "Chinese",
  "Japanese",
  "Norwegian",
];

export function AIReplyAssistant({
  conversationId,
  draft,
  onApply,
  disabled,
  triggerLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<string>("");
  const [lastAction, setLastAction] = useState<ReplyAction | null>(null);
  const [lastLanguage, setLastLanguage] = useState<string | undefined>();
  const [customPrompt, setCustomPrompt] = useState("");
  const [langOpen, setLangOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const fn = useServerFn(aiReplyAssistant);
  const mut = useMutation({
    mutationFn: (v: {
      action: ReplyAction;
      regenerate?: boolean;
      targetLanguage?: string;
      customPrompt?: string;
    }) =>
      fn({
        data: {
          conversationId,
          action: v.action,
          draft,
          regenerate: v.regenerate ?? false,
          targetLanguage: v.targetLanguage,
          customPrompt: v.customPrompt,
        },
      }),
    onSuccess: (r, vars) => {
      setSuggestion(r.reply);
      setLastAction(vars.action);
      setLastLanguage(vars.targetLanguage);
    },
    onError: (e: Error) => {
      toast.error(replyAssistantErrorMessage(e));
    },
  });

  const run = (
    action: ReplyAction,
    extra?: { targetLanguage?: string; customPrompt?: string; regenerate?: boolean },
  ) => {
    mut.mutate({ action, ...extra });
  };

  const apply = () => {
    if (!suggestion) return;
    onApply(suggestion);
    setOpen(false);
    setSuggestion("");
    setLastAction(null);
    toast.success("Applied to composer");
  };

  const copy = async () => {
    if (!suggestion) return;
    await navigator.clipboard.writeText(suggestion);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const regenerate = () => {
    if (!lastAction) return;
    run(lastAction, { targetLanguage: lastLanguage, regenerate: true });
  };

  const isBusy = mut.isPending;
  const canEdit = draft.trim().length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {triggerLabel ? (
          <Button
            type="button"
            variant="ghost"
            className="justify-start gap-2 h-9 px-2 font-normal"
            disabled={disabled}
            aria-label="AI reply assistant"
          >
            <Sparkles className={cn("h-4 w-4 text-violet-500", isBusy && "animate-pulse")} />
            {triggerLabel}
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "h-9 w-9 shrink-0 rounded-full relative",
              "hover:bg-gradient-to-br hover:from-violet-500/10 hover:to-fuchsia-500/10",
            )}
            disabled={disabled}
            aria-label="AI reply assistant"
            title="AI reply assistant"
          >
            <Sparkles
              className={cn(
                "h-5 w-5 transition-colors",
                "text-violet-500",
                isBusy && "animate-pulse",
              )}
            />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-[380px] p-0 overflow-hidden">
        {/* Header */}
        <div className="px-3 py-2 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border-b border-border flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-medium">AI Reply Assistant</span>
          {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />}
        </div>

        {/* Suggestion preview */}
        {suggestion && (
          <div className="p-3 border-b border-border animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="relative rounded-control border border-violet-500/20 bg-violet-500/5 p-3 pr-2 max-h-48 overflow-y-auto">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{suggestion}</p>
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <Button size="sm" className="h-7 text-xs flex-1" onClick={apply}>
                <Check className="h-3 w-3 " /> Use this reply
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={regenerate}
                disabled={isBusy}
              >
                <RefreshCw className={cn("h-3 w-3 ", isBusy && "animate-spin")} />
                Regenerate
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={copy} title="Copy">
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setSuggestion("")}
                title="Dismiss"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {/* Actions grid */}
        <div className="p-2 space-y-2">
          {/* Generate */}
          <Button
            variant="ghost"
            className="w-full justify-start h-9 text-xs font-normal"
            disabled={isBusy}
            onClick={() => run("generate")}
          >
            <MessageSquarePlus className="h-3.5 w-3.5 text-violet-500" />
            <span className="font-medium">Generate reply</span>
            <span className="ml-auto text-[11px] text-muted-foreground">context-aware</span>
          </Button>

          <div>
            <div className="px-2 py-1 text-[11px]  text-muted-foreground">Tone</div>
            <div className="grid grid-cols-2 gap-1">
              {TONE_ACTIONS.map((a) => (
                <Button
                  key={a.id}
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs justify-start font-normal"
                  disabled={isBusy || !canEdit}
                  onClick={() => run(a.id)}
                >
                  <a.icon className="h-3 w-3 mr-1.5" />
                  {a.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <div className="px-2 py-1 text-[11px]  text-muted-foreground">Edit</div>
            <div className="grid grid-cols-2 gap-1">
              {EDIT_ACTIONS.map((a) => (
                <Button
                  key={a.id}
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs justify-start font-normal"
                  disabled={isBusy || !canEdit}
                  onClick={() => run(a.id)}
                >
                  <a.icon className="h-3 w-3 mr-1.5" />
                  {a.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Translate */}
          <Popover open={langOpen} onOpenChange={setLangOpen}>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="w-full h-7 text-xs justify-start font-normal"
                disabled={isBusy || !canEdit}
              >
                <Languages className="h-3 w-3 mr-1.5" />
                Translate to
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-48 p-1">
              <div className="max-h-56 overflow-y-auto">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted"
                    onClick={() => {
                      setLangOpen(false);
                      run("translate", { targetLanguage: lang });
                    }}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Separator className="my-1" />

          {/* Custom prompt */}
          <div>
            <div className="px-2 py-1 text-[11px]  text-muted-foreground">Custom instruction</div>
            <div className="flex items-center gap-1">
              <Input
                placeholder="e.g. Ask when they're available"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customPrompt.trim() && !isBusy) {
                    e.preventDefault();
                    run("custom", { customPrompt });
                  }
                }}
                className="h-7 text-xs"
                disabled={isBusy}
              />
              <Button
                size="icon"
                className="h-7 w-7 shrink-0"
                disabled={isBusy || !customPrompt.trim()}
                onClick={() => run("custom", { customPrompt })}
                aria-label="Run custom prompt"
              >
                {isBusy ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ArrowRight className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="px-3 py-1.5 bg-muted/30 border-t border-border flex items-center gap-1.5">
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          <span className="text-[11px] text-muted-foreground">
            Uses conversation history, CRM, and business context
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
