import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, BookOpen, Check, ChevronRight, Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { aiSuggestSelfHelp, createTicket } from "@/lib/client-portal/portal.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/client/tickets/new")({
  component: NewTicketPage,
});

type Priority = "low" | "normal" | "high" | "urgent";
type Step = "compose" | "review" | "submitted";

function NewTicketPage() {
  const router = useRouter();
  const suggestFn = useServerFn(aiSuggestSelfHelp);
  const createFn = useServerFn(createTicket);

  const [step, setStep] = useState<Step>("compose");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [category, setCategory] = useState<string>("general");

  const suggest = useMutation({
    mutationFn: () => suggestFn({ data: { subject, body } }),
    onSuccess: () => setStep("review"),
    onError: () => setStep("review"), // still show manual submit
  });

  const create = useMutation({
    mutationFn: () => createFn({ data: { subject, body, priority } }),
    onSuccess: (r) => {
      toast.success("Ticket submitted");
      router.navigate({ to: "/client/tickets/$id", params: { id: r.id } });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to submit"),
  });

  const disabled = subject.trim().length < 3 || body.trim().length < 3;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <Link to="/client/tickets" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to support
      </Link>

      {/* Progress */}
      <div className="flex items-center gap-2 text-xs">
        <StepDot label="Describe" active={step === "compose"} done={step !== "compose"} />
        <div className="flex-1 h-px bg-border" />
        <StepDot label="Self-service" active={step === "review"} done={step === "submitted"} />
        <div className="flex-1 h-px bg-border" />
        <StepDot label="Submit" active={step === "submitted"} done={false} />
      </div>

      {step === "compose" && (
        <section className="rounded-control border border-border bg-surface p-6">
          <h1 className="font-display text-2xl font-semibold">Contact support</h1>
          <p className="text-sm text-muted-foreground mt-1">Tell us what's going on. We'll first check if there's a quick answer for you.</p>

          <div className="mt-5 space-y-4">
            <div>
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="A brief summary of your issue" maxLength={200} />
            </div>
            <div>
              <Label>Details</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={4000}
                placeholder="Include steps to reproduce, error messages, and anything you've already tried." />
              <p className="mt-1 text-[11px] text-muted-foreground">{body.length}/4000</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="billing">Billing</SelectItem>
                    <SelectItem value="technical">Technical</SelectItem>
                    <SelectItem value="bug">Bug report</SelectItem>
                    <SelectItem value="feature_request">Feature request</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Link to="/client/tickets"><Button variant="ghost">Cancel</Button></Link>
            <Button disabled={disabled || suggest.isPending} onClick={() => suggest.mutate()}>
              {suggest.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
              Check self-service options
            </Button>
          </div>
        </section>
      )}

      {step === "review" && (
        <section className="space-y-4">
          {/* AI summary + suggestions */}
          <div className="rounded-control border border-accent/40 bg-gradient-to-br from-accent/5 to-surface p-5">
            <div className="flex items-center gap-2 text-xs uppercase text-accent font-medium mb-2">
              <Sparkles className="w-3.5 h-3.5" /> AI self-service suggestions
            </div>
            {suggest.isPending ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Analyzing</div>
            ) : (
              <>
                {suggest.data?.summary && <p className="text-sm">{suggest.data.summary}</p>}
                {(suggest.data?.steps?.length ?? 0) > 0 && (
                  <div className="mt-3">
                    <p className="text-xs uppercase text-muted-foreground mb-1.5">Try these steps</p>
                    <ol className="space-y-1.5">
                      {suggest.data!.steps.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="w-5 h-5 rounded-full bg-accent/10 text-accent text-[11px] font-medium flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {(suggest.data?.articles?.length ?? 0) > 0 && (
                  <div className="mt-4">
                    <p className="text-xs uppercase text-muted-foreground mb-1.5">Suggested articles</p>
                    <ul className="space-y-1.5">
                      {suggest.data!.articles.map((a) => (
                        <li key={a.id}>
                          <Link to="/client/knowledge"
                            className="flex items-center gap-2 rounded-control border border-border bg-background p-2.5 hover:border-border-strong transition-colors group">
                            <BookOpen className="w-4 h-4 text-accent shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{a.title}</p>
                              {a.summary && <p className="text-xs text-muted-foreground truncate">{a.summary}</p>}
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-accent" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!suggest.data?.summary && !suggest.data?.steps?.length && !suggest.data?.articles?.length && (
                  <p className="text-sm text-muted-foreground">No self-service match found — our team will help you directly.</p>
                )}
              </>
            )}
          </div>

          {/* Confirm submission */}
          <div className="rounded-control border border-border bg-surface p-5">
            <h2 className="text-base font-semibold">Still need help?</h2>
            <p className="text-sm text-muted-foreground mt-1">Submit your ticket and a support agent will follow up.</p>

            <dl className="mt-4 text-sm space-y-1.5">
              <div className="flex gap-2"><dt className="text-muted-foreground w-20 shrink-0">Subject</dt><dd className="font-medium">{subject}</dd></div>
              <div className="flex gap-2"><dt className="text-muted-foreground w-20 shrink-0">Priority</dt><dd className="capitalize">{priority}</dd></div>
              <div className="flex gap-2"><dt className="text-muted-foreground w-20 shrink-0">Category</dt><dd className="capitalize">{category.replace("_", " ")}</dd></div>
            </dl>

            <div className="mt-5 flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep("compose")}>Back</Button>
              <div className="flex gap-2">
                <Link to="/client/knowledge"><Button variant="outline">Browse help center</Button></Link>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  {create.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
                  Submit ticket
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function StepDot({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 ${active ? "text-accent" : done ? "text-foreground" : "text-muted-foreground"}`}>
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold ${
        active ? "bg-accent text-accent-foreground" : done ? "bg-foreground/10" : "bg-muted"
      }`}>
        {done ? <Check className="w-3 h-3" /> : "•"}
      </div>
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}
