import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type {
  SegmentCondition,
  SegmentRules,
  SegmentRuleOp,
  TagEntity,
} from "@/hooks/use-tags";
import { useTags } from "@/hooks/use-tags";

const OPS: { value: SegmentRuleOp; label: string; needsValue?: boolean }[] = [
  { value: "eq", label: "equals", needsValue: true },
  { value: "neq", label: "not equals", needsValue: true },
  { value: "contains", label: "contains", needsValue: true },
  { value: "not_contains", label: "not contains", needsValue: true },
  { value: "starts_with", label: "starts with", needsValue: true },
  { value: "gt", label: ">", needsValue: true },
  { value: "gte", label: ">=", needsValue: true },
  { value: "lt", label: "<", needsValue: true },
  { value: "lte", label: "<=", needsValue: true },
  { value: "has_tag", label: "has tag", needsValue: true },
  { value: "is_true", label: "is true" },
  { value: "is_false", label: "is false" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

const FIELD_SUGGESTIONS: Record<TagEntity, { value: string; label: string }[]> = {
  contact: [
    { value: "display_name", label: "Name" },
    { value: "job_title", label: "Job title" },
    { value: "lead_status", label: "Lead status" },
    { value: "customer_status", label: "Customer status" },
    { value: "lifecycle_stage", label: "Lifecycle stage" },
    { value: "is_favorite", label: "Favorite" },
    { value: "is_archived", label: "Archived" },
    { value: "do_not_contact", label: "Do not contact" },
    { value: "tags", label: "Tags" },
  ],
  company: [
    { value: "name", label: "Name" },
    { value: "industry", label: "Industry" },
    { value: "size", label: "Company size" },
    { value: "annual_revenue", label: "Annual revenue" },
    { value: "country", label: "Country" },
    { value: "status", label: "Status" },
    { value: "tags", label: "Tags" },
  ],
  lead: [
    { value: "name", label: "Name" },
    { value: "status", label: "Status" },
    { value: "source", label: "Source" },
    { value: "score", label: "Lead score" },
    { value: "owner_id", label: "Owner" },
    { value: "tags", label: "Tags" },
  ],
  customer: [
    { value: "customer_status", label: "Status" },
    { value: "lifetime_value", label: "Lifetime value" },
    { value: "health_score", label: "Health score" },
    { value: "tags", label: "Tags" },
  ],
  deal: [
    { value: "name", label: "Name" },
    { value: "stage", label: "Stage" },
    { value: "value", label: "Value" },
    { value: "probability", label: "Probability" },
    { value: "tags", label: "Tags" },
  ],
  task: [
    { value: "title", label: "Title" },
    { value: "status", label: "Status" },
    { value: "priority", label: "Priority" },
    { value: "tags", label: "Tags" },
  ],
};

interface Props {
  entityType: TagEntity;
  value: SegmentRules;
  onChange: (v: SegmentRules) => void;
}

export function SegmentBuilder({ entityType, value, onChange }: Props) {
  const { data: tags = [] } = useTags();
  const fields = FIELD_SUGGESTIONS[entityType];
  const conds = value?.conditions ?? [];

  const setOp = (op: "AND" | "OR") => onChange({ ...value, operator: op });

  const setCond = (i: number, patch: Partial<SegmentCondition>) => {
    const next = [...conds];
    next[i] = { ...next[i], ...patch };
    onChange({ ...value, conditions: next });
  };

  const addCond = () =>
    onChange({
      ...value,
      conditions: [...conds, { field: fields[0].value, op: "eq", value: "" }],
    });

  const removeCond = (i: number) =>
    onChange({ ...value, conditions: conds.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <Label>Match</Label>
        <Select value={value.operator ?? "AND"} onValueChange={(v) => setOp(v as "AND" | "OR")}>
          <SelectTrigger className="w-28 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AND">All (AND)</SelectItem>
            <SelectItem value="OR">Any (OR)</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">of the following:</span>
      </div>

      <div className="space-y-2">
        {conds.map((c, i) => {
          const opDef = OPS.find((o) => o.value === c.op);
          return (
            <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1.4fr_auto] gap-2">
              <Select value={c.field} onValueChange={(v) => setCond(i, { field: v })}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fields.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={c.op} onValueChange={(v) => setCond(i, { op: v as SegmentRuleOp })}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {opDef?.needsValue ? (
                c.op === "has_tag" ? (
                  <Select
                    value={(c.value as string) ?? ""}
                    onValueChange={(v) => setCond(i, { value: v })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select tag" />
                    </SelectTrigger>
                    <SelectContent>
                      {tags.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    className="h-9"
                    value={(c.value as string) ?? ""}
                    onChange={(e) => setCond(i, { value: e.target.value })}
                    placeholder="Value"
                  />
                )
              ) : (
                <div />
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeCond(i)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>

      <Button variant="outline" size="sm" onClick={addCond}>
        <Plus className="h-4 w-4 " />
        Add condition
      </Button>
    </div>
  );
}
