import { printDocument } from "@/lib/print-document";
import { quoteFileName } from "@/lib/billing/document-print";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { ActionBar } from "@/components/app/action-bar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Pencil,
  Printer,
  Download,
  Share2,
  Copy,
  Send,
  Check,
  X,
  ClipboardCheck,
  History,
  FileText,
  GitBranch,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  useQuote,
  useQuoteVersions,
  useUpdateQuoteStatus,
  useCreateQuoteRevision,
  useEnsureShareToken,
  useSetApproval,
  readApproval,
  QUOTE_STATUS_META,
  type QuoteStatus,
} from "@/hooks/use-quotes";
import { QuoteFormDialog } from "@/components/app/quotes/quote-form-dialog";
import { QuotePreview } from "@/components/app/quotes/quote-preview";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useTenantCurrency } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/quotes/$quoteId")({
  component: QuoteDetail,
  staticData: { breadcrumb: "Quote" },
  head: () => ({ meta: [{ title: "Quote" }] }),
});

function QuoteDetail() {
  const { quoteId } = Route.useParams();
  const navigate = useNavigate();
  const { active: workspace } = useCurrentWorkspace();
  const { data: quote, isLoading, error, refetch } = useQuote(quoteId);
  // Rows written before a currency was stored fall back to the tenant's
  // currency, never a hardcoded USD — see use-currency.ts.
  const tenantCurrency = useTenantCurrency();
  const zonedDate = useZonedDateFormatter();
  const rootId = quote?.parent_quote_id ?? quote?.id;
  const { data: versions } = useQuoteVersions(quoteId, rootId);
  const setStatus = useUpdateQuoteStatus();
  const revise = useCreateQuoteRevision();
  const ensureToken = useEnsureShareToken();
  const setApproval = useSetApproval();
  const [editOpen, setEditOpen] = useState(false);
  const [approvalReason, setApprovalReason] = useState("");

  const approval = useMemo(() => readApproval(quote), [quote]);

  const changeStatus = async (s: QuoteStatus) => {
    try {
      await setStatus.mutateAsync({ id: quoteId, status: s });
      toast.success(`Marked as ${s}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const share = async () => {
    try {
      const token = await ensureToken.mutateAsync(quoteId);
      const url = `${window.location.origin}/q/${token}`;
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // Title drives the browser's suggested "Save as PDF" filename.
  const download = () => {
    void printDocument(".quote-preview", { title: quoteFileName(quote?.quote_number) }).catch((e) =>
      toast.error(e.message),
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <AppTopbar title="Quote" />
        <div className="p-6 space-y-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-96 w-full max-w-3xl mx-auto" />
        </div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="flex flex-col h-full">
        <AppTopbar title="Quote" />
        <div className="p-6">
          <Card className="p-8 max-w-lg mx-auto text-center space-y-3">
            <FileText className="h-8 w-8 mx-auto text-muted-foreground" />
            <div className="font-medium">
              {error ? "This quote could not be loaded" : "Quote not found"}
            </div>
            <p className="text-sm text-muted-foreground">
              {error
                ? (error as Error).message
                : "It may have been deleted, or it belongs to another workspace."}
            </p>
            <div className="flex justify-center gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => navigate({ to: "/quotes" })}>
                <ArrowLeft className="h-4 w-4 " /> Back to quotes
              </Button>
              {error && (
                <Button size="sm" onClick={() => refetch()}>
                  Try again
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const meta = QUOTE_STATUS_META[quote.status];

  return (
    <div className="flex flex-col h-full">
      <AppTopbar
        title={quote.quote_number}
        subtitle={quote.title}
        actions={
          <ActionBar
            primary={[
              ...(quote.status === "draft"
                ? [
                    <Button key="send" size="sm" onClick={() => changeStatus("sent")}>
                      <Send className="h-4 w-4 " /> Send
                    </Button>,
                  ]
                : []),
              <Button key="edit" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4 " /> Edit
              </Button>,
            ]}
            overflow={[
              <DropdownMenuItem key="print" onClick={download}>
                <Printer className="h-4 w-4 mr-2" /> Print / PDF
              </DropdownMenuItem>,
              <DropdownMenuItem key="share" onClick={share}>
                <Share2 className="h-4 w-4 mr-2" /> Share link
              </DropdownMenuItem>,
              ...(quote.status === "sent" || quote.status === "viewed"
                ? [
                    <DropdownMenuItem key="accept" onClick={() => changeStatus("accepted")}>
                      <Check className="h-4 w-4 mr-2" /> Mark accepted
                    </DropdownMenuItem>,
                    <DropdownMenuItem key="reject" onClick={() => changeStatus("rejected")}>
                      <X className="h-4 w-4 mr-2" /> Mark rejected
                    </DropdownMenuItem>,
                  ]
                : []),
              <DropdownMenuItem
                key="revision"
                onClick={async () => {
                  try {
                    const id = await revise.mutateAsync(quoteId);
                    toast.success("New revision created");
                    navigate({ to: "/quotes/$quoteId", params: { quoteId: id } });
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                <GitBranch className="h-4 w-4 mr-2" /> New revision
              </DropdownMenuItem>,
            ]}
          />
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="no-print flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/quotes" })}>
            <ArrowLeft className="h-4 w-4 " /> Back
          </Button>
          <Badge variant="outline" className={meta.tone}>
            {meta.label}
          </Badge>
          <span className="text-xs text-muted-foreground">v{quote.version}</span>
        </div>

        <Tabs defaultValue="preview" className="no-print">
          <TabsList>
            <TabsTrigger value="preview">
              <FileText className="h-4 w-4 " /> Preview
            </TabsTrigger>
            <TabsTrigger value="approval">
              <ShieldCheck className="h-4 w-4 " /> Approval
            </TabsTrigger>
            <TabsTrigger value="versions">
              <History className="h-4 w-4 " /> Versions ({versions?.length ?? 1})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="mt-4">
            <QuotePreview quote={quote} workspaceName={workspace?.name} />
          </TabsContent>

          <TabsContent value="approval" className="mt-4">
            <Card className="p-6 max-w-2xl">
              <div className="flex items-center gap-3">
                <ClipboardCheck className="h-5 w-5" />
                <div>
                  <div className="font-medium">Approval workflow</div>
                  <div className="text-sm text-muted-foreground">
                    Status:{" "}
                    <span className="font-medium capitalize">
                      {approval.status.replace("_", " ")}
                    </span>
                  </div>
                </div>
              </div>
              <Separator className="my-4" />
              {approval.status === "not_requested" && (
                <Button
                  onClick={async () => {
                    await setApproval.mutateAsync({
                      id: quoteId,
                      next: { status: "pending", requested_at: new Date().toISOString() },
                    });
                    toast.success("Approval requested");
                  }}
                >
                  Request approval
                </Button>
              )}
              {approval.status === "pending" && (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Reason / comments (optional)"
                    value={approvalReason}
                    onChange={(e) => setApprovalReason(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={async () => {
                        await setApproval.mutateAsync({
                          id: quoteId,
                          next: {
                            ...approval,
                            status: "approved",
                            decided_at: new Date().toISOString(),
                            reason: approvalReason || null,
                          },
                        });
                        toast.success("Approved");
                      }}
                    >
                      <Check className="h-4 w-4 " /> Approve
                    </Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        await setApproval.mutateAsync({
                          id: quoteId,
                          next: {
                            ...approval,
                            status: "rejected",
                            decided_at: new Date().toISOString(),
                            reason: approvalReason || null,
                          },
                        });
                        toast.success("Rejected");
                      }}
                    >
                      <X className="h-4 w-4 " /> Reject
                    </Button>
                  </div>
                </div>
              )}
              {(approval.status === "approved" || approval.status === "rejected") && (
                <div className="space-y-2 text-sm">
                  <div>
                    Decided{" "}
                    {approval.decided_at &&
                      zonedDate(approval.decided_at, { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                  {approval.reason && (
                    <div className="text-muted-foreground">“{approval.reason}”</div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await setApproval.mutateAsync({
                        id: quoteId,
                        next: { status: "not_requested" },
                      });
                    }}
                  >
                    Reset
                  </Button>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="versions" className="mt-4">
            <Card className="divide-y">
              {(versions ?? [quote]).map((v) => {
                const m = QUOTE_STATUS_META[v.status];
                const money = new Intl.NumberFormat(undefined, {
                  style: "currency",
                  currency: v.currency || tenantCurrency,
                }).format(Number(v.total));
                const active = v.id === quoteId;
                return (
                  <Link
                    key={v.id}
                    to="/quotes/$quoteId"
                    params={{ quoteId: v.id }}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/40 ${active ? "bg-muted/60" : ""}`}
                  >
                    <div className="font-mono text-sm w-24">{v.quote_number}</div>
                    <div className="text-sm">v{v.version}</div>
                    <span
                      className={`inline-block rounded-control px-2 py-0.5 text-xs font-medium ${m.tone}`}
                    >
                      {m.label}
                    </span>
                    <div className="ml-auto text-sm ">{money}</div>
                    <div className="text-xs text-muted-foreground w-32 text-right">
                      {zonedDate(v.created_at, { dateStyle: "short" })}
                    </div>
                  </Link>
                );
              })}
            </Card>
          </TabsContent>
        </Tabs>

        {/* Print-only view */}
        <div className="hidden print:block">
          <QuotePreview quote={quote} workspaceName={workspace?.name} />
        </div>
      </div>

      <QuoteFormDialog open={editOpen} onOpenChange={setEditOpen} quote={quote} />
    </div>
  );
}
