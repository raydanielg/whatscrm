import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, GripVertical, Loader2, Plus, Save, Trash2, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

export type FormStepType =
  "text" | "textarea" | "email" | "phone" | "number" | "select" | "multiselect";

export type FormStepOption = { value: string; label: string };

export type FormStep = {
  id: string;
  title: string;
  question: string;
  type: FormStepType;
  required: boolean;
  field_key: string;
  help?: string | null;
  validation: {
    min?: number | null;
    max?: number | null;
    pattern?: string | null;
  };
  options: FormStepOption[];
};

type FlowJson = {
  version: number;
  steps: FormStep[];
};

const STEP_TYPES: { value: FormStepType; label: string; hint: string }[] = [
  { value: "text", label: "Short text", hint: "Single line answer" },
  { value: "textarea", label: "Long text", hint: "Multi-line answer" },
  { value: "email", label: "Email", hint: "Validated email address" },
  { value: "phone", label: "Phone", hint: "E.164 phone number" },
  { value: "number", label: "Number", hint: "Numeric answer" },
  { value: "select", label: "Single choice", hint: "Pick one option" },
  { value: "multiselect", label: "Multiple choice", hint: "Pick many options" },
];

const FIELD_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

const stepSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(80),
  question: z.string().trim().min(1, "Question is required").max(300),
  type: z.enum(["text", "textarea", "email", "phone", "number", "select", "multiselect"]),
  required: z.boolean(),
  field_key: z
    .string()
    .trim()
    .regex(FIELD_KEY_RE, "lowercase, digits and _ only, starts with a letter, max 40"),
  help: z.string().trim().max(200).optional().nullable(),
  validation: z.object({
    min: z.number().int().nullable().optional(),
    max: z.number().int().nullable().optional(),
    pattern: z.string().max(200).nullable().optional(),
  }),
  options: z
    .array(z.object({ value: z.string().min(1).max(40), label: z.string().min(1).max(80) }))
    .max(20),
});

const flowSchema = z.object({
  version: z.number().int().positive(),
  steps: z.array(stepSchema).min(1, "Add at least one step").max(30),
});

function makeStep(index: number): FormStep {
  return {
    id: crypto.randomUUID(),
    title: `Step ${index + 1}`,
    question: "",
    type: "text",
    required: true,
    field_key: `field_${index + 1}`,
    help: "",
    validation: { min: null, max: null, pattern: null },
    options: [],
  };
}

function normalize(flow: unknown): FlowJson {
  const raw = (flow ?? {}) as Partial<FlowJson>;
  const steps: FormStep[] = Array.isArray(raw.steps)
    ? raw.steps.map((s, i) => ({
        id: (s as FormStep)?.id ?? crypto.randomUUID(),
        title: (s as FormStep)?.title ?? `Step ${i + 1}`,
        question: (s as FormStep)?.question ?? "",
        type: ((s as FormStep)?.type as FormStepType) ?? "text",
        required: Boolean((s as FormStep)?.required ?? true),
        field_key: (s as FormStep)?.field_key ?? `field_${i + 1}`,
        help: (s as FormStep)?.help ?? "",
        validation: {
          min: (s as FormStep)?.validation?.min ?? null,
          max: (s as FormStep)?.validation?.max ?? null,
          pattern: (s as FormStep)?.validation?.pattern ?? null,
        },
        options: Array.isArray((s as FormStep)?.options) ? (s as FormStep).options : [],
      }))
    : [];
  return { version: 1, steps };
}

