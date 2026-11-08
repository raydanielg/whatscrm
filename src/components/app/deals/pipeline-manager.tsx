import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Trash2, GripVertical, Palette, Loader2, Trophy, X as CloseX,
  Sparkles, ChevronUp, ChevronDown, Layers,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  usePipelinesFull, useStagesFull,
  useCreatePipeline, useUpdatePipeline, useDeletePipeline,
  useCreateStage, useUpdateStage, useDeleteStage, useReorderStages,
  usePipelineTemplates, useApplyTemplate,
  STAGE_COLORS,
  type PipelineRow, type StageRow, type StageType,
} from "@/hooks/use-pipeline";
import { ScrollArea } from "@/components/ui/scroll-area";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialPipelineId?: string | null;
  onPipelineChange?: (id: string) => void;
};

export function PipelineManager({ open, onOpenChange, initialPipelineId, onPipelineChange }: Props) {
  const { data: pipelines = [] } = usePipelinesFull();
  const [activeId, setActiveId] = useState<string | null>(initialPipelineId ?? null);

  useEffect(() => {
    if (open && !activeId && pipelines.length > 0) {
      setActiveId(initialPipelineId ?? pipelines.find((p) => p.is_default)?.id ?? pipelines[0].id);
    }
  }, [open, activeId, initialPipelineId, pipelines]);

  const active = pipelines.find((p) => p.id === activeId) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border/60 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            Pipeline manager
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar: pipelines */}
          <ScrollArea
            type="hover"
            className="w-56 border-r border-border/60"
            viewportClassName="[&>div]:!block"
          >
            <aside className="p-3 space-y-1">
              {pipelines.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setActiveId(p.id); onPipelineChange?.(p.id); }}
                  className={cn(
                    "w-full text-left px-2.5 py-2 rounded-control text-sm flex items-center gap-2 transition-colors",
                    activeId === p.id ? "bg-primary/10 text-primary" : "hover:bg-muted/60",
                  )}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: p.color ?? "#6366f1" }} />
                  <span className="truncate flex-1">{p.name}</span>
                  {p.is_default && <Trophy className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                </button>
              ))}
              <NewPipelineButton onCreated={(id) => setActiveId(id)} />
            </aside>
          </ScrollArea>

          {/* Main */}
          <ScrollArea type="hover" className="flex-1 min-w-0" viewportClassName="[&>div]:!block">
            {active ? (
              <PipelineDetail
                key={active.id}
                pipeline={active}
                canDelete={pipelines.length > 1}
              />
            ) : (
              <EmptyState />
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------- Empty / New button --------------------------- */

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted-foreground p-8 text-center">
      <div className="space-y-2">
        <Layers className="w-8 h-8 mx-auto opacity-50" />
        <p>Select or create a pipeline to configure stages.</p>
      </div>
    </div>
  );
}

