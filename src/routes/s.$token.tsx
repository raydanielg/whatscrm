import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Star, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { sbAny } from "@/lib/supabase/untyped";

const getPublicSurvey = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ token: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: row, error } = await sbAny(supabaseAdmin)
      .from("csat_surveys")
      .select(
        "id, name, description, survey_type, questions, thank_you_message, branding, is_active",
      )
      .eq("public_token", data.token)
      .maybeSingle();
    if (error || !row) throw new Error("Survey not found");
    return row;
  });

export const Route = createFileRoute("/s/$token")({
  head: () => ({
    meta: [{ title: "Share your feedback" }, { name: "robots", content: "noindex" }],
  }),
  component: PublicSurveyPage,
  errorComponent: () => (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">
          <p className="text-lg font-medium">Survey unavailable</p>
          <p className="text-sm text-muted-foreground mt-2">
            This survey link is invalid or expired.
          </p>
        </CardContent>
      </Card>
    </div>
  ),
  notFoundComponent: () => <div className="p-10 text-center">Not found</div>,
});

type Question = {
  id: string;
  type: string;
  label: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
};

function PublicSurveyPage() {
  const { token } = Route.useParams();
  const search =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  const fetchFn = useServerFn(getPublicSurvey);
  const {
    data: survey,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["public-survey", token],
    queryFn: () => fetchFn({ data: { token } }),
    retry: false,
  });
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitted, setSubmitted] = useState<{ thank_you: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (isLoading)
    return <div className="min-h-screen flex items-center justify-center">Loading</div>;
  if (isError || !survey)
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <p className="text-lg font-medium">Survey unavailable</p>
            <p className="text-sm text-muted-foreground mt-2">
              This survey link is invalid or expired.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  const s = survey as unknown as {
    id: string;
    name: string;
    description: string | null;
    survey_type: string;
    questions: Question[];
    thank_you_message: string | null;
  };

  const setAnswer = (id: string, v: unknown) => setAnswers((prev) => ({ ...prev, [id]: v }));

  const submit = async () => {
    // Determine primary score for aggregate columns
    const first = s.questions[0];
    let rating: number | null = null;
    let nps: number | null = null;
    let ces: number | null = null;
    if (first) {
      const v = answers[first.id];
      if (first.type === "nps" && typeof v === "number") nps = v;
      else if (first.type === "ces" && typeof v === "number") ces = v;
      else if (typeof v === "number") rating = v;
    }
    // Look for any nps/ces across all questions if not primary
    for (const q of s.questions) {
      const v = answers[q.id];
      if (nps == null && q.type === "nps" && typeof v === "number") nps = v;
      if (ces == null && q.type === "ces" && typeof v === "number") ces = v;
    }
    const commentField = s.questions.find((q) => q.type === "text" || q.type === "long_text");
    const comment = commentField
      ? ((answers[commentField.id] as string | undefined) ?? null)
      : null;

    setBusy(true);
    try {
      const res = await fetch("/api/public/surveys/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          public_token: token,
          response_token: search.get("rt") || undefined,
          ticket_id: search.get("tid") || undefined,
          agent_id: search.get("aid") || undefined,
          department_id: search.get("did") || undefined,
          rating,
          nps_score: nps,
          ces_score: ces,
          score_type: s.survey_type,
          comment,
          responses: answers,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Submit failed");
      setSubmitted({ thank_you: json.thank_you });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  if (submitted)
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 mx-auto text-primary" />
            <p className="text-lg font-semibold">Thank you</p>
            <p className="text-sm text-muted-foreground">{submitted.thank_you}</p>
          </CardContent>
        </Card>
      </div>
    );

  return (
    <div className="min-h-screen p-6 bg-muted/30">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>{s.name}</CardTitle>
          {s.description && <p className="text-sm text-muted-foreground">{s.description}</p>}
        </CardHeader>
        <CardContent className="space-y-6">
          {s.questions.map((q) => (
            <div key={q.id} className="space-y-2">
              <p className="text-sm font-medium">
                {q.label}
                {q.required && <span className="text-destructive"> *</span>}
              </p>
              <QuestionInput q={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />
            </div>
          ))}
          <Button className="w-full h-9" onClick={submit} disabled={busy}>
            {busy ? "Submitting" : "Submit"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function QuestionInput({
  q,
  value,
  onChange,
}: {
  q: Question;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (q.type === "stars_5" || q.type === "csat_5") {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className="p-1"
            aria-label={`${n} stars`}
          >
            <Star
              className={`w-8 h-8 ${typeof value === "number" && value >= n ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
            />
          </button>
        ))}
      </div>
    );
  }
  if (q.type === "stars_10") {
    return (
      <div className="flex gap-1 flex-wrap">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`w-9 h-9 rounded border text-sm ${value === n ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {n}
          </button>
        ))}
      </div>
    );
  }
  if (q.type === "emoji_5") {
    const emojis = ["😡", "😞", "😐", "🙂", "😍"];
    return (
      <div className="flex gap-2">
        {emojis.map((e, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i + 1)}
            className={`text-3xl p-2 rounded ${value === i + 1 ? "bg-primary/10 ring-2 ring-primary" : "hover:bg-muted"}`}
          >
            {e}
          </button>
        ))}
      </div>
    );
  }
  if (q.type === "emoji_3") {
    const emojis = ["😞", "😐", "😍"];
    return (
      <div className="flex gap-2">
        {emojis.map((e, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i + 1)}
            className={`text-3xl p-2 rounded ${value === i + 1 ? "bg-primary/10 ring-2 ring-primary" : "hover:bg-muted"}`}
          >
            {e}
          </button>
        ))}
      </div>
    );
  }
  if (q.type === "nps") {
    return (
      <div>
        <div className="flex gap-1 flex-wrap">
          {Array.from({ length: 11 }, (_, i) => i).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`w-9 h-9 rounded border text-sm font-medium ${value === n ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>Not at all likely</span>
          <span>Extremely likely</span>
        </div>
      </div>
    );
  }
  if (q.type === "ces") {
    const labels = [
      "Strongly disagree",
      "Disagree",
      "Somewhat disagree",
      "Neutral",
      "Somewhat agree",
      "Agree",
      "Strongly agree",
    ];
    return (
      <div className="flex gap-1 flex-wrap">
        {labels.map((lbl, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i + 1)}
            title={lbl}
            className={`px-3 h-9 rounded border text-xs ${value === i + 1 ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    );
  }
  if (q.type === "yes_no") {
    return (
      <div className="flex gap-2">
        {["yes", "no"].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`px-4 h-9 rounded border capitalize ${value === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {v}
          </button>
        ))}
      </div>
    );
  }
  if (q.type === "single_choice" && q.options) {
    return (
      <div className="flex flex-col gap-2">
        {q.options.map((o) => (
          <label key={o} className="flex items-center gap-2 text-sm">
            <input type="radio" checked={value === o} onChange={() => onChange(o)} />
            {o}
          </label>
        ))}
      </div>
    );
  }
  if (q.type === "multi_choice" && q.options) {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="flex flex-col gap-2">
        {q.options.map((o) => (
          <div key={o} className="flex items-center gap-2 text-sm">
            <Checkbox
              id={`mc-${o}`}
              checked={arr.includes(o)}
              onCheckedChange={(v) => {
                onChange(v === true ? [...arr, o] : arr.filter((x) => x !== o));
              }}
            />
            <Label htmlFor={`mc-${o}`} className="font-normal">
              {o}
            </Label>
          </div>
        ))}
      </div>
    );
  }
  return (
    <Textarea
      value={(value as string) ?? ""}
      placeholder={q.placeholder}
      onChange={(e) => onChange(e.target.value)}
      rows={q.type === "long_text" ? 5 : 3}
    />
  );
}