export function WhatsAppFormEditorDialog({
  open,
  onOpenChange,
  formId,
  formName,
  initialFlow,
  workspaceId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  formId: string | null;
  formName: string | null;
  initialFlow: unknown;
  workspaceId: string | undefined;
  onSaved: () => void;
}) {
  const [steps, setSteps] = useState<FormStep[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Seed only when the dialog opens or switches to a different form.
  // Ignoring `initialFlow` reference changes while already open prevents a
  // parent re-render (e.g. after query invalidation) from silently discarding
  // unsaved edits.
  useEffect(() => {
    if (!open) return;
    const normalized = normalize(initialFlow);
    const seeded = normalized.steps.length ? normalized.steps : [makeStep(0)];
    setSteps(seeded);
    setActiveId(seeded[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, formId]);

  const active = useMemo(() => steps.find((s) => s.id === activeId) ?? null, [steps, activeId]);

  const updateStep = (id: string, patch: Partial<FormStep>) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const addStep = () => {
    const s = makeStep(steps.length);
    setSteps((prev) => [...prev, s]);
    setActiveId(s.id);
  };

  const removeStep = (id: string) => {
    setSteps((prev) => {
      if (prev.length <= 1) {
        toast.error("At least one step is required");
        return prev;
      }
      const next = prev.filter((s) => s.id !== id);
      if (activeId === id) setActiveId(next[0]?.id ?? null);
      return next;
    });
  };

  const move = (id: string, dir: -1 | 1) =>
    setSteps((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = useMutation({
    mutationFn: async () => {
      if (!formId) throw new Error("No form selected");
      // Duplicate field_key detection.
      const keys = new Set<string>();
      for (const s of steps) {
        if (keys.has(s.field_key)) {
          throw new Error(`Duplicate field key: ${s.field_key}`);
        }
        keys.add(s.field_key);
        if (["select", "multiselect"].includes(s.type) && s.options.length === 0) {
          throw new Error(`"${s.title}" needs at least one option`);
        }
      }
      if (!workspaceId) throw new Error("Workspace not loaded — please try again");
      const flow: FlowJson = { version: 1, steps };
      const parsed = flowSchema.safeParse(flow);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid steps");
      // Fetch the current row to preserve metadata (e.g. flow_token set by publish).
      const { data: existing } = await supabase
        .from("whatsapp_forms")
        .select("flow_json")
        .eq("id", formId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      const existingMeta = (existing?.flow_json as Record<string, unknown> | null) ?? {};
      const merged = { ...existingMeta, ...parsed.data };
      const { error } = await supabase
        .from("whatsapp_forms")
        .update({ flow_json: merged, updated_at: new Date().toISOString() })
        .eq("id", formId)
        .eq("workspace_id", workspaceId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Form saved");
      onSaved();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-7xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-primary" />
            Edit form steps
            {formName && <span className="text-muted-foreground font-normal">· {formName}</span>}
          </DialogTitle>
          <DialogDescription>
            Design each question, its answer type, validation, and the field key used in
            submissions.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] min-h-[520px] max-h-[70vh]">
          <div className="border-r border-border flex flex-col min-h-0">
            <div className="p-2 border-b border-border">
              <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={addStep}>
                <Plus className="w-3.5 h-3.5" /> Add step
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="divide-y divide-border">
                {steps.map((s, idx) => {
                  const isActive = activeId === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setActiveId(s.id)}
                      className={`w-full text-left px-3 py-2.5 hover:bg-muted transition-colors ${
                        isActive ? "bg-muted" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <GripVertical className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-medium truncate flex-1">
                          {s.title || "Untitled"}
                        </span>
                        {s.required && (
                          <Badge variant="outline" className="text-[11px] h-4 px-1">
                            req
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5 font-mono">
                        <span>{s.type}</span>
                        <span>→ {s.field_key}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          <div className="min-h-0 flex flex-col">
            {active ? (
              <ScrollArea className="flex-1">
                <StepEditor
                  step={active}
                  onChange={(patch) => updateStep(active.id, patch)}
                  onMoveUp={() => move(active.id, -1)}
                  onMoveDown={() => move(active.id, 1)}
                  onDelete={() => removeStep(active.id)}
                  index={steps.findIndex((s) => s.id === active.id)}
                  total={steps.length}
                />
              </ScrollArea>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
                Select a step to edit.
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="p-3 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5">
            {save.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepEditor({
  step,
  onChange,
  onMoveUp,
  onMoveDown,
  onDelete,
  index,
  total,
}: {
  step: FormStep;
  onChange: (patch: Partial<FormStep>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  index: number;
  total: number;
}) {
  const needsOptions = step.type === "select" || step.type === "multiselect";
  const isNumeric = step.type === "number";
  const isTextual = ["text", "textarea", "email", "phone"].includes(step.type);

  const addOption = () =>
    onChange({
      options: [
        ...step.options,
        { value: `opt_${step.options.length + 1}`, label: `Option ${step.options.length + 1}` },
      ],
    });

  const updateOption = (i: number, patch: Partial<FormStepOption>) =>
    onChange({
      options: step.options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)),
    });

  const removeOption = (i: number) =>
    onChange({ options: step.options.filter((_, idx) => idx !== i) });

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase text-muted-foreground">
          Step {index + 1} of {total}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={onMoveUp}
            disabled={index === 0}
            title="Move up"
          >
            <ArrowUp className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onMoveDown}
            disabled={index === total - 1}
            title="Move down"
          >
            <ArrowDown className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onDelete} title="Delete step">
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input
            value={step.title}
            maxLength={80}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Your name"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Answer type</Label>
          <Select value={step.type} onValueChange={(v) => onChange({ type: v as FormStepType })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STEP_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  <div className="flex flex-col leading-normal text-start">
                    <span>{t.label}</span>
                    <span className="text-[11px] text-muted-foreground">{t.hint}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Question shown in WhatsApp</Label>
        <Textarea
          rows={2}
          value={step.question}
          maxLength={300}
          onChange={(e) => onChange({ question: e.target.value })}
          placeholder="What is your full name?"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Helper text (optional)</Label>
        <Input
          value={step.help ?? ""}
          maxLength={200}
          onChange={(e) => onChange({ help: e.target.value })}
          placeholder="Shown as a subtitle under the question"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Submission field key</Label>
          <Input
            value={step.field_key}
            maxLength={40}
            onChange={(e) =>
              onChange({ field_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })
            }
            placeholder="full_name"
            className="font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            Stored as <span className="font-mono">response_data.{step.field_key || ""}</span> on
            every submission.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Required</Label>
          <div className="flex items-center gap-2 h-9">
            <Switch checked={step.required} onCheckedChange={(v) => onChange({ required: v })} />
            <span className="text-xs text-muted-foreground">
              {step.required ? "Answer is required" : "Answer is optional"}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] uppercase text-muted-foreground">Validation</div>
        {isTextual && (
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Min length</Label>
              <Input
                type="number"
                min={0}
                value={step.validation.min ?? ""}
                onChange={(e) =>
                  onChange({
                    validation: {
                      ...step.validation,
                      min: e.target.value === "" ? null : Number(e.target.value),
                    },
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Max length</Label>
              <Input
                type="number"
                min={1}
                value={step.validation.max ?? ""}
                onChange={(e) =>
                  onChange({
                    validation: {
                      ...step.validation,
                      max: e.target.value === "" ? null : Number(e.target.value),
                    },
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Regex pattern</Label>
              <Input
                value={step.validation.pattern ?? ""}
                maxLength={200}
                onChange={(e) =>
                  onChange({
                    validation: { ...step.validation, pattern: e.target.value || null },
                  })
                }
                placeholder="^[A-Z].*"
                className="font-mono text-xs"
              />
            </div>
          </div>
        )}
        {isNumeric && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Min value</Label>
              <Input
                type="number"
                value={step.validation.min ?? ""}
                onChange={(e) =>
                  onChange({
                    validation: {
                      ...step.validation,
                      min: e.target.value === "" ? null : Number(e.target.value),
                    },
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Max value</Label>
              <Input
                type="number"
                value={step.validation.max ?? ""}
                onChange={(e) =>
                  onChange({
                    validation: {
                      ...step.validation,
                      max: e.target.value === "" ? null : Number(e.target.value),
                    },
                  })
                }
              />
            </div>
          </div>
        )}
        {!isNumeric && !isTextual && !needsOptions && (
          <p className="text-[11px] text-muted-foreground">No validation options for this type.</p>
        )}
      </div>

      {needsOptions && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase text-muted-foreground">
              Options ({step.options.length})
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 h-7" onClick={addOption}>
              <Plus className="w-3 h-3" /> Add option
            </Button>
          </div>
          {step.options.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic">
              Add at least one option — required for choice questions.
            </div>
          ) : (
            <div className="space-y-1.5">
              {step.options.map((opt, i) => (
                <div
                  key={opt.value || i}
                  className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center"
                >
                  <Input
                    value={opt.value}
                    maxLength={40}
                    onChange={(e) =>
                      updateOption(i, {
                        value: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
                      })
                    }
                    placeholder="value"
                    className="font-mono text-xs"
                  />
                  <Input
                    value={opt.label}
                    maxLength={80}
                    onChange={(e) => updateOption(i, { label: e.target.value })}
                    placeholder="Label shown to user"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeOption(i)}
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
