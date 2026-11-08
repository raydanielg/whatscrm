import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  GripVertical,
  TrendingUp,
  Calendar,
  Flame,
  AlertTriangle,
  Link2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShareQuoteLink, copyText } from "@/hooks/use-quote-share";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { formatMoney, useUpdateDeal, type DealRow } from "@/hooks/use-deals";
import { useTenantCurrency } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { isDealStale, type StageRow } from "@/hooks/use-pipeline";
import { toast } from "sonner";

type Props = {
  stages: StageRow[];
  deals: DealRow[];
  membersById?: Map<
    string,
    { display_name: string | null; avatar_url: string | null; email: string | null }
  >;
  pipelineStaleAfter?: number;
};

export function DealKanban({ stages, deals, membersById, pipelineStaleAfter = 14 }: Props) {
  const update = useUpdateDeal();
  const [dragging, setDragging] = useState<string | null>(null);
  const [hoverStage, setHoverStage] = useState<string | null>(null);

  const dealsByStage = useMemo(() => {
    const m = new Map<string, DealRow[]>();
    for (const s of stages) m.set(s.id, []);
    for (const d of deals) {
      const arr = d.stage_id ? m.get(d.stage_id) : undefined;
      if (arr) arr.push(d);
    }
    return m;
  }, [stages, deals]);

  const totalByStage = (list: DealRow[]) =>
    list.reduce<Record<string, number>>((acc, d) => {
      acc[d.currency] = (acc[d.currency] ?? 0) + Number(d.amount || 0);
      return acc;
    }, {});

  const handleDrop = async (stage: StageRow, dealId: string) => {
    setHoverStage(null);
    setDragging(null);
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage_id === stage.id) return;

    // Enforce stage rules
    const rules = (stage.rules ?? {}) as {
      require_amount?: boolean;
      require_contact?: boolean;
      require_close_date?: boolean;
    };
    if (rules.require_amount && (!deal.amount || Number(deal.amount) <= 0)) {
      toast.error(`“${stage.name}” requires an amount on the deal`);
      return;
    }
    if (rules.require_contact && !deal.contact_id) {
      toast.error(`“${stage.name}” requires a linked contact`);
      return;
    }
    if (rules.require_close_date && !deal.expected_close_date) {
      toast.error(`“${stage.name}” requires an expected close date`);
      return;
    }

    try {
      await update.mutateAsync({
        id: dealId,
        patch: {
          stage_id: stage.id,
          probability: stage.probability,
          status: stage.is_won ? "won" : stage.is_lost ? "lost" : "open",
          actual_close_date:
            stage.is_won || stage.is_lost
              ? new Date().toISOString().slice(0, 10)
              : deal.actual_close_date,
        },
      });
      toast.success(`Moved to ${stage.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to move deal");
    }
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 md:-mx-6 px-4 md:px-6 snap-x">
      {stages.map((s) => {
        const list = dealsByStage.get(s.id) ?? [];
        const totals = totalByStage(list);
        const isHover = hoverStage === s.id;
        return (
          <motion.div
            key={s.id}
            layout
            className={cn(
              "flex-shrink-0 w-[300px] snap-start rounded-control border transition-all",
              isHover
                ? "border-primary/60 bg-primary/5 shadow-lg shadow-primary/10 scale-[1.02]"
                : "border-transparent bg-muted/40",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setHoverStage(s.id);
            }}
            onDragLeave={() => setHoverStage((h) => (h === s.id ? null : h))}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              if (id) handleDrop(s, id);
            }}
          >
            <div className="p-3 border-b border-border/40 sticky top-0 bg-muted/60 backdrop-blur rounded-t-xl z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ring-offset-1 ring-offset-background"
                    style={{
                      backgroundColor: s.color ?? "#94a3b8",
                      boxShadow: `0 0 12px ${s.color ?? "#94a3b8"}40`,
                    }}
                  />
                  <span className="text-sm font-semibold truncate">{s.name}</span>
                  <span className="text-xs text-muted-foreground">{list.length}</span>
                </div>
                <div className="flex items-center gap-1">
                  {s.stage_type === "won" && (
                    <Badge className="h-4 text-[11px] bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">
                      won
                    </Badge>
                  )}
                  {s.stage_type === "lost" && (
                    <Badge variant="destructive" className="h-4 text-[11px]">
                      lost
                    </Badge>
                  )}
                  <span className="text-[11px] text-muted-foreground">{s.probability}%</span>
                </div>
              </div>
              {Object.keys(totals).length > 0 && (
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {Object.entries(totals)
                    .map(([c, v]) => formatMoney(v, c))
                    .join(" · ")}
                </div>
              )}
              {/* Progress bar */}
              <div className="h-0.5 mt-2 rounded-full bg-border/60 overflow-hidden">
                <motion.div
                  className="h-full"
                  style={{ backgroundColor: s.color ?? "#94a3b8" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${s.probability}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
            </div>

            <div className="p-2 space-y-2 min-h-[220px]">
              <AnimatePresence initial={false}>
                {list.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={cn(
                      "text-xs text-muted-foreground/70 text-center py-6 border border-dashed rounded-control transition-colors",
                      isHover ? "border-primary/40 text-primary" : "border-border/50",
                    )}
                  >
                    {isHover ? "Release to drop here" : "Drop deals here"}
                  </motion.div>
                ) : (
                  list.map((d) => (
                    <motion.div
                      key={d.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.15 }}
                    >
                      <DealCard
                        deal={d}
                        stage={s}
                        pipelineStaleAfter={pipelineStaleAfter}
                        membersById={membersById}
                        onDragStart={() => setDragging(d.id)}
                        onDragEnd={() => setDragging(null)}
                        dragging={dragging === d.id}
                      />
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function DealCard({
  deal,
  stage,
  pipelineStaleAfter,
  membersById,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  deal: DealRow;
  stage: StageRow;
  pipelineStaleAfter: number;
  membersById?: Map<
    string,
    { display_name: string | null; avatar_url: string | null; email: string | null }
  >;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  const tenantCurrency = useTenantCurrency();
  const formatZonedDate = useZonedDateFormatter();
  const shareQuote = useShareQuoteLink();
  const owner = deal.owner_id ? membersById?.get(deal.owner_id) : null;
  const initials = (owner?.display_name || owner?.email || "??")
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const overdue =
    deal.expected_close_date &&
    new Date(deal.expected_close_date) < new Date() &&
    deal.status === "open";

  const stale = isDealStale(deal, stage, pipelineStaleAfter);

  return (
    <Link
      to="/deals/$dealId"
      params={{ dealId: deal.id }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", deal.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "block group rounded-control bg-surface border p-3 shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-grab active:cursor-grabbing",
        dragging ? "opacity-40 scale-95 rotate-1" : "border-border/60",
        stale && "border-amber-500/40 bg-amber-500/[0.03]",
      )}
      style={{
        borderLeftWidth: 3,
        borderLeftColor: stage.color ?? undefined,
      }}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium leading-snug truncate">{deal.title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {formatMoney(Number(deal.amount || 0), deal.currency || tenantCurrency)}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {stale && (
              <Badge
                variant="outline"
                className="h-4 text-[11px] gap-0.5 px-1.5 border-amber-500/50 text-amber-600 dark:text-amber-400"
              >
                <AlertTriangle className="w-2.5 h-2.5" /> stalled
              </Badge>
            )}
            {deal.priority === "urgent" && (
              <Badge variant="destructive" className="h-4 text-[11px] gap-0.5 px-1.5">
                <Flame className="w-2.5 h-2.5" /> urgent
              </Badge>
            )}
            {deal.priority === "high" && (
              <Badge variant="secondary" className="h-4 text-[11px] px-1.5">
                high
              </Badge>
            )}
            {deal.probability > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                <TrendingUp className="w-2.5 h-2.5" />
                {deal.probability}%
              </span>
            )}
            {deal.expected_close_date && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-[11px]",
                  overdue ? "text-destructive" : "text-muted-foreground",
                )}
              >
                <Calendar className="w-2.5 h-2.5" />
                {formatZonedDate(deal.expected_close_date, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
            {deal.tags?.slice(0, 2).map((t) => (
              <Badge key={t} variant="outline" className="h-4 text-[11px] px-1.5">
                {t}
              </Badge>
            ))}
          </div>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Copy quote link for this deal"
          title="Copy quote link"
          className="h-8 w-8 flex-shrink-0"
          disabled={shareQuote.isPending}
          onClick={async (e) => {
            // Sits inside the card <Link>, so keep the click from navigating.
            e.preventDefault();
            e.stopPropagation();
            try {
              const res = await shareQuote.mutateAsync({
                dealId: deal.id,
                contactId: deal.contact_id,
                companyId: deal.company_id,
                title: deal.title,
                amount: Number(deal.amount || 0),
                currency: deal.currency || tenantCurrency,
              });
              const copied = await copyText(res.url);
              toast.success(copied ? "Quote link copied" : "Quote link ready", {
                description: res.url,
                action: {
                  label: "Open",
                  onClick: () => window.open(res.url, "_blank", "noopener"),
                },
              });
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not create the quote link");
            }
          }}
        >
          {shareQuote.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Link2 className="w-3.5 h-3.5" />
          )}
        </Button>
        {owner && (
          <Avatar className="w-6 h-6 flex-shrink-0">
            <AvatarFallback className="text-[11px] bg-primary/10 text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </Link>
  );
}
