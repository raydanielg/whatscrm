import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Save,
  Search,
  Variable as VarIcon,
  Lock,
  Loader2,
  Code2,
} from "lucide-react";
import {
  listVariables,
  upsertVariable,
  deleteVariable,
  previewExpression,
} from "@/lib/workflows/variables.functions";
import { MERGE_FIELD_SUGGESTIONS, type VariableScope } from "@/lib/workflows/variables";
import { ScrollArea } from "@/components/ui/scroll-area";

const SCOPES: Array<{ key: VariableScope; label: string; hint: string }> = [
  { key: "global", label: "Global", hint: "Workspace-wide values" },
  { key: "environment", label: "Environment", hint: "API keys, URLs (env.*)" },
  { key: "workflow", label: "Workflow", hint: "Scoped to one workflow" },
  { key: "contact", label: "Contact", hint: "Defaults for contact.*" },
  { key: "deal", label: "Deal", hint: "Defaults for deal.*" },
  { key: "conversation", label: "Conversation", hint: "Defaults for conversation.*" },
  { key: "organization", label: "Organization", hint: "Company data" },
  { key: "custom", label: "Custom", hint: "Free-form namespace" },
];

const DATA_TYPES = ["string", "number", "boolean", "json", "date", "secret"] as const;

type EditingRow = {
  id?: string;
  scope: VariableScope;
  key: string;
  value: string;
  dataType: (typeof DATA_TYPES)[number];
  description: string;
  isSecret: boolean;
  automationId?: string | null;
};

const EMPTY_ROW: EditingRow = {
  scope: "global",
  key: "",
  value: "",
  dataType: "string",
  description: "",
  isSecret: false,
};

