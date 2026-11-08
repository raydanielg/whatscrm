import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles,
  RefreshCcw,
  Loader2,
  ArrowRight,
  Copy,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  generateCustomerInsight,
  type CustomerInsight,
} from "@/lib/ai/customer-insights.functions";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

interface Props {
  customerId: string;
}

/**
 * AI-generated summary + suggested next best action for a customer, derived
 * from their recent WhatsApp conversation history.
 */
export function CustomerAIInsights({ customerId }: Props) {
  const qc = useQueryClient();
  const formatZonedDate = useZonedDateFormatter();
  const fetchInsight = useServerFn(generateCustomerInsight);
  const queryKey = ["customer-ai-insight", customerId];

  const insightQ = useQuery<CustomerInsight>({
    queryKey,
    queryFn: () => fetchInsight({ data: { customerId } }),
    staleTime: 1000 * 60 * 10, // 10 min
    refetchOnWindowFocus: false,
  });

  const regen = useMutation({
    mutationFn: () => fetchInsight({ data: { customerId } }),
    onSuccess: (fresh) => {
      qc.setQueryData(queryKey, fresh);
      toast.success("Insight refreshed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to refresh"),
  });

  const insight = insightQ.data;
  const loading = insightQ.isLoading;
  const error = insightQ.error as Error | undefined;

  return (
    <div className="rounded-control border border-border bg-gradient-to-br from-accent/5 via-surface to-surface p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-control bg-accent/10 grid place-items-center text-accent shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-display font-semibold truncate">AI insight</h3>
            <p className="text-[11px] text-muted-foreground truncate">
              Summary & next best action from recent WhatsApp threads
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => regen.mutate()}
          disabled={regen.isPending || loading}
        >
          {regen.isPending || loading ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
          )}
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-16" />
          </div>
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 text-xs text-destructive">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{error.message}</span>
        </div>
      ) : insight ? (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-foreground">{insight.summary}</p>

          <div className="flex flex-wrap gap-1.5">
            <Badge
              variant="outline"
              className={cn("capitalize", sentimentClass(insight.sentiment))}
            >
              {insight.sentiment}
            </Badge>
            {insight.topics.map((t) => (
              <Badge key={t} variant="secondary" className="capitalize">
                {t}
              </Badge>
            ))}
          </div>

          <div className="rounded-control border border-border bg-surface p-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="text-[11px]  text-muted-foreground font-semibold flex items-center gap-1.5">
                <ArrowRight className="w-3 h-3" /> Next best action
              </div>
              <Badge variant="outline" className={priorityClass(insight.nextAction.priority)}>
                {insight.nextAction.priority}
              </Badge>
            </div>
            <div className="text-sm font-medium">{insight.nextAction.title}</div>
            <p className="text-xs text-muted-foreground mt-0.5">{insight.nextAction.reason}</p>
          </div>

          {insight.suggestedReply && (
            <div className="rounded-control border border-dashed border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-[11px]  text-muted-foreground font-semibold">
                  Suggested reply
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2"
                  onClick={() => {
                    void navigator.clipboard.writeText(insight.suggestedReply ?? "");
                    toast.success("Copied");
                  }}
                >
                  <Copy className="w-3 h-3 " /> Copy
                </Button>
              </div>
              <p className="text-sm whitespace-pre-wrap">{insight.suggestedReply}</p>
            </div>
          )}

          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatZonedDate(insight.meta.generatedAt, {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </span>
            <span>·</span>
            <span>
              {insight.meta.messageCount} msgs / {insight.meta.conversationCount} threads
            </span>
            <span>·</span>
            <span className="truncate">{insight.meta.model}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function sentimentClass(s: CustomerInsight["sentiment"]) {
  if (s === "positive") return "border-emerald-500/40 text-emerald-600";
  if (s === "negative") return "border-rose-500/40 text-rose-600";
  return "border-border text-muted-foreground";
}

function priorityClass(p: "low" | "medium" | "high") {
  if (p === "high") return "border-rose-500/40 text-rose-600";
  if (p === "medium") return "border-amber-500/40 text-amber-600";
  return "border-border text-muted-foreground";
}
