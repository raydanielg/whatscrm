import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import {
  useUpsertSegment,
  type SegmentRow,
} from "@/hooks/use-marketing";
import {
  type SegmentCondition,
  type SegmentFilterDefinition,
  EMPTY_DEFINITION,
  countSegmentMembers,
} from "@/lib/marketing/segment-filters";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segment?: SegmentRow | null;
};

const FIELD_LABELS: Record<SegmentCondition["field"], string> = {
  tags: "Tag",
  last_seen_at: "Last activity",
  lifecycle_stage: "Lifecycle stage",
  customer_status: "Customer status",
  source: "Source",
  do_not_contact: "Do-not-contact",
  custom_field: "Custom field",
};

const DEFAULT_CONDITION: Record<SegmentCondition["field"], SegmentCondition> = {
  tags: { field: "tags", op: "contains_any", values: [] },
  last_seen_at: { field: "last_seen_at", op: "within_days", days: 30 },
  lifecycle_stage: { field: "lifecycle_stage", op: "is", value: "lead" },
  customer_status: { field: "customer_status", op: "is", value: "active" },
  source: { field: "source", op: "is", value: "" },
  do_not_contact: { field: "do_not_contact", op: "is", value: false },
  custom_field: { field: "custom_field", op: "equals", key: "", value: "" },
};

function normalizeDefinition(def: unknown): SegmentFilterDefinition {
  if (!def || typeof def !== "object") return { ...EMPTY_DEFINITION };
  const raw = def as { logic?: string; conditions?: unknown };
  const conditions = Array.isArray(raw.conditions)
    ? (raw.conditions as SegmentCondition[])
    : [];
  const logic = raw.logic === "OR" ? "OR" : "AND";
  return { logic, conditions };
}

