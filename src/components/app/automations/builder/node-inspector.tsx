import * as React from "react";
import { X, Copy, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { NODE_REGISTRY_BY_TYPE, type FieldSchema } from "@/lib/workflows/node-registry";
import type { WorkflowNode } from "@/lib/workflows/types";
import { supabase } from "@/integrations/supabase/client";
import { readActiveWorkspaceId } from "@/lib/tenant/active-tenant";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

export function NodeInspector({
  node,
  onChange,
  onClose,
  onDelete,
  onDuplicate,
  readOnly = false,
  readOnlyReason,
}: {
  node: WorkflowNode;
  onChange: (patch: Partial<WorkflowNode>) => void;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  /** When true every field and destructive action is inert. */
  readOnly?: boolean;
  readOnlyReason?: string;
}) {
  const def = NODE_REGISTRY_BY_TYPE[node.type];
  if (!def) return null;

  const setField = (key: string, value: unknown) =>
    onChange({ config: { ...node.config, [key]: value } });

  return (
    <aside className="w-80 shrink-0 border-l border-border bg-surface flex flex-col h-full animate-slide-in-right">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[11px]  text-muted-foreground font-semibold">{def.category}</div>
          <div className="text-sm font-semibold truncate">{def.label}</div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-muted"
          aria-label="Close inspector"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {readOnly && readOnlyReason ? (
        <p
          data-testid="inspector-readonly-note"
          className="px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 border-b border-amber-500/30"
        >
          {readOnlyReason}
        </p>
      ) : null}
      <fieldset
        disabled={readOnly}
        className="flex-1 min-h-0 flex flex-col disabled:opacity-100"
        aria-disabled={readOnly}
      >
        <ScrollArea type="hover" className="flex-1 min-h-0">
          <div className="p-3 space-y-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Label</label>
              <input
                value={node.label ?? ""}
                onChange={(e) => onChange({ label: e.target.value })}
                placeholder={def.label}
                className="mt-1 w-full px-2.5 py-1.5 text-sm rounded-control border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
            {(def.inputs ?? []).map((f) => (
              <FieldEditor
                key={f.key}
                field={f}
                value={node.config?.[f.key]}
                onChange={(v) => setField(f.key, v)}
              />
            ))}
            {(def.inputs?.length ?? 0) === 0 && (
              <div className="text-xs text-muted-foreground italic">
                No configuration for this node.
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="p-3 border-t border-border flex gap-2">
          <button
            onClick={onDuplicate}
            title={readOnly ? readOnlyReason : undefined}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-control border border-border bg-surface text-xs hover:bg-muted transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Copy className="w-3.5 h-3.5" /> Duplicate
          </button>
          <button
            onClick={onDelete}
            title={readOnly ? readOnlyReason : undefined}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-control border border-rose-500/30 bg-rose-500/10 text-rose-600 text-xs hover:bg-rose-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </fieldset>
    </aside>
  );
}

type RefOption = { value: string; label: string };

/** Reference kinds that have a dropdown picker. Others keep the plain ID input. */
const PICKER_KINDS = new Set(["contact", "wa_template", "campaign", "deal", "channel", "user"]);

/**
 * Loads the choices for a reference field from the active workspace. Returns
 * null for kinds with no picker yet, so those keep the plain ID input.
 */
async function loadReferenceOptions(
  kind: string,
  workspaceId: string,
): Promise<RefOption[] | null> {
  const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const byName = (rows: { id: string; label: string }[]) =>
    rows.map((r) => ({ value: r.id, label: r.label || r.id }));
  switch (kind) {
    case "contact": {
      const { data } = await db
        .from("contacts")
        .select("id, name, first_name, last_name, phone")
        .eq("workspace_id", workspaceId)
        .order("name")
        .limit(500);
      return byName(
        (data ?? []).map((c: any) => ({
          id: c.id,
          label: c.name || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.phone || c.id,
        })),
      );
    }
    case "wa_template": {
      const { data } = await db
        .from("wa_templates")
        .select("id, name, language, status")
        .eq("workspace_id", workspaceId)
        .order("name");
      return (data ?? [])
        .filter((t: any) => String(t.status).toUpperCase() === "APPROVED")
        .map((t: any) => ({ value: t.id, label: `${t.name} (${t.language})` }));
    }
    case "campaign": {
      const { data } = await db
        .from("campaigns")
        .select("id, name")
        .eq("workspace_id", workspaceId)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      return byName((data ?? []).map((c: any) => ({ id: c.id, label: c.name })));
    }
    case "deal": {
      const { data } = await db
        .from("deals")
        .select("id, title")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      return byName((data ?? []).map((d: any) => ({ id: d.id, label: d.title })));
    }
    case "channel": {
      const { data } = await db
        .from("channel_accounts")
        .select("id, display_name, provider, phone_number")
        .eq("workspace_id", workspaceId)
        .order("created_at");
      return (data ?? []).map((c: any) => ({
        value: c.id,
        label: `${c.display_name || c.phone_number || c.id} · ${c.provider}`,
      }));
    }
    case "user": {
      const { data: members } = await db
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId)
        .eq("status", "active");
      const ids = (members ?? []).map((m: any) => m.user_id);
      if (ids.length === 0) return [];
      const { data: people } = await db
        .from("profiles")
        .select("id, display_name, full_name, email")
        .in("id", ids);
      return (people ?? []).map((p: any) => ({
        value: p.id,
        label: p.display_name || p.full_name || p.email || p.id,
      }));
    }
    default:
      return null;
  }
}

function ReferenceSelect({
  kind,
  value,
  onChange,
  className,
}: {
  kind: string;
  value: string;
  onChange: (v: string) => void;
  className: string;
}) {
  const workspaceId = readActiveWorkspaceId() ?? "";
  const { data: options, isLoading } = useQuery({
    queryKey: ["wf-ref-options", kind, workspaceId],
    queryFn: () => loadReferenceOptions(kind, workspaceId),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
  const known = options?.some((o) => o.value === value) ?? false;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      disabled={isLoading}
    >
      <option value="">{isLoading ? "Loading" : "Select"}</option>
      {/* Keep a saved ID visible even if it is no longer in the list, so nothing is silently cleared. */}
      {value && !known && <option value={value}>Unknown item ({value.slice(0, 8)})</option>}
      {(options ?? []).map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function FieldEditor({
  field,
  value,
  onChange,
}: {
  field: FieldSchema;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = (
    <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
      {field.label}
      {field.required && <span className="text-rose-500">*</span>}
    </label>
  );
  const cls =
    "mt-1 w-full px-2.5 py-1.5 text-sm rounded-control border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30";
  const str = value == null ? "" : String(value);

  const control = (() => {
    switch (field.type) {
      case "textarea":
      case "json":
        return (
          <textarea
            value={str}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            rows={field.type === "json" ? 5 : 3}
            className={`${cls} font-mono resize-y`}
          />
        );
      case "number":
        return (
          <input
            type="number"
            value={str}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder={field.placeholder}
            className={cls}
          />
        );
      case "boolean":
        return (
          <div className="mt-1 inline-flex items-center gap-2 text-sm">
            <Checkbox checked={Boolean(value)} onCheckedChange={(v) => onChange(v === true)} />
            <span>{field.helpText ?? "Enabled"}</span>
          </div>
        );
      case "reference":
        if (field.reference && PICKER_KINDS.has(field.reference)) {
          return (
            <ReferenceSelect
              kind={field.reference}
              value={str}
              onChange={onChange}
              className={cls}
            />
          );
        }
        return (
          <input
            value={str}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? "ID"}
            className={cls}
          />
        );
      case "select": {
        const known = field.options?.some((o) => o.value === str) ?? true;
        return (
          <select value={str} onChange={(e) => onChange(e.target.value)} className={cls}>
            <option value="">Select</option>
            {/* A value saved before this list existed (e.g. a free-typed tone) stays visible. */}
            {str && !known && <option value={str}>Custom: {str}</option>}
            {field.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
      }
      default:
        return (
          <input
            value={str}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className={cls}
          />
        );
    }
  })();

  return (
    <div>
      {label}
      {control}
      {field.helpText && field.type !== "boolean" && (
        <div className="mt-1 text-[11px] text-muted-foreground">{field.helpText}</div>
      )}
    </div>
  );
}
