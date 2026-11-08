import { useEffect, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateDeal, useUpdateDeal, usePipelines, useStages,
  useContactsLite, useCompaniesLite,
  DEAL_PRIORITIES, DEAL_STATUSES, CURRENCIES,
  type DealInput, type DealRow,
} from "@/hooks/use-deals";
import { useWorkspaceMembers } from "@/hooks/use-workspace";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useTenantCurrency } from "@/hooks/use-currency";
import { DatePicker } from "@/shared/components";
import { format as fmtDate, parseISO } from "date-fns";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: DealRow | null;
  defaults?: DealInput;
};

/** `fallbackCurrency` is required: a default of "USD" here silently overrode the tenant's. */
function baseline(initial: DealRow | null | undefined, defaults: DealInput | undefined, fallbackCurrency: string): DealInput {
  if (initial) {
    return {
      title: initial.title,
      description: initial.description,
      amount: initial.amount,
      currency: initial.currency,
      probability: initial.probability,
      status: initial.status,
      priority: initial.priority,
      pipeline_id: initial.pipeline_id,
      stage_id: initial.stage_id,
      owner_id: initial.owner_id,
      contact_id: initial.contact_id,
      company_id: initial.company_id,
      expected_close_date: initial.expected_close_date,
      source: initial.source,
      tags: initial.tags ?? [],
    };
  }
  return {
    title: "",
    amount: 0,
    currency: fallbackCurrency,
    probability: 10,
    status: "open",
    priority: "normal",
    tags: [],
    ...defaults,
  };
}

export function DealFormDialog({ open, onOpenChange, initial, defaults }: Props) {
  const isEdit = !!initial;
  const { active } = useCurrentWorkspace();
  const tenantCurrency = useTenantCurrency();
  const { data: members } = useWorkspaceMembers(active?.id);
  const { data: pipelines } = usePipelines();
  const create = useCreateDeal();
  const update = useUpdateDeal();

  const [form, setForm] = useState<DealInput>(() => baseline(initial, defaults, tenantCurrency));
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (open) {
      setForm(baseline(initial, defaults, tenantCurrency));
      setTagInput("");
    }
  }, [open, initial, defaults]);

  const set = <K extends keyof DealInput>(k: K, v: DealInput[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const pipelineId = form.pipeline_id ?? pipelines?.find((p) => p.is_default)?.id ?? pipelines?.[0]?.id ?? null;
  const { data: stages } = useStages(pipelineId);

  // Auto-set pipeline when creating new & pipelines load
  useEffect(() => {
    if (!isEdit && !form.pipeline_id && pipelines?.length) {
      const def = pipelines.find((p) => p.is_default) ?? pipelines[0];
      setForm((s) => ({ ...s, pipeline_id: def.id }));
    }
  }, [pipelines, isEdit, form.pipeline_id]);

  // Auto-set stage when pipeline changes / stages load
  useEffect(() => {
    if (!form.stage_id && stages?.length) {
      setForm((s) => ({ ...s, stage_id: stages[0].id, probability: stages[0].probability }));
    }
  }, [stages, form.stage_id]);

  const { data: contacts } = useContactsLite();
  const { data: companies } = useCompaniesLite();

  const contactOptions = useMemo(() => contacts ?? [], [contacts]);
  const companyOptions = useMemo(() => companies ?? [], [companies]);

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (!(form.tags ?? []).includes(t)) set("tags", [...(form.tags ?? []), t]);
    setTagInput("");
  };
  const removeTag = (t: string) => set("tags", (form.tags ?? []).filter((x) => x !== t));

  const busy = create.isPending || update.isPending;

  const submit = async () => {
    if (!form.title?.trim()) {
      toast.error("Please enter a title");
      return;
    }
    try {
      if (isEdit && initial) {
        await update.mutateAsync({ id: initial.id, patch: form });
        toast.success("Deal updated");
      } else {
        await create.mutateAsync(form);
        toast.success("Deal created");
      }
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save";
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit deal" : "New deal"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update deal details, owner, stage, or value." : "Create a new opportunity in your sales pipeline."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input
              value={form.title ?? ""}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Northwind expansion"
              autoFocus
            />
          </div>

          <div>
            <Label>Description</Label>
            <RichTextarea
              rows={3}
              value={form.description ?? ""}
              onChange={(value) => set("description", value)}
              placeholder="Deal context, requirements, next steps..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.amount ?? 0}
                onChange={(e) => set("amount", Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>Currency</Label>
              <Select value={form.currency ?? tenantCurrency} onValueChange={(v) => set("currency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Expected close</Label>
              <DatePicker
                value={form.expected_close_date ? parseISO(form.expected_close_date) : undefined}
                onChange={(d) => set("expected_close_date", d ? fmtDate(d, "yyyy-MM-dd") : null)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Pipeline</Label>
              <Select
                value={form.pipeline_id ?? undefined}
                onValueChange={(v) => setForm((s) => ({ ...s, pipeline_id: v, stage_id: null }))}
              >
                <SelectTrigger><SelectValue placeholder="Select pipeline" /></SelectTrigger>
                <SelectContent>
                  {(pipelines ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Stage</Label>
              <Select
                value={form.stage_id ?? undefined}
                onValueChange={(v) => {
                  const st = stages?.find((s) => s.id === v);
                  setForm((s) => ({
                    ...s,
                    stage_id: v,
                    probability: st?.probability ?? s.probability,
                    status: st?.is_won ? "won" : st?.is_lost ? "lost" : "open",
                  }));
                }}
                disabled={!stages?.length}
              >
                <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
                <SelectContent>
                  {(stages ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Win probability — {form.probability ?? 0}%</Label>
            <Slider
              value={[form.probability ?? 0]}
              min={0}
              max={100}
              step={5}
              onValueChange={([v]) => set("probability", v)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Priority</Label>
              <Select value={form.priority ?? "normal"} onValueChange={(v) => set("priority", v as DealInput["priority"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEAL_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status ?? "open"} onValueChange={(v) => set("status", v as DealInput["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEAL_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Owner</Label>
              <Select
                value={form.owner_id ?? "__none__"}
                onValueChange={(v) => set("owner_id", v === "__none__" ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {(members ?? []).map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.display_name ?? m.email ?? m.user_id.slice(0, 6)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Related contact</Label>
              <Select
                value={form.contact_id ?? "__none__"}
                onValueChange={(v) => set("contact_id", v === "__none__" ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {contactOptions.slice(0, 200).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.phone || c.id.slice(0, 6)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Related company</Label>
              <Select
                value={form.company_id ?? "__none__"}
                onValueChange={(v) => set("company_id", v === "__none__" ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {companyOptions.slice(0, 200).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Source</Label>
            <Input
              value={form.source ?? ""}
              onChange={(e) => set("source", e.target.value)}
              placeholder="e.g. Inbound, WhatsApp, Referral"
            />
          </div>

          <div>
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                placeholder="Add a tag and press Enter"
              />
              <Button type="button" variant="outline" onClick={addTag}>Add</Button>
            </div>
            {(form.tags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(form.tags ?? []).map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1">
                    {t}
                    <button onClick={() => removeTag(t)} className="hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            {isEdit ? "Save changes" : "Create deal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
