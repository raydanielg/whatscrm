import { useState } from "react";
import { Plus, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { AudienceFilter, AudienceCondition, AudienceField, AudienceOperator } from "@/hooks/use-audience";

const FIELDS: { value: AudienceField; label: string; group: string }[] = [
  { value: "search", label: "Free text search", group: "Basic" },
  { value: "tags", label: "Tags", group: "Basic" },
  { value: "segments", label: "Segments", group: "Basic" },
  { value: "lifecycle_stage", label: "Lifecycle stage", group: "CRM" },
  { value: "lead_status", label: "Lead status", group: "CRM" },
  { value: "customer_status", label: "Customer status", group: "CRM" },
  { value: "customer_lifetime_value", label: "Lifetime value", group: "CRM" },
  { value: "owner_id", label: "Owner", group: "CRM" },
  { value: "assigned_agent_id", label: "Assigned agent", group: "CRM" },
  { value: "country", label: "Country", group: "Location" },
  { value: "city", label: "City", group: "Location" },
  { value: "language", label: "Language / locale", group: "Location" },
  { value: "timezone", label: "Timezone", group: "Location" },
  { value: "is_favorite", label: "Is favorite", group: "Flags" },
  { value: "do_not_contact", label: "Do not contact", group: "Flags" },
  { value: "created_at", label: "Created at", group: "Activity" },
  { value: "last_seen_at", label: "Last seen", group: "Activity" },
  { value: "pipeline_stage", label: "Pipeline stage (deals)", group: "Activity" },
  { value: "last_conversation_at", label: "Last conversation", group: "Activity" },
  { value: "last_campaign_id", label: "Last campaign", group: "Activity" },
];

const OPERATORS: Record<string, { value: AudienceOperator; label: string }[]> = {
  text: [
    { value: "eq", label: "equals" },
    { value: "contains", label: "contains" },
    { value: "is_null", label: "is empty" },
    { value: "not_null", label: "is set" },
  ],
  array: [
    { value: "in", label: "any of" },
    { value: "not_in", label: "none of" },
  ],
  number: [
    { value: "gte", label: "≥" },
    { value: "gt", label: ">" },
    { value: "lte", label: "≤" },
    { value: "lt", label: "<" },
  ],
  date: [
    { value: "within_days", label: "within last N days" },
    { value: "is_null", label: "never" },
    { value: "not_null", label: "any" },
  ],
  bool: [{ value: "eq", label: "is" }],
};

function opsFor(field: AudienceField): { value: AudienceOperator; label: string }[] {
  if (["tags", "segments"].includes(field)) return OPERATORS.array;
  if (field === "customer_lifetime_value") return OPERATORS.number;
  if (["created_at", "last_seen_at", "last_conversation_at"].includes(field)) return OPERATORS.date;
  if (["is_favorite", "do_not_contact"].includes(field)) return OPERATORS.bool;
  return OPERATORS.text;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export interface AudienceFilterBuilderProps {
  value: AudienceFilter;
  onChange: (next: AudienceFilter) => void;
  compact?: boolean;
}

export function AudienceFilterBuilder({ value, onChange, compact }: AudienceFilterBuilderProps) {
  const [aiOpen, setAiOpen] = useState(false);

  const addCondition = () => {
    onChange({
      ...value,
      conditions: [
        ...value.conditions,
        { id: uid(), field: "tags", operator: "in", value: [] } satisfies AudienceCondition,
      ],
    });
  };

  const updateCondition = (id: string, patch: Partial<AudienceCondition>) => {
    onChange({
      ...value,
      conditions: value.conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  };

  const removeCondition = (id: string) => {
    onChange({ ...value, conditions: value.conditions.filter((c) => c.id !== id) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Match</Label>
          <Select
            value={value.logic}
            onValueChange={(v) => onChange({ ...value, logic: v as "AND" | "OR" })}
          >
            <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="AND">All (AND)</SelectItem>
              <SelectItem value="OR">Any (OR)</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="text-xs">
            {value.conditions.length} condition{value.conditions.length === 1 ? "" : "s"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {!compact && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAiOpen((v) => !v)}
              className="gap-1"
            >
              <Sparkles className="h-3.5 w-3.5" /> AI segment
            </Button>
          )}
          <Button size="sm" onClick={addCondition} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Add filter
          </Button>
        </div>
      </div>

      {aiOpen && (
        <AiSuggestionBox
          onApply={(f) => {
            onChange(f);
            setAiOpen(false);
          }}
        />
      )}

      <div className="space-y-2">
        {value.conditions.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-control">
            No filters yet — click <span className="font-medium">Add filter</span> to build your audience.
          </p>
        )}
        {value.conditions.map((c) => (
          <ConditionRow
            key={c.id}
            condition={c}
            onChange={(patch) => updateCondition(c.id, patch)}
            onRemove={() => removeCondition(c.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ConditionRow({
  condition,
  onChange,
  onRemove,
}: {
  condition: AudienceCondition;
  onChange: (patch: Partial<AudienceCondition>) => void;
  onRemove: () => void;
}) {
  const ops = opsFor(condition.field);
  const isMulti = ["tags", "segments", "in", "not_in"].includes(condition.operator) || ["tags", "segments"].includes(condition.field);
  const isBool = ["is_favorite", "do_not_contact"].includes(condition.field);
  const isDateNumber = condition.field === "customer_lifetime_value" || condition.operator === "within_days";
  const nullish = condition.operator === "is_null" || condition.operator === "not_null";

  return (
    <div className="flex items-start gap-2 p-2 rounded-control border bg-card">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 flex-1">
        <Select
          value={condition.field}
          onValueChange={(v) => onChange({ field: v as AudienceField, operator: opsFor(v as AudienceField)[0].value, value: undefined })}
        >
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FIELDS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                <span className="text-muted-foreground text-xs">{f.group}</span>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={condition.operator}
          onValueChange={(v) => onChange({ operator: v as AudienceOperator })}
        >
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ops.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!nullish && (
          <>
            {isBool ? (
              <Select
                value={String(condition.value ?? "true")}
                onValueChange={(v) => onChange({ value: v === "true" })}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">true</SelectItem>
                  <SelectItem value="false">false</SelectItem>
                </SelectContent>
              </Select>
            ) : isMulti ? (
              <Input
                className="h-9"
                placeholder="comma separated (vip, gold)"
                value={Array.isArray(condition.value) ? (condition.value as string[]).join(", ") : ""}
                onChange={(e) =>
                  onChange({
                    value: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            ) : isDateNumber ? (
              <Input
                type="number"
                className="h-9"
                placeholder={condition.operator === "within_days" ? "days" : "value"}
                value={typeof condition.value === "number" ? condition.value : ""}
                onChange={(e) => onChange({ value: Number(e.target.value) })}
              />
            ) : (
              <Input
                className="h-9"
                placeholder="value"
                value={typeof condition.value === "string" ? condition.value : ""}
                onChange={(e) => onChange({ value: e.target.value })}
              />
            )}
          </>
        )}
      </div>
      <Button variant="ghost" size="icon" onClick={onRemove}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function AiSuggestionBox({ onApply }: { onApply: (f: AudienceFilter) => void }) {
  const [q, setQ] = useState("");
  const suggest = () => {
    // Deterministic keyword-based AI-style suggester (no API cost).
    const text = q.toLowerCase();
    const conditions: AudienceCondition[] = [];
    if (/\bvip|top|high[- ]value\b/.test(text))
      conditions.push({ id: uid(), field: "customer_lifetime_value", operator: "gte", value: 1000 });
    if (/\blead(s)?\b/.test(text))
      conditions.push({ id: uid(), field: "lifecycle_stage", operator: "eq", value: "lead" });
    if (/\bcustomer(s)?\b/.test(text))
      conditions.push({ id: uid(), field: "lifecycle_stage", operator: "eq", value: "customer" });
    const country = text.match(/\b(in|from) ([a-z ]{2,20})\b/)?.[2]?.trim();
    if (country) conditions.push({ id: uid(), field: "country", operator: "contains", value: country });
    const days = Number(text.match(/last (\d+) days?/)?.[1]);
    if (days > 0)
      conditions.push({ id: uid(), field: "last_seen_at", operator: "within_days", value: days });
    if (/\bopt(ed)?[- ]in\b/.test(text))
      conditions.push({ id: uid(), field: "do_not_contact", operator: "eq", value: false });
    if (!conditions.length)
      conditions.push({ id: uid(), field: "search", operator: "contains", value: q });
    onApply({ conditions, logic: "AND" });
  };
  return (
    <div className="p-3 border rounded-control bg-muted/40 space-y-2">
      <Label className="text-xs">Describe the audience</Label>
      <div className="flex gap-2">
        <Input
          placeholder="e.g. VIP customers in Germany seen in last 30 days"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && suggest()}
        />
        <Button onClick={suggest} className="gap-1">
          <Sparkles className="h-3.5 w-3.5" /> Suggest
        </Button>
      </div>
    </div>
  );
}
