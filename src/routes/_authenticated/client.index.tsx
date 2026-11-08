import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  MessagesSquare,
  CalendarDays,
  Receipt,
  ShoppingBag,
  Bell,
  CheckSquare,
  BookOpen,
  Sparkles,
  Zap,
  LifeBuoy,
  CreditCard,
  Loader2,
  Settings2,
  Plus,
  ArrowRight,
  GripVertical,
  Video,
  Clock,
  AlertCircle,
} from "lucide-react";
import {
  getDashboardBundle,
  saveDashboardPrefs,
  markNotificationRead,
} from "@/lib/client-portal/portal.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCurrencyFormatter } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/client/")({
  component: ClientDashboard,
});
function relTime(iso: string | null | undefined) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.abs(diff) / 1000;
  const sign = diff >= 0 ? "" : "in ";
  const suffix = diff >= 0 ? " ago" : "";
  if (s < 60) return `${sign}${Math.round(s)}s${suffix}`;
  if (s < 3600) return `${sign}${Math.round(s / 60)}m${suffix}`;
  if (s < 86400) return `${sign}${Math.round(s / 3600)}h${suffix}`;
  return `${sign}${Math.round(s / 86400)}d${suffix}`;
}

const ALL_WIDGETS = [
  "welcome",
  "quick_actions",
  "appointments",
  "conversations",
  "orders",
  "invoices",
  "payments",
  "tickets",
  "notifications",
  "tasks",
  "kb",
  "ai_assistant",
] as const;
type WidgetKey = (typeof ALL_WIDGETS)[number];

const WIDGET_META: Record<
  WidgetKey,
  { title: string; icon: React.ComponentType<{ className?: string }> }
> = {
  welcome: { title: "Welcome", icon: Sparkles },
  quick_actions: { title: "Quick Actions", icon: Zap },
  appointments: { title: "Upcoming Appointments", icon: CalendarDays },
  conversations: { title: "Recent Conversations", icon: MessagesSquare },
  orders: { title: "Recent Orders", icon: ShoppingBag },
  invoices: { title: "Invoices", icon: Receipt },
  payments: { title: "Payments", icon: CreditCard },
  tickets: { title: "Support Tickets", icon: LifeBuoy },
  notifications: { title: "Notifications", icon: Bell },
  tasks: { title: "Tasks", icon: CheckSquare },
  kb: { title: "Knowledge Base", icon: BookOpen },
  ai_assistant: { title: "AI Assistant", icon: Sparkles },
};

const DEFAULT_ORDER: WidgetKey[] = [
  "welcome",
  "quick_actions",
  "appointments",
  "conversations",
  "notifications",
  "tasks",
  "invoices",
  "payments",
  "orders",
  "tickets",
  "kb",
  "ai_assistant",
];

