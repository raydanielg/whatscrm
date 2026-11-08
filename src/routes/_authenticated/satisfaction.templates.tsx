import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listTemplates, useTemplate } from "@/lib/satisfaction/satisfaction.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/satisfaction/templates")({
  component: TemplatesPage,
});

type Tpl = { id: string; name: string; description: string | null; survey_type: string; category: string | null; icon: string | null; is_system: boolean; usage_count: number };

function TemplatesPage() {
  const listFn = useServerFn(listTemplates);
  const useFn = useServerFn(useTemplate);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["satisfaction-templates"], queryFn: () => listFn() });
  const use = useMutation({
    mutationFn: (id: string) => useFn({ data: { template_id: id } }),
    onSuccess: () => { toast.success("Survey created from template"); qc.invalidateQueries({ queryKey: ["satisfaction-surveys"] }); navigate({ to: "/satisfaction" }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const list = data as unknown as Tpl[];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Survey templates</h2>
        <p className="text-sm text-muted-foreground">Start from a battle-tested preset or save your own.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {list.map((t) => (
          <Card key={t.id}>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2">
              {t.name}
              <Badge variant="outline" className="uppercase text-xs">{t.survey_type}</Badge>
              {t.is_system && <Badge variant="secondary" className="text-xs">System</Badge>}
            </CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{t.description}</p>
              <div className="flex items-center justify-between">
                {t.category && <Badge variant="outline" className="text-xs">{t.category}</Badge>}
                <span className="text-xs text-muted-foreground">Used {t.usage_count} ×</span>
              </div>
              <Button size="sm" className="h-9 w-full" onClick={() => use.mutate(t.id)}>Use template</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
