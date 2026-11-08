import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { DatePicker, DateTimePicker, fromDateString, toDateString, fromLocalDateTimeString, toLocalDateTimeString } from "@/shared/components";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Upload, Loader2 } from "lucide-react";
import {
  useCustomFields,
  uploadCustomFieldFile,
  type CustomFieldDefinition,
  type CustomFieldEntity,
} from "@/hooks/use-custom-fields";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CustomFieldValues = Record<string, unknown>;

interface Props {
  entity: CustomFieldEntity;
  values: CustomFieldValues;
  onChange: (next: CustomFieldValues) => void;
  columns?: 1 | 2;
}

export function CustomFieldsSection({ entity, values, onChange, columns = 2 }: Props) {
  const { data: fields = [], isLoading } = useCustomFields(entity);
  const visible = useMemo(() => fields.filter((f) => f.is_visible), [fields]);

  if (isLoading) return null;
  if (!visible.length)
    return (
      <p className="text-sm text-muted-foreground">
        No custom fields configured. Add fields from Settings → Custom Fields.
      </p>
    );

  const set = (key: string, val: unknown) => onChange({ ...values, [key]: val });

  const grouped = visible.reduce<Record<string, CustomFieldDefinition[]>>((acc, f) => {
    const s = f.section || "General";
    acc[s] = acc[s] || [];
    acc[s].push(f);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([section, list]) => (
        <div key={section} className="space-y-4">
          {Object.keys(grouped).length > 1 && (
            <h4 className="text-sm font-semibold text-muted-foreground">{section}</h4>
          )}
          <div
            className={
              columns === 2
                ? "grid grid-cols-1 md:grid-cols-2 gap-4"
                : "grid grid-cols-1 gap-4"
            }
          >
            {list.map((field) => (
              <CustomFieldControl
                key={field.id}
                field={field}
                value={values[field.key]}
                onChange={(v) => set(field.key, v)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CustomFieldControl({
  field,
  value,
  onChange,
}: {
  field: CustomFieldDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const wide =
    field.field_type === "textarea" ||
    field.field_type === "multi_select" ||
    field.field_type === "file" ||
    field.field_type === "image";

  return (
    <div className={wide ? "md:col-span-2 space-y-2" : "space-y-2"}>
      <Label className="flex items-center gap-1">
        {field.label}
        {field.is_required && <span className="text-destructive">*</span>}
      </Label>
      <FieldInput field={field} value={value} onChange={onChange} />
      {field.help_text && (
        <p className="text-xs text-muted-foreground">{field.help_text}</p>
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: CustomFieldDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const placeholder = field.placeholder ?? "";
  switch (field.field_type) {
    case "text":
    case "email":
    case "phone":
    case "url":
      return (
        <Input
          type={
            field.field_type === "email"
              ? "email"
              : field.field_type === "url"
              ? "url"
              : field.field_type === "phone"
              ? "tel"
              : "text"
          }
          value={(value as string) ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "textarea":
      return (
        <Textarea
          value={(value as string) ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
        />
      );
    case "number":
    case "decimal":
    case "currency":
      return (
        <Input
          type="number"
          step={field.field_type === "number" ? "1" : "0.01"}
          value={(value as number | string) ?? ""}
          placeholder={placeholder}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Number(e.target.value))
          }
        />
      );
    case "date":
      return (
        <DatePicker
          value={fromDateString((value as string) ?? "")}
          onChange={(d) => onChange(toDateString(d))}
        />
      );
    case "datetime":
      return (
        <DateTimePicker
          value={fromLocalDateTimeString((value as string) ?? "")}
          onChange={(d) => onChange(toLocalDateTimeString(d))}
        />
      );
    case "boolean":
    case "checkbox":
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={Boolean(value)}
            onCheckedChange={(v) => onChange(Boolean(v))}
          />
          <span className="text-sm text-muted-foreground">
            {placeholder || "Enabled"}
          </span>
        </div>
      );
    case "switch":
      return (
        <div className="flex items-center gap-2">
          <Switch
            checked={Boolean(value)}
            onCheckedChange={(v) => onChange(Boolean(v))}
          />
          <span className="text-sm text-muted-foreground">
            {placeholder || "Enabled"}
          </span>
        </div>
      );
    case "select":
      return (
        <Select
          value={(value as string) ?? ""}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger>
            <SelectValue placeholder={placeholder || "Select..."} />
          </SelectTrigger>
          <SelectContent>
            {(field.options || []).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "radio":
      return (
        <RadioGroup
          value={(value as string) ?? ""}
          onValueChange={(v) => onChange(v)}
          className="flex flex-wrap gap-4"
        >
          {(field.options || []).map((o) => (
            <div key={o.value} className="flex items-center gap-2">
              <RadioGroupItem value={o.value} id={`${field.id}-${o.value}`} />
              <Label htmlFor={`${field.id}-${o.value}`} className="font-normal">
                {o.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      );
    case "multi_select":
      return (
        <MultiSelectField field={field} value={value} onChange={onChange} />
      );
    case "file":
      return <FileUploadField field={field} value={value} onChange={onChange} accept="*/*" />;
    case "image":
      return <FileUploadField field={field} value={value} onChange={onChange} accept="image/*" preview />;
    case "relationship":
      return (
        <Input
          value={(value as string) ?? ""}
          placeholder={placeholder || `Enter ${field.relationship_entity ?? "record"} ID`}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    default:
      return (
        <Input
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

function MultiSelectField({
  field,
  value,
  onChange,
}: {
  field: CustomFieldDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const selected = Array.isArray(value) ? (value as string[]) : [];
  const remaining = (field.options || []).filter((o) => !selected.includes(o.value));
  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((v) => {
            const opt = field.options?.find((o) => o.value === v);
            return (
              <Badge key={v} variant="secondary" className="gap-1">
                {opt?.label ?? v}
                <button
                  type="button"
                  onClick={() => onChange(selected.filter((s) => s !== v))}
                  className="hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
      <Select
        value=""
        onValueChange={(v) => v && onChange([...selected, v])}
      >
        <SelectTrigger>
          <SelectValue
            placeholder={
              remaining.length ? field.placeholder || "Add option..." : "All selected"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {remaining.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FileUploadField({
  field,
  value,
  onChange,
  accept,
  preview,
}: {
  field: CustomFieldDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
  accept?: string;
  preview?: boolean;
}) {
  const { active } = useCurrentWorkspace();
  const [uploading, setUploading] = useState(false);
  const current = value as { path?: string; url?: string; name?: string } | null;
  const filePath = current?.path;
  const { data: signedUrl, isError: fileUrlError } = useQuery({
    queryKey: ["custom-field-file-url", active?.id, filePath],
    enabled: !!active?.id && !!filePath && filePath.startsWith(`${active.id}/`),
    staleTime: 50 * 60_000,
    refetchInterval: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("custom-fields")
        .createSignedUrl(filePath!, 60 * 60);
      if (error || !data?.signedUrl) throw error ?? new Error("Could not access file");
      return data.signedUrl;
    },
  });
  const displayUrl = filePath ? signedUrl : current?.url;

  const handle = async (file: File) => {
    if (!active?.id) return;
    try {
      setUploading(true);
      const res = await uploadCustomFieldFile({
        workspaceId: active.id,
        entity: field.entity_type,
        fieldKey: field.key,
        file,
      });
      onChange({ path: res.path, url: res.url, name: file.name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      {displayUrl && preview && (
        <img
          src={displayUrl}
          alt={current?.name || ""}
          className="h-24 w-24 rounded-control object-cover border"
        />
      )}
      {displayUrl && !preview && (
        <a
          href={displayUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-primary underline"
        >
          {current?.name || "View file"}
        </a>
      )}
      {fileUrlError && <p className="text-xs text-destructive">Could not load this file.</p>}
      <div className="flex items-center gap-2">
        <label className="cursor-pointer">
          <input
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handle(f);
            }}
          />
          <Button type="button" variant="outline" size="sm" asChild>
            <span>
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin " />
              ) : (
                <Upload className="h-4 w-4 " />
              )}
              {current?.url ? "Replace" : "Upload"}
            </span>
          </Button>
        </label>
        {current?.url && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(null)}
          >
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
