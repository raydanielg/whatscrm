import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useConvertLead, type LeadRow } from "@/hooks/use-leads";
import { useTenantCurrency } from "@/hooks/use-currency";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: LeadRow | null;
};

export function ConvertLeadDialog({ open, onOpenChange, lead }: Props) {
  const convert = useConvertLead();
  const navigate = useNavigate();
  const [createContact, setCreateContact] = useState(true);
  const [createCompany, setCreateCompany] = useState(true);
  const [createDeal, setCreateDeal] = useState(false);
  const [dealTitle, setDealTitle] = useState("");
  const [dealAmount, setDealAmount] = useState("");
  const tenantCurrency = useTenantCurrency();
  const [currency, setCurrency] = useState(tenantCurrency);

  const submit = async () => {
    if (!lead) return;
    if (createDeal && !dealTitle.trim()) return toast.error("Deal title is required");
    try {
      const res = await convert.mutateAsync({
        leadId: lead.id,
        createContact,
        createCompany: createCompany && !!lead.company_name,
        createDeal,
        deal: createDeal ? { title: dealTitle.trim(), amount: dealAmount ? Number(dealAmount) : null, currency } : undefined,
      });
      toast.success("Lead converted");
      onOpenChange(false);
      if (res.contactId) navigate({ to: "/contacts/$contactId", params: { contactId: res.contactId } });
    } catch (e: unknown) {
      toast.error((e as Error).message || "Conversion failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Convert lead to customer</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">Choose what to create from this lead. The lead will be marked as converted.</p>
          <div className="rounded-control border p-3 space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox checked={createContact} onCheckedChange={(v) => setCreateContact(!!v)} />
              <div>
                <div className="font-medium">Create customer contact</div>
                <div className="text-xs text-muted-foreground">Marks lifecycle stage as customer.</div>
              </div>
            </label>
            <label className={`flex items-start gap-2 ${lead?.company_name ? "cursor-pointer" : "opacity-50"}`}>
              <Checkbox checked={createCompany && !!lead?.company_name} disabled={!lead?.company_name} onCheckedChange={(v) => setCreateCompany(!!v)} />
              <div>
                <div className="font-medium">Create company</div>
                <div className="text-xs text-muted-foreground">{lead?.company_name ? `Adds "${lead.company_name}" to Companies.` : "No company name on this lead."}</div>
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox checked={createDeal} onCheckedChange={(v) => setCreateDeal(!!v)} />
              <div>
                <div className="font-medium">Create deal</div>
                <div className="text-xs text-muted-foreground">Start a new opportunity for this customer.</div>
              </div>
            </label>
          </div>
          {createDeal && (
            <div className="grid gap-2 rounded-control border p-3">
              <Label className="text-xs text-muted-foreground">Deal title</Label>
              <Input value={dealTitle} onChange={(e) => setDealTitle(e.target.value)} placeholder="Enterprise plan — Q1" />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Amount</Label>
                  <Input type="number" value={dealAmount} onChange={(e) => setDealAmount(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Currency</Label>
                  <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
                </div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={convert.isPending}>Convert</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
