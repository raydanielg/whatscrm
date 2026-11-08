import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import * as Icons from "lucide-react";
import { Loader2, Sparkles, FileText, Zap, ArrowRight, Check, AlertCircle, CheckCircle2 } from "lucide-react";

import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WORKFLOW_TEMPLATES } from "@/lib/workflows/templates";
import type { WorkflowGraph } from "@/lib/workflows/types";
import { ScrollArea } from "@/components/ui/scroll-area";

type TriggerOption = {
  type: string;
  label: string;
  description: string;
  icon: keyof typeof Icons;
  group: string;
};

const CURATED_TRIGGERS: TriggerOption[] = [
  { type: "trigger.message.received", label: "Message received", description: "When a customer sends a message on any channel.", icon: "MessageSquare", group: "Messaging" },
  { type: "trigger.conversation.created", label: "Conversation started", description: "When a new conversation opens.", icon: "MessagesSquare", group: "Messaging" },
  { type: "trigger.conversation.closed", label: "Conversation closed", description: "When a conversation is resolved or closed.", icon: "CheckCircle2", group: "Messaging" },
  { type: "trigger.contact.created", label: "Contact created", description: "When a new contact is added.", icon: "UserPlus", group: "CRM" },
  { type: "trigger.lead.created", label: "Lead created", description: "When a new lead is captured.", icon: "UserCheck", group: "CRM" },
  { type: "trigger.deal.stage_changed", label: "Deal stage changed", description: "When a deal moves to a new pipeline stage.", icon: "TrendingUp", group: "Sales" },
  { type: "trigger.deal.won", label: "Deal won", description: "When a deal is marked won.", icon: "Trophy", group: "Sales" },
  { type: "trigger.schedule.cron", label: "On schedule", description: "Run on a recurring schedule (cron).", icon: "Clock", group: "Schedule" },
  { type: "trigger.webhook", label: "Webhook", description: "Trigger from an inbound HTTP webhook.", icon: "Webhook", group: "Integration" },
];

const VALID_TRIGGER_TYPES = CURATED_TRIGGERS.map((t) => t.type) as [string, ...string[]];
const VALID_TEMPLATE_IDS = WORKFLOW_TEMPLATES.map((t) => t.id) as [string, ...string[]];

const NAME_MAX = 80;
const DESC_MAX = 240;

const basicsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Name must be at least 3 characters")
    .max(NAME_MAX, `Name must be under ${NAME_MAX} characters`)
    .regex(/^[\p{L}\p{N}][\p{L}\p{N} \-_.,'&()\/]*$/u, "Use letters, numbers and simple punctuation only"),
  description: z
    .string()
    .trim()
    .min(10, "Add a short description (at least 10 characters)")
    .max(DESC_MAX, `Description must be under ${DESC_MAX} characters`),
  mode: z.enum(["blank", "template"]),
});

const triggerSchema = z.object({
  trigger: z.enum(VALID_TRIGGER_TYPES, { message: "Select a trigger to continue" }),
});

const templateSchema = z.object({
  templateId: z.enum(VALID_TEMPLATE_IDS, { message: "Select a template to continue" }),
});

type Mode = "blank" | "template";
type Step = "basics" | "trigger" | "template";
type FieldKey = "name" | "description" | "mode" | "trigger" | "templateId";
type Errors = Partial<Record<FieldKey, string>>;
type Touched = Partial<Record<FieldKey, boolean>>;

