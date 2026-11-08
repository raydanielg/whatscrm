import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DatePicker, fromDateString, toDateString } from "@/shared/components";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Trash2,
  Pencil,
  MoreHorizontal,
  Copy,
  DollarSign,
  Calendar,
  Flame,
  Building2,
  User as UserIcon,
  MessageSquare,
  Target,
  Plus,
  Loader2,
  Check,
  X,
  Megaphone,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useTenantCurrency } from "@/hooks/use-currency";
import {
  useDeal,
  useUpdateDeal,
  useDeleteDeal,
  useDuplicateDeal,
  useStages,
  usePipelines,
  useContactsLite,
  useCompaniesLite,
  useCampaignsLite,
  useConversationsLite,
  useDealTasks,
  useCreateDealTask,
  useToggleDealTask,
  useDeleteDealTask,
  formatMoney,
  DEAL_STATUSES,
  DEAL_PRIORITIES,
  type DealRow,
} from "@/hooks/use-deals";
import { useCurrentWorkspace, useWorkspaceMembers } from "@/hooks/use-workspace";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { DealFormDialog } from "@/components/app/deals/deal-form-dialog";
import { AISalesAssistantPanel } from "@/components/app/deals/ai-sales-assistant-panel";
import { DealDocumentsPanel } from "@/components/app/deals/deal-documents-panel";
import { useSalesRealtime } from "@/hooks/use-sales-realtime";
import { ActivityTimeline } from "@/components/app/timeline/activity-timeline";
import { CustomFieldsSection } from "@/components/app/custom-fields/custom-fields-section";
import { PermissionGate } from "@/components/app/permission-gate";
import { useCanAct } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/deals/$dealId")({
  staticData: { breadcrumb: "Deal" },
  head: () => ({ meta: [{ title: "Deal" }] }),
  component: DealDetailPage,
});

