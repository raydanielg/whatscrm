import { requireWorkspaceRole } from "@/lib/rbac";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { TimePicker } from "@/shared/components";
import {
  Building2,
  MapPin,
  Globe,
  Clock,
  Palette,
  ScrollText,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  useActiveOrganization,
  useOrgRole,
  useOrgMembers,
  useUpdateOrganization,
  useTransferOwnership,
  useDeleteOrganization,
  useOrgAuditLog,
  type OrganizationRow,
} from "@/hooks/use-organization";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";
import { Autocomplete, type AutocompleteOption } from "@/shared/components/autocomplete";
import {
  WORLD_TIMEZONES,
  WORLD_CURRENCIES,
  WORLD_LANGUAGES,
  timezoneOffsetLabel,
} from "@/lib/i18n/locale-data";
import { useRef } from "react";
import { Upload, X } from "lucide-react";
import {
  validateBrandingFile,
  uploadBrandingAsset,
  isBrandingAssetUrl,
  removeBrandingAsset,
  BRANDING_ACCEPT,
} from "@/lib/branding/upload";

const INDUSTRY_OPTIONS: AutocompleteOption[] = [
  { value: "Technology/Software", label: "Technology/Software" },
  { value: "Retail & E-commerce", label: "Retail & E-commerce" },
  { value: "Healthcare", label: "Healthcare" },
  { value: "Finance & Banking", label: "Finance & Banking" },
  { value: "Insurance", label: "Insurance" },
  { value: "Real Estate", label: "Real Estate" },
  { value: "Education", label: "Education" },
  { value: "Hospitality & Travel", label: "Hospitality & Travel" },
  { value: "Food & Beverage", label: "Food & Beverage" },
  { value: "Manufacturing", label: "Manufacturing" },
  { value: "Professional Services", label: "Professional Services" },
  { value: "Marketing & Advertising", label: "Marketing & Advertising" },
  { value: "Non-profit", label: "Non-profit" },
  { value: "Construction", label: "Construction" },
  { value: "Transportation & Logistics", label: "Transportation & Logistics" },
  { value: "Media & Entertainment", label: "Media & Entertainment" },
  { value: "Legal", label: "Legal" },
  { value: "Agriculture", label: "Agriculture" },
  { value: "Energy & Utilities", label: "Energy & Utilities" },
  { value: "Telecommunications", label: "Telecommunications" },
  { value: "Automotive", label: "Automotive" },
  { value: "Beauty & Wellness", label: "Beauty & Wellness" },
  { value: "Fitness & Sports", label: "Fitness & Sports" },
  { value: "Consumer Goods", label: "Consumer Goods" },
  { value: "Fashion & Apparel", label: "Fashion & Apparel" },
  { value: "Pharmaceuticals", label: "Pharmaceuticals" },
  { value: "Government & Public Sector", label: "Government & Public Sector" },
  { value: "Human Resources & Staffing", label: "Human Resources & Staffing" },
  { value: "Consulting", label: "Consulting" },
  { value: "Events & Entertainment Services", label: "Events & Entertainment Services" },
  { value: "Arts & Crafts", label: "Arts & Crafts" },
  { value: "Pet Care & Veterinary", label: "Pet Care & Veterinary" },
  { value: "Logistics & Supply Chain", label: "Logistics & Supply Chain" },
  { value: "Aerospace & Defense", label: "Aerospace & Defense" },
  { value: "Mining & Metals", label: "Mining & Metals" },
  { value: "Other", label: "Other" },
];

export const Route = createFileRoute("/_authenticated/organization")({
  beforeLoad: requireWorkspaceRole("owner", "admin"),
  component: OrganizationPage,
});

type SectionId = "profile" | "contact" | "locale" | "hours" | "brand" | "activity" | "danger";

