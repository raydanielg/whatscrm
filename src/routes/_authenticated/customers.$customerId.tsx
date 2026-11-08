import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Users,
  Mail,
  Phone,
  Heart,
  DollarSign,
  Activity,
  Clock,
  FileText,
  Pencil,
  Tag,
  ExternalLink,
  Handshake,
  MessagesSquare,
  Send,
  StickyNote,
  Sliders,
  LineChart as LineChartIcon,
  UserSquare2,
} from "lucide-react";
import {
  useCustomer,
  useCustomerTimeline,
  useCustomerActivities,
  useCustomerAttachments,
  customerDisplayName,
  customerInitials,
} from "@/hooks/use-customers";
import { useCompany } from "@/hooks/use-companies";
import {
  AttachmentItem,
  AttachmentsErrorState,
  type AttachmentFileRef,
} from "@/components/app/files/attachment-item";
import {
  useCustomerDeals,
  useCustomerTasks,
  useCustomerConversations,
  useCustomerNotes,
  useCustomerCampaigns,
  useRelatedContacts,
} from "@/hooks/use-dashboard";
import { useCustomFields } from "@/hooks/use-custom-fields";
import { useTenantCurrency } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { aggregateCurrency, formatMoney } from "@/lib/currency/format";
import { CustomerEditDialog } from "@/components/app/customers/customer-edit-dialog";
import { ActivityTimeline } from "@/components/app/timeline/activity-timeline";
import { CustomerActivityTimeline } from "@/components/app/customers/customer-activity-timeline";
import { EngagementMetrics } from "@/components/app/customers/engagement-metrics";
import { CustomerAIInsights } from "@/components/app/customers/customer-ai-insights";
import { CustomerNotesTasksPanel } from "@/components/app/customers/customer-notes-tasks-panel";
import { TagSelector } from "@/components/app/tags/tag-selector";
import {
  InlineEditableField,
  InlineOwnerPicker,
  InlineTagEditor,
} from "@/components/app/customers/inline-editable-header";

import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/customers/$customerId")({
  staticData: { breadcrumb: "Customer" },
  head: () => ({
    meta: [
      { title: "Customer 360° — CRM" },
      {
        name: "description",
        content:
          "Complete 360° view of a customer with timeline, deals, tasks, conversations and analytics.",
      },
    ],
  }),
  component: CustomerDetailPage,
});

