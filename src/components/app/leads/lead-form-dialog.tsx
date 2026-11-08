import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useCreateLead, useUpdateLead, LEAD_STATUSES, LEAD_RATINGS, LEAD_SOURCES, type LeadInput, type LeadRow } from "@/hooks/use-leads";
import { useWorkspaceMembers, useCurrentWorkspace } from "@/hooks/use-workspace";
import { DateTimePicker } from "@/shared/components";
import { CustomFieldsSection } from "@/components/app/custom-fields/custom-fields-section";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: LeadRow | null;
};

export function LeadFormDialog({ open, onOpenChange, initial }: Props) {
  const isEdit = !!initial;
  const { active } = useCurrentWorkspace();
  const { data: members } = useWorkspaceMembers(active?.id);
  const create = useCreateLead();
  const update = useUpdateLead();

  const [form, setForm] = useState<LeadInput>(() => baseline(initial));
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (open) { setForm(baseline(initial)); setTagInput(""); }
  }, [open, initial]);

  const set = <K extends keyof LeadInput>(k: K, v: LeadInput[K]) => setForm((s) => ({ ...s, [k]: v }));

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (!(form.tags ?? []).includes(t)) set("tags", [...(form.tags ?? []), t]);
    setTagInput("");
  };
  const removeTag = (t: string) => set("tags", (form.tags ?? []).filter((x) => x !== t));

  const submit = async () => {
    if (!form.email && !form.phone && !form.first_name && !form.last_name && !form.company_name) {
      return toast.error("Enter at least a name, email, phone or company");
    }
    try {
      if (isEdit && initial) {
        await update.mutateAsync({ id: initial.id, patch: form });
        toast.success("Lead updated");
      } else {
        await create.mutateAsync(form);
        toast.success("Lead captured");
      }
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to save");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Edit lead" : "New lead"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name"><Input value={form.first_name ?? ""} onChange={(e) => set("first_name", e.target.value)} /></Field>
            <Field label="Last name"><Input value={form.last_name ?? ""} onChange={(e) => set("last_name", e.target.value)} /></Field>
            <Field label="Email"><Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label="Phone"><Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
            <Field label="Company"><Input value={form.company_name ?? ""} onChange={(e) => set("company_name", e.target.value)} /></Field>
            <Field label="Job title"><Input value={form.job_title ?? ""} onChange={(e) => set("job_title", e.target.value)} /></Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Source">
              <Select value={form.source ?? "manual"} onValueChange={(v) => set("source", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LEAD_SOURCES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status ?? "new"} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Rating">
              <Select value={form.rating ?? "none"} onValueChange={(v) => set("rating", v === "none" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unrated</SelectItem>
                  {LEAD_RATINGS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Owner">
              <Select value={form.owner_id ?? "unassigned"} onValueChange={(v) => set("owner_id", v === "unassigned" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {(members ?? []).map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.display_name || m.user_id.slice(0, 8)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Next follow-up">
              <DateTimePicker
                value={form.next_follow_up_at ? new Date(form.next_follow_up_at) : undefined}
                onChange={(d) => set("next_follow_up_at", d ? d.toISOString() : null)}
              />
            </Field>
          </div>

          <Field label={`Lead score: ${form.score ?? 0}`}>
            <Slider value={[form.score ?? 0]} min={0} max={100} step={1} onValueChange={([v]) => set("score", v)} />
          </Field>
          <Field label="Score reason">
            <Input value={form.score_reason ?? ""} onChange={(e) => set("score_reason", e.target.value)} placeholder="Why this score?" />
          </Field>

          <Field label="Tags">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(form.tags ?? []).map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-control bg-accent/10 text-accent text-xs px-2 py-1">
                  {t}
                  <button type="button" onClick={() => removeTag(t)} className="hover:opacity-70"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())} placeholder="Add tag" />
              <Button type="button" variant="secondary" onClick={addTag}>Add</Button>
            </div>
          </Field>

          <Field label="Notes"><RichTextarea rows={3} value={form.notes ?? ""} onChange={(value) => set("notes", value)} /></Field>
          <CustomFieldsSection
            entity="lead"
            values={form.custom_fields ?? {}}
            onChange={(next) => set("custom_fields", next)}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>{isEdit ? "Save" : "Capture"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}

function baseline(l?: LeadRow | null): LeadInput {
  return {
    first_name: l?.first_name ?? null,
    last_name: l?.last_name ?? null,
    email: l?.email ?? null,
    phone: l?.phone ?? null,
    company_name: l?.company_name ?? null,
    job_title: l?.job_title ?? null,
    source: l?.source ?? "manual",
    status: l?.status ?? "new",
    score: l?.score ?? 0,
    score_reason: l?.score_reason ?? null,
    rating: l?.rating ?? null,
    owner_id: l?.owner_id ?? null,
    next_follow_up_at: l?.next_follow_up_at ?? null,
    tags: l?.tags ?? [],
    notes: l?.notes ?? null,
    custom_fields: l?.custom_fields ?? {},
  };
}