export function NewFlowDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = React.useState<Step>("basics");
  const [mode, setMode] = React.useState<Mode>("blank");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [trigger, setTrigger] = React.useState<string>("");
  const [templateId, setTemplateId] = React.useState<string | null>(null);
  const [templateQuery, setTemplateQuery] = React.useState("");
  const [touched, setTouched] = React.useState<Touched>({});

  React.useEffect(() => {
    if (open) {
      setStep("basics");
      setMode("blank");
      setName("");
      setDescription("");
      setTrigger("");
      setTemplateId(null);
      setTemplateQuery("");
      setTouched({});
    }
  }, [open]);

  // Debounce name for async uniqueness check.
  const [debouncedName, setDebouncedName] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedName(name.trim()), 350);
    return () => clearTimeout(t);
  }, [name]);

  // Always create inside the workspace the user is actually looking at.
  // Picking an arbitrary membership row put workflows in the wrong tenant.
  const { active: activeWorkspace } = useCurrentWorkspace();
  const workspaceId = activeWorkspace?.id;

  // Async uniqueness check — only runs when the name passes basic client validation.
  const nameSyntaxOk = React.useMemo(
    () => basicsSchema.pick({ name: true }).safeParse({ name: debouncedName }).success,
    [debouncedName],
  );

  const nameCheckQ = useQuery({
    queryKey: ["workflow-name-check", workspaceId, debouncedName.toLowerCase()],
    enabled: open && !!workspaceId && nameSyntaxOk,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automations")
        .select("id, name")
        .eq("workspace_id", workspaceId!)
        .ilike("name", debouncedName)
        .limit(1);
      if (error) throw error;
      return (data?.[0] ?? null) as { id: string; name: string } | null;
    },
  });

  const nameChecking =
    nameSyntaxOk && (nameCheckQ.isFetching || debouncedName !== name.trim());
  const nameTaken = !!nameCheckQ.data;

  // Live validation — errors reflect current values regardless of touched state.
  const errors: Errors = React.useMemo(() => {
    const e: Errors = {};
    const basics = basicsSchema.safeParse({ name, description, mode });
    if (!basics.success) {
      for (const issue of basics.error.issues) {
        const key = issue.path[0] as FieldKey;
        if (!e[key]) e[key] = issue.message;
      }
    }
    if (!e.name && nameTaken) {
      e.name = `"${nameCheckQ.data?.name ?? name.trim()}" already exists in this workspace`;
    }
    if (step !== "basics" && mode === "blank") {
      const t = triggerSchema.safeParse({ trigger });
      if (!t.success) e.trigger = t.error.issues[0].message;
    }
    if (step !== "basics" && mode === "template") {
      const t = templateSchema.safeParse({ templateId: templateId ?? "" });
      if (!t.success) e.templateId = t.error.issues[0].message;
    }
    return e;
  }, [name, description, mode, trigger, templateId, step, nameTaken, nameCheckQ.data]);

  const markTouched = (k: FieldKey) => setTouched((prev) => ({ ...prev, [k]: true }));
  const showErr = (k: FieldKey) => (touched[k] ? errors[k] : undefined);

  const basicsValid = !errors.name && !errors.description && !errors.mode && !nameChecking;
  const stepTwoValid = mode === "blank" ? !errors.trigger : !errors.templateId;


  const createMutation = useMutation({
    mutationFn: async () => {
      // Final full-schema validation before hitting the network.
      const full = basicsSchema.safeParse({ name, description, mode });
      if (!full.success) throw new Error(full.error.issues[0].message);
      if (mode === "blank") {
        const t = triggerSchema.safeParse({ trigger });
        if (!t.success) throw new Error(t.error.issues[0].message);
      } else {
        const t = templateSchema.safeParse({ templateId: templateId ?? "" });
        if (!t.success) throw new Error(t.error.issues[0].message);
      }

      if (nameTaken) throw new Error("Name already exists in this workspace");
      if (!workspaceId) throw new Error("No workspace found");


      let graph: WorkflowGraph = { nodes: [], edges: [] };
      let triggerType = trigger;

      if (mode === "template" && templateId) {
        const tpl = WORKFLOW_TEMPLATES.find((t) => t.id === templateId);
        if (tpl) {
          graph = tpl.graph;
          const firstTrigger = tpl.graph.nodes.find((n) => n.type.startsWith("trigger."));
          if (firstTrigger) triggerType = firstTrigger.type;
        }
      } else {
        graph = {
          nodes: [{ id: "n1", type: trigger, position: { x: 80, y: 140 }, config: {} }],
          edges: [],
        };
      }

      const { data, error } = await supabase
        .from("automations")
        .insert({
          workspace_id: workspaceId,
          name: name.trim(),
          description: description.trim(),
          trigger_type: triggerType,
          status: "draft",
          graph: graph as any,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("Workflow created");
      qc.invalidateQueries({ queryKey: ["workflows"] });
      onOpenChange(false);
      navigate({ to: "/automations/$workflowId", params: { workflowId: id } });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const filteredTemplates = WORKFLOW_TEMPLATES.filter((t) => {
    if (!templateQuery.trim()) return true;
    const q = templateQuery.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q)
    );
  });

  const handleContinue = () => {
    setTouched((prev) => ({ ...prev, name: true, description: true, mode: true }));
    if (!basicsValid) {
      toast.error(errors.name ?? errors.description ?? "Fix the highlighted fields");
      return;
    }
    setStep(mode === "template" ? "template" : "trigger");
  };

  const handleCreate = () => {
    setTouched((prev) => ({ ...prev, trigger: true, templateId: true }));
    if (!basicsValid) {
      setStep("basics");
      setTouched((prev) => ({ ...prev, name: true, description: true }));
      return;
    }
    if (!stepTwoValid) {
      toast.error(mode === "blank" ? errors.trigger! : errors.templateId!);
      return;
    }
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create a new workflow</DialogTitle>
          <DialogDescription>
            {step === "basics" && "Name your workflow and choose how to start."}
            {step === "trigger" && "Pick the event that starts this workflow."}
            {step === "template" && "Start from a proven pattern — you can edit everything after."}
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <StepDot active={step === "basics"} done={step !== "basics"} label="1. Basics" />
          <div className="h-px flex-1 bg-border" />
          <StepDot
            active={step !== "basics"}
            done={false}
            label={mode === "template" ? "2. Template" : "2. Trigger"}
          />
        </div>

        {step === "basics" && (
          <div className="space-y-4">
            <Field
              id="wf-name"
              label="Workflow name"
              required
              error={showErr("name")}
              hint={`${name.trim().length}/${NAME_MAX}`}
            >
              <Input
                id="wf-name"
                autoFocus
                value={name}
                onChange={(e) => {
                  setName(e.target.value.slice(0, NAME_MAX));
                  if (!touched.name) markTouched("name");
                }}
                onBlur={() => markTouched("name")}
                maxLength={NAME_MAX}
                aria-invalid={!!showErr("name")}
                aria-describedby={showErr("name") ? "wf-name-err" : undefined}
                placeholder="e.g. Welcome new WhatsApp leads"
                className={cn(showErr("name") && "border-destructive focus-visible:ring-destructive/30")}
              />
              {touched.name && !errors.name && nameSyntaxOk && (
                <p className="text-[11px] flex items-center gap-1 text-muted-foreground">
                  {nameChecking ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" /> Checking availability
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-600">Name is available</span>
                    </>
                  )}
                </p>
              )}
            </Field>


            <Field
              id="wf-desc"
              label="Description"
              required
              error={showErr("description")}
              hint={`${description.trim().length}/${DESC_MAX}`}
            >
              <textarea
                id="wf-desc"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value.slice(0, DESC_MAX));
                  if (!touched.description) markTouched("description");
                }}
                onBlur={() => markTouched("description")}
                maxLength={DESC_MAX}
                rows={3}
                aria-invalid={!!showErr("description")}
                aria-describedby={showErr("description") ? "wf-desc-err" : undefined}
                placeholder="What does this workflow do, and when should it run?"
                className={cn(
                  "flex w-full rounded-control border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y",
                  showErr("description") && "border-destructive focus-visible:ring-destructive/30",
                )}
              />
            </Field>

            <div className="space-y-2">
              <Label>Start from <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <ModeCard
                  active={mode === "blank"}
                  onClick={() => { setMode("blank"); markTouched("mode"); }}
                  icon={<Zap className="w-4 h-4" />}
                  title="Blank workflow"
                  subtitle="Pick a trigger and build from scratch."
                />
                <ModeCard
                  active={mode === "template"}
                  onClick={() => { setMode("template"); markTouched("mode"); }}
                  icon={<Sparkles className="w-4 h-4" />}
                  title="From template"
                  subtitle={`${WORKFLOW_TEMPLATES.length} ready-made patterns.`}
                />
              </div>
            </div>
          </div>
        )}

        {step === "trigger" && (
          <div className="space-y-3">
            {showErr("trigger") && <InlineError message={errors.trigger!} />}
            <ScrollArea type="hover" className="-mx-1" viewportClassName="max-h-[380px] [&>div]:!block">
              <div className="px-1 space-y-3">
                {Object.entries(groupBy(CURATED_TRIGGERS, (t) => t.group)).map(([group, items]) => (
                  <div key={group}>
                    <div className="text-[11px] font-semibold text-foreground mb-1.5">
                      {group}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {items.map((opt) => {
                        const Icon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[opt.icon] || Icons.Zap;
                        const active = trigger === opt.type;
                        return (
                          <button
                            key={opt.type}
                            type="button"
                            onClick={() => { setTrigger(opt.type); markTouched("trigger"); }}
                            className={cn(
                              "text-left rounded-control border p-3 transition-all",
                              active
                                ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                                : "border-border bg-surface hover:border-primary/40 hover:bg-muted/50",
                              showErr("trigger") && !active && "border-destructive/40",
                            )}
                          >
                            <div className="flex items-start gap-2.5">
                              <div className={cn(
                                "w-8 h-8 rounded-control grid place-items-center shrink-0",
                                active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                              )}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium truncate flex items-center gap-1.5">
                                  {opt.label}
                                  {active && <Check className="w-3.5 h-3.5 text-primary" />}
                                </div>
                                <div className="text-[11px] text-muted-foreground line-clamp-2">
                                  {opt.description}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {step === "template" && (
          <div className="space-y-3">
            {showErr("templateId") && <InlineError message={errors.templateId!} />}
            <Input
              placeholder="Search templates"
              value={templateQuery}
              onChange={(e) => setTemplateQuery(e.target.value)}
            />
            <ScrollArea type="hover" className="-mx-1" viewportClassName="max-h-[340px] [&>div]:!block">
              <div className="px-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredTemplates.length === 0 ? (
                  <div className="col-span-full text-center text-sm text-muted-foreground py-8">
                    No templates match "{templateQuery}".
                  </div>
                ) : (
                  filteredTemplates.map((tpl) => {
                    const Icon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[tpl.icon] || FileText;
                    const active = templateId === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => { setTemplateId(tpl.id); markTouched("templateId"); }}
                        className={cn(
                          "text-left rounded-control border p-3 transition-all",
                          active
                            ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                            : "border-border bg-surface hover:border-primary/40 hover:bg-muted/50",
                          showErr("templateId") && !active && "border-destructive/40",
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className={cn(
                            "w-9 h-9 rounded-control grid place-items-center shrink-0",
                            active ? "bg-primary text-primary-foreground" : "bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 text-primary",
                          )}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px]  text-muted-foreground font-medium">
                              {tpl.category}
                            </div>
                            <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                              {tpl.name}
                              {active && <Check className="w-3.5 h-3.5 text-primary" />}
                            </div>
                            <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                              {tpl.description}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-1">
                              {tpl.graph.nodes.length} nodes
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          <div>
            {step !== "basics" && (
              <Button variant="ghost" onClick={() => setStep("basics")} disabled={createMutation.isPending}>
                Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            {step === "basics" ? (
              <Button onClick={handleContinue} disabled={nameChecking || nameTaken}>
                {nameChecking ? <Loader2 className="w-4 h-4 animate-spin " /> : null}
                Continue <ArrowRight className="w-4 h-4 ml-1" />

              </Button>
            ) : (
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin " />
                ) : (
                  <Sparkles className="w-4 h-4 " />
                )}
                Create workflow
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  required,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
        {hint && (
          <span className={cn("text-[11px] ", error ? "text-destructive" : "text-muted-foreground")}>
            {hint}
          </span>
        )}
      </div>
      {children}
      {error && (
        <p id={`${id}-err`} className="text-[11px] text-destructive flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> {error}
        </p>
      )}
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-control border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-control border p-3 transition-all",
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary/40"
          : "border-border bg-surface hover:border-primary/40 hover:bg-muted/50",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className={cn(
          "w-8 h-8 rounded-control grid place-items-center shrink-0",
          active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
        )}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium flex items-center gap-1.5">
            {title}
            {active && <Check className="w-3.5 h-3.5 text-primary" />}
          </div>
          <div className="text-[11px] text-muted-foreground line-clamp-2">{subtitle}</div>
        </div>
      </div>
    </button>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className={cn("flex items-center gap-1.5", active ? "text-foreground font-medium" : done ? "text-primary" : "")}>
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          active ? "bg-primary" : done ? "bg-primary/60" : "bg-muted-foreground/40",
        )}
      />
      {label}
    </div>
  );
}

function groupBy<T, K extends string>(arr: T[], key: (item: T) => K): Record<K, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    (acc[k] ||= []).push(item);
    return acc;
  }, {} as Record<K, T[]>);
}