const SECTIONS: { id: SectionId; label: string; icon: typeof Building2 }[] = [
  { id: "profile", label: "Profile", icon: Building2 },
  { id: "contact", label: "Contact", icon: MapPin },
  { id: "locale", label: "Locale", icon: Globe },
  { id: "hours", label: "Business hours", icon: Clock },
  { id: "brand", label: "Brand", icon: Palette },
  { id: "activity", label: "Activity log", icon: ScrollText },
  { id: "danger", label: "Danger zone", icon: ShieldAlert },
];

const DAYS = [
  { id: 1, short: "Mon" },
  { id: 2, short: "Tue" },
  { id: 3, short: "Wed" },
  { id: 4, short: "Thu" },
  { id: 5, short: "Fri" },
  { id: 6, short: "Sat" },
  { id: 0, short: "Sun" },
];

function OrganizationPage() {
  const [active, setActive] = useState<SectionId>("profile");
  const {
    active: org,
    activeId,
    isLoading,
    isError,
    error,
    refetch,
    isMissingContext,
  } = useActiveOrganization();

  const { data: role } = useOrgRole(org?.id);
  const canEdit = role === "owner" || role === "admin";

  return (
    <>
      <AppTopbar
        title="Organization"
        subtitle={org ? `${org.name} · ${role ?? "member"}` : "Loading"}
      />
      <main className="p-6 max-w-7xl w-full mx-auto flex flex-col md:flex-row gap-6">
        <nav className="md:w-56 space-y-1 shrink-0">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-control text-sm font-medium text-left transition-colors ${
                active === s.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-foreground/80"
              }`}
            >
              <s.icon className="w-4 h-4" /> {s.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 rounded-control border border-border bg-surface shadow-sm p-6 min-h-[400px]">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading organization
            </div>
          ) : isError ? (
            <div className="space-y-3" role="alert">
              <p className="text-sm font-medium text-destructive">
                Could not load your organization.
              </p>
              <p className="text-xs text-muted-foreground break-words">
                {(error as Error | null)?.message ?? "Unknown error"}
              </p>
              <button
                onClick={() => void refetch()}
                className="rounded-control border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Retry
              </button>
            </div>
          ) : isMissingContext ? (
            <div className="space-y-3" role="alert">
              <p className="text-sm font-medium text-destructive">
                Organization context is missing.
              </p>
              <p className="text-sm text-muted-foreground">
                {activeId
                  ? "The selected organization is no longer available to your account. Pick another one from the organization switcher."
                  : "Your account is not a member of any organization. Ask an owner to invite you, or create one from the organization switcher."}
              </p>
              <button
                onClick={() => void refetch()}
                className="rounded-control border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Retry
              </button>
            </div>
          ) : !org ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading organization
            </div>
          ) : (
            <>
              {active === "profile" && <ProfileSection org={org} canEdit={canEdit} />}
              {active === "contact" && <ContactSection org={org} canEdit={canEdit} />}
              {active === "locale" && <LocaleSection org={org} canEdit={canEdit} />}
              {active === "hours" && <HoursSection org={org} canEdit={canEdit} />}
              {active === "brand" && <BrandSection org={org} canEdit={canEdit} />}
              {active === "activity" && <ActivitySection orgId={org.id} />}
              {active === "danger" && <DangerSection org={org} role={role} />}
            </>
          )}
        </div>
      </main>
    </>
  );
}

/* ------------------------------ Sections ------------------------------ */

function ProfileSection({ org, canEdit }: { org: OrganizationRow; canEdit: boolean }) {
  const [form, setForm] = useState({
    name: org.name,
    industry: org.industry ?? "",
    logo_url: org.logo_url ?? "",
  });
  const mut = useUpdateOrganization(org.id);

  // Preserve a legacy/unlisted industry value already saved on the org —
  // don't silently drop it just because it's not one of our canonical
  // options. The column is plain text, not a DB enum, so this stays a
  // UI-only constraint.
  const industryOptions = useMemo(() => {
    const current = org.industry?.trim();
    if (current && !INDUSTRY_OPTIONS.some((o) => o.value === current)) {
      return [{ value: current, label: current }, ...INDUSTRY_OPTIONS];
    }
    return INDUSTRY_OPTIONS;
  }, [org.industry]);

  async function save() {
    try {
      await mut.mutateAsync({
        name: form.name.trim(),
        industry: form.industry.trim() || null,
        logo_url: form.logo_url.trim() || null,
      });
      toast.success("Organization updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <div className="space-y-5 max-w-xl">
      <h2 className="font-bold text-xl">Organization profile</h2>

      <LogoUpload
        label="Logo"
        logoUrl={form.logo_url}
        fallback={form.name.slice(0, 1).toUpperCase()}
        scope={{ kind: "org", orgId: org.id }}
        slot="logo"
        disabled={!canEdit}
        onChange={(v) => setForm({ ...form, logo_url: v })}
      />

      <Field
        label="Business name"
        value={form.name}
        onChange={(v) => setForm({ ...form, name: v })}
        disabled={!canEdit}
      />
      <div>
        <label className="text-xs font-medium text-muted-foreground">Industry</label>
        <div className="mt-1">
          <Autocomplete
            options={industryOptions}
            value={form.industry || null}
            onValueChange={(v) => setForm({ ...form, industry: v ?? "" })}
            disabled={!canEdit}
            placeholder="Select an industry"
            searchPlaceholder="Search industries"
          />
        </div>
      </div>
      <Field label="Slug" value={org.slug} disabled readOnly />

      {canEdit && (
        <button
          onClick={save}
          disabled={mut.isPending}
          className="px-4 h-10 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {mut.isPending ? "Saving" : "Save changes"}
        </button>
      )}
    </div>
  );
}

function ContactSection({ org, canEdit }: { org: OrganizationRow; canEdit: boolean }) {
  const [form, setForm] = useState({
    contact_email: org.contact_email ?? "",
    billing_email: org.billing_email ?? "",
    phone: org.phone ?? "",
    website: org.website ?? "",
    address: org.address ?? "",
  });
  const mut = useUpdateOrganization(org.id);

  async function save() {
    try {
      await mut.mutateAsync({
        contact_email: form.contact_email.trim() || null,
        billing_email: form.billing_email.trim() || null,
        phone: form.phone.trim() || null,
        website: form.website.trim() || null,
        address: form.address.trim() || null,
      });
      toast.success("Contact information updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <div className="space-y-5 max-w-xl">
      <h2 className="font-bold text-xl">Contact information</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Contact email"
          value={form.contact_email}
          onChange={(v) => setForm({ ...form, contact_email: v })}
          disabled={!canEdit}
          placeholder="hello@company.com"
        />
        <Field
          label="Billing email"
          value={form.billing_email}
          onChange={(v) => setForm({ ...form, billing_email: v })}
          disabled={!canEdit}
          placeholder="billing@company.com"
        />
        <Field
          label="Phone"
          value={form.phone}
          onChange={(v) => setForm({ ...form, phone: v })}
          disabled={!canEdit}
          placeholder="+1 555 010 0000"
        />
        <Field
          label="Website"
          value={form.website}
          onChange={(v) => setForm({ ...form, website: v })}
          disabled={!canEdit}
          placeholder="https://company.com"
        />
      </div>
      <TextArea
        label="Address"
        value={form.address}
        onChange={(v) => setForm({ ...form, address: v })}
        disabled={!canEdit}
      />

      {canEdit && (
        <button
          onClick={save}
          disabled={mut.isPending}
          className="px-4 h-10 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {mut.isPending ? "Saving" : "Save changes"}
        </button>
      )}
    </div>
  );
}

function LocaleSection({ org, canEdit }: { org: OrganizationRow; canEdit: boolean }) {
  const [form, setForm] = useState({
    timezone: org.timezone,
    currency: org.currency,
    language: org.language,
  });
  const mut = useUpdateOrganization(org.id);

  const timezoneOptions = useMemo(
    () =>
      WORLD_TIMEZONES.map((z) => ({
        value: z,
        label: z.replace(/_/g, " "),
        description: timezoneOffsetLabel(z),
      })),
    [],
  );
  const currencyOptions = useMemo(
    () =>
      WORLD_CURRENCIES.map((c) => ({
        value: c.code,
        label: `${c.code} — ${c.label}`,
        description: c.symbol,
      })),
    [],
  );
  const languageOptions = useMemo(
    () => WORLD_LANGUAGES.map((l) => ({ value: l.code, label: `${l.label} (${l.native})` })),
    [],
  );

  // Preserve a value already saved in the DB even if it isn't in the canonical
  // list, so an older/freeform row doesn't silently disappear from the field.
  function withSavedFallback<T extends { value: string; label: string }>(
    options: T[],
    saved: string | null | undefined,
  ): T[] {
    return saved && !options.some((o) => o.value === saved)
      ? [{ value: saved, label: saved } as T, ...options]
      : options;
  }

  async function save() {
    try {
      await mut.mutateAsync(form);
      toast.success("Locale updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <div className="space-y-5 max-w-xl">
      <h2 className="font-bold text-xl">Locale</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Timezone</label>
          <div className="mt-1">
            <Autocomplete
              options={withSavedFallback(timezoneOptions, form.timezone)}
              value={form.timezone}
              onValueChange={(v) => setForm({ ...form, timezone: v ?? "" })}
              placeholder="Select timezone"
              searchPlaceholder="Search timezones"
              clearable={false}
              disabled={!canEdit}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Currency</label>
          <div className="mt-1">
            <Autocomplete
              options={withSavedFallback(currencyOptions, form.currency)}
              value={form.currency}
              onValueChange={(v) => setForm({ ...form, currency: v ?? "" })}
              placeholder="Select currency"
              searchPlaceholder="Search currencies"
              clearable={false}
              disabled={!canEdit}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Language</label>
          <div className="mt-1">
            <Autocomplete
              options={withSavedFallback(languageOptions, form.language)}
              value={form.language}
              onValueChange={(v) => setForm({ ...form, language: v ?? "" })}
              placeholder="Select language"
              searchPlaceholder="Search languages"
              clearable={false}
              disabled={!canEdit}
            />
          </div>
        </div>
      </div>
      {canEdit && (
        <button
          onClick={save}
          disabled={mut.isPending}
          className="px-4 h-10 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {mut.isPending ? "Saving" : "Save changes"}
        </button>
      )}
    </div>
  );
}

function HoursSection({ org, canEdit }: { org: OrganizationRow; canEdit: boolean }) {
  const [workingDays, setWorkingDays] = useState<number[]>(org.working_days ?? [1, 2, 3, 4, 5]);
  const [hours, setHours] = useState<OrganizationRow["business_hours"]>(() => {
    const base: OrganizationRow["business_hours"] = {};
    DAYS.forEach((d) => {
      base[String(d.id)] = org.business_hours?.[String(d.id)] ?? { open: "09:00", close: "17:00" };
    });
    return base;
  });
  const mut = useUpdateOrganization(org.id);

  function toggleDay(d: number) {
    setWorkingDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );
  }

  async function save() {
    try {
      await mut.mutateAsync({ working_days: workingDays, business_hours: hours });
      toast.success("Business hours updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="font-bold text-xl">Working days</h2>
        <p className="text-sm text-muted-foreground">
          Days when your team is available to respond to customers.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DAYS.map((d) => {
            const on = workingDays.includes(d.id);
            return (
              <button
                key={d.id}
                onClick={() => canEdit && toggleDay(d.id)}
                disabled={!canEdit}
                className={`px-3 h-9 rounded-control text-sm border transition-colors ${
                  on
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-input bg-surface text-foreground/70 hover:bg-muted"
                } disabled:opacity-60`}
              >
                {d.short}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="font-bold text-xl">Business hours</h2>
        <p className="text-sm text-muted-foreground">
          Times shown in the organization's timezone ({org.timezone}).
        </p>
        <div className="mt-3 space-y-2">
          {DAYS.map((d) => {
            const h = hours[String(d.id)] ?? { open: "09:00", close: "17:00" };
            const enabled = workingDays.includes(d.id);
            return (
              <div
                key={d.id}
                className={`flex items-center gap-3 rounded-control border border-border p-3 ${!enabled ? "opacity-50" : ""}`}
              >
                <span className="w-12 text-sm font-medium">{d.short}</span>
                <TimePicker
                  value={h.open}
                  disabled={!canEdit || !enabled}
                  onChange={(v) => setHours({ ...hours, [d.id]: { ...h, open: v ?? "" } })}
                  className="w-32"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <TimePicker
                  value={h.close}
                  disabled={!canEdit || !enabled}
                  onChange={(v) => setHours({ ...hours, [d.id]: { ...h, close: v ?? "" } })}
                  className="w-32"
                />
              </div>
            );
          })}
        </div>
      </div>

      {canEdit && (
        <button
          onClick={save}
          disabled={mut.isPending}
          className="px-4 h-10 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {mut.isPending ? "Saving" : "Save changes"}
        </button>
      )}
    </div>
  );
}

function BrandSection({ org, canEdit }: { org: OrganizationRow; canEdit: boolean }) {
  const [brand, setBrand] = useState({
    primary_color: org.brand_settings?.primary_color ?? "#303030",
    accent_color: org.brand_settings?.accent_color ?? "#22C55E",
    logo_dark_url: org.brand_settings?.logo_dark_url ?? "",
  });
  const mut = useUpdateOrganization(org.id);

  async function save() {
    try {
      await mut.mutateAsync({ brand_settings: brand });
      toast.success("Brand updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <div className="space-y-5 max-w-xl">
      <h2 className="font-bold text-xl">Brand</h2>
      <p className="text-sm text-muted-foreground">
        Colors and assets used across customer-facing surfaces (WhatsApp templates, portal,
        invoices).
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <ColorField
          label="Primary color"
          value={brand.primary_color}
          onChange={(v) => setBrand({ ...brand, primary_color: v })}
          disabled={!canEdit}
        />
        <ColorField
          label="Accent color"
          value={brand.accent_color}
          onChange={(v) => setBrand({ ...brand, accent_color: v })}
          disabled={!canEdit}
        />
      </div>

      <LogoUpload
        label="Dark-mode logo"
        logoUrl={brand.logo_dark_url}
        fallback={null}
        scope={{ kind: "org", orgId: org.id }}
        slot="logo-dark"
        disabled={!canEdit}
        onChange={(v) => setBrand({ ...brand, logo_dark_url: v })}
        previewClassName="bg-slate-900"
      />

      <div className="rounded-control border border-border p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-control" style={{ background: brand.primary_color }} />
        <div className="w-12 h-12 rounded-control" style={{ background: brand.accent_color }} />
        <span className="text-xs text-muted-foreground">Preview</span>
      </div>

      {canEdit && (
        <button
          onClick={save}
          disabled={mut.isPending}
          className="px-4 h-10 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {mut.isPending ? "Saving" : "Save changes"}
        </button>
      )}
    </div>
  );
}

const ACTIVITY_PAGE_SIZE = 50;

function ActivitySection({ orgId }: { orgId: string }) {
  const [limit, setLimit] = useState(ACTIVITY_PAGE_SIZE);
  const { data, isLoading, isFetching } = useOrgAuditLog(orgId, limit);
  const hasMore = (data?.length ?? 0) === limit;
  return (
    <div>
      <h2 className="font-bold text-xl mb-1">Activity log</h2>
      <p className="text-sm text-muted-foreground mb-4">Changes made in this organization.</p>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading</div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-control border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No activity yet.
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border rounded-control border border-border overflow-hidden">
            {data.map((row) => (
              <li key={row.id} className="p-3 flex items-start gap-3 text-sm">
                <span
                  className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-control text-xs font-medium ${badgeForAction(row.action)}`}
                >
                  {row.action}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {row.resource_type} <span className="text-muted-foreground font-normal">·</span>{" "}
                    <span className="text-muted-foreground font-mono text-xs">{row.resource_id}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setLimit((n) => n + ACTIVITY_PAGE_SIZE)}
                disabled={isFetching}
                className="px-4 h-9 rounded-control border border-input bg-surface text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isFetching ? "Loading" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function badgeForAction(a: string) {
  switch (a) {
    case "create":
      return "bg-success/10 text-success";
    case "delete":
      return "bg-destructive/10 text-destructive";
    case "update":
      return "bg-primary/10 text-primary";
    case "invite":
    case "login":
      return "bg-accent/10 text-accent-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function DangerSection({
  org,
  role,
}: {
  org: OrganizationRow;
  role: "owner" | "admin" | "member" | null | undefined;
}) {
  const isOwner = role === "owner";
  const { data: members } = useOrgMembers(org.id);
  const transferable = useMemo(() => (members ?? []).filter((m) => m.role !== "owner"), [members]);

  const [newOwnerId, setNewOwnerId] = useState<string>("");
  const [confirmName, setConfirmName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");
  const [transferStep, setTransferStep] = useState<0 | 1 | 2>(0); // 0=idle, 1=review, 2=type-to-confirm
  const [transferConfirmText, setTransferConfirmText] = useState("");
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0); // 0=idle, 1=warn, 2=type-to-confirm
  const [transferError, setTransferError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const transferMut = useTransferOwnership(org.id);
  const deleteMut = useDeleteOrganization(org.id);
  const navigate = useNavigate();

  const selectedMember = transferable.find((m) => m.user_id === newOwnerId);
  const memberLabel = (member: (typeof transferable)[number]) => {
    const name = member.display_name?.trim() || member.full_name?.trim();
    if (name && member.email) return `${name} — ${member.email}`;
    return name || member.email || `Member ${member.user_id.slice(0, 8)}`;
  };
  const selectedMemberLabel = selectedMember ? memberLabel(selectedMember) : "selected member";
  const TRANSFER_PHRASE = "transfer ownership";
  const isBusy = transferMut.isPending || deleteMut.isPending;

  function openTransfer() {
    if (!newOwnerId) {
      toast.error("Pick a member to transfer to");
      return;
    }
    setTransferError(null);
    setTransferConfirmText("");
    setTransferStep(1);
  }

  async function confirmTransfer() {
    setTransferError(null);
    try {
      await transferMut.mutateAsync(newOwnerId);
      toast.success(`Ownership transferred to ${selectedMemberLabel}`);
      setNewOwnerId("");
      setTransferConfirmText("");
      setTransferStep(0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transfer failed. Please try again.";
      setTransferError(msg);
      toast.error(msg);
    }
  }

  function openDelete() {
    if (confirmName !== org.name) {
      toast.error("Type the organization name to confirm");
      return;
    }
    setDeleteError(null);
    setConfirmDelete("");
    setDeleteStep(1);
  }

  async function confirmDeleteAction() {
    setDeleteError(null);
    try {
      await deleteMut.mutateAsync();
      toast.success("Organization deleted");
      setDeleteStep(0);
      await supabase.auth.getSession();
      navigate({ to: "/dashboard", replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed. Please try again.";
      setDeleteError(msg);
      toast.error(msg);
    }
  }

  if (!isOwner) {
    return (
      <div className="rounded-control border border-dashed border-border p-6 text-sm text-muted-foreground">
        Only the organization owner can transfer ownership or delete the organization.
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-xl">
      {/* Transfer ownership */}
      <div className="rounded-control border border-border p-5">
        <h3 className="font-display font-semibold">Transfer ownership</h3>
        <p className="text-sm text-muted-foreground mt-1">
          The new owner gets full control. You'll be demoted to admin and lose the ability to delete
          this organization.
        </p>
        <div className="mt-4 space-y-3">
          <Select
            label="New owner"
            value={newOwnerId}
            onChange={setNewOwnerId}
            disabled={isBusy}
            options={[
              { value: "", label: "Select a member" },
              ...transferable.map((m) => ({
                value: m.user_id,
                label: memberLabel(m),
              })),
            ]}
          />
          <button
            onClick={openTransfer}
            disabled={isBusy || !newOwnerId}
            className="px-4 h-10 rounded-control border border-input bg-surface text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {transferMut.isPending ? "Transferring" : "Transfer ownership"}
          </button>
        </div>
      </div>

      {/* Delete organization */}
      <div className="rounded-control border border-destructive/40 p-5 bg-destructive/5">
        <h3 className="font-display font-semibold text-destructive">Delete organization</h3>
        <p className="text-sm text-muted-foreground mt-1">
          This permanently deletes the organization, all workspaces, contacts, deals, conversations,
          and files. This cannot be undone.
        </p>
        <div className="mt-4 space-y-3">
          <Field
            label={`Type "${org.name}" to enable`}
            value={confirmName}
            onChange={setConfirmName}
            placeholder={org.name}
            disabled={isBusy}
          />
          <button
            onClick={openDelete}
            disabled={isBusy || confirmName !== org.name}
            className="px-4 h-10 rounded-control bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleteMut.isPending ? "Deleting" : "Delete organization permanently"}
          </button>
        </div>
      </div>

      {/* Transfer: Step 1 — Review */}
      <AlertDialog
        open={transferStep === 1}
        onOpenChange={(o) => {
          if (!o && !transferMut.isPending) setTransferStep(0);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Review ownership transfer
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  You are about to transfer ownership of <strong>{org.name}</strong> to{" "}
                  <strong>{selectedMemberLabel}</strong>.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li>They will get full control, including billing and deletion rights.</li>
                  <li>
                    You will be demoted to <strong>admin</strong>.
                  </li>
                  <li>You will not be able to reverse this yourself.</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={transferMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setTransferStep(2);
              }}
              disabled={transferMut.isPending}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer: Step 2 — Type to confirm */}
      <AlertDialog
        open={transferStep === 2}
        onOpenChange={(o) => {
          if (!o && !transferMut.isPending) setTransferStep(0);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm transfer</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Type{" "}
                  <code className="px-1 py-0.5 rounded bg-muted font-mono">{TRANSFER_PHRASE}</code>{" "}
                  to confirm.
                </p>
                <Field
                  label=""
                  value={transferConfirmText}
                  onChange={setTransferConfirmText}
                  placeholder={TRANSFER_PHRASE}
                  disabled={transferMut.isPending}
                />
                {transferError && (
                  <p className="text-destructive text-sm" role="alert">
                    {transferError}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={transferMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmTransfer();
              }}
              disabled={
                transferMut.isPending ||
                transferConfirmText.trim().toLowerCase() !== TRANSFER_PHRASE
              }
            >
              {transferMut.isPending ? "Transferring" : `Transfer to ${selectedMemberLabel}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete: Step 1 — Warn */}
      <AlertDialog
        open={deleteStep === 1}
        onOpenChange={(o) => {
          if (!o && !deleteMut.isPending) setDeleteStep(0);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Permanently delete {org.name}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>This will immediately and irreversibly delete:</p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li>All workspaces, members, and invitations</li>
                  <li>All contacts, deals, conversations, and messages</li>
                  <li>All files, media, and integrations</li>
                  <li>All billing history and audit logs</li>
                </ul>
                <p className="text-destructive font-medium pt-1">
                  There is no undo. Backups cannot be restored from the app.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Keep organization</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setDeleteStep(2);
              }}
              disabled={deleteMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              I understand, continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete: Step 2 — Final type-to-confirm */}
      <AlertDialog
        open={deleteStep === 2}
        onOpenChange={(o) => {
          if (!o && !deleteMut.isPending) setDeleteStep(0);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Final confirmation</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Type <code className="px-1 py-0.5 rounded bg-muted font-mono">{org.name}</code>{" "}
                  once more to delete this organization forever.
                </p>
                <Field
                  label=""
                  value={confirmDelete}
                  onChange={setConfirmDelete}
                  placeholder={org.name}
                  disabled={deleteMut.isPending}
                />
                {deleteError && (
                  <p className="text-destructive text-sm" role="alert">
                    {deleteError}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDeleteAction();
              }}
              disabled={deleteMut.isPending || confirmDelete !== org.name}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending ? "Deleting" : "Delete forever"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------ Inputs ------------------------------ */

function LogoUpload({
  label,
  logoUrl,
  fallback,
  scope,
  slot,
  disabled,
  onChange,
  previewClassName,
}: {
  label: string;
  logoUrl: string;
  fallback: string | null;
  scope: { kind: "org"; orgId: string };
  slot: string;
  disabled?: boolean;
  onChange: (v: string) => void;
  previewClassName?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showUrlField, setShowUrlField] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const invalid = validateBrandingFile(file);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setUploading(true);
    try {
      const prevUrl = logoUrl;
      const url = await uploadBrandingAsset(file, scope, slot);
      onChange(url);
      if (isBrandingAssetUrl(prevUrl) && prevUrl !== url) {
        void removeBrandingAsset(prevUrl);
      }
      toast.success("Logo uploaded");
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    const prevUrl = logoUrl;
    onChange("");
    if (isBrandingAssetUrl(prevUrl)) {
      void removeBrandingAsset(prevUrl);
    }
  }

  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="mt-1 flex items-center gap-4">
        <div
          className={`w-16 h-16 rounded-control grid place-items-center text-accent-foreground font-display font-bold text-xl overflow-hidden shrink-0 ${
            previewClassName ?? "bg-gradient-accent"
          }`}
        >
          {logoUrl ? (
            <img src={logoUrl} alt={label} className="w-full h-full object-contain" />
          ) : (
            fallback
          )}
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={disabled || uploading}
              className="px-3 h-9 rounded-control border border-input bg-surface text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              {uploading ? "Uploading" : "Upload"}
            </button>
            {logoUrl && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={disabled || uploading}
                className="px-3 h-9 rounded-control border border-input bg-surface text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" /> Remove
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowUrlField((v) => !v)}
              disabled={disabled}
              className="text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-50"
            >
              {showUrlField ? "Hide URL field" : "Paste URL instead"}
            </button>
          </div>
          <input ref={fileRef} type="file" accept={BRANDING_ACCEPT} hidden onChange={handleFile} />
          {showUrlField && (
            <input
              value={logoUrl}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https:///logo.png"
              disabled={disabled}
              className="w-full h-9 px-3 rounded-control border border-input bg-surface text-sm"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  readOnly,
  className,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        className={`mt-1 w-full h-10 px-3 rounded-control border border-input bg-surface text-sm ${
          readOnly || disabled ? "bg-muted/40 text-muted-foreground" : ""
        }`}
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={3}
        className="mt-1 w-full px-3 py-2 rounded-control border border-input bg-surface text-sm disabled:bg-muted/40 disabled:text-muted-foreground"
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="mt-1 w-full h-10 px-3 rounded-control border border-input bg-surface text-sm disabled:bg-muted/40 disabled:text-muted-foreground"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-10 w-14 rounded-control bg-surface cursor-pointer disabled:opacity-50"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="flex-1 h-10 px-3 rounded-control bg-surface text-sm font-mono disabled:bg-muted/40 disabled:text-muted-foreground"
        />
      </div>
    </div>
  );
}
