import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { slaMonitor } from "@/lib/helpdesk/helpdesk.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Timer, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/helpdesk/sla")({
  component: SlaMonitor,
});

function SlaMonitor() {
  const fn = useServerFn(slaMonitor);
  const { data = [], isLoading } = useQuery({
    queryKey: ["helpdesk-sla-monitor"],
    queryFn: () => fn(),
    refetchInterval: 30_000,
  });

  const rows = data as Array<{
    id: string; ticket_id: string; state: string;
    minutes_to_resolution: number | null; minutes_to_first_response: number | null;
    conversations: { id: string; subject: string | null; status: string; priority: string; assigned_to: string | null };
  }>;

  const breached = rows.filter((r) => r.state === "breached");
  const atRisk = rows.filter((r) => r.state === "at_risk");
  const ok = rows.filter((r) => r.state === "ok");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Breached" count={breached.length} icon={AlertTriangle} tone="red" />
        <StatCard label="At risk" count={atRisk.length} icon={Timer} tone="orange" />
        <StatCard label="On track" count={ok.length} icon={CheckCircle2} tone="green" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Active SLAs</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="p-6 text-sm text-muted-foreground">Loading</div> :
            rows.length === 0 ? <div className="p-6 text-sm text-muted-foreground">No SLAs attached yet. Open a ticket and click "Attach default SLA".</div> :
            <div className="divide-y">
              {rows.map((r) => (
                <Link key={r.id} to="/helpdesk/$id" params={{ id: r.ticket_id }}
                  className="flex items-center gap-3 p-4 hover:bg-muted">
                  <StateBadge state={r.state} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.conversations?.subject || "(no subject)"}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.conversations?.priority} · {r.conversations?.status}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className={r.state === "breached" ? "text-red-600 font-medium" : r.state === "at_risk" ? "text-orange-600" : "text-muted-foreground"}>
                      {r.minutes_to_resolution !== null
                        ? r.minutes_to_resolution < 0
                          ? `Overdue ${Math.abs(r.minutes_to_resolution)}m`
                          : `${r.minutes_to_resolution}m to resolve`
                        : "—"}
                    </div>
                    <div className="text-muted-foreground">
                      {r.minutes_to_first_response !== null && r.minutes_to_first_response < 0 ? "First response overdue" : "First response ok"}
                    </div>
                  </div>
                </Link>
              ))}
            </div>}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, count, icon: Icon, tone }: { label: string; count: number; icon: typeof AlertTriangle; tone: "red" | "orange" | "green" }) {
  const toneClass = tone === "red" ? "text-red-600" : tone === "orange" ? "text-orange-600" : "text-green-600";
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className={`h-8 w-8 ${toneClass}`} />
        <div>
          <div className="text-2xl font-semibold">{count}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function StateBadge({ state }: { state: string }) {
  if (state === "breached") return <Badge variant="destructive">Breached</Badge>;
  if (state === "at_risk") return <Badge className="bg-orange-500/15 text-orange-600 border-orange-300">At risk</Badge>;
  return <Badge variant="outline">OK</Badge>;
}
