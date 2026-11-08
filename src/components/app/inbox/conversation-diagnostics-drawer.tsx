/**
 * Conversation diagnostics drawer — explains why a thread is (or isn't)
 * properly linked into the unified Inbox and what to do next.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Stethoscope } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  diagnoseConversation,
  type DiagnosticCheck,
  type DiagnosticStatus,
} from "@/lib/inbox/diagnostics.functions";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
  workspaceId: string | null | undefined;
};

const STATUS_META: Record<
  DiagnosticStatus,
  { icon: typeof CheckCircle2; className: string; label: string }
> = {
  ok: { icon: CheckCircle2, className: "text-primary", label: "OK" },
  warn: { icon: AlertTriangle, className: "text-muted-foreground", label: "Check" },
  fail: { icon: XCircle, className: "text-destructive", label: "Blocking" },
};

function CheckRow({ check }: { check: DiagnosticCheck }) {
  const meta = STATUS_META[check.status];
  const Icon = meta.icon;
  return (
    <li className="rounded border border-border p-3 space-y-1.5">
      <div className="flex items-start gap-2">
        <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", meta.className)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{check.label}</p>
            <Badge variant={check.status === "fail" ? "destructive" : "secondary"} className="text-[11px]">
              {meta.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 break-words">{check.detail}</p>
          {check.action && (
            <p className="text-xs mt-1.5">
              <span className="font-medium">Next step: </span>
              <span className="text-muted-foreground">{check.action}</span>
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export function ConversationDiagnosticsDrawer({
  open,
  onOpenChange,
  conversationId,
  workspaceId,
}: Props) {
  const run = useServerFn(diagnoseConversation);
  const query = useQuery({
    queryKey: ["conversation-diagnostics", conversationId, workspaceId],
    enabled: open && !!conversationId && !!workspaceId,
    staleTime: 15_000,
    queryFn: () => run({ data: { conversationId: conversationId!, workspaceId: workspaceId! } }),
  });

  const data = query.data;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="p-4 pb-3 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Stethoscope className="h-4 w-4" /> Conversation diagnostics
          </SheetTitle>
          <SheetDescription className="text-xs">
            Why this thread is or isn't linked to a channel account, session and contact.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-4">
            {query.isLoading && (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            )}

            {query.isError && (
              <p className="text-sm text-destructive">
                Could not run diagnostics: {(query.error as Error).message}
              </p>
            )}

            {data && (
              <>
                <div
                  className={cn(
                    "rounded border p-3",
                    data.linked ? "border-border bg-muted/40" : "border-destructive/40 bg-destructive/5",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant={data.linked ? "secondary" : "destructive"}>
                      {data.linked ? "Linked" : "Not linked"}
                    </Badge>
                    <span className="text-xs text-muted-foreground capitalize">{data.channel}</span>
                  </div>
                  <p className="text-sm mt-2">{data.summary}</p>
                </div>

                <ul className="space-y-2">
                  {data.checks.map((c) => (
                    <CheckRow key={c.id} check={c} />
                  ))}
                </ul>

                <p className="text-[11px] text-muted-foreground">
                  Conversation id: <span className="font-mono">{data.conversationId}</span>
                </p>
              </>
            )}
          </div>
        </ScrollArea>

        <div className="p-3 border-t border-border flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", query.isFetching && "animate-spin")} />
            Re-run checks
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
