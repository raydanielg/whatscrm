import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listSurveys,
  saveSurvey,
  deleteSurvey,
  duplicateSurvey,
  sendSurvey,
} from "@/lib/satisfaction/satisfaction.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Copy, Trash2, Send, ExternalLink, GripVertical, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/satisfaction/")({
  component: SurveysPage,
});

type Question = {
  id: string;
  type: string;
  label: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
};
type Survey = {
  id?: string;
  name: string;
  description?: string | null;
  survey_type: "csat" | "nps" | "ces" | "custom";
  questions: Question[];
  scale: string;
  channel: string;
  send_on: string;
  delay_minutes: number;
  is_active: boolean;
  public_token?: string;
  thank_you_message?: string | null;
};

const QUESTION_TYPES = [
  { value: "stars_5", label: "5-star rating" },
  { value: "stars_10", label: "10-point rating" },
  { value: "emoji_5", label: "Emoji (5)" },
  { value: "emoji_3", label: "Emoji (3)" },
  { value: "nps", label: "NPS (0–10)" },
  { value: "ces", label: "CES (1–7)" },
  { value: "text", label: "Short text" },
  { value: "long_text", label: "Long text / review" },
  { value: "yes_no", label: "Yes / No" },
  { value: "single_choice", label: "Single choice" },
  { value: "multi_choice", label: "Multi choice" },
];