function CustomerDetailPage() {
  const { customerId } = Route.useParams();
  const { data: customer, isLoading } = useCustomer(customerId);
  const formatZonedDate = useZonedDateFormatter();
  const { data: company } = useCompany(customer?.company_id ?? undefined);
  const { data: timeline = [] } = useCustomerTimeline(customerId);
  const { data: activities = [] } = useCustomerActivities(customerId);
  const {
    data: attachments = [],
    error: attachmentsError,
    refetch: refetchAttachments,
  } = useCustomerAttachments(customerId);
  const { data: deals = [] } = useCustomerDeals(customerId);
  const tenantCurrency = useTenantCurrency();
  const { data: tasks = [] } = useCustomerTasks(customerId);
  const { data: conversations = [] } = useCustomerConversations(customerId);
  const { data: notes = [] } = useCustomerNotes(customerId);
  const { data: campaigns = [] } = useCustomerCampaigns(customerId);
  const { data: related = [] } = useRelatedContacts(customerId, customer?.company_id);
  const { data: fieldDefs = [] } = useCustomFields("customer");
  const [edit, setEdit] = useState(false);

  if (isLoading)
    return (
      <>
        <AppTopbar title="Loading" />
        <main className="p-6 text-sm text-muted-foreground">Loading</main>
      </>
    );
  if (!customer)
    return (
      <>
        <AppTopbar title="Not found" />
        <main className="p-6 text-center">
          <Users className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground mb-3">Customer not found.</p>
          <Link to="/customers">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>
          </Link>
        </main>
      </>
    );

  const health = customer.customer_health_score ?? 0;
  const healthColor =
    health >= 70 ? "text-emerald-500" : health >= 40 ? "text-amber-500" : "text-rose-500";
  const ltv = Number(customer.customer_lifetime_value || 0);
  const openDealsValue = deals
    .filter((d) => d.status === "open")
    .reduce((s, d) => s + Number(d.amount || 0), 0);
  const wonDealsValue = deals
    .filter((d) => d.status === "won")
    .reduce((s, d) => s + Number(d.amount || 0), 0);
  // Deal amounts carry their own currency; the tenant's fills in when this
  // customer's deals disagree (or when there are none yet, as for lifetime value).
  const dealsCurrency = aggregateCurrency(deals, tenantCurrency);
  const money = (value: number) => formatMoney(value, dealsCurrency, { maximumFractionDigits: 0 });
  const openTasks = tasks.filter((t) => t.status !== "completed").length;
  const cf =
    (customer as unknown as { custom_fields?: Record<string, unknown> }).custom_fields ?? {};

  return (
    <>
      <AppTopbar
        title={customerDisplayName(customer)}
        subtitle="360° customer view"
        actions={
          <>
            <Link to="/contacts/$contactId" params={{ contactId: customer.id }}>
              <Button size="sm" variant="outline">
                <ExternalLink className="w-4 h-4 mr-1.5" /> Contact view
              </Button>
            </Link>
            <Button size="sm" onClick={() => setEdit(true)}>
              <Pencil className="w-4 h-4 mr-1.5" /> Edit
            </Button>
          </>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {/* Header card */}
        <div className="rounded-control border border-border bg-gradient-to-br from-surface via-surface to-accent/5 p-5 shadow-sm">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:items-start">
            <div className="flex min-w-0 items-start gap-4 flex-1">
              <Avatar className="w-16 h-16 shrink-0 ring-2 ring-accent/20">
                {customer.avatar_url ? <AvatarImage src={customer.avatar_url} /> : null}
                <AvatarFallback className="text-lg bg-accent/10 text-accent">
                  {customerInitials(customer)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <InlineEditableField
                    customer={customer}
                    field="name"
                    className="truncate text-xl md:text-2xl font-display font-semibold"
                    placeholder="Add name"
                  />
                  <Badge variant="secondary" className="capitalize">
                    {customer.customer_status ?? "—"}
                  </Badge>
                  <Badge variant="outline">{customer.lifecycle_stage}</Badge>
                  <InlineOwnerPicker customer={customer} />
                </div>
                <div className="text-sm text-muted-foreground mt-0.5 truncate">
                  {customer.job_title ?? ""}
                  {company ? ` · ` : ""}
                  {company && (
                    <Link
                      to="/companies/$companyId"
                      params={{ companyId: company.id }}
                      className="text-accent hover:underline"
                    >
                      {company.name}
                    </Link>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-xs text-muted-foreground items-center">
                  <InlineEditableField
                    customer={customer}
                    field="email"
                    type="email"
                    placeholder="Add email"
                    icon={<Mail className="w-3.5 h-3.5" />}
                  />
                  <InlineEditableField
                    customer={customer}
                    field="phone"
                    type="tel"
                    placeholder="Add phone"
                    icon={<Phone className="w-3.5 h-3.5" />}
                  />
                  {customer.first_customer_at && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> Since{" "}
                      {formatZonedDate(customer.first_customer_at, {})}
                    </span>
                  )}
                </div>
                <div className="mt-3">
                  <InlineTagEditor customer={customer} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <MetricCard
            label="Lifetime value"
            value={ltv ? money(ltv) : "—"}
            icon={<DollarSign className="w-4 h-4 text-amber-500" />}
          />
          <MetricCard
            label="Health"
            value={String(customer.customer_health_score ?? "—")}
            icon={<Heart className={`w-4 h-4 ${healthColor}`} />}
          />
          <MetricCard
            label="Open deals"
            value={money(Math.round(openDealsValue))}
            icon={<Handshake className="w-4 h-4 text-blue-500" />}
          />
          <MetricCard
            label="Won deals"
            value={money(Math.round(wonDealsValue))}
            icon={<DollarSign className="w-4 h-4 text-emerald-500" />}
          />
          <MetricCard
            label="Open tasks"
            value={String(openTasks)}
            icon={<Activity className="w-4 h-4 text-purple-500" />}
          />
          <MetricCard
            label="Conversations"
            value={String(conversations.length)}
            icon={<MessagesSquare className="w-4 h-4 text-cyan-500" />}
          />
        </div>

        <EngagementMetrics customerId={customer.id} />

        <CustomerAIInsights customerId={customer.id} />

        {/* Tabs */}
        <div className="rounded-control border border-border bg-surface">
          <Tabs defaultValue="overview">
            <div className="border-b">
              <ScrollArea orientation="horizontal" type="hover" className="w-full">
                <TabsList className="w-max flex justify-start rounded-none h-9 p-0 bg-transparent">
                  <Tab v="overview" label="Overview" icon={<UserSquare2 className="w-4 h-4" />} />
                  <Tab v="timeline" label="Timeline" icon={<Clock className="w-4 h-4" />} />
                  <Tab
                    v="conversations"
                    label="WhatsApp"
                    icon={<MessagesSquare className="w-4 h-4" />}
                  />
                  <Tab
                    v="deals"
                    label={`Deals · ${deals.length}`}
                    icon={<Handshake className="w-4 h-4" />}
                  />
                  <Tab
                    v="tasks"
                    label={`Tasks · ${tasks.length}`}
                    icon={<Activity className="w-4 h-4" />}
                  />
                  <Tab
                    v="campaigns"
                    label={`Campaigns · ${campaigns.length}`}
                    icon={<Send className="w-4 h-4" />}
                  />
                  <Tab
                    v="notes"
                    label={`Notes · ${notes.length}`}
                    icon={<StickyNote className="w-4 h-4" />}
                  />
                  <Tab
                    v="attachments"
                    label={`Files · ${attachments.length}`}
                    icon={<FileText className="w-4 h-4" />}
                  />
                  <Tab v="custom" label="Custom Fields" icon={<Sliders className="w-4 h-4" />} />
                  <Tab v="tags" label="Tags" icon={<Tag className="w-4 h-4" />} />
                  <Tab
                    v="related"
                    label={`Related · ${related.length}`}
                    icon={<Users className="w-4 h-4" />}
                  />
                  <Tab v="analytics" label="Analytics" icon={<LineChartIcon className="w-4 h-4" />} />
                  <Tab v="history" label="History" icon={<Clock className="w-4 h-4" />} />
                </TabsList>
              </ScrollArea>
            </div>

            <TabsContent value="overview" className="p-4">
              <OverviewPane
                customer={customer}
                openDeals={deals.filter((d) => d.status === "open").length}
                recentActivity={activities.slice(0, 5)}
                recentNotes={notes.slice(0, 3)}
              />
            </TabsContent>
            <TabsContent value="timeline" className="p-4 space-y-4">
              <CustomerActivityTimeline customerId={customer.id} />
              <ActivityTimeline entityType="contact" entityId={customer.id} />
            </TabsContent>
            <TabsContent value="conversations">
              <ConversationsPane items={conversations} />
            </TabsContent>
            <TabsContent value="deals">
              <DealsPane items={deals} />
            </TabsContent>
            <TabsContent value="tasks" className="p-4">
              <CustomerNotesTasksPanel
                customerId={customer.id}
                workspaceId={customer.workspace_id}
              />
            </TabsContent>
            <TabsContent value="campaigns">
              <CampaignsPane items={campaigns} />
            </TabsContent>
            <TabsContent value="notes" className="p-4">
              <CustomerNotesTasksPanel
                customerId={customer.id}
                workspaceId={customer.workspace_id}
              />
            </TabsContent>
            <TabsContent value="attachments">
              <AttachmentsPane
                items={attachments}
                error={attachmentsError}
                onRetry={() => void refetchAttachments()}
              />
            </TabsContent>
            <TabsContent value="custom" className="p-4">
              <CustomFieldsPane defs={fieldDefs} values={cf} />
            </TabsContent>
            <TabsContent value="tags" className="p-4">
              <TagSelector entityType="contact" entityId={customer.id} />
            </TabsContent>
            <TabsContent value="related">
              <RelatedPane items={related} />
            </TabsContent>
            <TabsContent value="analytics" className="p-4">
              <AnalyticsPane
                activities={activities}
                deals={deals}
                tasks={tasks}
                health={health}
                ltv={ltv}
                currency={dealsCurrency}
              />
            </TabsContent>
            <TabsContent value="history">
              <HistoryPane entries={timeline} />
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <CustomerEditDialog open={edit} onOpenChange={setEdit} customer={customer} />
    </>
  );
}

/* --------------------- Reusable primitives --------------------- */

function Tab({ v, label, icon }: { v: string; label: string; icon: React.ReactNode }) {
  return (
    <TabsTrigger
      value={v}
      className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent px-4 py-2.5 gap-1.5 text-sm whitespace-nowrap"
    >
      {icon} <span>{label}</span>
    </TabsTrigger>
  );
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-control border border-border bg-surface p-3">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        {icon} {label}
      </div>
      <div className="text-lg md:text-xl font-display font-semibold mt-1 ">{value}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="p-8 text-center text-sm text-muted-foreground">{text}</div>;
}

/* --------------------- Panes --------------------- */

function OverviewPane({
  customer,
  openDeals,
  recentActivity,
  recentNotes,
}: {
  customer: { segments?: string[]; preferences?: Record<string, unknown>; tags?: string[] };
  openDeals: number;
  recentActivity: Array<Record<string, unknown>>;
  recentNotes: Array<{ id: string; body: string; is_pinned: boolean; created_at: string }>;
}) {
  const formatZonedDate = useZonedDateFormatter();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-3">
        <SectionCard title="Segments">
          {customer.segments?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {customer.segments.map((s) => (
                <Badge key={s} variant="outline">
                  <Tag className="w-3 h-3 " /> {s}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No segments assigned.</p>
          )}
        </SectionCard>
        <SectionCard title="Preferences">
          {customer.preferences && Object.keys(customer.preferences).length ? (
            <dl className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(customer.preferences)
                .slice(0, 8)
                .map(([k, v]) => (
                  <div key={k} className="flex flex-col p-2 rounded border border-border">
                    <dt className="text-muted-foreground truncate">{k}</dt>
                    <dd className="truncate font-medium">
                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </dd>
                  </div>
                ))}
            </dl>
          ) : (
            <p className="text-xs text-muted-foreground">No preferences saved.</p>
          )}
        </SectionCard>
        <SectionCard title="At a glance">
          <ul className="text-xs space-y-1.5">
            <li>
              <span className="text-muted-foreground">Open deals:</span>{" "}
              <span className="font-medium">{openDeals}</span>
            </li>
            <li>
              <span className="text-muted-foreground">Tags:</span>{" "}
              <span className="font-medium">{customer.tags?.length ?? 0}</span>
            </li>
          </ul>
        </SectionCard>
      </div>
      <div className="space-y-3">
        <SectionCard title="Recent activity">
          {recentActivity.length ? (
            <ul className="space-y-2">
              {recentActivity.map((a) => (
                <li key={String(a.id)} className="text-xs flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">
                    {String(a.summary ?? a.verb ?? "Activity")}
                  </span>
                  <span className="text-muted-foreground">
                    {a.created_at ? formatZonedDate(String(a.created_at), {}) : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No activity yet.</p>
          )}
        </SectionCard>
        <SectionCard title="Pinned & recent notes">
          {recentNotes.length ? (
            <ul className="space-y-2">
              {recentNotes.map((n) => (
                <li key={n.id} className="p-2 rounded border border-border text-xs">
                  <div className="flex items-center justify-between mb-1">
                    {n.is_pinned && (
                      <Badge variant="outline" className="text-[11px]">
                        Pinned
                      </Badge>
                    )}
                    <span className="text-muted-foreground ml-auto">
                      {formatZonedDate(n.created_at, {})}
                    </span>
                  </div>
                  <p className="line-clamp-3">{n.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No notes yet.</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-control border border-border p-3">
      <div className="text-[11px]  text-muted-foreground font-semibold mb-2">{title}</div>
      {children}
    </div>
  );
}

function ConversationsPane({
  items,
}: {
  items: Array<{
    id: string;
    status: string;
    unread_count: number;
    last_message_at: string | null;
    ai_summary: string | null;
  }>;
}) {
  const formatZonedDate = useZonedDateFormatter();
  if (!items.length) return <Empty text="No WhatsApp conversations yet." />;
  return (
    <ul className="divide-y divide-border/60">
      {items.map((c) => (
        <li key={c.id} className="flex items-center gap-3 p-3 hover:bg-muted/40">
          <div className="w-9 h-9 rounded-full bg-emerald-500/10 grid place-items-center text-emerald-600 shrink-0">
            <MessagesSquare className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium capitalize">{c.status.replace(/_/g, " ")}</div>
            <div className="text-xs text-muted-foreground truncate">
              {c.ai_summary || "No summary"}
            </div>
          </div>
          <div className="text-right shrink-0">
            {c.unread_count > 0 && <Badge className="mb-1">{c.unread_count}</Badge>}
            {c.last_message_at && (
              <div className="text-[11px] text-muted-foreground">
                {formatZonedDate(c.last_message_at, {})}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function DealsPane({
  items,
}: {
  items: Array<{
    id: string;
    title: string;
    amount: number;
    currency: string;
    status: string;
    probability: number;
    expected_close_date: string | null;
  }>;
}) {
  const formatZonedDate = useZonedDateFormatter();
  if (!items.length) return <Empty text="No deals linked to this customer." />;
  return (
    <ul className="divide-y divide-border/60">
      {items.map((d) => (
        <li key={d.id} className="flex items-center gap-3 p-3 hover:bg-muted/40">
          <Handshake className="w-4 h-4 text-blue-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{d.title}</div>
            <div className="text-xs text-muted-foreground">
              <span className="capitalize">{d.status}</span> · {d.probability}% probability
              {d.expected_close_date
                ? ` · close ${formatZonedDate(d.expected_close_date, {})}`
                : ""}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-semibold ">
              {d.currency} {Number(d.amount).toLocaleString()}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function TasksPane({
  items,
}: {
  items: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    due_at: string | null;
  }>;
}) {
  const formatZonedDate = useZonedDateFormatter();
  if (!items.length) return <Empty text="No tasks for this customer." />;
  return (
    <ul className="divide-y divide-border/60">
      {items.map((t) => (
        <li key={t.id} className="flex items-center gap-3 p-3 hover:bg-muted/40">
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${t.priority === "high" || t.priority === "urgent" ? "bg-destructive" : t.priority === "medium" ? "bg-amber-500" : "bg-muted-foreground/60"}`}
          />
          <div className="flex-1 min-w-0">
            <div
              className={`text-sm font-medium truncate ${t.status === "completed" ? "line-through text-muted-foreground" : ""}`}
            >
              {t.title}
            </div>
            <div className="text-xs text-muted-foreground">
              {t.due_at
                ? formatZonedDate(t.due_at, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "No due date"}
            </div>
          </div>
          <Badge variant="outline" className="capitalize text-[11px] shrink-0">
            {t.status}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function CampaignsPane({
  items,
}: {
  items: Array<{ id: string; name: string; status: string; created_at: string }>;
}) {
  const formatZonedDate = useZonedDateFormatter();
  if (!items.length) return <Empty text="This customer isn't part of any campaigns yet." />;
  return (
    <ul className="divide-y divide-border/60">
      {items.map((c) => (
        <li key={c.id} className="flex items-center gap-3 p-3 hover:bg-muted/40">
          <Send className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{c.name}</div>
            <div className="text-xs text-muted-foreground capitalize">{c.status}</div>
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatZonedDate(c.created_at, {})}
          </span>
        </li>
      ))}
    </ul>
  );
}

function NotesPane({
  items,
}: {
  items: Array<{ id: string; body: string; is_pinned: boolean; created_at: string }>;
}) {
  const formatZonedDate = useZonedDateFormatter();
  if (!items.length) return <Empty text="No notes yet." />;
  return (
    <div className="p-4 space-y-3">
      {items.map((n) => (
        <div
          key={n.id}
          className={`p-3 rounded-control border ${n.is_pinned ? "border-accent/40 bg-accent/5" : "border-border"}`}
        >
          <div className="flex items-center justify-between mb-1.5">
            {n.is_pinned && (
              <Badge variant="outline" className="text-[11px]">
                <StickyNote className="w-3 h-3 " /> Pinned
              </Badge>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {formatZonedDate(n.created_at, { dateStyle: "short", timeStyle: "short" })}
            </span>
          </div>
          <p className="text-sm whitespace-pre-wrap">{n.body}</p>
        </div>
      ))}
    </div>
  );
}

function AttachmentsPane({
  items,
  error,
  onRetry,
}: {
  items: Array<{ id: string; file: AttachmentFileRef; created_at: string }>;
  error?: unknown;
  onRetry?: () => void;
}) {
  if (error)
    return (
      <div className="p-3">
        <AttachmentsErrorState
          error={error}
          onRetry={onRetry}
          context="GET attachments (contact files)"
        />
      </div>
    );
  if (!items.length) return <Empty text="No attachments." />;
  return (
    <div className="space-y-2 p-3">
      {items.map((a) => (
        <AttachmentItem key={a.id} file={a.file} createdAt={a.created_at} />
      ))}
    </div>
  );
}

function CustomFieldsPane({
  defs,
  values,
}: {
  defs: Array<{ id: string; key: string; label: string; field_type: string }>;
  values: Record<string, unknown>;
}) {
  if (!defs.length)
    return (
      <Empty text="No custom fields defined for customers. Configure them in Custom Fields." />
    );
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {defs.map((f) => {
        const v = values[f.key];
        return (
          <div key={f.id} className="p-2.5 rounded border border-border flex justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px]  text-muted-foreground">{f.label}</div>
              <div className="text-sm truncate">
                {v == null || v === "" ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  String(typeof v === "object" ? JSON.stringify(v) : v)
                )}
              </div>
            </div>
            <Badge variant="outline" className="text-[11px] shrink-0 self-start">
              {f.field_type}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

function RelatedPane({
  items,
}: {
  items: Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
    job_title: string | null;
  }>;
}) {
  if (!items.length)
    return <Empty text="No related contacts. Link this customer to a company to see teammates." />;
  return (
    <ul className="divide-y divide-border/60">
      {items.map((c) => {
        const name =
          c.display_name ||
          [c.first_name, c.last_name].filter(Boolean).join(" ") ||
          c.email ||
          "Unnamed";
        const initials = name
          .split(/\s+/)
          .map((w) => w[0])
          .slice(0, 2)
          .join("")
          .toUpperCase();
        return (
          <li key={c.id}>
            <Link
              to="/contacts/$contactId"
              params={{ contactId: c.id }}
              className="flex items-center gap-3 p-3 hover:bg-muted/40"
            >
              <Avatar className="w-9 h-9 shrink-0">
                {c.avatar_url ? <AvatarImage src={c.avatar_url} /> : null}
                <AvatarFallback className="text-xs bg-accent/10 text-accent">
                  {initials || "??"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {c.job_title || c.email || "—"}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function AnalyticsPane({
  activities,
  deals,
  tasks,
  health,
  ltv,
  currency,
}: {
  activities: Array<{ created_at?: string }>;
  deals: Array<{ status: string; amount: number }>;
  tasks: Array<{ status: string }>;
  health: number;
  ltv: number;
  /** Currency these figures are denominated in, resolved by the caller. */
  currency: string;
}) {
  // Activity per day, last 30d
  const days: Array<{ day: string; count: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    const count = activities.filter((a) => a.created_at?.slice(0, 10) === key).length;
    days.push({ day: d.toLocaleDateString([], { month: "short", day: "numeric" }), count });
  }

  const dealBreakdown = ["open", "won", "lost"]
    .map((s) => ({
      name: s,
      value: deals.filter((d) => d.status === s).reduce((sum, d) => sum + Number(d.amount || 0), 0),
    }))
    .filter((x) => x.value > 0);
  const COLORS = ["hsl(var(--primary))", "hsl(142 76% 45%)", "hsl(0 72% 55%)"];

  const openTasksN = tasks.filter((t) => t.status !== "completed").length;
  const doneTasksN = tasks.filter((t) => t.status === "completed").length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 rounded-control border border-border p-4">
        <h4 className="text-sm font-semibold mb-1">Activity · last 30 days</h4>
        <p className="text-xs text-muted-foreground mb-3">Engagement volume over time</p>
        <div className="h-56">
          <ResponsiveContainer>
            <LineChart data={days}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="day"
                stroke="var(--color-muted-foreground)"
                fontSize={10}
                interval={4}
              />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={10} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface-elevated)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="hsl(var(--accent))"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-control border border-border p-4">
        <h4 className="text-sm font-semibold mb-1">Deal breakdown</h4>
        <p className="text-xs text-muted-foreground mb-3">Value by status</p>
        {dealBreakdown.length ? (
          <div className="h-56">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={dealBreakdown}
                  innerRadius={45}
                  outerRadius={80}
                  dataKey="value"
                  nameKey="name"
                >
                  {dealBreakdown.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-56 grid place-items-center text-xs text-muted-foreground">
            No deals yet
          </div>
        )}
      </div>

      <StatBig
        label="Health score"
        value={String(health || "—")}
        suffix="/100"
        tone={health >= 70 ? "green" : health >= 40 ? "amber" : "rose"}
      />
      <StatBig
        label="Lifetime value"
        value={ltv ? formatMoney(ltv, currency, { maximumFractionDigits: 0 }) : "—"}
        tone="accent"
      />
      <StatBig
        label="Task completion"
        value={tasks.length ? `${Math.round((doneTasksN / tasks.length) * 100)}%` : "—"}
        suffix={tasks.length ? ` · ${openTasksN} open` : ""}
        tone="accent"
      />
    </div>
  );
}

function StatBig({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: string;
  suffix?: string;
  tone: "green" | "amber" | "rose" | "accent";
}) {
  const toneClass = {
    green: "from-emerald-500/10 to-emerald-500/0 text-emerald-600",
    amber: "from-amber-500/10 to-amber-500/0 text-amber-600",
    rose: "from-rose-500/10 to-rose-500/0 text-rose-600",
    accent: "from-accent/10 to-accent/0 text-accent",
  }[tone];
  return (
    <div className={`rounded-control border border-border p-4 bg-gradient-to-br ${toneClass}`}>
      <div className="text-xs  text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-display font-semibold ">
        {value}
        <span className="text-sm text-muted-foreground font-normal">{suffix}</span>
      </div>
    </div>
  );
}

function HistoryPane({
  entries,
}: {
  entries: Array<{
    id: string;
    action: string;
    changes: Record<string, unknown>;
    created_at: string;
  }>;
}) {
  const formatZonedDate = useZonedDateFormatter();
  if (!entries.length) return <Empty text="No history entries." />;
  return (
    <div className="divide-y divide-border/60">
      {entries.map((e) => (
        <details key={e.id} className="p-3 group">
          <summary className="cursor-pointer flex items-center justify-between text-sm">
            <span className="capitalize">{e.action.replace(/_/g, " ")}</span>
            <span className="text-xs text-muted-foreground">
              {formatZonedDate(e.created_at, { dateStyle: "short", timeStyle: "short" })}
            </span>
          </summary>
          <pre className="mt-2 text-[11px] bg-muted/40 p-2 rounded overflow-auto max-h-40">
            {JSON.stringify(e.changes, null, 2)}
          </pre>
        </details>
      ))}
    </div>
  );
}
