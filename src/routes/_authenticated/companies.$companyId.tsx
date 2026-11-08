import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { ActionBar } from "@/components/app/action-bar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
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
  ArrowLeft,
  Building2,
  Globe,
  Mail,
  Phone,
  MapPin,
  Users,
  Briefcase,
  DollarSign,
  CheckSquare,
  StickyNote,
  MessageCircle,
  Megaphone,
  BarChart3,
  Clock,
  Star,
  Archive,
  ArchiveRestore,
  Trash2,
  Pencil,
  Linkedin,
  Twitter,
  Pin,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  useCompany,
  useCompanyContacts,
  useCompanyDeals,
  useCompanyTasks,
  useCompanyNotes,
  useCompanyConversations,
  useCompanyCampaigns,
  useCompanyTimeline,
  useCompanyDetailRealtime,
  useUpdateCompany,
  useDeleteCompany,
  useAddCompanyNote,
  useDeleteCompanyNote,
  companyInitials,
} from "@/hooks/use-companies";
import { CompanyFormDialog } from "@/components/app/companies/company-form-dialog";
import { ActivityTimeline } from "@/components/app/timeline/activity-timeline";
import { useTenantCurrency } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { PermissionGate } from "@/components/app/permission-gate";
import { useCanAct } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_authenticated/companies/$companyId")({
  staticData: { breadcrumb: "Company" },
  head: () => ({ meta: [{ title: "Company" }] }),
  component: CompanyDetailPage,
});

