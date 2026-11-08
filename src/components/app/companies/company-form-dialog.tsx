import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { X } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateCompany,
  useUpdateCompany,
  type CompanyInput,
  type CompanyRow,
} from "@/hooks/use-companies";
import { useWorkspaceMembers, useCurrentWorkspace } from "@/hooks/use-workspace";
import { CustomFieldsSection } from "@/components/app/custom-fields/custom-fields-section";
import { useTenantCurrency } from "@/hooks/use-currency";

const INDUSTRIES = [
  "Software",
  "SaaS",
  "E-commerce",
  "Retail",
  "Manufacturing",
  "Healthcare",
  "Finance",
  "Education",
  "Real Estate",
  "Media",
  "Consulting",
  "Hospitality",
  "Logistics",
  "Other",
];
const BUSINESS_TYPES = ["B2B", "B2C", "B2B2C", "Marketplace", "Nonprofit", "Government"];
const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5000+"];
const STATUSES = ["active", "prospect", "customer", "partner", "vendor", "inactive"];
const CURRENCIES = ["USD", "EUR", "GBP", "NOK", "SEK", "DKK", "CHF", "CAD", "AUD"];

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: CompanyRow | null;
};

export function CompanyFormDialog({ open, onOpenChange, initial }: Props) {
  const tenantCurrency = useTenantCurrency();
  const isEdit = !!initial;
  const { active } = useCurrentWorkspace();
  const { data: members } = useWorkspaceMembers(active?.id);
  const create = useCreateCompany();
  const update = useUpdateCompany();

  const [form, setForm] = useState<CompanyInput>(() => baseline(initial, tenantCurrency));
  const [tagInput, setTagInput] = useState("");

  useMemo(() => {
    if (open) {
      setForm(baseline(initial, tenantCurrency));
      setTagInput("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const set = <K extends keyof CompanyInput>(k: K, v: CompanyInput[K]) =>
    setForm((s) => ({ ...s, [k]: v }));
  const setAddr = (k: keyof NonNullable<CompanyInput["address"]>, v: string) =>
    setForm((s) => ({ ...s, address: { ...(s.address ?? {}), [k]: v || undefined } }));

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (!(form.tags ?? []).includes(t)) set("tags", [...(form.tags ?? []), t]);
    setTagInput("");
  };
  const removeTag = (t: string) =>
    set(
      "tags",
      (form.tags ?? []).filter((x) => x !== t),
    );

  const submit = async () => {
    if (!form.name?.trim()) return toast.error("Company name is required");
    try {
      if (isEdit && initial) {
        await update.mutateAsync({ id: initial.id, patch: form });
        toast.success("Company updated");
      } else {
        await create.mutateAsync(form);
        toast.success("Company created");
      }
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to save");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit company" : "New company"}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="profile">
          <TabsList className="w-full">
            <TabsTrigger value="profile" className="flex-1">
              Profile
            </TabsTrigger>
            <TabsTrigger value="details" className="flex-1">
              Details
            </TabsTrigger>
            <TabsTrigger value="address" className="flex-1">
              Address
            </TabsTrigger>
            <TabsTrigger value="crm" className="flex-1">
              CRM
            </TabsTrigger>
            <TabsTrigger value="custom" className="flex-1">
              Custom
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="grid gap-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name*">
                <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} />
              </Field>
              <Field label="Legal name">
                <Input
                  value={form.legal_name ?? ""}
                  onChange={(e) => set("legal_name", e.target.value)}
                />
              </Field>
              <Field label="Logo URL">
                <Input
                  value={form.logo_url ?? ""}
                  onChange={(e) => set("logo_url", e.target.value)}
                  placeholder="https://..."
                />
              </Field>
              <Field label="Website">
                <Input
                  value={form.website ?? ""}
                  onChange={(e) => set("website", e.target.value)}
                  placeholder="https://..."
                />
              </Field>
              <Field label="Domain">
                <Input
                  value={form.domain ?? ""}
                  onChange={(e) => set("domain", e.target.value)}
                  placeholder="acme.com"
                />
              </Field>
              <Field label="Email">
                <Input
                  value={form.email ?? ""}
                  onChange={(e) => set("email", e.target.value)}
                  type="email"
                />
              </Field>
              <Field label="Phone">
                <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label="LinkedIn URL">
                <Input
                  value={form.linkedin_url ?? ""}
                  onChange={(e) => set("linkedin_url", e.target.value)}
                />
              </Field>
              <Field label="Twitter handle">
                <Input
                  value={form.twitter_handle ?? ""}
                  onChange={(e) => set("twitter_handle", e.target.value)}
                  placeholder="@acme"
                />
              </Field>
            </div>
            <Field label="Short description">
              <RichTextarea
                rows={2}
                value={form.description ?? ""}
                onChange={(v) => set("description", v)}
              />
            </Field>
            <Field label="About">
              <RichTextarea rows={4} value={form.about ?? ""} onChange={(v) => set("about", v)} />
            </Field>
          </TabsContent>

          <TabsContent value="details" className="grid gap-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Industry">
                <Select
                  value={form.industry ?? ""}
                  onValueChange={(v) => set("industry", v || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((i) => (
                      <SelectItem key={i} value={i}>
                        {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Business type">
                <Select
                  value={form.business_type ?? ""}
                  onValueChange={(v) => set("business_type", v || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {BUSINESS_TYPES.map((i) => (
                      <SelectItem key={i} value={i}>
                        {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Company size">
                <Select
                  value={form.company_size ?? ""}
                  onValueChange={(v) => set("company_size", v || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPANY_SIZES.map((i) => (
                      <SelectItem key={i} value={i}>
                        {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Annual revenue">
                <Input
                  type="number"
                  value={form.annual_revenue ?? ""}
                  onChange={(e) =>
                    set("annual_revenue", e.target.value ? Number(e.target.value) : null)
                  }
                />
              </Field>
              <Field label="Currency">
                <Select
                  value={form.currency ?? tenantCurrency}
                  onValueChange={(v) => set("currency", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((i) => (
                      <SelectItem key={i} value={i}>
                        {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Source">
                <Input
                  value={form.source ?? ""}
                  onChange={(e) => set("source", e.target.value)}
                  placeholder="referral, web, manual"
                />
              </Field>
            </div>
          </TabsContent>

          <TabsContent value="address" className="grid gap-3 pt-3">
            <Field label="Line 1">
              <Input
                value={form.address?.line1 ?? ""}
                onChange={(e) => setAddr("line1", e.target.value)}
              />
            </Field>
            <Field label="Line 2">
              <Input
                value={form.address?.line2 ?? ""}
                onChange={(e) => setAddr("line2", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="City">
                <Input
                  value={form.address?.city ?? ""}
                  onChange={(e) => setAddr("city", e.target.value)}
                />
              </Field>
              <Field label="State">
                <Input
                  value={form.address?.state ?? ""}
                  onChange={(e) => setAddr("state", e.target.value)}
                />
              </Field>
              <Field label="Postal code">
                <Input
                  value={form.address?.postal_code ?? ""}
                  onChange={(e) => setAddr("postal_code", e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Country">
                <Input
                  value={form.address?.country ?? ""}
                  onChange={(e) => {
                    setAddr("country", e.target.value);
                    set("country", e.target.value || null);
                  }}
                />
              </Field>
              <Field label="Timezone">
                <Input
                  value={form.timezone ?? ""}
                  onChange={(e) => set("timezone", e.target.value || null)}
                  placeholder="Europe/Oslo"
                />
              </Field>
            </div>
          </TabsContent>

          <TabsContent value="crm" className="grid gap-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Owner">
                <Select
                  value={form.owner_id ?? ""}
                  onValueChange={(v) => set("owner_id", v || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    {(members ?? []).map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.display_name || m.user_id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status ?? "active"} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Assigned team (id)">
                <Input
                  value={form.assigned_team_id ?? ""}
                  onChange={(e) => set("assigned_team_id", e.target.value || null)}
                  placeholder="Optional"
                />
              </Field>
            </div>
            <Field label="Tags">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(form.tags ?? []).map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-control bg-accent/10 text-accent text-xs px-2 py-1"
                  >
                    {t}
                    <button type="button" onClick={() => removeTag(t)} className="hover:opacity-70">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  placeholder="Add tag"
                />
                <Button type="button" variant="secondary" onClick={addTag}>
                  Add
                </Button>
              </div>
            </Field>
            <div className="flex items-center justify-between rounded-control border p-3">
              <div>
                <div className="text-sm font-medium">Favorite</div>
                <div className="text-xs text-muted-foreground">Pin to your favorites list.</div>
              </div>
              <Switch checked={!!form.is_favorite} onCheckedChange={(v) => set("is_favorite", v)} />
            </div>
            <div className="flex items-center justify-between rounded-control border p-3">
              <div>
                <div className="text-sm font-medium">Archived</div>
                <div className="text-xs text-muted-foreground">Hide from default lists.</div>
              </div>
              <Switch checked={!!form.is_archived} onCheckedChange={(v) => set("is_archived", v)} />
            </div>
          </TabsContent>

          <TabsContent value="custom" className="grid gap-3 pt-3">
            <CustomFieldsSection
              entity="company"
              values={(form.custom_fields ?? {}) as Record<string, unknown>}
              onChange={(v: Record<string, unknown>) => set("custom_fields", v)}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/** `fallbackCurrency` is required: a new company is created in the tenant's currency. */
function baseline(c: CompanyRow | null | undefined, fallbackCurrency: string): CompanyInput {
  return {
    name: c?.name ?? "",
    legal_name: c?.legal_name ?? null,
    domain: c?.domain ?? null,
    website: c?.website ?? null,
    industry: c?.industry ?? null,
    business_type: c?.business_type ?? null,
    company_size: c?.company_size ?? null,
    annual_revenue: c?.annual_revenue ?? null,
    currency: c?.currency ?? fallbackCurrency,
    phone: c?.phone ?? null,
    email: c?.email ?? null,
    description: c?.description ?? null,
    about: c?.about ?? null,
    logo_url: c?.logo_url ?? null,
    linkedin_url: c?.linkedin_url ?? null,
    twitter_handle: c?.twitter_handle ?? null,
    status: c?.status ?? "active",
    source: c?.source ?? null,
    tags: c?.tags ?? [],
    address: c?.address ?? {},
    country: c?.country ?? null,
    timezone: c?.timezone ?? null,
    owner_id: c?.owner_id ?? null,
    assigned_team_id: c?.assigned_team_id ?? null,
    custom_fields: c?.custom_fields ?? {},
    is_favorite: c?.is_favorite ?? false,
    is_archived: c?.is_archived ?? false,
  };
}
