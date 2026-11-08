import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCsatSurveys, saveCsatSurvey, csatSummary } from "@/lib/helpdesk/helpdesk.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Star, TrendingUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/helpdesk/csat")({
  component: CsatPage,
});

type Survey = {
  id: string;
  name: string;
  question: string;
  scale: string;
  channel: string;
  is_active: boolean;
};

function CsatPage() {
  const fmtZoned = useZonedDateFormatter();
  const listFn = useServerFn(listCsatSurveys);
  const saveFn = useServerFn(saveCsatSurvey);
  const summaryFn = useServerFn(csatSummary);
  const qc = useQueryClient();
  const { data: surveys = [] } = useQuery({
    queryKey: ["helpdesk-csat-surveys"],
    queryFn: () => listFn(),
  });
  const { data: summary } = useQuery({
    queryKey: ["helpdesk-csat-summary"],
    queryFn: () => summaryFn(),
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Survey> | null>(null);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          id: editing?.id,
          name: editing?.name ?? "",
          question: editing?.question ?? "How would you rate this support experience?",
          scale: (editing?.scale ?? "stars_5") as never,
          channel: (editing?.channel ?? "email") as never,
          is_active: editing?.is_active ?? true,
          send_on: "resolved" as const,
          delay_minutes: 0,
        } as never,
      }),
    onSuccess: () => {
      toast.success("Saved");
      setOpen(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["helpdesk-csat-surveys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const s = summary as
    | {
        total: number;
        csat_avg: number;
        nps: number;
        recent: Array<{
          rating: number;
          score_type: string;
          comment: string | null;
          submitted_at: string;
          sentiment: string | null;
        }>;
      }
    | undefined;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Responses (30d)</div>
            <div className="text-2xl font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              {s?.total ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">CSAT avg</div>
            <div className="text-2xl font-semibold flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500" />
              {s?.csat_avg ?? 0}/5
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">NPS</div>
            <div
              className={`text-2xl font-semibold ${(s?.nps ?? 0) >= 30 ? "text-green-600" : (s?.nps ?? 0) < 0 ? "text-red-600" : ""}`}
            >
              {s?.nps ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Surveys</h2>
        <Button
          onClick={() => {
            setEditing({
              name: "",
              question: "How would you rate this support experience?",
              scale: "stars_5",
              channel: "email",
              is_active: true,
            });
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4 " /> New survey
        </Button>
      </div>
      <Card>
        <CardContent className="p-0 divide-y">
          {(surveys as Survey[]).length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground text-center">
              No CSAT surveys configured.
            </div>
          ) : (
            (surveys as Survey[]).map((sv) => (
              <div key={sv.id} className="flex items-center gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{sv.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{sv.question}</div>
                </div>
                <Badge variant="outline">{sv.scale}</Badge>
                <Badge variant="outline">{sv.channel}</Badge>
                {sv.is_active ? <Badge>Active</Badge> : <Badge variant="secondary">Off</Badge>}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(sv);
                    setOpen(true);
                  }}
                >
                  Edit
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent responses</CardTitle>
        </CardHeader>
        <CardContent className="p-0 divide-y">
          {(s?.recent ?? []).length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No responses yet.</div>
          ) : (
            (s?.recent ?? []).map((r, i) => (
              <div key={i} className="p-4 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{r.score_type}</Badge>
                  <span className="font-medium">{r.rating}</span>
                  {r.sentiment && (
                    <Badge variant="secondary" className="text-xs">
                      {r.sentiment}
                    </Badge>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {fmtZoned(new Date(r.submitted_at), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                {r.comment && <div className="text-muted-foreground mt-1">{r.comment}</div>}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit survey" : "New survey"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                value={editing?.name ?? ""}
                onChange={(e) => setEditing((v) => ({ ...v, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Question</Label>
              <Input
                value={editing?.question ?? ""}
                onChange={(e) => setEditing((v) => ({ ...v, question: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Scale</Label>
                <Select
                  value={editing?.scale ?? "stars_5"}
                  onValueChange={(v) => setEditing((s) => ({ ...s, scale: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stars_5">5-star CSAT</SelectItem>
                    <SelectItem value="nps_10">NPS (0-10)</SelectItem>
                    <SelectItem value="thumbs">Thumbs up/down</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Channel</Label>
                <Select
                  value={editing?.channel ?? "email"}
                  onValueChange={(v) => setEditing((s) => ({ ...s, channel: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="in_app">In-app</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="active"
                checked={editing?.is_active ?? true}
                onCheckedChange={(v) => setEditing((s) => ({ ...s, is_active: v }))}
              />
              <Label htmlFor="active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !editing?.name}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
