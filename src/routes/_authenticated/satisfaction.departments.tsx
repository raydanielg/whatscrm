import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { departmentRatings } from "@/lib/satisfaction/satisfaction.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/satisfaction/departments")({
  component: DepartmentsPage,
});

function DepartmentsPage() {
  const [days, setDays] = useState(30);
  const fn = useServerFn(departmentRatings);
  const { data = [] } = useQuery({ queryKey: ["satisfaction-departments", days], queryFn: () => fn({ data: { days } }) });
  const list = data as unknown as Array<{ department_id: string; name: string; response_count: number; csat_avg: number; csat_pct: number; nps: number; ces_avg: number }>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Department ratings</h2>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{[7, 30, 60, 90, 180, 365].map((d) => <SelectItem key={d} value={String(d)}>{d} days</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {list.map((d) => (
          <Card key={d.department_id}>
            <CardHeader className="pb-2"><CardTitle className="text-base">{d.name}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant={d.csat_avg >= 4 ? "default" : d.csat_avg >= 3 ? "secondary" : "destructive"}>{d.csat_avg.toFixed(2)} CSAT</Badge>
                <Badge variant="outline">NPS {d.nps}</Badge>
                <Badge variant="outline">CES {d.ces_avg.toFixed(2)}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{d.response_count} responses · {d.csat_pct}% satisfied</p>
            </CardContent>
          </Card>
        ))}
        {list.length === 0 && <Card className="md:col-span-2 lg:col-span-3"><CardContent className="p-10 text-center text-muted-foreground">No department-scoped responses yet.</CardContent></Card>}
      </div>
    </div>
  );
}