export function SegmentEditorDialog({ open, onOpenChange, segment }: Props) {
  const { active } = useCurrentWorkspace();
  const upsert = useUpsertSegment();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDynamic, setIsDynamic] = useState(true);
  const [definition, setDefinition] = useState<SegmentFilterDefinition>({ ...EMPTY_DEFINITION });

  // Reset local state whenever the dialog opens for a new segment.
  useEffect(() => {
    if (!open) return;
    setName(segment?.name ?? "");
    setDescription(segment?.description ?? "");
    setIsDynamic(segment?.is_dynamic ?? true);
    setDefinition(normalizeDefinition(segment?.filter_definition));
  }, [open, segment]);

  // Live preview: run a count query whenever the definition changes.
  const previewQuery = useQuery({
    queryKey: ["segment-preview", active?.id, definition],
    enabled: open && !!active?.id,
    queryFn: () => countSegmentMembers(supabase, active!.id, definition),
    // Keep it snappy but not spammy — a small debounce via staleTime.
    staleTime: 500,
  });

  const conditionSummary = useMemo(() => {
    if (definition.conditions.length === 0) return "No filters — matches every eligible contact.";
    return `${definition.conditions.length} rule${definition.conditions.length === 1 ? "" : "s"} · joined with ${definition.logic}`;
  }, [definition]);

  function updateCondition(index: number, patch: Partial<SegmentCondition>) {
    setDefinition((prev) => ({
      ...prev,
      conditions: prev.conditions.map((c, i) =>
        i === index ? ({ ...c, ...patch } as SegmentCondition) : c,
      ),
    }));
  }

  function replaceCondition(index: number, field: SegmentCondition["field"]) {
    setDefinition((prev) => ({
      ...prev,
      conditions: prev.conditions.map((c, i) => (i === index ? { ...DEFAULT_CONDITION[field] } : c)),
    }));
  }

  function addCondition() {
    setDefinition((prev) => ({
      ...prev,
      conditions: [...prev.conditions, { ...DEFAULT_CONDITION.tags }],
    }));
  }

  function removeCondition(index: number) {
    setDefinition((prev) => ({
      ...prev,
      conditions: prev.conditions.filter((_, i) => i !== index),
    }));
  }

  async function handleSave() {
    if (!active) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Give your segment a name");
      return;
    }
    try {
      const memberCount = previewQuery.data ?? 0;
      await upsert.mutateAsync({
        id: segment?.id,
        workspace_id: active.id,
        name: trimmed,
        description: description.trim() || null,
        is_dynamic: isDynamic,
        filter_definition: definition as unknown as SegmentRow["filter_definition"],
        member_count: memberCount,
        last_computed_at: new Date().toISOString(),
      });
      toast.success(segment ? "Segment updated" : "Segment created");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save segment");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{segment ? "Edit segment" : "New segment"}</DialogTitle>
          <DialogDescription>
            Build a reusable audience by combining rules over tags, activity, and custom fields.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="seg-name">Name</Label>
            <Input
              id="seg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Active last 30 days"
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="flex items-center justify-between rounded-control border p-2  ">
              <span className="text-sm">{isDynamic ? "Dynamic (re-evaluated on use)" : "Static snapshot"}</span>
              <Switch checked={isDynamic} onCheckedChange={setIsDynamic} />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="seg-desc">Description</Label>
          <Textarea
            id="seg-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional — describe who is in this segment"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Rules</div>
              <div className="text-xs text-muted-foreground">{conditionSummary}</div>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Match</Label>
              <Select
                value={definition.logic}
                onValueChange={(v) =>
                  setDefinition((prev) => ({ ...prev, logic: v as "AND" | "OR" }))
                }
              >
                <SelectTrigger className="h-8 w-[92px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AND">All (AND)</SelectItem>
                  <SelectItem value="OR">Any (OR)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto rounded-control border p-2">
            {definition.conditions.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No rules yet. Add one to narrow this audience.
              </div>
            ) : (
              definition.conditions.map((cond, index) => (
                <ConditionRow
                  key={index}
                  condition={cond}
                  onFieldChange={(field) => replaceCondition(index, field)}
                  onChange={(patch) => updateCondition(index, patch)}
                  onRemove={() => removeCondition(index)}
                />
              ))
            )}
          </div>

          <Button variant="outline" size="sm" onClick={addCondition} type="button">
            <Plus className="h-3.5 w-3.5" /> Add rule
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-control border bg-muted/40 p-3">
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>
              Preview:{" "}
              <span className="font-medium">
                {previewQuery.isFetching ? (
                  <Loader2 className="inline h-3.5 w-3.5 animate-spin" />
                ) : (
                  (previewQuery.data ?? 0).toLocaleString()
                )}
              </span>{" "}
              contacts match
            </span>
          </div>
          {previewQuery.isError && (
            <Badge variant="destructive" className="text-[11px]">
              Preview failed — check rules
            </Badge>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending ? "Saving" : segment ? "Save changes" : "Create segment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------- Row -------- */

function ConditionRow({
  condition,
  onFieldChange,
  onChange,
  onRemove,
}: {
  condition: SegmentCondition;
  onFieldChange: (field: SegmentCondition["field"]) => void;
  onChange: (patch: Partial<SegmentCondition>) => void;
  onRemove: () => void;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-control border bg-background p-2")}>
      <Select value={condition.field} onValueChange={(v) => onFieldChange(v as SegmentCondition["field"])}>
        <SelectTrigger className="h-8 w-[170px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(FIELD_LABELS) as Array<SegmentCondition["field"]>).map((k) => (
            <SelectItem key={k} value={k}>
              {FIELD_LABELS[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ConditionInputs condition={condition} onChange={onChange} />

      <Button variant="ghost" size="icon" className="ml-auto h-8 w-8" onClick={onRemove} type="button">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function ConditionInputs({
  condition,
  onChange,
}: {
  condition: SegmentCondition;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (patch: any) => void;
}) {
  switch (condition.field) {
    case "tags":
      return (
        <>
          <Select value={condition.op} onValueChange={(v) => onChange({ op: v })}>
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contains_any">contains any of</SelectItem>
              <SelectItem value="contains_all">contains all of</SelectItem>
              <SelectItem value="not_contains">does not contain</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="h-8 flex-1 min-w-[180px]"
            placeholder="tag1, tag2"
            value={condition.values.join(", ")}
            onChange={(e) =>
              onChange({
                values: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              })
            }
          />
        </>
      );
    case "last_seen_at":
      return (
        <>
          <Select value={condition.op} onValueChange={(v) => onChange({ op: v })}>
            <SelectTrigger className="h-8 w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="within_days">active in last</SelectItem>
              <SelectItem value="older_than_days">inactive for more than</SelectItem>
              <SelectItem value="ever">has ever been active</SelectItem>
              <SelectItem value="never">has never been active</SelectItem>
            </SelectContent>
          </Select>
          {(condition.op === "within_days" || condition.op === "older_than_days") && (
            <>
              <Input
                type="number"
                min={0}
                className="h-8 w-[90px]"
                value={condition.days ?? 0}
                onChange={(e) => onChange({ days: Math.max(0, Number(e.target.value) || 0) })}
              />
              <span className="text-xs text-muted-foreground">days</span>
            </>
          )}
        </>
      );
    case "lifecycle_stage":
    case "customer_status":
    case "source":
      return (
        <>
          <Select value={condition.op} onValueChange={(v) => onChange({ op: v })}>
            <SelectTrigger className="h-8 w-[90px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="is">is</SelectItem>
              <SelectItem value="is_not">is not</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="h-8 flex-1 min-w-[180px]"
            value={condition.value}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder={condition.field === "lifecycle_stage" ? "e.g. lead" : "value"}
          />
        </>
      );
    case "do_not_contact":
      return (
        <div className="flex items-center gap-2">
          <span className="text-sm">is</span>
          <Select value={condition.value ? "true" : "false"} onValueChange={(v) => onChange({ value: v === "true" })}>
            <SelectTrigger className="h-8 w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">ON</SelectItem>
              <SelectItem value="false">OFF</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );
    case "custom_field":
      return (
        <>
          <Input
            className="h-8 w-[150px]"
            value={condition.key}
            onChange={(e) => onChange({ key: e.target.value })}
            placeholder="field key"
          />
          <Select value={condition.op} onValueChange={(v) => onChange({ op: v })}>
            <SelectTrigger className="h-8 w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="equals">equals</SelectItem>
              <SelectItem value="not_equals">not equals</SelectItem>
              <SelectItem value="contains">contains</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="h-8 flex-1 min-w-[150px]"
            value={condition.value}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder="value"
          />
        </>
      );
    default:
      return null;
  }
}