function CompanyDetailPage() {
  const tenantCurrency = useTenantCurrency();
  const formatZonedDate = useZonedDateFormatter();
  const { companyId } = Route.useParams();
  const navigate = useNavigate();
  useCompanyDetailRealtime(companyId);

  const { data: company, isLoading } = useCompany(companyId);
  const update = useUpdateCompany();
  const del = useDeleteCompany();
  const canDelete = useCanAct("companies.delete");

  const [openEdit, setOpenEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isLoading) {
    return (
      <>
        <AppTopbar title="Loading" />
        <main className="p-6 text-sm text-muted-foreground">Loading</main>
      </>
    );
  }
  if (!company) {
    return (
      <>
        <AppTopbar title="Not found" />
        <main className="p-6 text-center">
          <Building2 className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground mb-3">Company not found or deleted.</p>
          <Link to="/companies">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to companies
            </Button>
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <AppTopbar
        title={company.name}
        subtitle={company.industry ?? "Company"}
        actions={
          <div className="hidden md:block">
            <ActionBar
              primary={[
                <Button key="edit" size="sm" onClick={() => setOpenEdit(true)}>
                  <Pencil className="w-4 h-4 " /> Edit
                </Button>,
                <Button
                  key="favorite"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    update.mutate({ id: company.id, patch: { is_favorite: !company.is_favorite } })
                  }
                >
                  <Star
                    className={`w-4 h-4 mr-1 ${company.is_favorite ? "fill-yellow-400 text-yellow-400" : ""}`}
                  />{" "}
                  Favorite
                </Button>,
              ]}
              overflow={[
                <DropdownMenuItem
                  key="archive"
                  onClick={() =>
                    update.mutate({ id: company.id, patch: { is_archived: !company.is_archived } })
                  }
                >
                  {company.is_archived ? (
                    <>
                      <ArchiveRestore className="w-4 h-4 mr-2" /> Restore
                    </>
                  ) : (
                    <>
                      <Archive className="w-4 h-4 mr-2" /> Archive
                    </>
                  )}
                </DropdownMenuItem>,
                <PermissionGate key="delete" permission="companies.delete">
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                  </DropdownMenuItem>
                </PermissionGate>,
              ]}
            />
          </div>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="flex flex-wrap items-start gap-4 rounded-control border border-border bg-surface p-4 md:p-6">
          <Avatar className="w-16 h-16 rounded-control">
            {company.logo_url ? <AvatarImage src={company.logo_url} alt={company.name} /> : null}
            <AvatarFallback className="rounded-control text-lg bg-accent/10 text-accent">
              {companyInitials(company)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-display font-semibold">{company.name}</h1>
              {company.is_favorite && <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />}
              <Badge variant="secondary">{company.status}</Badge>
              {company.is_archived && <Badge variant="outline">Archived</Badge>}
            </div>
            {company.legal_name && (
              <div className="text-sm text-muted-foreground">{company.legal_name}</div>
            )}
            {company.description && (
              <p className="text-sm mt-2 text-muted-foreground max-w-2xl">{company.description}</p>
            )}
            <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
              {company.website && (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <Globe className="w-3.5 h-3.5" /> {company.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              {company.email && (
                <a
                  href={`mailto:${company.email}`}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <Mail className="w-3.5 h-3.5" /> {company.email}
                </a>
              )}
              {company.phone && (
                <a
                  href={`tel:${company.phone}`}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <Phone className="w-3.5 h-3.5" /> {company.phone}
                </a>
              )}
              {(company.address?.city || company.country) && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {[company.address?.city, company.country ?? company.address?.country]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              )}
              {company.linkedin_url && (
                <a
                  href={company.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <Linkedin className="w-3.5 h-3.5" />
                </a>
              )}
              {company.twitter_handle && (
                <a
                  href={`https://twitter.com/${company.twitter_handle.replace("@", "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <Twitter className="w-3.5 h-3.5" /> {company.twitter_handle}
                </a>
              )}
            </div>
            {(company.tags?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {company.tags.map((t) => (
                  <Badge key={t} variant="outline" className="text-[11px]">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar + tabs layout */}
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <aside className="rounded-control border border-border bg-surface p-4 space-y-3 text-sm h-fit">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Profile
            </h3>
            <Row label="Industry" value={company.industry} />
            <Row label="Business type" value={company.business_type} />
            <Row label="Company size" value={company.company_size} />
            <Row
              label="Annual revenue"
              value={
                company.annual_revenue
                  ? `${company.currency ?? ""} ${Number(company.annual_revenue).toLocaleString()}`
                  : null
              }
            />
            <Row label="Domain" value={company.domain} />
            <Row label="Country" value={company.country ?? company.address?.country ?? null} />
            <Row label="Timezone" value={company.timezone} />
            <Row label="Source" value={company.source} />
            <Row label="Created" value={formatZonedDate(company.created_at, {})} />
            {company.about && (
              <>
                <h3 className="text-xs font-medium text-muted-foreground uppercase pt-2 border-t border-border">
                  About
                </h3>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{company.about}</p>
              </>
            )}
            {Object.keys(company.custom_fields ?? {}).length > 0 && (
              <>
                <h3 className="text-xs font-medium text-muted-foreground uppercase pt-2 border-t border-border">
                  Custom fields
                </h3>
                {Object.entries(company.custom_fields).map(([k, v]) => (
                  <Row key={k} label={k} value={String(v ?? "")} />
                ))}
              </>
            )}
          </aside>

          <div className="rounded-control border border-border bg-surface">
            <Tabs defaultValue="contacts">
              <div className="border-b">
                <ScrollArea orientation="horizontal" type="hover" className="w-full">
                  <TabsList className="w-max flex justify-start rounded-none h-9 p-0 bg-transparent">
                    <TabTrigger v="contacts" icon={<Users className="w-4 h-4" />} label="Contacts" />
                    <TabTrigger v="deals" icon={<Briefcase className="w-4 h-4" />} label="Deals" />
                    <TabTrigger v="tasks" icon={<CheckSquare className="w-4 h-4" />} label="Tasks" />
                    <TabTrigger v="notes" icon={<StickyNote className="w-4 h-4" />} label="Notes" />
                    <TabTrigger
                      v="conversations"
                      icon={<MessageCircle className="w-4 h-4" />}
                      label="Conversations"
                    />
                    <TabTrigger
                      v="campaigns"
                      icon={<Megaphone className="w-4 h-4" />}
                      label="Campaigns"
                    />
                    <TabTrigger
                      v="analytics"
                      icon={<BarChart3 className="w-4 h-4" />}
                      label="Analytics"
                    />
                    <TabTrigger v="timeline" icon={<Clock className="w-4 h-4" />} label="Timeline" />
                  </TabsList>
                </ScrollArea>
              </div>
              <TabsContent value="contacts" className="p-0">
                <ContactsTab companyId={company.id} />
              </TabsContent>
              <TabsContent value="deals" className="p-0">
                <DealsTab companyId={company.id} currency={company.currency ?? tenantCurrency} />
              </TabsContent>
              <TabsContent value="tasks" className="p-0">
                <TasksTab companyId={company.id} />
              </TabsContent>
              <TabsContent value="notes" className="p-0">
                <NotesTab companyId={company.id} />
              </TabsContent>
              <TabsContent value="conversations" className="p-0">
                <ConversationsTab companyId={company.id} />
              </TabsContent>
              <TabsContent value="campaigns" className="p-0">
                <CampaignsTab companyId={company.id} />
              </TabsContent>
              <TabsContent value="analytics" className="p-0">
                <AnalyticsTab
                  companyId={company.id}
                  currency={company.currency ?? tenantCurrency}
                />
              </TabsContent>
              <TabsContent value="timeline" className="p-4">
                <ActivityTimeline entityType="company" entityId={company.id} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      <CompanyFormDialog open={openEdit} onOpenChange={setOpenEdit} initial={company} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this company?</AlertDialogTitle>
            <AlertDialogDescription>
              The company will be soft-deleted. You can restore it from the trash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!canDelete) return;
                await del.mutateAsync({ id: company.id });
                toast.success("Company deleted");
                navigate({ to: "/companies" });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TabTrigger({ v, icon, label }: { v: string; icon: React.ReactNode; label: string }) {
  return (
    <TabsTrigger
      value={v}
      className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent px-4 py-2.5 gap-1.5 text-sm"
    >
      {icon} <span className="hidden sm:inline">{label}</span>
    </TabsTrigger>
  );
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs text-right truncate max-w-[60%]">{String(value)}</span>
    </div>
  );
}

function EmptyRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="p-8 text-center text-sm text-muted-foreground">
      {icon}
      <div className="mt-2">{text}</div>
    </div>
  );
}

/* ---------------------------- Tabs ---------------------------- */

function ContactsTab({ companyId }: { companyId: string }) {
  const { data = [] } = useCompanyContacts(companyId);
  if (!data.length)
    return (
      <EmptyRow
        icon={<Users className="w-8 h-8 mx-auto text-muted-foreground/40" />}
        text="No contacts linked yet."
      />
    );
  return (
    <div className="divide-y divide-border/60">
      {data.map((c) => {
        const name =
          c.display_name ||
          [c.first_name, c.last_name].filter(Boolean).join(" ") ||
          c.name ||
          c.email ||
          "Unnamed";
        return (
          <Link
            key={c.id}
            to="/contacts/$contactId"
            params={{ contactId: c.id }}
            className="flex items-center gap-3 p-3 hover:bg-muted/40"
          >
            <Avatar className="w-8 h-8">
              <AvatarImage src={c.avatar_url ?? undefined} />
              <AvatarFallback className="text-xs">{(name[0] ?? "?").toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {c.job_title ?? ""} {c.email ? `· ${c.email}` : ""}
              </div>
            </div>
            {c.lifecycle_stage && (
              <Badge variant="secondary" className="text-[11px]">
                {c.lifecycle_stage}
              </Badge>
            )}
          </Link>
        );
      })}
    </div>
  );
}

function DealsTab({ companyId, currency }: { companyId: string; currency: string }) {
  const { data = [] } = useCompanyDeals(companyId);
  if (!data.length)
    return (
      <EmptyRow
        icon={<Briefcase className="w-8 h-8 mx-auto text-muted-foreground/40" />}
        text="No deals for this company."
      />
    );
  return (
    <div className="divide-y divide-border/60">
      {data.map((d) => (
        <div key={String(d.id)} className="flex items-center gap-3 p-3">
          <Briefcase className="w-4 h-4 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{String(d.title ?? "Untitled deal")}</div>
            <div className="text-xs text-muted-foreground">
              {String(d.status ?? "")}
              {d.probability != null ? ` · ${d.probability}%` : ""}
            </div>
          </div>
          <div className="text-sm font-medium">
            {String(d.currency ?? currency)} {Number(d.amount ?? 0).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}

function TasksTab({ companyId }: { companyId: string }) {
  const { data = [] } = useCompanyTasks(companyId);
  const formatZonedDate = useZonedDateFormatter();
  if (!data.length)
    return (
      <EmptyRow
        icon={<CheckSquare className="w-8 h-8 mx-auto text-muted-foreground/40" />}
        text="No tasks assigned."
      />
    );
  return (
    <div className="divide-y divide-border/60">
      {data.map((t) => (
        <div key={String(t.id)} className="flex items-center gap-3 p-3">
          <CheckSquare className="w-4 h-4 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{String(t.title ?? "")}</div>
            <div className="text-xs text-muted-foreground">
              {String(t.status ?? "")}
              {t.priority ? ` · ${t.priority}` : ""}
            </div>
          </div>
          {t.due_at ? (
            <div className="text-xs text-muted-foreground">
              {formatZonedDate(String(t.due_at), {})}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function NotesTab({ companyId }: { companyId: string }) {
  const { data = [] } = useCompanyNotes(companyId);
  const formatZonedDate = useZonedDateFormatter();
  const add = useAddCompanyNote();
  const remove = useDeleteCompanyNote();
  const [body, setBody] = useState("");
  const submit = async () => {
    if (!body.trim()) return;
    await add.mutateAsync({ companyId, body: body.trim() });
    setBody("");
    toast.success("Note added");
  };
  return (
    <div className="p-3 space-y-3">
      <div className="rounded-control border border-border p-2">
        <Textarea
          rows={2}
          placeholder="Add a note"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="border-0 focus-visible:ring-0 resize-none"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={submit} disabled={add.isPending || !body.trim()}>
            Post
          </Button>
        </div>
      </div>
      {!data.length ? (
        <EmptyRow
          icon={<StickyNote className="w-8 h-8 mx-auto text-muted-foreground/40" />}
          text="No notes yet."
        />
      ) : (
        <div className="space-y-2">
          {data.map((n) => (
            <div key={n.id} className="rounded-control border border-border p-3 text-sm group">
              <div className="flex items-start gap-2">
                {n.is_pinned && <Pin className="w-3.5 h-3.5 text-accent mt-0.5" />}
                <p className="whitespace-pre-wrap flex-1">{n.body}</p>
                <Button
                  size="icon"
                  variant="ghost"
                  className="opacity-0 group-hover:opacity-100 h-6 w-6"
                  onClick={() => remove.mutate({ id: n.id, companyId })}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {formatZonedDate(n.created_at, { dateStyle: "short", timeStyle: "short" })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConversationsTab({ companyId }: { companyId: string }) {
  const { data = [] } = useCompanyConversations(companyId);
  const formatZonedDate = useZonedDateFormatter();
  if (!data.length)
    return (
      <EmptyRow
        icon={<MessageCircle className="w-8 h-8 mx-auto text-muted-foreground/40" />}
        text="No conversations yet."
      />
    );
  return (
    <div className="divide-y divide-border/60">
      {data.map((c) => (
        <div key={String(c.id)} className="flex items-center gap-3 p-3">
          <MessageCircle className="w-4 h-4 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate">{String(c.ai_summary ?? "Conversation")}</div>
            <div className="text-xs text-muted-foreground">
              {String(c.status ?? "")}
              {c.unread_count ? ` · ${c.unread_count} unread` : ""}
            </div>
          </div>
          {c.last_message_at ? (
            <div className="text-xs text-muted-foreground">
              {formatZonedDate(String(c.last_message_at), {})}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function CampaignsTab({ companyId }: { companyId: string }) {
  const { data = [] } = useCompanyCampaigns(companyId);
  if (!data.length)
    return (
      <EmptyRow
        icon={<Megaphone className="w-8 h-8 mx-auto text-muted-foreground/40" />}
        text="No campaigns targeting this company's tags."
      />
    );
  return (
    <div className="divide-y divide-border/60">
      {data.map((c) => (
        <div key={String(c.id)} className="flex items-center gap-3 p-3">
          <Megaphone className="w-4 h-4 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{String(c.name ?? "")}</div>
            <div className="text-xs text-muted-foreground">
              {String(c.status ?? "")} · sent {Number(c.sent_count ?? 0)} · delivered{" "}
              {Number(c.delivered_count ?? 0)} · read {Number(c.read_count ?? 0)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AnalyticsTab({ companyId, currency }: { companyId: string; currency: string }) {
  const { data: contacts = [] } = useCompanyContacts(companyId);
  const { data: deals = [] } = useCompanyDeals(companyId);
  const { data: tasks = [] } = useCompanyTasks(companyId);
  const { data: convos = [] } = useCompanyConversations(companyId);
  const openDeals = deals.filter((d) => d.status !== "won" && d.status !== "lost");
  const wonDeals = deals.filter((d) => d.status === "won");
  const pipeline = openDeals.reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const revenue = wonDeals.reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "completed").length;

  const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="rounded-control border border-border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-display font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );

  return (
    <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
      <Stat label="Contacts" value={String(contacts.length)} />
      <Stat
        label="Open deals"
        value={String(openDeals.length)}
        sub={`${currency} ${pipeline.toLocaleString()}`}
      />
      <Stat
        label="Won revenue"
        value={`${currency} ${revenue.toLocaleString()}`}
        sub={`${wonDeals.length} wins`}
      />
      <Stat label="Open tasks" value={String(openTasks)} />
      <Stat label="Total deals" value={String(deals.length)} />
      <Stat label="Conversations" value={String(convos.length)} />
      <Stat
        label="Win rate"
        value={deals.length ? `${Math.round((wonDeals.length / deals.length) * 100)}%` : "—"}
      />
      <Stat
        label="Avg deal"
        value={
          deals.length
            ? `${currency} ${Math.round(deals.reduce((s, d) => s + Number(d.amount ?? 0), 0) / deals.length).toLocaleString()}`
            : "—"
        }
      />
    </div>
  );
}

function TimelineTab({ companyId }: { companyId: string }) {
  const { data = [] } = useCompanyTimeline(companyId);
  const formatZonedDate = useZonedDateFormatter();
  if (!data.length)
    return (
      <EmptyRow
        icon={<Clock className="w-8 h-8 mx-auto text-muted-foreground/40" />}
        text="No activity yet."
      />
    );
  return (
    <ol className="p-4 space-y-3 relative before:absolute before:left-[22px] before:top-2 before:bottom-2 before:w-px before:bg-border">
      {data.map((e) => (
        <li key={e.id} className="flex items-start gap-3 relative">
          <div className="w-3 h-3 rounded-full bg-accent mt-1.5 ring-4 ring-surface z-10" />
          <div className="flex-1">
            <div className="text-sm capitalize">{e.action.replace(/_/g, " ")}</div>
            <div className="text-xs text-muted-foreground">
              {formatZonedDate(e.created_at, { dateStyle: "short", timeStyle: "short" })}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
