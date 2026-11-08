/**
 * QuickPickTemplates — reusable quick-pick dropdown for message templates.
 *
 * Sits above a Textarea/Input and lets the user drop a curated preset (greeting,
 * fallback, or human-handoff) into the field in one click. Share this across
 * every chatbot setup surface so channels don't drift in tone or coverage.
 */
import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getTemplates,
  type MessageTemplateKind,
} from "@/lib/chatbots/message-templates";
import { ScrollArea } from "@/components/ui/scroll-area";

export function QuickPickTemplates({
  kind,
  onPick,
  label = "Templates",
}: {
  kind: MessageTemplateKind;
  onPick: (body: string) => void;
  label?: string;
}) {
  const templates = getTemplates(kind);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
          <MessageSquareText className="w-3.5 h-3.5 mr-1.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Quick-pick {kind}
        </div>
        <ScrollArea type="hover" viewportClassName="max-h-72">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onPick(t.body)}
              className="w-full text-left rounded-control px-2 py-2 hover:bg-muted focus:bg-muted focus:outline-none"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{t.label}</span>
                {t.hint && (
                  <span className="text-[11px] text-muted-foreground">{t.hint}</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                {t.body}
              </p>
            </button>
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
