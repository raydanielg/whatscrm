import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Search,
  ListTodo,
  Calendar as CalendarIcon,
  History,
  Settings2,
  Clock,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  useSalesActivities,
  useRealtimeActivities,
  ACTIVITY_TYPE_META,
  type ActivityType,
  type SalesActivity,
  type ActivityFilters,
} from "@/hooks/use-sales-activities";
import { useAuth } from "@/hooks/use-auth";
import { ActivityFormDialog } from "@/components/app/activities/activity-form-dialog";
import { ActivityCard } from "@/components/app/activities/activity-card";
import { ActivityCalendar } from "@/components/app/activities/activity-calendar";
import { ActivityTimelineView } from "@/components/app/activities/activity-timeline-view";
import { CalendarAccountsPanel } from "@/components/app/activities/calendar-accounts-panel";

export const Route = createFileRoute("/_authenticated/activities")({
  component: ActivitiesPage,
  staticData: { breadcrumb: "Activities" },
  head: () => ({
    meta: [
      { title: "Sales Activities" },
      {
        name: "description",
        content:
          "Plan calls, meetings, tasks, emails, and WhatsApp follow-ups with calendar, agenda, and daily/weekly/monthly planners.",
      },
    ],
  }),
});

type PlannerView = "day" | "week" | "month" | "agenda";

function ActivitiesPage() {
  const { user } = useAuth();
  useRealtimeActivities();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ActivityType | "all">("all");
  const [assigneeFilter, setAssigneeFilter] = useState<"me" | "all">("me");
  const [tab, setTab] = useState<"planner" | "list" | "timeline" | "settings">("planner");
  const [plannerView, setPlannerView] = useState<PlannerView>("week");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SalesActivity | null>(null);
  const [defaults, setDefaults] = useState<Partial<SalesActivity> | undefined>();

  const filters: ActivityFilters = useMemo(
    () => ({
      types: typeFilter === "all" ? undefined : [typeFilter],
      assignee: assigneeFilter,
      search: search || undefined,
    }),
    [typeFilter, assigneeFilter, search],
  );

  const { data: activities = [], isLoading } = useSalesActivities(filters);

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const inWeek = new Date(today);
    inWeek.setDate(inWeek.getDate() + 7);
    let todayCount = 0,
      overdue = 0,
      upcoming = 0,
      completedWeek = 0;
    for (const a of activities) {
      if (a.status === "completed") {
        if (a.completed_at && new Date(a.completed_at) >= today) completedWeek++;
        continue;
      }
      if (!a.start_at) continue;
      const d = new Date(a.start_at);
      if (d < today && (a.status === "planned" || a.status === "in_progress")) overdue++;
      else if (d >= today && d < tomorrow) todayCount++;
      else if (d >= tomorrow && d <= inWeek) upcoming++;
    }
    return { todayCount, overdue, upcoming, completedWeek };
  }, [activities]);

  const openCreate = (d?: Partial<SalesActivity>) => {
    setEditing(null);
    setDefaults(d);
    setFormOpen(true);
  };
  const openEdit = (a: SalesActivity) => {
    // strip synthetic id suffix from recurrence expansion
    const clean = a.id.includes("::") ? { ...a, id: a.id.split("::")[0] } : a;
    setEditing(clean);
    setDefaults(undefined);
    setFormOpen(true);
  };

  return (
    <>
      <AppTopbar
        title="Sales Activities"
        subtitle="Plan every touchpoint across your pipeline"
        actions={
          <Button onClick={() => openCreate()} size="lg" className="gap-2">
            <Plus className="h-4 w-4" />
            New activity
          </Button>
        }
      />
      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Today"
            value={stats.todayCount}
            icon={<CalendarIcon className="h-4 w-4" />}
            tone="text-primary"
          />
          <StatCard
            label="Overdue"
            value={stats.overdue}
            icon={<AlertTriangle className="h-4 w-4" />}
            tone="text-red-500"
          />
          <StatCard
            label="Next 7 days"
            value={stats.upcoming}
            icon={<Clock className="h-4 w-4" />}
            tone="text-blue-500"
          />
          <StatCard
            label="Completed today"
            value={stats.completedWeek}
            icon={<CheckCircle2 className="h-4 w-4" />}
            tone="text-emerald-500"
          />
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-3 flex flex-col md:flex-row gap-2 items-stretch md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search activities"
                className="pl-9"
              />
            </div>
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as ActivityType | "all")}
            >
              <SelectTrigger className="w-full md:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {(Object.keys(ACTIVITY_TYPE_META) as ActivityType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {ACTIVITY_TYPE_META[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={assigneeFilter}
              onValueChange={(v) => setAssigneeFilter(v as "me" | "all")}
            >
              <SelectTrigger className="w-full md:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="me">Assigned to me</SelectItem>
                <SelectItem value="all">Everyone</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="planner" className="gap-1.5">
              <CalendarIcon className="h-4 w-4" />
              Planner
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-1.5">
              <ListTodo className="h-4 w-4" />
              List
            </TabsTrigger>
            <TabsTrigger value="timeline" className="gap-1.5">
              <History className="h-4 w-4" />
              Timeline
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5">
              <Settings2 className="h-4 w-4" />
              Sync
            </TabsTrigger>
          </TabsList>

          <TabsContent value="planner" className="mt-3">
            <ActivityCalendar
              activities={activities}
              view={plannerView}
              onViewChange={setPlannerView}
              onSelectActivity={openEdit}
              onSelectSlot={(d) => openCreate({ start_at: d.toISOString(), type: "meeting" })}
            />
          </TabsContent>

          <TabsContent value="list" className="mt-3">
            {isLoading ? (
              <Card className="p-12 text-center text-muted-foreground">Loading</Card>
            ) : activities.length === 0 ? (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground mb-4">No activities match your filters.</p>
                <Button onClick={() => openCreate()} variant="outline">
                  Create your first activity
                </Button>
              </Card>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {activities.map((a) => (
                  <ActivityCard key={a.id} activity={a} onClick={openEdit} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="timeline" className="mt-3">
            <ActivityTimelineView activities={activities} onSelect={openEdit} />
          </TabsContent>

          <TabsContent value="settings" className="mt-3 space-y-4 max-w-2xl">
            <CalendarAccountsPanel />
            <Card>
              <CardContent className="p-4 text-sm space-y-2">
                <p className="font-medium">Calendar sync architecture</p>
                <ul className="text-muted-foreground space-y-1 list-disc pl-5">
                  <li>
                    Every activity has <code className="text-xs">external_provider</code>,{" "}
                    <code className="text-xs">external_calendar_id</code>, and{" "}
                    <code className="text-xs">external_event_id</code> columns for two-way mapping.
                  </li>
                  <li>
                    Per-user calendar accounts hold provider tokens and sync direction (pull, push,
                    both).
                  </li>
                  <li>
                    Background workers poll changes and reconcile CRM records without duplicating
                    events.
                  </li>
                  <li>
                    Recurring activities expand client-side and store an RFC-5545 style rule
                    server-side.
                  </li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {user && (
          <ActivityFormDialog
            open={formOpen}
            onOpenChange={setFormOpen}
            activity={editing}
            defaults={defaults}
          />
        )}
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className={tone}>{icon}</div>
      </div>
    </Card>
  );
}