function ClientDashboard() {
  const money = useCurrencyFormatter({ locale: "en-US", fromCents: true });
  const fmtZoned = useZonedDateFormatter();
  const fn = useServerFn(getDashboardBundle);
  const saveFn = useServerFn(saveDashboardPrefs);
  const markFn = useServerFn(markNotificationRead);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["client-dashboard"],
    queryFn: () => fn(),
    refetchOnWindowFocus: true,
  });

  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState<WidgetKey[]>(DEFAULT_ORDER);
  const [dragging, setDragging] = useState<WidgetKey | null>(null);

  useEffect(() => {
    const saved = q.data?.prefs?.widgets as string[] | undefined;
    if (saved && saved.length) {
      const valid = saved.filter((k): k is WidgetKey =>
        (ALL_WIDGETS as readonly string[]).includes(k),
      );
      const missing = DEFAULT_ORDER.filter((k) => !valid.includes(k));
      setOrder([...valid, ...missing.filter((m) => saved.includes(m))]);
    }
  }, [q.data?.prefs]);

  // Real-time: subscribe to changes on user's contact-scoped tables
  useEffect(() => {
    const contactId = q.data?.contact.id;
    if (!contactId) return;
    const ch = supabase
      .channel(`portal-dashboard-${contactId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `contact_id=eq.${contactId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["client-dashboard"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () =>
        qc.invalidateQueries({ queryKey: ["client-dashboard"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "booking_appointments" }, () =>
        qc.invalidateQueries({ queryKey: ["client-dashboard"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices", filter: `contact_id=eq.${contactId}` },
        () => qc.invalidateQueries({ queryKey: ["client-dashboard"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments", filter: `contact_id=eq.${contactId}` },
        () => qc.invalidateQueries({ queryKey: ["client-dashboard"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deals", filter: `contact_id=eq.${contactId}` },
        () => qc.invalidateQueries({ queryKey: ["client-dashboard"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () =>
        qc.invalidateQueries({ queryKey: ["client-dashboard"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () =>
        qc.invalidateQueries({ queryKey: ["client-dashboard"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [q.data?.contact.id, qc]);

  const saveMut = useMutation({
    mutationFn: (widgets: string[]) => saveFn({ data: { widgets } }),
    onSuccess: () => {
      toast.success("Dashboard saved");
      qc.invalidateQueries({ queryKey: ["client-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markMut = useMutation({
    mutationFn: (id?: string) => markFn({ data: id ? { id } : { all: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-dashboard"] }),
  });

  const visible = useMemo(() => order, [order]);

  function move(k: WidgetKey, dir: -1 | 1) {
    setOrder((prev) => {
      const i = prev.indexOf(k);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function toggle(k: WidgetKey) {
    setOrder((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading your dashboard
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="rounded-control border border-destructive/40 bg-destructive/5 p-6 text-sm">
        {(q.error as Error).message}
      </div>
    );
  }
  const d = q.data!;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Live updates as things change</p>
        </div>
        <div className="flex items-center gap-2">
          {editing && (
            <button
              onClick={() => saveMut.mutate(order)}
              disabled={saveMut.isPending}
              className="h-9 px-3 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {saveMut.isPending ? "Saving" : "Save layout"}
            </button>
          )}
          <button
            onClick={() => setEditing((v) => !v)}
            className="h-9 px-3 rounded-control border border-border bg-surface text-sm font-medium hover:border-border-strong inline-flex items-center gap-1.5"
          >
            <Settings2 className="w-4 h-4" /> {editing ? "Done" : "Customize"}
          </button>
        </div>
      </header>

      {editing && (
        <div className="rounded-control border border-border bg-surface p-4">
          <p className="text-xs uppercase   text-muted-foreground mb-3">Show widgets</p>
          <div className="flex flex-wrap gap-2">
            {ALL_WIDGETS.map((k) => {
              const on = order.includes(k);
              const Icon = WIDGET_META[k].icon;
              return (
                <button
                  key={k}
                  onClick={() => toggle(k)}
                  className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-control border text-xs font-medium transition ${on ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted-foreground hover:border-border-strong"}`}
                >
                  <Icon className="w-3.5 h-3.5" /> {WIDGET_META[k].title}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-min">
        {visible.map((k) => (
          <WidgetCard
            key={k}
            widgetKey={k}
            editing={editing}
            onMoveUp={() => move(k, -1)}
            onMoveDown={() => move(k, 1)}
            onRemove={() => toggle(k)}
            span={
              k === "welcome"
                ? "md:col-span-2 xl:col-span-3"
                : k === "quick_actions"
                  ? "md:col-span-2 xl:col-span-3"
                  : ""
            }
            dragging={dragging === k}
            onDragStart={() => setDragging(k)}
            onDragEnd={() => setDragging(null)}
            onDrop={() => {
              if (!dragging || dragging === k) return;
              setOrder((prev) => {
                const from = prev.indexOf(dragging);
                const to = prev.indexOf(k);
                if (from < 0 || to < 0) return prev;
                const next = [...prev];
                next.splice(from, 1);
                next.splice(to, 0, dragging);
                return next;
              });
              setDragging(null);
            }}
          >
            {renderWidget(k, d, markMut.mutate, money, fmtZoned)}
          </WidgetCard>
        ))}
      </div>
    </div>
  );
}

type BundleData = Awaited<ReturnType<typeof getDashboardBundle>>;

function WidgetCard(props: {
  widgetKey: WidgetKey;
  editing: boolean;
  span?: string;
  dragging?: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  children: React.ReactNode;
}) {
  const meta = WIDGET_META[props.widgetKey];
  const Icon = meta.icon;
  return (
    <section
      draggable={props.editing}
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
      onDragOver={(e) => {
        if (props.editing) e.preventDefault();
      }}
      onDrop={props.onDrop}
      className={`rounded-control border border-border bg-surface overflow-hidden animate-in fade-in duration-300 ${props.span ?? ""} ${props.dragging ? "opacity-50" : ""}`}
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="inline-flex items-center gap-2">
          {props.editing && <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />}
          <Icon className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-medium">{meta.title}</h3>
        </div>
        {props.editing && (
          <div className="flex items-center gap-1">
            <button
              onClick={props.onMoveUp}
              className="h-7 px-2 text-xs rounded border border-border hover:bg-muted"
            >
              ↑
            </button>
            <button
              onClick={props.onMoveDown}
              className="h-7 px-2 text-xs rounded border border-border hover:bg-muted"
            >
              ↓
            </button>
            <button
              onClick={props.onRemove}
              className="h-7 px-2 text-xs rounded border border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              Hide
            </button>
          </div>
        )}
      </header>
      <div className="p-4">{props.children}</div>
    </section>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="text-xs text-muted-foreground py-4 text-center">{label}</p>;
}

function renderWidget(
  k: WidgetKey,
  d: BundleData,
  markRead: (id?: string) => void,
  money: (value: number | null | undefined, currency?: string | null) => string,
  fmtZoned: (date: Date | string | number, options: Intl.DateTimeFormatOptions) => string,
) {
  switch (k) {
    case "welcome":
      return (
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase   text-accent font-medium">Welcome back</p>
            <h2 className="mt-1 font-display text-3xl font-semibold">
              {d.contact.name ?? d.contact.email}
            </h2>
            {d.counters.outstanding_cents > 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                You have{" "}
                <span className="text-foreground font-medium">
                  {money(d.counters.outstanding_cents)}
                </span>{" "}
                in outstanding invoices.{" "}
                <Link to="/client/invoices" className="text-accent hover:underline">
                  View invoices →
                </Link>
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                You're all caught up. Explore your workspace below.
              </p>
            )}
          </div>
          <div className="flex gap-2 text-xs">
            <Stat label="Appointments" value={d.appointments.length} />
            <Stat label="Conversations" value={d.conversations.length} />
            <Stat label="Unread" value={d.counters.unread_notifications} />
          </div>
        </div>
      );

    case "quick_actions":
      return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <QA to="/client/tickets" icon={LifeBuoy} label="New ticket" />
          <QA to="/client/appointments" icon={CalendarDays} label="Book time" />
          <QA to="/client/invoices" icon={Receipt} label="Pay invoice" />
          <QA to="/client/assistant" icon={Sparkles} label="Ask AI" />
        </div>
      );

    case "appointments":
      if (!d.appointments.length) return <Empty label="No upcoming appointments" />;
      return (
        <ul className="space-y-2">
          {d.appointments.map((a) => {
            const row = a as {
              id: string;
              start_at: string;
              status: string;
              join_url: string | null;
              location_kind: string | null;
            };
            return (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {new Date(row.start_at).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                    <Clock className="w-3 h-3" /> {row.status}
                    {row.location_kind && <span>· {row.location_kind}</span>}
                  </p>
                </div>
                {row.join_url ? (
                  <a
                    href={row.join_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    <Video className="w-3.5 h-3.5" /> Join
                  </a>
                ) : (
                  <Link to="/client/appointments" className="text-xs text-accent hover:underline">
                    Details
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      );

    case "conversations":
      if (!d.conversations.length) return <Empty label="No conversations yet" />;
      return (
        <ul className="space-y-2">
          {d.conversations.map((c) => {
            const row = c as {
              id: string;
              subject: string | null;
              last_message_preview: string | null;
              last_message_at: string | null;
              unread_count: number | null;
            };
            return (
              <li key={row.id}>
                <Link
                  to="/client/conversations"
                  className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-b-0 hover:bg-muted/40 -mx-2 px-2 rounded"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{row.subject ?? "Conversation"}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {row.last_message_preview ?? "—"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">{relTime(row.last_message_at)}</p>
                    {(row.unread_count ?? 0) > 0 && (
                      <span className="mt-1 inline-block text-[11px] px-1.5 py-0.5 rounded-control bg-primary text-primary-foreground">
                        {row.unread_count}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      );

    case "orders":
      if (!d.orders.length) return <Empty label="No orders yet" />;
      return (
        <ul className="space-y-2">
          {d.orders.map((o) => {
            const row = o as {
              id: string;
              title: string;
              amount: number | null;
              currency: string | null;
              status: string | null;
            };
            return (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{row.title}</p>
                  <p className="text-xs text-muted-foreground">{row.status ?? "—"}</p>
                </div>
                <p className="text-sm font-medium">{money(row.amount, row.currency)}</p>
              </li>
            );
          })}
        </ul>
      );

    case "invoices":
      if (!d.invoices.length) return <Empty label="No invoices" />;
      return (
        <ul className="space-y-2">
          {d.invoices.map((i) => {
            const row = i as {
              id: string;
              invoice_number: string | null;
              status: string;
              total: number;
              amount_due: number | null;
              currency: string;
              due_date: string | null;
            };
            const overdue = row.status === "overdue";
            return (
              <li key={row.id}>
                <Link
                  to="/client/invoices"
                  className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-b-0 hover:bg-muted/40 -mx-2 px-2 rounded"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate inline-flex items-center gap-1.5">
                      {overdue && <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
                      {row.invoice_number ?? row.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {row.status}
                      {row.due_date
                        ? ` · due ${fmtZoned(new Date(row.due_date), { dateStyle: "medium" })}`
                        : ""}
                    </p>
                  </div>
                  <p className="text-sm font-medium">
                    {money(row.amount_due ?? row.total, row.currency)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      );

    case "payments":
      if (!d.payments.length) return <Empty label="No payments yet" />;
      return (
        <ul className="space-y-2">
          {d.payments.map((p) => {
            const row = p as {
              id: string;
              amount: number;
              currency: string;
              method: string | null;
              status: string;
              paid_at: string | null;
            };
            return (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-b-0"
              >
                <div>
                  <p className="text-sm font-medium">{money(row.amount, row.currency)}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {row.method ?? "—"} · {row.status}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">{relTime(row.paid_at)}</p>
              </li>
            );
          })}
        </ul>
      );

    case "tickets":
      if (!d.tickets.length) return <Empty label="No support tickets" />;
      return (
        <ul className="space-y-2">
          {d.tickets.map((t) => {
            const row = t as {
              id: string;
              subject: string | null;
              status: string;
              priority: string | null;
              created_at: string;
            };
            return (
              <li key={row.id}>
                <Link
                  to="/client/tickets"
                  className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-b-0 hover:bg-muted/40 -mx-2 px-2 rounded"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{row.subject}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {row.status}
                      {row.priority ? ` · ${row.priority}` : ""}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">{relTime(row.created_at)}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      );

    case "notifications":
      if (!d.notifications.length) return <Empty label="No notifications" />;
      return (
        <ul className="space-y-1">
          {d.notifications.map((n) => {
            const row = n as {
              id: string;
              title: string;
              body: string | null;
              read_at: string | null;
              created_at: string;
              action_url: string | null;
            };
            return (
              <li
                key={row.id}
                className={`py-2 border-b border-border last:border-b-0 ${!row.read_at ? "" : "opacity-70"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate inline-flex items-center gap-2">
                      {!row.read_at && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                      {row.title}
                    </p>
                    {row.body && (
                      <p className="text-xs text-muted-foreground truncate">{row.body}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {relTime(row.created_at)}
                    </p>
                  </div>
                  {!row.read_at && (
                    <button
                      onClick={() => markRead(row.id)}
                      className="text-xs text-accent hover:underline shrink-0"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      );

    case "tasks":
      if (!d.tasks.length) return <Empty label="No open tasks" />;
      return (
        <ul className="space-y-2">
          {d.tasks.map((t) => {
            const row = t as {
              id: string;
              title: string;
              priority: string | null;
              due_at: string | null;
              status: string;
            };
            return (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-b-0"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <CheckSquare className="w-3.5 h-3.5 text-accent shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm truncate">{row.title}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {row.status}
                      {row.priority ? ` · ${row.priority}` : ""}
                    </p>
                  </div>
                </div>
                {row.due_at && (
                  <p className="text-xs text-muted-foreground">
                    {fmtZoned(new Date(row.due_at), { dateStyle: "medium" })}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      );

    case "kb":
      if (!d.kb.length) return <Empty label="No help articles yet" />;
      return (
        <ul className="space-y-2">
          {d.kb.map((a) => {
            const row = a as { id: string; slug: string; title: string; summary: string | null };
            return (
              <li key={row.id}>
                <Link
                  to="/client/knowledge"
                  className="block py-2 border-b border-border last:border-b-0 hover:bg-muted/40 -mx-2 px-2 rounded"
                >
                  <p className="text-sm font-medium truncate">{row.title}</p>
                  {row.summary && (
                    <p className="text-xs text-muted-foreground truncate">{row.summary}</p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      );

    case "ai_assistant":
      return (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Ask about your account, invoices, appointments, or products — 24/7.
          </p>
          <Link
            to="/client/assistant"
            className="inline-flex items-center gap-2 h-9 px-3 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            <Sparkles className="w-4 h-4" /> Open AI Assistant <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      );
  }
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-control border border-border bg-surface px-3 py-2 min-w-[88px] text-center">
      <p className="text-lg font-semibold leading-tight">{value}</p>
      <p className="text-[11px] uppercase   text-muted-foreground">{label}</p>
    </div>
  );
}

function QA({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-2 rounded-control border border-border bg-surface p-3 hover:border-border-strong transition"
    >
      <span className="w-8 h-8 rounded-control bg-accent/10 text-accent inline-flex items-center justify-center">
        <Icon className="w-4 h-4" />
      </span>
      <span className="text-sm font-medium">{label}</span>
      <Plus className="w-3.5 h-3.5 ml-auto text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
    </Link>
  );
}