function SurveysPage() {
  const listFn = useServerFn(listSurveys);
  const saveFn = useServerFn(saveSurvey);
  const delFn = useServerFn(deleteSurvey);
  const dupFn = useServerFn(duplicateSurvey);
  const sendFn = useServerFn(sendSurvey);
  const qc = useQueryClient();
  const { data: surveys = [] } = useQuery({
    queryKey: ["satisfaction-surveys"],
    queryFn: () => listFn({ data: {} }),
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Survey | null>(null);

  const create = () => {
    setEditing({
      name: "",
      survey_type: "csat",
      questions: [
        { id: "q1", type: "stars_5", label: "How would you rate this experience?", required: true },
      ],
      scale: "stars_5",
      channel: "email",
      send_on: "resolved",
      delay_minutes: 0,
      is_active: true,
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: () => saveFn({ data: editing as never }),
    onSuccess: () => {
      toast.success("Saved");
      setOpen(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["satisfaction-surveys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["satisfaction-surveys"] });
    },
  });
  const dup = useMutation({
    mutationFn: (id: string) => dupFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Duplicated");
      qc.invalidateQueries({ queryKey: ["satisfaction-surveys"] });
    },
  });

  const copyLink = async (token: string) => {
    const link = `${window.location.origin}/s/${token}`;
    await navigator.clipboard.writeText(link);
    toast.success("Public link copied");
  };

  const sendTest = async (id: string) => {
    try {
      const res = await sendFn({ data: { survey_id: id } });
      toast.success(`Sent (${res.channel})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const updateQ = (idx: number, patch: Partial<Question>) => {
    if (!editing) return;
    const qs = [...editing.questions];
    qs[idx] = { ...qs[idx], ...patch };
    setEditing({ ...editing, questions: qs });
  };
  const addQ = () =>
    editing &&
    setEditing({
      ...editing,
      questions: [
        ...editing.questions,
        { id: `q${Date.now()}`, type: "text", label: "Additional feedback" },
      ],
    });
  const removeQ = (idx: number) =>
    editing && setEditing({ ...editing, questions: editing.questions.filter((_, i) => i !== idx) });

  const list = surveys as unknown as Array<
    Survey & { id: string; public_token: string; created_at: string }
  >;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Surveys</h2>
          <p className="text-sm text-muted-foreground">
            Create CSAT, NPS, CES and custom feedback forms.
          </p>
        </div>
        <Button className="h-9" onClick={create}>
          <Plus className="w-4 h-4 " />
          New Survey
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {list.map((s) => (
          <Card key={s.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{s.name}</CardTitle>
                <Badge variant={s.is_active ? "default" : "secondary"}>
                  {s.is_active ? "Active" : "Draft"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="uppercase text-xs">
                  {s.survey_type}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {s.channel}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {s.questions?.length ?? 0} questions
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9"
                  onClick={() => {
                    setEditing(s);
                    setOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9"
                  onClick={() => copyLink(s.public_token)}
                >
                  <ExternalLink className="w-3 h-3 " />
                  Link
                </Button>
                <Button size="sm" variant="outline" className="h-9" onClick={() => sendTest(s.id)}>
                  <Send className="w-3 h-3 " />
                  Send
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9"
                  onClick={() => dup.mutate(s.id)}
                >
                  <Copy className="w-3 h-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 text-destructive"
                  onClick={() => {
                    if (confirm("Delete survey?")) del.mutate(s.id);
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {list.length === 0 && (
          <Card className="md:col-span-2 lg:col-span-3">
            <CardContent className="p-10 text-center text-muted-foreground">
              No surveys yet. Create your first survey or start from a template.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit survey" : "New survey"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Type</Label>
                  <Select
                    value={editing.survey_type}
                    onValueChange={(v) =>
                      setEditing({ ...editing, survey_type: v as Survey["survey_type"] })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="csat">CSAT</SelectItem>
                      <SelectItem value="nps">NPS</SelectItem>
                      <SelectItem value="ces">CES</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  rows={2}
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <Label>Channel</Label>
                  <Select
                    value={editing.channel}
                    onValueChange={(v) => setEditing({ ...editing, channel: v })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["email", "sms", "whatsapp", "in_app", "web"].map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Send on</Label>
                  <Select
                    value={editing.send_on}
                    onValueChange={(v) => setEditing({ ...editing, send_on: v })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="resolved">Ticket resolved</SelectItem>
                      <SelectItem value="appointment">Appointment complete</SelectItem>
                      <SelectItem value="purchase">Purchase</SelectItem>
                      <SelectItem value="manual">Manual only</SelectItem>
                      <SelectItem value="workflow">From workflow</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Delay (minutes)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editing.delay_minutes}
                    onChange={(e) =>
                      setEditing({ ...editing, delay_minutes: Number(e.target.value) || 0 })
                    }
                  />
                </div>
              </div>
              <div>
                <Label>Thank-you message</Label>
                <Textarea
                  rows={2}
                  value={editing.thank_you_message ?? ""}
                  onChange={(e) => setEditing({ ...editing, thank_you_message: e.target.value })}
                  placeholder="Thanks for helping us improve!"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editing.is_active}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
                <Label>Active</Label>
              </div>

              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center justify-between">
                  <Label>Questions</Label>
                  <Button size="sm" variant="outline" className="h-9" onClick={addQ}>
                    <Plus className="w-3 h-3 " />
                    Add
                  </Button>
                </div>
                {editing.questions.map((q, i) => (
                  <Card key={q.id}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <GripVertical className="w-4 h-4 text-muted-foreground" />
                        <Select value={q.type} onValueChange={(v) => updateQ(i, { type: v })}>
                          <SelectTrigger className="h-9 w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {QUESTION_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-1 text-xs ml-auto">
                          <Checkbox
                            id={`q-required-${i}`}
                            checked={!!q.required}
                            onCheckedChange={(v) => updateQ(i, { required: v === true })}
                          />
                          <Label htmlFor={`q-required-${i}`} className="font-normal text-xs">
                            Required
                          </Label>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => removeQ(i)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      <Input
                        value={q.label}
                        onChange={(e) => updateQ(i, { label: e.target.value })}
                        placeholder="Question label"
                      />
                      {(q.type === "single_choice" || q.type === "multi_choice") && (
                        <Textarea
                          rows={2}
                          placeholder="One option per line"
                          value={(q.options ?? []).join("\n")}
                          onChange={(e) =>
                            updateQ(i, {
                              options: e.target.value
                                .split("\n")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="h-9"
              onClick={() => save.mutate()}
              disabled={save.isPending || !editing?.name}
            >
              {save.isPending ? "Saving" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
