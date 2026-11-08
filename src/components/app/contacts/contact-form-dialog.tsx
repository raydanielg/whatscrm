import { useEffect, useRef, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X, Plus, Star, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateContact,
  useUpdateContact,
  useUploadContactAvatar,
  isValidEmail,
  isValidPhone,
  type ContactInput,
  type ContactRow,
  type EmailEntry,
  type PhoneEntry,
} from "@/hooks/use-contacts";

import { useWorkspaceMembers, useCurrentWorkspace } from "@/hooks/use-workspace";
import { useCompaniesLite } from "@/hooks/use-deals";
import { Autocomplete } from "@/shared/components/autocomplete";
import { CustomFieldsSection } from "@/components/app/custom-fields/custom-fields-section";
import { BirthdayPicker } from "@/shared/components";
import { format as fmtDate, parseISO } from "date-fns";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contact?: ContactRow | null;
};

const LEAD_STATUS = ["new", "contacted", "qualified", "proposal", "won", "lost"];
const CUSTOMER_STATUS = ["prospect", "active", "at_risk", "churned", "vip"];
const LIFECYCLE = ["lead", "opportunity", "customer", "other"];

export function ContactFormDialog({ open, onOpenChange, contact }: Props) {
  const isEdit = !!contact;
  const { active } = useCurrentWorkspace();
  const { data: members } = useWorkspaceMembers(active?.id);
  const create = useCreateContact();
  const update = useUpdateContact();
  const uploadAvatar = useUploadContactAvatar();
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const { data: companies } = useCompaniesLite();
  const [form, setForm] = useState<ContactInput>({});
  const [tagInput, setTagInput] = useState("");
  const [errors, setErrors] = useState<{ emails?: string[]; phones?: string[]; general?: string }>(
    {},
  );

  const isPending = create.isPending || update.isPending;

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !active?.id) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Image must be under 5 MB");
    if (!file.type.startsWith("image/")) return toast.error("File must be an image");
    try {
      const url = await uploadAvatar.mutateAsync({ workspaceId: active.id, file });
      setField("avatar_url", url);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  useEffect(() => {
    if (open) {
      setErrors({});
      setTagInput("");
      setForm(
        contact
          ? {
              first_name: contact.first_name,
              last_name: contact.last_name,
              display_name:
                contact.display_name ||
                (!contact.first_name && !contact.last_name ? contact.name : null),
              avatar_url: contact.avatar_url,
              job_title: contact.job_title,
              department: contact.department,
              company_id: contact.company_id,
              phones: contact.phones?.length
                ? contact.phones.map((phone) => ({ ...phone }))
                : contact.phone
                  ? [{ number: contact.phone, is_primary: true }]
                  : [],
              emails: contact.emails?.length
                ? contact.emails.map((email) => ({ ...email }))
                : contact.email
                  ? [{ email: contact.email, is_primary: true }]
                  : [],
              whatsapp: contact.whatsapp,
              birthday: contact.birthday,
              website: contact.website,
              address: contact.address ?? {},
              tags: contact.tags ?? [],
              notes: contact.notes,
              lifecycle_stage: contact.lifecycle_stage,
              lead_status: contact.lead_status,
              customer_status: contact.customer_status,
              owner_id: contact.owner_id,
              assigned_agent_id: contact.assigned_agent_id,
              is_favorite: contact.is_favorite,
              is_archived: contact.is_archived,
              do_not_contact: contact.do_not_contact,
              custom_fields: contact.custom_fields ?? {},
            }
          : {
              phones: [],
              emails: [],
              tags: [],
              address: {},
              lifecycle_stage: "lead",
              custom_fields: {},
            },
      );
    }
  }, [open, contact]);

  const setField = <K extends keyof ContactInput>(k: K, v: ContactInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const addPhone = () =>
    setField("phones", [...(form.phones ?? []), { number: "", label: "mobile" }]);
  const updPhone = (i: number, patch: Partial<PhoneEntry>) => {
    const next = [...(form.phones ?? [])];
    next[i] = { ...next[i], ...patch };
    setField("phones", next);
  };
  const rmPhone = (i: number) =>
    setField(
      "phones",
      (form.phones ?? []).filter((_, idx) => idx !== i),
    );
  const setPrimaryPhone = (i: number) =>
    setField(
      "phones",
      (form.phones ?? []).map((p, idx) => ({ ...p, is_primary: idx === i })),
    );

  const addEmail = () => setField("emails", [...(form.emails ?? []), { email: "", label: "work" }]);
  const updEmail = (i: number, patch: Partial<EmailEntry>) => {
    const next = [...(form.emails ?? [])];
    next[i] = { ...next[i], ...patch };
    setField("emails", next);
  };
  const rmEmail = (i: number) =>
    setField(
      "emails",
      (form.emails ?? []).filter((_, idx) => idx !== i),
    );
  const setPrimaryEmail = (i: number) =>
    setField(
      "emails",
      (form.emails ?? []).map((e, idx) => ({ ...e, is_primary: idx === i })),
    );

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (!(form.tags ?? []).includes(t)) setField("tags", [...(form.tags ?? []), t]);
    setTagInput("");
  };
  const rmTag = (t: string) =>
    setField(
      "tags",
      (form.tags ?? []).filter((x) => x !== t),
    );

  const submit = async () => {
    if (isPending) return; // double-submit guard
    // Clean empty rows before validation
    const cleanPhones = (form.phones ?? []).filter((p) => p.number.trim());
    const cleanEmails = (form.emails ?? []).filter((e) => e.email.trim());

    // Validation
    const emailErrs = cleanEmails
      .map((e) => (isValidEmail(e.email) ? "" : `Invalid email: ${e.email}`))
      .filter(Boolean);
    const phoneErrs = cleanPhones
      .map((p) => (isValidPhone(p.number) ? "" : `Invalid phone: ${p.number}`))
      .filter(Boolean);
    const nameOk =
      (form.first_name && form.first_name.trim()) ||
      (form.last_name && form.last_name.trim()) ||
      (form.display_name && form.display_name.trim()) ||
      cleanEmails[0] ||
      cleanPhones[0];
    const general = !nameOk ? "A name, email, or phone is required." : undefined;
    if (emailErrs.length || phoneErrs.length || general) {
      setErrors({ emails: emailErrs, phones: phoneErrs, general });
      toast.error(general ?? emailErrs[0] ?? phoneErrs[0] ?? "Validation failed");
      return;
    }
    setErrors({});

    const payload: ContactInput = { ...form, phones: cleanPhones, emails: cleanEmails };
    try {
      if (isEdit && contact) {
        await update.mutateAsync({ id: contact.id, patch: payload });
        toast.success("Contact updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Contact created");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save contact");
    }
  };

  const address = form.address ?? {};

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && isPending) return;
        onOpenChange(v);
      }}
    >
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onEscapeKeyDown={(e) => {
          if (isPending) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (isPending) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (isPending) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit contact" : "New contact"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basic" className="mt-2">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="contact">Contact</TabsTrigger>
            <TabsTrigger value="crm">CRM</TabsTrigger>
            <TabsTrigger value="address">Address</TabsTrigger>
            <TabsTrigger value="more">More</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-3 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First name</Label>
                <Input
                  value={form.first_name ?? ""}
                  onChange={(e) => setField("first_name", e.target.value)}
                />
              </div>
              <div>
                <Label>Last name</Label>
                <Input
                  value={form.last_name ?? ""}
                  onChange={(e) => setField("last_name", e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>Display name</Label>
              <Input
                value={form.display_name ?? ""}
                onChange={(e) => setField("display_name", e.target.value)}
                placeholder="Optional override"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Job title</Label>
                <Input
                  value={form.job_title ?? ""}
                  onChange={(e) => setField("job_title", e.target.value)}
                />
              </div>
              <div>
                <Label>Department</Label>
                <Input
                  value={form.department ?? ""}
                  onChange={(e) => setField("department", e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>Company</Label>
              <Autocomplete
                options={(companies ?? []).map((c) => ({
                  value: c.id,
                  label: c.name,
                  description: c.industry ?? undefined,
                }))}
                value={form.company_id ?? null}
                onValueChange={(v) => setField("company_id", v)}
                placeholder="Select company"
                searchPlaceholder="Search companies"
                emptyText="No companies found."
              />
            </div>
            <div>
              <Label>Avatar</Label>
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10 shrink-0">
                  <AvatarImage src={form.avatar_url ?? undefined} alt="" />
                  <AvatarFallback className="text-xs">
                    {(form.display_name || form.first_name || "?")[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => avatarFileRef.current?.click()}
                  disabled={uploadAvatar.isPending}
                >
                  {uploadAvatar.isPending && (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  )}
                  Upload
                </Button>
                <input
                  ref={avatarFileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleAvatarFile}
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm">
                      Choose preset
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3">
                    <p className="text-xs text-muted-foreground mb-2">Pick a preset avatar</p>
                    <div className="grid grid-cols-4 gap-2">
                      {Array.from({ length: 12 }, (_, i) => `/avatars/preset-${i + 1}.svg`).map(
                        (url) => (
                          <button
                            key={url}
                            type="button"
                            className="rounded-control overflow-hidden border border-border hover:ring-2 hover:ring-ring transition-shadow"
                            onClick={() => setField("avatar_url", url)}
                          >
                            <img src={url} alt="" className="w-full h-full aspect-square" />
                          </button>
                        ),
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div>
              <Label>Birthday</Label>
              <BirthdayPicker
                value={form.birthday ? parseISO(form.birthday) : undefined}
                onChange={(d) => setField("birthday", d ? fmtDate(d, "yyyy-MM-dd") : null)}
              />
            </div>
          </TabsContent>

          <TabsContent value="contact" className="space-y-4 pt-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Phone numbers</Label>
                <Button type="button" size="sm" variant="ghost" onClick={addPhone}>
                  <Plus className="w-3.5 h-3.5 " /> Add
                </Button>
              </div>
              <div className="space-y-2">
                {(form.phones ?? []).map((p, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      className="w-24"
                      placeholder="label"
                      value={p.label ?? ""}
                      onChange={(e) => updPhone(i, { label: e.target.value })}
                    />
                    <Input
                      className="flex-1"
                      placeholder="+1 555"
                      value={p.number}
                      onChange={(e) => updPhone(i, { number: e.target.value })}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant={p.is_primary ? "default" : "ghost"}
                      onClick={() => setPrimaryPhone(i)}
                      title="Primary"
                    >
                      <Star className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove phone ${i + 1}`}
                      onClick={() => rmPhone(i)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Email addresses</Label>
                <Button type="button" size="sm" variant="ghost" onClick={addEmail}>
                  <Plus className="w-3.5 h-3.5 " /> Add
                </Button>
              </div>
              <div className="space-y-2">
                {(form.emails ?? []).map((e, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      className="w-24"
                      placeholder="label"
                      value={e.label ?? ""}
                      onChange={(ev) => updEmail(i, { label: ev.target.value })}
                    />
                    <Input
                      className="flex-1"
                      type="email"
                      placeholder="name@example.com"
                      value={e.email}
                      onChange={(ev) => updEmail(i, { email: ev.target.value })}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant={e.is_primary ? "default" : "ghost"}
                      onClick={() => setPrimaryEmail(i)}
                    >
                      <Star className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove email ${i + 1}`}
                      onClick={() => rmEmail(i)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>WhatsApp</Label>
                <Input
                  value={form.whatsapp ?? ""}
                  onChange={(e) => setField("whatsapp", e.target.value)}
                  placeholder="+1 555"
                />
              </div>
              <div>
                <Label>Website</Label>
                <Input
                  value={form.website ?? ""}
                  onChange={(e) => setField("website", e.target.value)}
                  placeholder="https://"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="crm" className="space-y-3 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Lifecycle stage</Label>
                <Select
                  value={form.lifecycle_stage ?? "lead"}
                  onValueChange={(v) => setField("lifecycle_stage", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LIFECYCLE.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Lead status</Label>
                <Select
                  value={form.lead_status ?? "__none"}
                  onValueChange={(v) => setField("lead_status", v === "__none" ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {LEAD_STATUS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Customer status</Label>
                <Select
                  value={form.customer_status ?? "__none"}
                  onValueChange={(v) => setField("customer_status", v === "__none" ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {CUSTOMER_STATUS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Source</Label>
                <Input
                  value={form.source ?? ""}
                  onChange={(e) => setField("source", e.target.value)}
                  placeholder="manual, import, form"
                />
              </div>
              <div>
                <Label>Owner</Label>
                <Select
                  value={form.owner_id ?? "__none"}
                  onValueChange={(v) => setField("owner_id", v === "__none" ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Unassigned</SelectItem>
                    {(members ?? []).map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.display_name || m.email || m.user_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Assigned agent</Label>
                <Select
                  value={form.assigned_agent_id ?? "__none"}
                  onValueChange={(v) => setField("assigned_agent_id", v === "__none" ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Unassigned</SelectItem>
                    {(members ?? []).map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.display_name || m.email || m.user_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Type and press Enter"
                />
                <Button type="button" variant="secondary" onClick={addTag}>
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(form.tags ?? []).map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1">
                    {t}
                    <button type="button" onClick={() => rmTag(t)}>
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="address" className="space-y-3 pt-4">
            <div>
              <Label>Address line 1</Label>
              <Input
                value={address.line1 ?? ""}
                onChange={(e) => setField("address", { ...address, line1: e.target.value })}
              />
            </div>
            <div>
              <Label>Address line 2</Label>
              <Input
                value={address.line2 ?? ""}
                onChange={(e) => setField("address", { ...address, line2: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>City</Label>
                <Input
                  value={address.city ?? ""}
                  onChange={(e) => setField("address", { ...address, city: e.target.value })}
                />
              </div>
              <div>
                <Label>State / Region</Label>
                <Input
                  value={address.state ?? ""}
                  onChange={(e) => setField("address", { ...address, state: e.target.value })}
                />
              </div>
              <div>
                <Label>Postal code</Label>
                <Input
                  value={address.postal_code ?? ""}
                  onChange={(e) => setField("address", { ...address, postal_code: e.target.value })}
                />
              </div>
              <div>
                <Label>Country</Label>
                <Input
                  value={address.country ?? ""}
                  onChange={(e) => setField("address", { ...address, country: e.target.value })}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="more" className="space-y-3 pt-4">
            <div>
              <Label>Notes</Label>
              <RichTextarea
                rows={4}
                value={form.notes ?? ""}
                onChange={(v) => setField("notes", v)}
              />
            </div>
            <div className="flex items-center justify-between border rounded-control p-3">
              <div>
                <p className="text-sm font-medium">Favorite</p>
                <p className="text-xs text-muted-foreground">Pin to top of contact list.</p>
              </div>
              <Switch
                checked={!!form.is_favorite}
                onCheckedChange={(v) => setField("is_favorite", v)}
              />
            </div>
            <div className="flex items-center justify-between border rounded-control p-3">
              <div>
                <p className="text-sm font-medium">Archived</p>
                <p className="text-xs text-muted-foreground">Hide from default views.</p>
              </div>
              <Switch
                checked={!!form.is_archived}
                onCheckedChange={(v) => setField("is_archived", v)}
              />
            </div>
            <div className="flex items-center justify-between border rounded-control p-3">
              <div>
                <p className="text-sm font-medium">Do not contact</p>
                <p className="text-xs text-muted-foreground">Suppress outbound communication.</p>
              </div>
              <Switch
                checked={!!form.do_not_contact}
                onCheckedChange={(v) => setField("do_not_contact", v)}
              />
            </div>
            <div>
              <Label>Custom fields</Label>
              <div className="mt-2">
                <CustomFieldsSection
                  entity="contact"
                  values={(form.custom_fields ?? {}) as Record<string, unknown>}
                  onChange={(v: Record<string, unknown>) => setField("custom_fields", v)}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {(errors.general ||
          (errors.emails && errors.emails.length) ||
          (errors.phones && errors.phones.length)) && (
          <div className="mt-3 rounded-control border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive space-y-1">
            {errors.general && <p>{errors.general}</p>}
            {(errors.emails ?? []).map((m, i) => (
              <p key={`e-${i}`}>{m}</p>
            ))}
            {(errors.phones ?? []).map((m, i) => (
              <p key={`p-${i}`}>{m}</p>
            ))}
          </div>
        )}

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending ? "Saving" : isEdit ? "Save changes" : "Create contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
