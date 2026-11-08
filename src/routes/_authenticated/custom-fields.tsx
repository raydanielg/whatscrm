import { requireWorkspaceRole } from "@/lib/rbac";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Save, X, GripVertical } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  useCustomFields,
  useCreateCustomField,
  useUpdateCustomField,
  useDeleteCustomField,
  useCustomFieldsRealtime,
  CUSTOM_FIELD_ENTITIES,
  CUSTOM_FIELD_TYPES,
  type CustomFieldDefinition,
  type CustomFieldEntity,
  type CustomFieldType,
  type CustomFieldOption,
} from "@/hooks/use-custom-fields";
import { AppTopbar } from "@/components/app/app-topbar";

export const Route = createFileRoute("/_authenticated/custom-fields")({
  beforeLoad: requireWorkspaceRole("owner", "admin"),
  component: CustomFieldsPage,
});

const OPTION_TYPES: CustomFieldType[] = ["select", "multi_select", "radio"];

function slug(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function CustomFieldsPage() {
  useCustomFieldsRealtime();
  const [entity, setEntity] = useState<CustomFieldEntity>("contact");
  const { data: fields = [], isLoading } = useCustomFields(entity);
  const [editing, setEditing] = useState<CustomFieldDefinition | null>(null);
  const [creating, setCreating] = useState(false);

  const grouped = useMemo(() => fields, [fields]);

  return (
    <>
      <AppTopbar
        title="Custom Fields"
        subtitle="Configure custom fields for every module without writing code"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 " />
            New field
          </Button>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <Tabs value={entity} onValueChange={(v) => setEntity(v as CustomFieldEntity)}>
          <TabsList className="flex flex-wrap  ">
            {CUSTOM_FIELD_ENTITIES.map((e) => (
              <TabsTrigger key={e.value} value={e.value}>
                {e.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {CUSTOM_FIELD_ENTITIES.map((e) => (
            <TabsContent key={e.value} value={e.value} className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{e.label} fields</CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading</p>
                  ) : grouped.length === 0 ? (
                    <div className="text-center py-10 text-sm text-muted-foreground">
                      No custom fields yet. Create the first one.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-8"></TableHead>
                            <TableHead>Label</TableHead>
                            <TableHead>Key</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Section</TableHead>
                            <TableHead>Required</TableHead>
                            <TableHead>Visible</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {grouped.map((f) => (
                            <TableRow key={f.id}>
                              <TableCell className="text-muted-foreground">
                                <GripVertical className="h-4 w-4" />
                              </TableCell>
                              <TableCell className="font-medium">{f.label}</TableCell>
                              <TableCell className="font-mono text-xs">{f.key}</TableCell>
                              <TableCell>
                                <Badge variant="secondary">
                                  {CUSTOM_FIELD_TYPES.find((t) => t.value === f.field_type)
                                    ?.label || f.field_type}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {f.section || "—"}
                              </TableCell>
                              <TableCell>{f.is_required ? "Yes" : "No"}</TableCell>
                              <TableCell>{f.is_visible ? "Yes" : "Hidden"}</TableCell>
                              <TableCell className="text-right">
                                <Button variant="ghost" size="icon" onClick={() => setEditing(f)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <DeleteButton id={f.id} label={f.label} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>

        {(creating || editing) && (
          <FieldEditorDialog
            entity={entity}
            existing={editing}
            onClose={() => {
              setCreating(false);
              setEditing(null);
            }}
          />
        )}
      </main>
    </>
  );
}

function DeleteButton({ id, label }: { id: string; label: string }) {
  const del = useDeleteCustomField();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => {
        if (!confirm(`Delete field "${label}"? Existing data will be preserved.`)) return;
        del.mutate(id, {
          onSuccess: () => toast.success("Field deleted"),
          onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
        });
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}

interface EditorProps {
  entity: CustomFieldEntity;
  existing: CustomFieldDefinition | null;
  onClose: () => void;
}

function FieldEditorDialog({ entity, existing, onClose }: EditorProps) {
  const create = useCreateCustomField();
  const update = useUpdateCustomField();

  const [label, setLabel] = useState(existing?.label ?? "");
  const [key, setKey] = useState(existing?.key ?? "");
  const [keyDirty, setKeyDirty] = useState(!!existing);
  const [fieldType, setFieldType] = useState<CustomFieldType>(existing?.field_type ?? "text");
  const [placeholder, setPlaceholder] = useState(existing?.placeholder ?? "");
  const [helpText, setHelpText] = useState(existing?.help_text ?? "");
  const [section, setSection] = useState(existing?.section ?? "");
  const [isRequired, setIsRequired] = useState(existing?.is_required ?? false);
  const [isUnique, setIsUnique] = useState(existing?.is_unique ?? false);
  const [isVisible, setIsVisible] = useState(existing?.is_visible ?? true);
  const [options, setOptions] = useState<CustomFieldOption[]>(existing?.options ?? []);
  const [relEntity, setRelEntity] = useState(existing?.relationship_entity ?? "contact");

  const needsOptions = OPTION_TYPES.includes(fieldType);

  const onLabelChange = (v: string) => {
    setLabel(v);
    if (!keyDirty) setKey(slug(v));
  };

  const submit = async () => {
    if (!label.trim()) return toast.error("Label required");
    if (!key.trim()) return toast.error("Key required");
    if (needsOptions && options.length === 0) return toast.error("Add at least one option");

    const payload = {
      entity_type: entity,
      label: label.trim(),
      key: key.trim(),
      field_type: fieldType,
      placeholder: placeholder || null,
      help_text: helpText || null,
      section: section || null,
      is_required: isRequired,
      is_unique: isUnique,
      is_visible: isVisible,
      options: needsOptions ? options : [],
      relationship_entity: fieldType === "relationship" ? relEntity : null,
    };

    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, patch: payload });
        toast.success("Field updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Field created");
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit field" : "New custom field"}</DialogTitle>
          <DialogDescription>
            Configure a field for {CUSTOM_FIELD_ENTITIES.find((e) => e.value === entity)?.label}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Label</Label>
            <Input value={label} onChange={(e) => onLabelChange(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Key</Label>
            <Input
              value={key}
              disabled={!!existing}
              onChange={(e) => {
                setKeyDirty(true);
                setKey(slug(e.target.value));
              }}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={fieldType}
              onValueChange={(v) => setFieldType(v as CustomFieldType)}
              disabled={!!existing}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CUSTOM_FIELD_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Section</Label>
            <Input
              value={section}
              onChange={(e) => setSection(e.target.value)}
              placeholder="General"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Placeholder</Label>
            <Input value={placeholder} onChange={(e) => setPlaceholder(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Help text</Label>
            <Textarea value={helpText} rows={2} onChange={(e) => setHelpText(e.target.value)} />
          </div>

          {fieldType === "relationship" && (
            <div className="space-y-2 md:col-span-2">
              <Label>Related entity</Label>
              <Select value={relEntity} onValueChange={setRelEntity}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOM_FIELD_ENTITIES.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {needsOptions && (
            <div className="space-y-2 md:col-span-2">
              <Label>Options</Label>
              <OptionsEditor value={options} onChange={setOptions} />
            </div>
          )}

          <div className="flex items-center justify-between md:col-span-2 gap-4 pt-2 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={isRequired} onCheckedChange={setIsRequired} />
              Required
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={isUnique} onCheckedChange={setIsUnique} />
              Unique
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={isVisible} onCheckedChange={setIsVisible} />
              Visible in forms
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            <Save className="h-4 w-4 " />
            {existing ? "Save changes" : "Create field"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OptionsEditor({
  value,
  onChange,
}: {
  value: CustomFieldOption[];
  onChange: (v: CustomFieldOption[]) => void;
}) {
  const [newLabel, setNewLabel] = useState("");
  const add = () => {
    const l = newLabel.trim();
    if (!l) return;
    const v = slug(l);
    if (value.some((o) => o.value === v)) {
      toast.error("Option already exists");
      return;
    }
    onChange([...value, { label: l, value: v }]);
    setNewLabel("");
  };
  return (
    <div className="space-y-2">
      {value.map((o, i) => (
        <div key={o.value} className="flex items-center gap-2">
          <Input
            value={o.label}
            onChange={(e) => {
              const next = [...value];
              next[i] = { ...o, label: e.target.value };
              onChange(next);
            }}
          />
          <span className="text-xs font-mono text-muted-foreground w-24 truncate">{o.value}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Add option..."
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" onClick={add} variant="secondary">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
