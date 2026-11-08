import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { agentRatings } from "@/lib/satisfaction/satisfaction.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/satisfaction/agents")({
  component: AgentsPage,
});

function AgentsPage() {
  const [days, setDays] = useState(30);
  const fn = useServerFn(agentRatings);
  const { data = [] } = useQuery({ queryKey: ["satisfaction-agents", days], queryFn: () => fn({ data: { days } }) });
  const list = data as unknown as Array<{ agent_id: string; name: string; avatar_url: string | null; response_count: number; csat_avg: number; csat_pct: number; nps: number; ces_avg: number }>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Agent ratings</h2>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{[7, 30, 60, 90, 180, 365].map((d) => <SelectItem key={d} value={String(d)}>{d} days</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Card><CardHeader><CardTitle className="text-base">Leaderboard</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr><th className="p-3">Agent</th><th className="p-3">Responses</th><th className="p-3">CSAT avg</th><th className="p-3">CSAT %</th><th className="p-3">NPS</th><th className="p-3">CES</th></tr>
            </thead>
            <tbody>
              {list.map((a, i) => (
                <tr key={a.agent_id} className="border-b">
                  <td className="p-3"><div className="flex items-center gap-2">
                    <span className="w-6 text-xs text-muted-foreground">#{i + 1}</span>
                    <Avatar className="w-7 h-7"><AvatarImage src={a.avatar_url ?? undefined} /><AvatarFallback>{a.name.charAt(0)}</AvatarFallback></Avatar>
                    <span>{a.name}</span>
                  </div></td>
                  <td className="p-3">{a.response_count}</td>
                  <td className="p-3"><Badge variant={a.csat_avg >= 4 ? "default" : a.csat_avg >= 3 ? "secondary" : "destructive"}>{a.csat_avg.toFixed(2)}</Badge></td>
                  <td className="p-3">{a.csat_pct}%</td>
                  <td className="p-3">{a.nps}</td>
                  <td className="p-3">{a.ces_avg.toFixed(2)}</td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">No agent-scoped responses yet.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
