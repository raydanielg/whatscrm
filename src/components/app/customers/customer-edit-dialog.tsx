import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useUpdateCustomer, CUSTOMER_STATUSES, type CustomerRow, type CustomerPatch } from "@/hooks/use-customers";

type Props = { open: boolean; onOpenChange: (v: boolean) => void; customer: CustomerRow | null };

export function CustomerEditDialog({ open, onOpenChange, customer }: Props) {
  const update = useUpdateCustomer();
  const [form, setForm] = useState<CustomerPatch>({});
  const [segInput, setSegInput] = useState("");
  const [prefsText, setPrefsText] = useState("{}");

  useEffect(() => {
    if (open && customer) {
      setForm({
        customer_status: customer.customer_status ?? "active",
        customer_lifetime_value: customer.customer_lifetime_value ?? null,
        customer_health_score: customer.customer_health_score ?? 50,
        segments: customer.segments ?? [],
      });
      setPrefsText(JSON.stringify(customer.preferences ?? {}, null, 2));
      setSegInput("");
    }
  }, [open, customer]);

  const addSeg = () => {
    const s = segInput.trim();
    if (!s) return;
    if (!(form.segments ?? []).includes(s)) setForm((f) => ({ ...f, segments: [...(f.segments ?? []), s] }));
    setSegInput("");
  };
  const removeSeg = (s: string) => setForm((f) => ({ ...f, segments: (f.segments ?? []).filter((x) => x !== s) }));

  const submit = async () => {
    if (!customer) return;
    let preferences: Record<string, unknown> | undefined;
    try {
      preferences = prefsText.trim() ? JSON.parse(prefsText) : {};
    } catch {
      return toast.error("Preferences must be valid JSON");
    }
    try {
      await update.mutateAsync({ id: customer.id, patch: { ...form, preferences } });
      toast.success("Customer updated");
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to save");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit customer profile</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Field label="Status">
            <Select value={form.customer_status ?? "active"} onValueChange={(v) => setForm((f) => ({ ...f, customer_status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CUSTOMER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Lifetime value (LTV)">
            <Input type="number" value={form.customer_lifetime_value ?? ""} onChange={(e) => setForm((f) => ({ ...f, customer_lifetime_value: e.target.value ? Number(e.target.value) : null }))} />
          </Field>
          <Field label={`Health score: ${form.customer_health_score ?? 0}`}>
            <Slider value={[form.customer_health_score ?? 0]} min={0} max={100} step={1} onValueChange={([v]) => setForm((f) => ({ ...f, customer_health_score: v }))} />
          </Field>
          <Field label="Segments">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(form.segments ?? []).map((s) => (
                <span key={s} className="inline-flex items-center gap-1 rounded-control bg-accent/10 text-accent text-xs px-2 py-1">
                  {s}
                  <button type="button" onClick={() => removeSeg(s)} className="hover:opacity-70"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={segInput} onChange={(e) => setSegInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSeg())} placeholder="Enterprise, SMB, high-value" />
              <Button type="button" variant="secondary" onClick={addSeg}>Add</Button>
            </div>
          </Field>
          <Field label="Preferences (JSON)">
            <Textarea rows={4} value={prefsText} onChange={(e) => setPrefsText(e.target.value)} className="font-mono text-xs" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={update.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}
