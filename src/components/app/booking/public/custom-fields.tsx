import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type BookingQuestion = {
  id?: string;
  key?: string;
  label: string;
  type: "text" | "textarea" | "email" | "phone" | "number" | "select" | "checkbox";
  required?: boolean;
  options?: string[];
  placeholder?: string;
};

export function CustomFieldsRenderer({
  questions,
  answers,
  onChange,
}: {
  questions: BookingQuestion[];
  answers: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  if (!questions?.length) return null;
  const setVal = (k: string, v: unknown) => onChange({ ...answers, [k]: v });

  return (
    <div className="space-y-3">
      {questions.map((q, i) => {
        const key = q.key ?? q.id ?? `q_${i}`;
        const value = answers[key];
        const label = (
          <Label>
            {q.label}
            {q.required && <span className="text-destructive"> *</span>}
          </Label>
        );
        if (q.type === "textarea") {
          return (
            <div key={key}>
              {label}
              <Textarea
                rows={3}
                placeholder={q.placeholder}
                value={(value as string) ?? ""}
                onChange={(e) => setVal(key, e.target.value)}
              />
            </div>
          );
        }
        if (q.type === "select") {
          return (
            <div key={key}>
              {label}
              <Select value={(value as string) ?? ""} onValueChange={(v) => setVal(key, v)}>
                <SelectTrigger>
                  <SelectValue placeholder={q.placeholder ?? "Select"} />
                </SelectTrigger>
                <SelectContent>
                  {(q.options ?? []).map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }
        if (q.type === "checkbox") {
          return (
            <div key={key} className="flex items-start gap-2 pt-1">
              <Checkbox
                checked={Boolean(value)}
                onCheckedChange={(c) => setVal(key, Boolean(c))}
                id={key}
              />
              <Label htmlFor={key} className="font-normal leading-snug">
                {q.label}
                {q.required && <span className="text-destructive"> *</span>}
              </Label>
            </div>
          );
        }
        const inputType = q.type === "email" ? "email" : q.type === "phone" ? "tel" : q.type === "number" ? "number" : "text";
        return (
          <div key={key}>
            {label}
            <Input
              type={inputType}
              placeholder={q.placeholder}
              value={(value as string | number | undefined) ?? ""}
              onChange={(e) => setVal(key, e.target.value)}
            />
          </div>
        );
      })}
    </div>
  );
}
