import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { ActionBar } from "@/components/app/action-bar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, FileText, Trash2, RotateCcw, ArrowLeft, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  useQuotes,
  useDeleteQuote,
  useRestoreQuote,
  usePurgeQuote,
  useDuplicateQuote,
  QUOTE_STATUS_META,
  type QuoteStatus,
  type QuoteRow,
} from "@/hooks/use-quotes";
import { useSalesRealtime } from "@/hooks/use-sales-realtime";
import { useTenantCurrency } from "@/hooks/use-currency";
import { QuoteFormDialog } from "@/components/app/quotes/quote-form-dialog";
import { ConfirmDialog } from "@/shared/components/confirm-dialog";

export const Route = createFileRoute("/_authenticated/quotes/")({
  component: QuotesPage,
  staticData: { breadcrumb: "Quotes" },
  head: () => ({
    meta: [
      { title: "Quotes" },
      {
        name: "description",
        content: "Draft, send, and track sales quotes with approvals, versions and PDF preview.",
      },
    ],
  }),
});

function QuotesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<QuoteStatus | "all">("all");
  const [open, setOpen] = useState(false);
  const [trashed, setTrashed] = useState(false);
  const [deleting, setDeleting] = useState<QuoteRow | null>(null);
  const [restoring, setRestoring] = useState<QuoteRow | null>(null);
  const [purging, setPurging] = useState<QuoteRow | null>(null);
  const { data: quotes, isLoading } = useQuotes({ search, status, trashed });
  // Rows written before a currency was stored fall back to the tenant's
  // currency, never a hardcoded USD — see use-currency.ts.
  const tenantCurrency = useTenantCurrency();
  const del = useDeleteQuote();
  const restore = useRestoreQuote();
  const purge = usePurgeQuote();
  const duplicate = useDuplicateQuote();
  const navigate = useNavigate();
  useSalesRealtime();

  return (
    <div className="flex flex-col h-full">
      <AppTopbar
        title={trashed ? "Quotes — Trash" : "Quotes"}
        subtitle={
          trashed
            ? "Soft-deleted quotes. Restore to bring them back to the active list."
            : "Create beautiful proposals with line items, taxes, discounts, and approval flows."
        }
        actions={
          trashed ? (
            <ActionBar
              primary={[
                <Button key="back" variant="outline" onClick={() => setTrashed(false)}>
                  <ArrowLeft className="h-4 w-4 " /> Back to quotes
                </Button>,
              ]}
            />
          ) : (
            <ActionBar
              primary={[
                <Button key="new-quote" onClick={() => setOpen(true)}>
                  <Plus className="h-4 w-4 " /> New quote
                </Button>,
                <Button key="trash" variant="outline" onClick={() => setTrashed(true)}>
                  <Trash2 className="h-4 w-4 " /> Trash
                </Button>,
              ]}
            />
          )
        }
      />
      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-7xl w-full mx-auto">
        <Card className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by number or title"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as QuoteStatus | "all")}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(QUOTE_STATUS_META).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>

        <Card className="overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b text-xs  text-muted-foreground">
            <div className="col-span-3">Number</div>
            <div className="col-span-4">Title</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2 text-right">Total</div>
            <div className="col-span-1"></div>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (quotes?.length ?? 0) === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>{trashed ? "Trash is empty." : "No quotes yet. Create your first proposal."}</p>
            </div>
          ) : (
            <div>
              {quotes!.map((q) => {
                const meta = QUOTE_STATUS_META[q.status];
                const money = new Intl.NumberFormat(undefined, {
                  style: "currency",
                  currency: q.currency || tenantCurrency,
                }).format(Number(q.total));
                const rowContent = (
                  <>
                    <div className="col-span-3 font-mono text-sm">
                      {q.quote_number}{" "}
                      <span className="text-xs text-muted-foreground">v{q.version}</span>
                    </div>
                    <div className="col-span-4 truncate">{q.title}</div>
                    <div className="col-span-2">
                      <span
                        className={`inline-block rounded-control px-2 py-0.5 text-xs font-medium ${meta.tone}`}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <div className="col-span-2 text-right ">{money}</div>
                    <div className="col-span-1 flex justify-end">
                      {trashed ? (
                        <div className="flex items-center gap-0.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Restore"
                            onClick={(e) => {
                              e.preventDefault();
                              setRestoring(q);
                            }}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Delete permanently"
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.preventDefault();
                              setPurging(q);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-0.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Duplicate"
                            disabled={duplicate.isPending}
                            onClick={async (e) => {
                              e.preventDefault();
                              try {
                                const newId = await duplicate.mutateAsync(q.id);
                                toast.success("Quote duplicated");
                                navigate({ to: "/quotes/$quoteId", params: { quoteId: newId } });
                              } catch (err) {
                                toast.error((err as Error).message);
                              }
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Delete"
                            onClick={(e) => {
                              e.preventDefault();
                              setDeleting(q);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                );
                return trashed ? (
                  <div
                    key={q.id}
                    className="grid grid-cols-12 gap-2 items-center px-4 py-3 border-b hover:bg-muted/40 transition-colors opacity-80"
                  >
                    {rowContent}
                  </div>
                ) : (
                  <Link
                    key={q.id}
                    to="/quotes/$quoteId"
                    params={{ quoteId: q.id }}
                    className="grid grid-cols-12 gap-2 items-center px-4 py-3 border-b hover:bg-muted/40 transition-colors"
                  >
                    {rowContent}
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <QuoteFormDialog open={open} onOpenChange={setOpen} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete quote?"
        description={
          deleting ? (
            <>
              Quote <strong>{deleting.quote_number}</strong> will be moved to trash. You can restore
              it later from the recycle bin.
            </>
          ) : (
            "This quote will be soft-deleted and can be restored later."
          )
        }
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await del.mutateAsync(deleting.id);
            toast.success("Quote moved to trash");
          } catch (err) {
            toast.error((err as Error).message);
            throw err;
          } finally {
            setDeleting(null);
          }
        }}
      />
      <ConfirmDialog
        open={!!restoring}
        onOpenChange={(o) => !o && setRestoring(null)}
        title="Restore quote?"
        description={
          restoring ? (
            <>
              Quote <strong>{restoring.quote_number}</strong> will be restored and moved back to the
              active quotes list.
            </>
          ) : (
            "This quote will be restored."
          )
        }
        confirmLabel="Restore"
        onConfirm={async () => {
          if (!restoring) return;
          try {
            await restore.mutateAsync(restoring.id);
            toast.success("Quote restored");
          } catch (err) {
            toast.error((err as Error).message);
            throw err;
          } finally {
            setRestoring(null);
          }
        }}
      />
      <ConfirmDialog
        open={!!purging}
        onOpenChange={(o) => !o && setPurging(null)}
        title="Delete permanently?"
        description={
          purging ? (
            <>
              Quote <strong>{purging.quote_number}</strong> will be permanently deleted. This cannot
              be undone.
            </>
          ) : (
            "This quote will be permanently deleted. This cannot be undone."
          )
        }
        confirmLabel="Delete permanently"
        destructive
        onConfirm={async () => {
          if (!purging) return;
          try {
            await purge.mutateAsync(purging.id);
            toast.success("Quote permanently deleted");
          } catch (err) {
            toast.error((err as Error).message);
            throw err;
          } finally {
            setPurging(null);
          }
        }}
      />
    </div>
  );
}
