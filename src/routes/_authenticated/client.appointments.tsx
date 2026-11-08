import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CalendarClock, Loader2, MapPin, Star, Video, Settings2, ChevronRight } from "lucide-react";
import { listMyAppointments } from "@/lib/client-portal/portal.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/client/appointments")({
  component: AppointmentsListPage,
});

type Tab = "upcoming" | "past";

function AppointmentsListPage() {
  const listFn = useServerFn(listMyAppointments);
  const q = useQuery({ queryKey: ["portal-appointments"], queryFn: () => listFn() });
  const [tab, setTab] = useState<Tab>("upcoming");
  const now = Date.now();
  const all = q.data ?? [];
  const filtered = all.filter((a) => {
    const isPast = new Date(a.end_at).getTime() < now || a.status === "completed" || a.status === "cancelled" || a.status === "no_show";
    return tab === "past" ? isPast : !isPast;
  });

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl font-semibold">Appointments</h2>
          <p className="text-sm text-muted-foreground">Manage your scheduled meetings.</p>
        </div>
        <Link to="/client/appointments/preferences">
          <Button variant="outline" size="sm"><Settings2 className="w-3.5 h-3.5 " /> Reminder preferences</Button>
        </Link>
      </header>

      <div className="inline-flex rounded-control border border-border bg-surface p-0.5 text-sm">
        {(["upcoming", "past"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-control capitalize transition-colors ${tab === t ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-control border border-border bg-surface p-10 text-center">
          <CalendarClock className="w-8 h-8 mx-auto text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">No {tab} appointments.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((a) => {
            const start = new Date(a.start_at);
            const end = new Date(a.end_at);
            return (
              <li key={a.id}>
                <Link
                  to="/client/appointments/$id" params={{ id: a.id }}
                  className="group flex items-center gap-4 rounded-control border border-border bg-surface p-4 hover:border-border-strong transition-colors"
                >
                  <div className="w-14 shrink-0 rounded-control bg-accent/10 text-accent flex flex-col items-center justify-center py-2">
                    <span className="text-[11px] uppercase font-medium">{start.toLocaleString(undefined, { month: "short" })}</span>
                    <span className="text-lg font-semibold leading-none">{start.getDate()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{a.customer_name || "Meeting"}</p>
                      <Badge variant={a.status === "cancelled" || a.status === "no_show" ? "destructive" : a.status === "completed" ? "outline" : "default"} className="capitalize">{a.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                      <span>{start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – {end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      {a.location_kind === "video" ? <span className="inline-flex items-center gap-1"><Video className="w-3 h-3" /> Video</span>
                        : a.location_kind === "in_person" ? <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> In person</span>
                        : a.location_kind && <span className="capitalize">{a.location_kind}</span>}
                    </p>
                  </div>
                  {tab === "past" && a.status === "completed" && <Star className="w-4 h-4 text-muted-foreground/40 group-hover:text-amber-500" />}
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-accent" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