function NewPipelineButton({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const { data: templates = [] } = usePipelineTemplates();
  const createBlank = useCreatePipeline();
  const applyTemplate = useApplyTemplate();
  const [tab, setTab] = useState<"blank" | "template">("template");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [makeDefault, setMakeDefault] = useState(false);

  const createFromBlank = async () => {
    if (!name.trim()) return;
    try {
      const p = await createBlank.mutateAsync({ name: name.trim(), color, is_default: makeDefault });
      toast.success("Pipeline created");
      setOpen(false); setName("");
      onCreated(p.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create");
    }
  };

  const createFromTemplate = async (t: typeof templates[number]) => {
    try {
      const p = await applyTemplate.mutateAsync({ template: t, name: name || undefined, makeDefault });
      toast.success(`Pipeline created from “${t.name}”`);
      setOpen(false); setName("");
      onCreated(p.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create");
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" className="w-full justify-start mt-1" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4 mr-1.5" /> New pipeline
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create a new pipeline</DialogTitle>
          </DialogHeader>
          <Tabs value={tab} onValueChange={(v) => setTab(v as "blank" | "template")}>
            <TabsList>
              <TabsTrigger value="template"><Sparkles className="w-3.5 h-3.5 mr-1.5" /> From template</TabsTrigger>
              <TabsTrigger value="blank">Blank</TabsTrigger>
            </TabsList>

            <TabsContent value="template" className="space-y-3 mt-3">
              <Input
                placeholder="Pipeline name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={makeDefault} onCheckedChange={setMakeDefault} />
                Make this the default pipeline
              </label>
              <ScrollArea type="hover" viewportClassName="max-h-[400px]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pr-1">
                  {templates.filter((t) => t.is_builtin).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => createFromTemplate(t)}
                      disabled={applyTemplate.isPending}
                      className="text-left rounded-control border border-border p-3 hover:border-primary hover:bg-primary/5 transition-all group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color ?? "#6366f1" }} />
                        <span className="font-medium text-sm">{t.name}</span>
                      </div>
                      {t.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {t.stages.slice(0, 6).map((s, i) => (
                          <span key={i} className="text-[11px] px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: `${s.color ?? "#94a3b8"}20`, color: s.color ?? "#94a3b8" }}>
                            {s.name}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="blank" className="space-y-3 mt-3">
              <div>
                <Label>Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Enterprise" />
              </div>
              <div>
                <Label>Color</Label>
                <div className="flex gap-1.5 flex-wrap mt-1">
                  {STAGE_COLORS.map((c) => (
                    <button key={c} type="button"
                      className={cn(
                        "w-7 h-7 rounded-full transition-all",
                        color === c ? "ring-2 ring-offset-2 ring-offset-background ring-primary scale-110" : "",
                      )}
                      style={{ backgroundColor: c }}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={makeDefault} onCheckedChange={setMakeDefault} />
                Make default
              </label>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={createFromBlank} disabled={!name.trim() || createBlank.isPending}>
                  {createBlank.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                  Create
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* --------------------------- Pipeline detail --------------------------- */

function PipelineDetail({ pipeline, canDelete }: { pipeline: PipelineRow; canDelete: boolean }) {
  const { data: stages = [], isLoading } = useStagesFull(pipeline.id);
  const update = useUpdatePipeline();
  const del = useDeletePipeline();
  const [name, setName] = useState(pipeline.name);
  const [description, setDescription] = useState(pipeline.description ?? "");
  const [color, setColor] = useState(pipeline.color ?? "#6366f1");
  const [staleDays, setStaleDays] = useState(pipeline.stale_after_days);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setName(pipeline.name);
    setDescription(pipeline.description ?? "");
    setColor(pipeline.color ?? "#6366f1");
    setStaleDays(pipeline.stale_after_days);
  }, [pipeline.id, pipeline.name, pipeline.description, pipeline.color, pipeline.stale_after_days]);

  const savePipeline = async (patch: Partial<PipelineRow>) => {
    try {
      await update.mutateAsync({ id: pipeline.id, patch });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update pipeline");
    }
  };

  const removePipeline = async () => {
    try {
      await del.mutateAsync(pipeline.id);
      toast.success("Pipeline deleted");
      setConfirmDelete(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Pipeline header */}
      <section className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Pipeline name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)}
              onBlur={() => name !== pipeline.name && savePipeline({ name })} />
          </div>
          <div>
            <Label>Stale after</Label>
            <div className="flex items-center gap-2">
              <Input type="number" min={1} value={staleDays}
                onChange={(e) => setStaleDays(Number(e.target.value))}
                onBlur={() => staleDays !== pipeline.stale_after_days && savePipeline({ stale_after_days: staleDays })}
                className="w-24" />
              <span className="text-sm text-muted-foreground">days without activity</span>
            </div>
          </div>
        </div>

        <div>
          <Label>Description</Label>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== (pipeline.description ?? "") && savePipeline({ description })} />
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <Label className="text-xs">Color</Label>
            <div className="flex gap-1 flex-wrap mt-1">
              {STAGE_COLORS.map((c) => (
                <button key={c}
                  className={cn(
                    "w-6 h-6 rounded-full transition-transform",
                    color === c ? "ring-2 ring-offset-1 ring-offset-background ring-primary scale-110" : "",
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => { setColor(c); savePipeline({ color: c }); }}
                />
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm ml-auto">
            <Switch checked={pipeline.is_default} onCheckedChange={(v) => savePipeline({ is_default: v })} />
            Default pipeline
          </label>
        </div>
      </section>

      {/* Stages */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Stages</h3>
          <AddStageButton pipelineId={pipeline.id} />
        </div>
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            <Loader2 className="w-4 h-4 inline mr-1.5 animate-spin" /> Loading stages
          </div>
        ) : stages.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-control">
            No stages yet. Add your first stage above.
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {stages.map((s, i) => (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.15 }}
                >
                  <StageEditor stage={s} index={i} total={stages.length}
                    allStages={stages} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* Danger zone */}
      <section className="pt-4 border-t border-destructive/20">
        <Button variant="outline" size="sm"
          className="text-destructive border-destructive/40 hover:bg-destructive/10"
          disabled={!canDelete}
          onClick={() => setConfirmDelete(true)}>
          <Trash2 className="w-4 h-4 mr-1.5" /> Delete this pipeline
        </Button>
        {!canDelete && (
          <p className="text-xs text-muted-foreground mt-1">Cannot delete the last remaining pipeline.</p>
        )}
      </section>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete pipeline “{pipeline.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Stages will be removed. Deals in this pipeline will keep their data but will no longer be
              linked to it. This cannot be undone from the app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={removePipeline} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------ Stage editor ------------------------------ */

const STAGE_TYPES: { value: StageType; label: string; desc: string }[] = [
  { value: "qualifying", label: "Qualifying", desc: "Early stage — lead qualification" },
  { value: "normal", label: "Normal", desc: "Active in-progress stage" },
  { value: "won", label: "Won", desc: "Deal is closed as a win" },
  { value: "lost", label: "Lost", desc: "Deal is closed as a loss" },
];

function AddStageButton({ pipelineId }: { pipelineId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(STAGE_COLORS[0]);
  const [type, setType] = useState<StageType>("normal");
  const [prob, setProb] = useState(50);
  const [aging, setAging] = useState<string>("");
  const create = useCreateStage();

  const submit = async () => {
    if (!name.trim()) return;
    try {
      await create.mutateAsync({
        pipeline_id: pipelineId,
        name: name.trim(),
        color,
        stage_type: type,
        probability: type === "won" ? 100 : type === "lost" ? 0 : prob,
        aging_days: aging ? Number(aging) : null,
      });
      toast.success("Stage added");
      setOpen(false); setName(""); setAging("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add stage");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm">
          <Plus className="w-4 h-4 mr-1.5" /> Add stage
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" align="end">
        <div>
          <Label className="text-xs">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Discovery" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as StageType)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Probability %</Label>
            <Input type="number" min={0} max={100} value={prob}
              disabled={type === "won" || type === "lost"}
              onChange={(e) => setProb(Number(e.target.value))} className="h-9" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Aging threshold (days)</Label>
          <Input type="number" min={1} value={aging} onChange={(e) => setAging(e.target.value)}
            placeholder="Optional — warn if a deal sits longer" className="h-9" />
        </div>
        <div>
          <Label className="text-xs">Color</Label>
          <div className="flex flex-wrap gap-1 mt-1">
            {STAGE_COLORS.map((c) => (
              <button key={c} type="button"
                className={cn(
                  "w-5 h-5 rounded-full transition-transform",
                  color === c ? "ring-2 ring-offset-1 ring-offset-background ring-primary scale-110" : "",
                )}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
        <Button size="sm" className="w-full" onClick={submit}
          disabled={!name.trim() || create.isPending}>
          {create.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
          Add stage
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function StageEditor({
  stage, index, total, allStages,
}: {
  stage: StageRow; index: number; total: number; allStages: StageRow[];
}) {
  const update = useUpdateStage();
  const del = useDeleteStage();
  const reorder = useReorderStages();

  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(stage.name);
  const [prob, setProb] = useState(stage.probability);
  const [aging, setAging] = useState(stage.aging_days ?? "");

  useEffect(() => {
    setName(stage.name); setProb(stage.probability); setAging(stage.aging_days ?? "");
  }, [stage.id, stage.name, stage.probability, stage.aging_days]);

  const save = async (patch: Partial<StageRow>) => {
    try { await update.mutateAsync({ id: stage.id, patch }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed to update stage"); }
  };

  const move = async (dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= total) return;
    const ids = allStages.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await reorder.mutateAsync({ pipelineId: stage.pipeline_id, orderedIds: ids });
  };

  const handleDelete = async () => {
    try {
      await del.mutateAsync({ id: stage.id, pipelineId: stage.pipeline_id });
      toast.success("Stage removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const rules = (stage.rules ?? {}) as { require_amount?: boolean; require_contact?: boolean; require_close_date?: boolean };
  const setRule = (k: keyof typeof rules, v: boolean) => save({ rules: { ...rules, [k]: v } });

  return (
    <div className="rounded-control border border-border/60 bg-surface transition-colors">
      <div className="flex items-center gap-2 p-2.5">
        <div className="flex flex-col opacity-40 hover:opacity-100 transition-opacity">
          <button className="hover:text-primary p-0.5" onClick={() => move(-1)} disabled={index === 0}>
            <ChevronUp className="w-3 h-3" />
          </button>
          <button className="hover:text-primary p-0.5" onClick={() => move(1)} disabled={index === total - 1}>
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
        <GripVertical className="w-4 h-4 text-muted-foreground/40" />
        <Popover>
          <PopoverTrigger asChild>
            <button className="w-5 h-5 rounded-full flex-shrink-0 hover:ring-2 hover:ring-primary transition-shadow"
              style={{ backgroundColor: stage.color ?? "#94a3b8" }} />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="flex flex-wrap gap-1 max-w-[160px]">
              {STAGE_COLORS.map((c) => (
                <button key={c}
                  className={cn(
                    "w-5 h-5 rounded-full",
                    stage.color === c ? "ring-2 ring-offset-1 ring-offset-background ring-primary" : "",
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => save({ color: c })}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== stage.name && save({ name })}
          className="h-9 flex-1"
        />
        <Badge variant="outline" className="text-[11px]">{stage.stage_type}</Badge>
        <Input
          type="number" min={0} max={100} value={prob}
          disabled={stage.stage_type === "won" || stage.stage_type === "lost"}
          onChange={(e) => setProb(Number(e.target.value))}
          onBlur={() => prob !== stage.probability && save({ probability: prob })}
          className="h-9 w-16 text-center"
        />
        <span className="text-xs text-muted-foreground w-6">%</span>
        <Button size="icon" variant="ghost" className="h-7 w-7"
          onClick={() => setExpanded((e) => !e)}>
          <Palette className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
          onClick={handleDelete} disabled={total === 1}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="px-3 pb-3 border-t border-border/40 pt-3 space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={stage.stage_type} onValueChange={(v) => save({ stage_type: v as StageType })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Aging threshold (days)</Label>
              <Input
                type="number" min={1}
                value={aging}
                onChange={(e) => setAging(e.target.value)}
                onBlur={() =>
                  save({ aging_days: aging === "" || aging === null ? null : Number(aging) })
                }
                className="h-9"
                placeholder="e.g. 14"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Description</Label>
            <Textarea
              rows={2}
              defaultValue={stage.description ?? ""}
              onBlur={(e) => e.target.value !== (stage.description ?? "") && save({ description: e.target.value })}
              placeholder="Explain when to use this stage"
            />
          </div>

          <div className="rounded-control bg-muted/40 p-3 space-y-2">
            <div className="text-xs font-semibold flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" /> Stage rules
            </div>
            <RuleRow label="Amount is required"
              checked={!!rules.require_amount}
              onChange={(v) => setRule("require_amount", v)} />
            <RuleRow label="Contact is required"
              checked={!!rules.require_contact}
              onChange={(v) => setRule("require_contact", v)} />
            <RuleRow label="Expected close date is required"
              checked={!!rules.require_close_date}
              onChange={(v) => setRule("require_close_date", v)} />
          </div>

          <div className="rounded-control bg-muted/40 p-3 space-y-2">
            <div className="text-xs font-semibold flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-primary" /> Automation
            </div>
            <AutomationEditor stage={stage} onChange={(automations) => save({ automations })} />
          </div>
        </motion.div>
      )}
    </div>
  );
}

function RuleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <Switch checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  );
}

type AutomationAction =
  | { type: "notify_owner"; template?: string }
  | { type: "create_task"; title: string; due_days?: number }
  | { type: "set_priority"; priority: "low" | "normal" | "high" | "urgent" }
  | { type: "add_tag"; tag: string };

function AutomationEditor({
  stage, onChange,
}: {
  stage: StageRow;
  onChange: (actions: Record<string, unknown>[]) => void;
}) {
  const actions = (stage.automations ?? []) as AutomationAction[];

  const add = (a: AutomationAction) => onChange([...actions, a] as unknown as Record<string, unknown>[]);
  const remove = (i: number) => onChange(actions.filter((_, idx) => idx !== i) as unknown as Record<string, unknown>[]);

  return (
    <div className="space-y-2">
      {actions.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No automations. Actions run when a deal enters this stage.
        </p>
      )}
      {actions.map((a, i) => (
        <div key={i} className="flex items-center gap-2 rounded bg-background border border-border px-2 py-1.5">
          <Badge variant="outline" className="text-[11px]">{a.type.replace(/_/g, " ")}</Badge>
          <span className="text-xs text-muted-foreground truncate flex-1">
            {a.type === "create_task" && `“${a.title}”${a.due_days ? ` in ${a.due_days}d` : ""}`}
            {a.type === "notify_owner" && "Notify deal owner"}
            {a.type === "set_priority" && `→ ${a.priority}`}
            {a.type === "add_tag" && `#${a.tag}`}
          </span>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => remove(i)}>
            <CloseX className="w-3 h-3" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5 pt-1">
        <Button size="sm" variant="outline" className="h-7 text-xs"
          onClick={() => add({ type: "notify_owner" })}>+ Notify owner</Button>
        <Button size="sm" variant="outline" className="h-7 text-xs"
          onClick={() => add({ type: "create_task", title: "Follow up", due_days: 2 })}>+ Create task</Button>
        <Button size="sm" variant="outline" className="h-7 text-xs"
          onClick={() => add({ type: "set_priority", priority: "high" })}>+ Set priority</Button>
        <Button size="sm" variant="outline" className="h-7 text-xs"
          onClick={() => {
            const tag = prompt("Tag to add:");
            if (tag) add({ type: "add_tag", tag });
          }}>+ Add tag</Button>
      </div>
    </div>
  );
}