function DealDetailPage() {
  const { dealId } = Route.useParams();
  const navigate = useNavigate();
  const { active } = useCurrentWorkspace();
  const tenantCurrency = useTenantCurrency();
  const formatZonedDate = useZonedDateFormatter();
  useSalesRealtime();
  const { data: deal, isLoading } = useDeal(dealId);
  const { data: pipelines } = usePipelines();
  const { data: stages } = useStages(deal?.pipeline_id);
  const { data: members } = useWorkspaceMembers(active?.id);
  const { data: contacts } = useContactsLite();
  const { data: companies } = useCompaniesLite();
  const { data: campaigns } = useCampaignsLite();
  const { data: conversations } = useConversationsLite(deal?.contact_id);

  const update = useUpdateDeal();
  const del = useDeleteDeal();
  const canDelete = useCanAct("deals.delete");
  const duplicate = useDuplicateDeal();

  const [edit, setEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const owner = useMemo(
    () => members?.find((m) => m.user_id === deal?.owner_id) ?? null,
    [members, deal?.owner_id],
  );
  const contact = useMemo(
    () => contacts?.find((c) => c.id === deal?.contact_id) ?? null,
    [contacts, deal?.contact_id],
  );
  const company = useMemo(
    () => companies?.find((c) => c.id === deal?.company_id) ?? null,
    [companies, deal?.company_id],
  );

  if (isLoading) {
    return (
      <>
        <AppTopbar title="Loading" />
        <main className="p-6 text-sm text-muted-foreground">Loading deal</main>
      </>
    );
  }
  if (!deal) {
    return (
      <>
        <AppTopbar title="Not found" />
        <main className="p-6 text-center">
          <Target className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground mb-3">Deal not found or deleted.</p>
          <Link to="/deals">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to deals
            </Button>
          </Link>
        </main>
      </>
    );
  }

  const stage = stages?.find((s) => s.id === deal.stage_id);
  const overdue =
    deal.expected_close_date &&
    new Date(deal.expected_close_date) < new Date() &&
    deal.status === "open";

  const handleDuplicate = async () => {
    try {
      const copy = await duplicate.mutateAsync(deal.id);
      toast.success("Deal duplicated");
      navigate({ to: "/deals/$dealId", params: { dealId: copy.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to duplicate");
    }
  };

  const handleDelete = async () => {
    if (!canDelete) return;
    try {
      await del.mutateAsync({ id: deal.id });
      toast.success("Deal deleted");
      navigate({ to: "/deals" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const patchField = async (patch: Partial<DealRow>) => {
    try {
      await update.mutateAsync({ id: deal.id, patch });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  };

  return (
    <>
      <AppTopbar
        title={deal.title}
        subtitle={company?.name ?? contact?.full_name ?? "Deal"}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setEdit(true)}>
              <Pencil className="w-4 h-4 mr-1.5" /> Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDuplicate}>
                  <Copy className="w-4 h-4" /> Duplicate
                </DropdownMenuItem>
                <PermissionGate permission="deals.delete">
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setConfirmDelete(true)}
                    className="text-destructive"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </DropdownMenuItem>
                </PermissionGate>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {/* Header card */}
        <div className="flex flex-wrap items-start gap-4 rounded-control border border-border bg-surface p-4">
          <div
            className="w-14 h-14 rounded-control flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${stage?.color ?? "#6366f1"}20` }}
          >
            <Target className="w-6 h-6" style={{ color: stage?.color ?? "#6366f1" }} />
          </div>
          <div className="flex-1 min-w-[220px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-display font-semibold">{deal.title}</h1>
              <Badge
                variant={
                  deal.status === "won"
                    ? "default"
                    : deal.status === "lost"
                      ? "destructive"
                      : "secondary"
                }
              >
                {deal.status}
              </Badge>
              {deal.priority !== "normal" && (
                <Badge
                  variant={deal.priority === "urgent" ? "destructive" : "secondary"}
                  className="gap-1"
                >
                  {deal.priority === "urgent" && <Flame className="w-3 h-3" />}
                  {deal.priority}
                </Badge>
              )}
            </div>
            {deal.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{deal.description}</p>
            )}
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" />
                <span className="font-medium text-foreground">
                  {formatMoney(Number(deal.amount || 0), deal.currency || tenantCurrency)}
                </span>
              </span>
              <span className="inline-flex items-center gap-1">Win {deal.probability}%</span>
              {deal.expected_close_date && (
                <span
                  className={cn("inline-flex items-center gap-1", overdue && "text-destructive")}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  {formatZonedDate(deal.expected_close_date, {})}
                  {overdue && " · overdue"}
                </span>
              )}
              {deal.actual_close_date && (
                <span>Closed {formatZonedDate(deal.actual_close_date, {})}</span>
              )}
            </div>
            {deal.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {deal.tags.map((t) => (
                  <Badge key={t} variant="outline" className="text-xs">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Quick actions column */}
          <div className="flex flex-col gap-2 items-end">
            {deal.status === "open" && (
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
                  onClick={() => patchField({ status: "won" })}
                >
                  <Check className="w-4 h-4 mr-1.5" /> Mark won
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => patchField({ status: "lost" })}
                >
                  <X className="w-4 h-4 mr-1.5" /> Mark lost
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: tabs */}
          <div className="lg:col-span-2 space-y-4">
            <Tabs defaultValue="ai">
              <TabsList>
                <TabsTrigger value="ai">
                  <Sparkles className="w-3.5 h-3.5 " /> AI Assistant
                </TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="tasks">Tasks</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
                <TabsTrigger value="related">Related</TabsTrigger>
                <TabsTrigger value="custom">Custom fields</TabsTrigger>
              </TabsList>

              <TabsContent value="ai" className="mt-4">
                <AISalesAssistantPanel dealId={deal.id} />
              </TabsContent>

              <TabsContent value="ai" className="mt-4">
                <AISalesAssistantPanel dealId={deal.id} />
              </TabsContent>

              <TabsContent value="timeline" className="mt-4">
                <ActivityTimeline entityType="deal" entityId={deal.id} />
              </TabsContent>

              <TabsContent value="tasks" className="mt-4">
                <DealTasksTab dealId={deal.id} members={members ?? []} />
              </TabsContent>

              <TabsContent value="documents" className="mt-4">
                <DealDocumentsPanel dealId={deal.id} />
              </TabsContent>

              <TabsContent value="related" className="mt-4 space-y-3">
                {/* Related conversation(s) */}
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4" /> Conversations
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {conversations?.length ?? 0}
                    </span>
                  </div>
                  {contact ? (
                    conversations && conversations.length > 0 ? (
                      <ul className="space-y-1.5">
                        {conversations.slice(0, 8).map((c) => (
                          <li key={c.id}>
                            <Link
                              to="/inbox"
                              search={{ conversationId: c.id }}
                              className="flex items-start gap-2 p-2 rounded-control hover:bg-muted/50 transition-colors"
                            >
                              <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium truncate">
                                  {c.subject || c.last_message_preview || "Conversation"}
                                </div>
                                {c.last_message_at && (
                                  <div className="text-xs text-muted-foreground">
                                    {formatZonedDate(c.last_message_at, {
                                      dateStyle: "short",
                                      timeStyle: "short",
                                    })}
                                  </div>
                                )}
                              </div>
                              <Badge variant="outline" className="text-[11px]">
                                {c.status}
                              </Badge>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No conversations for the linked contact.
                      </p>
                    )
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Link a contact to see related conversations.
                    </p>
                  )}
                </Card>

                {/* Campaign link */}
                <Card className="p-4">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                    <Megaphone className="w-4 h-4" /> Campaign
                  </h3>
                  <Select
                    value={(deal.custom_fields?.campaign_id as string) ?? "__none__"}
                    onValueChange={(v) =>
                      patchField({
                        custom_fields: {
                          ...(deal.custom_fields ?? {}),
                          campaign_id: v === "__none__" ? null : v,
                        },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No campaign" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No campaign</SelectItem>
                      {(campaigns ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Card>
              </TabsContent>

              <TabsContent value="custom" className="mt-4">
                <Card className="p-4">
                  <CustomFieldsSection
                    entity="deal"
                    values={deal.custom_fields ?? {}}
                    onChange={(next) => patchField({ custom_fields: next })}
                  />
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right: quick edit sidebar */}
          <div className="space-y-4">
            <Card className="p-4 space-y-3">
              <h3 className="text-sm font-semibold">Details</h3>

              <QuickField label="Pipeline">
                <Select
                  value={deal.pipeline_id ?? undefined}
                  onValueChange={(v) => patchField({ pipeline_id: v, stage_id: null })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(pipelines ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </QuickField>

              <QuickField label="Stage">
                <Select
                  value={deal.stage_id ?? undefined}
                  onValueChange={(v) => {
                    const st = stages?.find((s) => s.id === v);
                    patchField({
                      stage_id: v,
                      probability: st?.probability ?? deal.probability,
                      status: st?.is_won ? "won" : st?.is_lost ? "lost" : "open",
                    });
                  }}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {(stages ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </QuickField>

              <QuickField label="Owner">
                <Select
                  value={deal.owner_id ?? "__none__"}
                  onValueChange={(v) => patchField({ owner_id: v === "__none__" ? null : v })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Unassigned">
                      {owner ? (
                        <span className="flex items-center gap-1.5">
                          <Avatar className="w-4 h-4">
                            <AvatarFallback className="text-[11px]">
                              {(owner.display_name ?? owner.email ?? "?").slice(0, 1).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          {owner.display_name ?? owner.email}
                        </span>
                      ) : (
                        "Unassigned"
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {(members ?? []).map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.display_name ?? m.email ?? m.user_id.slice(0, 6)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </QuickField>

              <QuickField label="Priority">
                <Select
                  value={deal.priority}
                  onValueChange={(v) => patchField({ priority: v as DealRow["priority"] })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEAL_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </QuickField>

              <QuickField label="Status">
                <Select
                  value={deal.status}
                  onValueChange={(v) => patchField({ status: v as DealRow["status"] })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEAL_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </QuickField>

              <QuickField label="Expected close">
                <DatePicker
                  value={fromDateString(deal.expected_close_date ?? "")}
                  onChange={(d) => patchField({ expected_close_date: toDateString(d) || null })}
                />
              </QuickField>

              <QuickField label="Amount">
                <div className="flex gap-1.5">
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    className="h-9 text-sm flex-1"
                    defaultValue={deal.amount}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== deal.amount) patchField({ amount: v || 0 });
                    }}
                  />
                  <Select value={deal.currency} onValueChange={(v) => patchField({ currency: v })}>
                    <SelectTrigger className="h-9 text-sm w-[80px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["USD", "EUR", "GBP", "NOK", "INR", "AUD", "CAD"].map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </QuickField>
            </Card>

            {/* Related contact/company */}
            <Card className="p-4 space-y-3">
              <h3 className="text-sm font-semibold">Related</h3>

              <div>
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <UserIcon className="w-3 h-3" /> Contact
                </div>
                <Select
                  value={deal.contact_id ?? "__none__"}
                  onValueChange={(v) => patchField({ contact_id: v === "__none__" ? null : v })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {(contacts ?? []).slice(0, 200).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name ||
                          [c.first_name, c.last_name].filter(Boolean).join(" ") ||
                          c.email ||
                          c.phone ||
                          c.id.slice(0, 6)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {contact && (
                  <Link
                    to="/contacts/$contactId"
                    params={{ contactId: contact.id }}
                    className="text-xs text-primary hover:underline mt-1 inline-block"
                  >
                    View contact →
                  </Link>
                )}
              </div>

              <div>
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> Company
                </div>
                <Select
                  value={deal.company_id ?? "__none__"}
                  onValueChange={(v) => patchField({ company_id: v === "__none__" ? null : v })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {(companies ?? []).slice(0, 200).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="text-xs text-muted-foreground mb-1">Source</div>
                <Input
                  className="h-9 text-sm"
                  defaultValue={deal.source ?? ""}
                  onBlur={(e) => {
                    if (e.target.value !== (deal.source ?? ""))
                      patchField({ source: e.target.value || null });
                  }}
                  placeholder="e.g. Inbound, WhatsApp"
                />
              </div>
            </Card>
          </div>
        </div>
      </main>

      <DealFormDialog open={edit} onOpenChange={setEdit} initial={deal} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this deal?</AlertDialogTitle>
            <AlertDialogDescription>
              The deal will be moved to trash. This action can be reverted by an admin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function QuickField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}

/* ---------------------------- Tasks tab ---------------------------- */

function DealTasksTab({
  dealId,
  members,
}: {
  dealId: string;
  members: { user_id: string; display_name: string | null; email: string | null }[];
}) {
  const { data: tasks = [], isLoading } = useDealTasks(dealId);
  const create = useCreateDealTask();
  const toggle = useToggleDealTask();
  const del = useDeleteDealTask();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  const add = async () => {
    if (!title.trim()) return;
    try {
      await create.mutateAsync({ dealId, title: title.trim(), due_at: due || null });
      setTitle("");
      setDue("");
      toast.success("Task added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add task");
    }
  };

  const open = tasks.filter((t) => t.status !== "completed");
  const done = tasks.filter((t) => t.status === "completed");

  return (
    <Card className="p-4 space-y-3">
      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="Add a task..."
          className="flex-1"
        />
        <DatePicker
          value={fromDateString(due)}
          onChange={(d) => setDue(toDateString(d))}
          className="w-[180px]"
        />
        <Button onClick={add} disabled={!title.trim() || create.isPending} size="sm">
          {create.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-4">Loading tasks</div>
      ) : tasks.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6">No tasks yet.</div>
      ) : (
        <div className="space-y-1">
          {open.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              dealId={dealId}
              members={members}
              onToggle={(done) => toggle.mutate({ id: t.id, done, dealId })}
              onDelete={() => del.mutate({ id: t.id, dealId })}
            />
          ))}
          {done.length > 0 && (
            <>
              <div className="text-xs  text-muted-foreground pt-3 pb-1">Completed</div>
              {done.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  dealId={dealId}
                  members={members}
                  onToggle={(done) => toggle.mutate({ id: t.id, done, dealId })}
                  onDelete={() => del.mutate({ id: t.id, dealId })}
                />
              ))}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function TaskRow({
  task,
  members,
  onToggle,
  onDelete,
}: {
  task: {
    id: string;
    title: string;
    status: string;
    due_at: string | null;
    assigned_to: string | null;
  };
  dealId: string;
  members: { user_id: string; display_name: string | null; email: string | null }[];
  onToggle: (done: boolean) => void;
  onDelete: () => void;
}) {
  const done = task.status === "completed";
  const assignee = members.find((m) => m.user_id === task.assigned_to);
  const overdue = !done && task.due_at && new Date(task.due_at) < new Date();
  const formatZonedDate = useZonedDateFormatter();
  return (
    <div className="group flex items-center gap-2 py-1.5 px-2 rounded-control hover:bg-muted/40">
      <Checkbox checked={done} onCheckedChange={(v) => onToggle(!!v)} />
      <div className="flex-1 min-w-0">
        <div className={cn("text-sm truncate", done && "line-through text-muted-foreground")}>
          {task.title}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {task.due_at && (
            <span className={cn(overdue && "text-destructive")}>
              <Calendar className="w-3 h-3 inline mr-0.5" />
              {formatZonedDate(task.due_at, {})}
            </span>
          )}
          {assignee && <span>· {assignee.display_name ?? assignee.email}</span>}
        </div>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 opacity-0 group-hover:opacity-100"
        onClick={onDelete}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
