import * as React from "react";
import type { ChatbotNode } from "@/lib/chatbots/flow-types";
import { NODE_DEF_BY_TYPE } from "@/lib/chatbots/flow-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Trash2, Copy, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

type Props = {
  node: ChatbotNode | null;
  onChange: (patch: Partial<ChatbotNode>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
};

export function ChatbotNodeInspector({ node, onChange, onDelete, onDuplicate, onClose }: Props) {
  if (!node) {
    return (
      <div className="w-80 border-l border-border bg-surface shrink-0 flex items-center justify-center text-xs text-muted-foreground p-6 text-center">
        Select a node to edit its properties.
      </div>
    );
  }
  const def = NODE_DEF_BY_TYPE[node.type];
  const setCfg = (patch: Record<string, unknown>) =>
    onChange({ config: { ...node.config, ...patch } });

  return (
    <div className="w-80 border-l border-border bg-surface shrink-0 flex flex-col">
      <div className="p-3 border-b border-border flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
            {def?.label}
          </div>
          <Input
            value={node.label ?? ""}
            placeholder={def?.label}
            onChange={(e) => onChange({ label: e.target.value })}
            className="font-semibold border-none shadow-none focus-visible:ring-0"
          />
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>

      <ScrollArea type="hover" className="flex-1 min-h-0">
        <div className="p-4 space-y-4 text-sm">
          {node.type === "message" && (
            <Field label="Message text">
              <RichTextarea
                rows={4}
                value={(node.config.text as string) ?? ""}
                onChange={(v) => setCfg({ text: v })}
              />
            </Field>
          )}
          {node.type === "question" && (
            <>
              <Field label="Question">
                <RichTextarea
                  rows={3}
                  value={(node.config.text as string) ?? ""}
                  onChange={(v) => setCfg({ text: v })}
                />
              </Field>
              <Field label="Save reply to variable">
                <Input
                  value={(node.config.variable as string) ?? ""}
                  onChange={(e) => setCfg({ variable: e.target.value })}
                  placeholder="name"
                />
              </Field>
            </>
          )}
          {node.type === "condition" && (
            <>
              <Field label="Variable">
                <Input
                  value={(node.config.variable as string) ?? ""}
                  onChange={(e) => setCfg({ variable: e.target.value })}
                />
              </Field>
              <Field label="Operator">
                <select
                  className="w-full h-9 rounded-control border border-input bg-background px-2 text-sm"
                  value={(node.config.operator as string) ?? "equals"}
                  onChange={(e) => setCfg({ operator: e.target.value })}
                >
                  <option value="equals">equals</option>
                  <option value="not_equals">not equals</option>
                  <option value="contains">contains</option>
                  <option value="starts_with">starts with</option>
                  <option value="exists">exists</option>
                </select>
              </Field>
              <Field label="Value">
                <Input
                  value={(node.config.value as string) ?? ""}
                  onChange={(e) => setCfg({ value: e.target.value })}
                />
              </Field>
            </>
          )}
          {(node.type === "button" || node.type === "quick_reply") && (
            <>
              <Field label="Prompt">
                <RichTextarea
                  rows={2}
                  value={(node.config.text as string) ?? ""}
                  onChange={(v) => setCfg({ text: v })}
                />
              </Field>
              <ListEditor
                label={node.type === "button" ? "Buttons" : "Quick replies"}
                items={
                  (node.config[node.type === "button" ? "buttons" : "replies"] as string[]) ?? []
                }
                onChange={(items) =>
                  setCfg({ [node.type === "button" ? "buttons" : "replies"]: items })
                }
                max={node.type === "button" ? 3 : 10}
              />
            </>
          )}
          {node.type === "form" && (
            <FormFieldsEditor
              fields={(node.config.fields as { label: string; key: string; type: string }[]) ?? []}
              onChange={(fields) => setCfg({ fields })}
            />
          )}
          {node.type === "ai" && (
            <>
              <Field label="Prompt">
                <Textarea
                  rows={5}
                  value={(node.config.prompt as string) ?? ""}
                  onChange={(e) => setCfg({ prompt: e.target.value })}
                />
              </Field>
              <label className="flex items-center justify-between text-xs">
                Use knowledge base (RAG)
                <Switch
                  checked={Boolean(node.config.useRag)}
                  onCheckedChange={(v) => setCfg({ useRag: v })}
                />
              </label>
            </>
          )}
          {node.type === "webhook" && (
            <>
              <Field label="URL">
                <Input
                  value={(node.config.url as string) ?? ""}
                  onChange={(e) => setCfg({ url: e.target.value })}
                  placeholder="https://"
                />
              </Field>
              <Field label="Method">
                <select
                  className="w-full h-9 rounded-control border border-input bg-background px-2 text-sm"
                  value={(node.config.method as string) ?? "POST"}
                  onChange={(e) => setCfg({ method: e.target.value })}
                >
                  <option>GET</option>
                  <option>POST</option>
                  <option>PUT</option>
                  <option>DELETE</option>
                </select>
              </Field>
              <Field label="Body (JSON, optional)">
                <Textarea
                  rows={3}
                  value={(node.config.body as string) ?? ""}
                  onChange={(e) => setCfg({ body: e.target.value })}
                  placeholder='{"key":"value"}'
                />
              </Field>
            </>
          )}
          {node.type === "delay" && (
            <Field label="Seconds">
              <Input
                type="number"
                min={0}
                value={(node.config.seconds as number) ?? 0}
                onChange={(e) => setCfg({ seconds: Number(e.target.value) })}
              />
            </Field>
          )}
          {node.type === "transfer" && (
            <Field label="Assign to team (optional)">
              <Input
                value={(node.config.team as string) ?? ""}
                onChange={(e) => setCfg({ team: e.target.value })}
                placeholder="sales"
              />
            </Field>
          )}
          {(node.type === "start" || node.type === "end") && (
            <p className="text-xs text-muted-foreground">This node has no configuration.</p>
          )}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-border flex gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={onDuplicate}>
          <Copy className="w-3.5 h-3.5 " /> Duplicate
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="w-3.5 h-3.5 " /> Delete
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function ListEditor({
  label,
  items,
  onChange,
  max,
}: {
  label: string;
  items: string[];
  onChange: (i: string[]) => void;
  max: number;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      {items.map((it, i) => (
        <div key={i} className="flex gap-1">
          <Input
            value={it}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
      {items.length < max && (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => onChange([...items, ""])}
        >
          + Add
        </Button>
      )}
    </div>
  );
}

function FormFieldsEditor({
  fields,
  onChange,
}: {
  fields: { label: string; key: string; type: string }[];
  onChange: (f: { label: string; key: string; type: string }[]) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">Form fields</Label>
      {fields.map((f, i) => (
        <div key={i} className="rounded-control border border-border p-2 space-y-1">
          <div className="flex gap-1">
            <Input
              placeholder="Label"
              value={f.label}
              onChange={(e) => {
                const n = [...fields];
                n[i] = { ...f, label: e.target.value };
                onChange(n);
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onChange(fields.filter((_, j) => j !== i))}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="flex gap-1">
            <Input
              placeholder="key"
              value={f.key}
              onChange={(e) => {
                const n = [...fields];
                n[i] = { ...f, key: e.target.value };
                onChange(n);
              }}
            />
            <select
              className="h-9 rounded-control border border-input bg-background px-2 text-sm"
              value={f.type}
              onChange={(e) => {
                const n = [...fields];
                n[i] = { ...f, type: e.target.value };
                onChange(n);
              }}
            >
              <option>text</option>
              <option>email</option>
              <option>tel</option>
              <option>number</option>
            </select>
          </div>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        className="w-full"
        onClick={() => onChange([...fields, { label: "", key: "", type: "text" }])}
      >
        + Add field
      </Button>
    </div>
  );
}