export function VariableManager({ automationId }: { automationId?: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listVariables);
  const upsertFn = useServerFn(upsertVariable);
  const deleteFn = useServerFn(deleteVariable);

  const [scope, setScope] = React.useState<VariableScope | "all">("all");
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<EditingRow | null>(null);
  const [showSecret, setShowSecret] = React.useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["workflow-variables", scope, automationId ?? null],
    queryFn: () =>
      listFn({
        data: {
          scope: scope === "all" ? undefined : scope,
          automationId: automationId,
        },
      }),
  });

  const items = (data?.items ?? []).filter((v) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return v.key.toLowerCase().includes(q) || (v.description ?? "").toLowerCase().includes(q);
  });

  const upsertMut = useMutation({
    mutationFn: async (row: EditingRow) => {
      let value: unknown = row.value;
      try {
        if (row.dataType === "number") value = Number(row.value);
        else if (row.dataType === "boolean") value = row.value === "true";
        else if (row.dataType === "json") value = JSON.parse(row.value || "null");
      } catch {
        throw new Error("Invalid value for selected data type");
      }
      return upsertFn({
        data: {
          id: row.id,
          scope: row.scope,
          automationId: row.scope === "workflow" ? (automationId ?? null) : null,
          key: row.key,
          value,
          dataType: row.dataType,
          description: row.description || null,
          isSecret: row.isSecret,
        },
      });
    },
    onSuccess: () => {
      toast.success("Variable saved");
      qc.invalidateQueries({ queryKey: ["workflow-variables"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Variable deleted");
      qc.invalidateQueries({ queryKey: ["workflow-variables"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <aside className="lg:w-56 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
        <ScopeChip
          active={scope === "all"}
          onClick={() => setScope("all")}
          label="All"
          hint="Every scope"
        />
        {SCOPES.map((s) => (
          <ScopeChip
            key={s.key}
            active={scope === s.key}
            onClick={() => setScope(s.key)}
            label={s.label}
            hint={s.hint}
          />
        ))}
      </aside>

      <div className="flex-1 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search variables"
              className="w-full h-9 pl-8 pr-3 rounded-control border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button
            onClick={() => setEditing({ ...EMPTY_ROW, scope: scope === "all" ? "global" : scope })}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-control bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
            New variable
          </button>
        </div>

        <div className="rounded-control border border-border bg-surface overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading variables
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <VarIcon className="w-6 h-6 mx-auto mb-2 opacity-50" />
              No variables in this scope yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground bg-muted/40">
                <tr>
                  <th className="text-left px-3 py-2">Scope</th>
                  <th className="text-left px-3 py-2">Key</th>
                  <th className="text-left px-3 py-2">Value</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-right px-3 py-2 w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((v) => (
                  <tr key={v.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <span className="text-[11px] uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        {v.scope}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{v.key}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground max-w-xs truncate">
                      {v.is_secret && !showSecret[v.id]
                        ? "••••••••"
                        : String(typeof v.value === "string" ? v.value : JSON.stringify(v.value))}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-[11px] uppercase text-muted-foreground">
                        {v.data_type}
                      </span>
                      {v.is_secret && <Lock className="inline w-3 h-3 ml-1 text-amber-500" />}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        {v.is_secret && (
                          <button
                            onClick={() => setShowSecret((s) => ({ ...s, [v.id]: !s[v.id] }))}
                            className="p-1 rounded hover:bg-muted text-muted-foreground"
                            title={showSecret[v.id] ? "Hide" : "Reveal"}
                          >
                            {showSecret[v.id] ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() =>
                            setEditing({
                              id: v.id,
                              scope: v.scope,
                              key: v.key,
                              value:
                                typeof v.value === "string"
                                  ? v.value
                                  : JSON.stringify(v.value ?? ""),
                              dataType: (v.data_type as EditingRow["dataType"]) ?? "string",
                              description: v.description ?? "",
                              isSecret: v.is_secret,
                            })
                          }
                          className="p-1 rounded hover:bg-muted text-muted-foreground"
                          title="Edit"
                        >
                          <Code2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete variable ${v.key}?`)) delMut.mutate(v.id);
                          }}
                          className="p-1 rounded hover:bg-destructive/10 text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <MergeFieldReference />

        {editing && (
          <EditDrawer
            row={editing}
            onChange={setEditing}
            onSave={() => upsertMut.mutate(editing)}
            onClose={() => setEditing(null)}
            saving={upsertMut.isPending}
            automationId={automationId}
          />
        )}
      </div>
    </div>
  );
}

function ScopeChip({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left px-3 py-2 rounded-control border transition-all whitespace-nowrap ${
        active
          ? "bg-primary/10 border-primary/40 text-primary"
          : "border-transparent hover:bg-muted text-foreground"
      }`}
    >
      <div className="text-sm font-medium">{label}</div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </button>
  );
}

function EditDrawer({
  row,
  onChange,
  onSave,
  onClose,
  saving,
  automationId,
}: {
  row: EditingRow;
  onChange: (r: EditingRow) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  automationId?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-control border border-border bg-background shadow-xl animate-in slide-in-from-bottom-2 duration-200">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="font-semibold text-sm">{row.id ? "Edit variable" : "New variable"}</div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">
            Close
          </button>
        </div>
        <div className="p-4 space-y-3">
          <Field label="Scope">
            <select
              value={row.scope}
              onChange={(e) => onChange({ ...row, scope: e.target.value as VariableScope })}
              className="w-full h-9 px-2 rounded-control border border-border bg-background text-sm"
              disabled={!!row.id}
            >
              {SCOPES.map((s) => (
                <option key={s.key} value={s.key} disabled={s.key === "workflow" && !automationId}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Key">
            <input
              value={row.key}
              onChange={(e) => onChange({ ...row, key: e.target.value })}
              placeholder="e.g. welcome_message"
              className="w-full h-9 px-2 rounded-control border border-border bg-background font-mono text-sm"
            />
          </Field>
          <Field label="Data type">
            <select
              value={row.dataType}
              onChange={(e) =>
                onChange({ ...row, dataType: e.target.value as EditingRow["dataType"] })
              }
              className="w-full h-9 px-2 rounded-control border border-border bg-background text-sm"
            >
              {DATA_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Value">
            <textarea
              value={row.value}
              onChange={(e) => onChange({ ...row, value: e.target.value })}
              rows={row.dataType === "json" ? 5 : 2}
              placeholder={row.dataType === "json" ? '{ "example": true }' : "Value"}
              className="w-full px-2 py-1.5 rounded-control border border-border bg-background font-mono text-sm"
            />
          </Field>
          <Field label="Description">
            <input
              value={row.description}
              onChange={(e) => onChange({ ...row, description: e.target.value })}
              className="w-full h-9 px-2 rounded-control border border-border bg-background text-sm"
            />
          </Field>
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              id="store-as-secret"
              checked={row.isSecret}
              onCheckedChange={(v) => onChange({ ...row, isSecret: v === true })}
            />
            <Label htmlFor="store-as-secret" className="flex items-center gap-1.5 font-normal">
              <Lock className="w-3.5 h-3.5 text-amber-500" />
              Store as secret (redacted in previews)
            </Label>
          </div>
        </div>
        <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 px-3 rounded-control border border-border text-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving || !row.key}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-control bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function MergeFieldReference() {
  const grouped = React.useMemo(() => {
    const g: Record<string, typeof MERGE_FIELD_SUGGESTIONS> = {};
    for (const f of MERGE_FIELD_SUGGESTIONS) (g[f.group] ??= []).push(f);
    return g;
  }, []);
  return (
    <details className="rounded-control border border-border bg-surface">
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
        Available merge fields & functions
      </summary>
      <div className="p-3 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {Object.entries(grouped).map(([group, fields]) => (
          <div key={group}>
            <div className="text-[11px] uppercase text-muted-foreground mb-1">{group}</div>
            <div className="space-y-1">
              {fields.map((f) => (
                <div key={f.path} className="font-mono">
                  <span className="text-primary">{`{{${f.path}}}`}</span>
                  <div className="text-muted-foreground text-[11px] font-sans">{f.description}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="sm:col-span-2">
          <div className="text-[11px] uppercase text-muted-foreground mb-1">Functions</div>
          <div className="font-mono text-[11px] space-y-0.5 text-muted-foreground">
            <div>
              <span className="text-primary">date.now()</span>,{" "}
              <span className="text-primary">date.format(iso, "YYYY-MM-DD")</span>,{" "}
              <span className="text-primary">date.addDays(iso, 7)</span>,{" "}
              <span className="text-primary">date.diffDays(a, b)</span>
            </div>
            <div>
              <span className="text-primary">math.round(x, 2)</span>,{" "}
              <span className="text-primary">math.sum(arr)</span>,{" "}
              <span className="text-primary">math.pct(a, b)</span>
            </div>
            <div>
              <span className="text-primary">str.upper</span>,{" "}
              <span className="text-primary">str.title</span>,{" "}
              <span className="text-primary">str.replace(s, a, b)</span>,{" "}
              <span className="text-primary">str.default(s, fallback)</span>
            </div>
            <div>
              Pipe form: <span className="text-primary">{`{{contact.name | upper}}`}</span>,{" "}
              <span className="text-primary">{`{{deal.value | number:2}}`}</span>
            </div>
            <div>
              Inline expression:{" "}
              <span className="text-primary">{`\${ deal.value * 0.1 + 100 }`}</span>
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}

/* ------------------------ Expression preview widget ---------------------- */

export function ExpressionBuilder({
  value,
  onChange,
  automationId,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  automationId?: string;
  placeholder?: string;
  rows?: number;
}) {
  const previewFn = useServerFn(previewExpression);
  const [preview, setPreview] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);
  const [showFields, setShowFields] = React.useState(false);

  React.useEffect(() => {
    if (!value) {
      setPreview("");
      return;
    }
    let cancelled = false;
    setBusy(true);
    const t = window.setTimeout(async () => {
      try {
        const res = await previewFn({ data: { template: value, automationId } });
        if (!cancelled) setPreview(res.output);
      } catch (e) {
        if (!cancelled) setPreview(String((e as Error).message));
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [value, automationId, previewFn]);

  const insert = (token: string) => {
    onChange((value ?? "") + token);
  };

  return (
    <div className="space-y-1.5">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          placeholder ?? "Type your message. Use {{contact.name}} or ${deal.value * 0.1}"
        }
        rows={rows}
        className="w-full px-2 py-1.5 rounded-control border border-border bg-background font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <div className="flex items-center gap-2 text-[11px]">
        <button
          onClick={() => setShowFields((s) => !s)}
          className="inline-flex items-center gap-1 h-6 px-2 rounded border border-border text-muted-foreground hover:bg-muted"
        >
          <VarIcon className="w-3 h-3" /> Insert field
        </button>
        <div className="flex-1 truncate">
          <span className="text-muted-foreground ">Preview:</span>
          {busy ? (
            <Loader2 className="inline w-3 h-3 animate-spin text-muted-foreground" />
          ) : (
            <span className="font-mono text-foreground">
              {preview || <span className="text-muted-foreground">—</span>}
            </span>
          )}
        </div>
      </div>
      {showFields && (
        <ScrollArea
          type="hover"
          className="rounded-control border border-border bg-surface"
          viewportClassName="max-h-40 [&>div]:!block"
        >
          <div className="p-2 grid grid-cols-2 gap-1">
            {MERGE_FIELD_SUGGESTIONS.map((f) => (
              <button
                key={f.path}
                onClick={() => insert(`{{${f.path}}}`)}
                className="text-left px-2 py-1 rounded hover:bg-muted font-mono text-[11px]"
                title={f.description}
              >
                <span className="text-primary">{`{{${f.path}}}`}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
