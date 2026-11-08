import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Save,
  User as UserIcon,
  MapPin,
  Building2,
  Bell,
  Shield,
  Radio,
  Monitor,
  KeyRound,
  Camera,
  Trash2,
  Plus,
  CheckCircle2,
  LogOut,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import {
  getMyProfile,
  updateMyProfile,
  getMyPreferences,
  saveMyPreferences,
  listMyAddresses,
  saveMyAddress,
  deleteMyAddress,
  listMyChannels,
  listMySessions,
  revokeMySession,
  uploadMyAvatar,
} from "@/lib/client-portal/portal.functions";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/client/profile")({
  component: ProfilePage,
});

type TabKey =
  | "personal"
  | "address"
  | "company"
  | "communication"
  | "notifications"
  | "privacy"
  | "channels"
  | "sessions"
  | "security";
const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "personal", label: "Personal info", icon: UserIcon },
  { key: "address", label: "Address", icon: MapPin },
  { key: "company", label: "Company", icon: Building2 },
  { key: "communication", label: "Communication", icon: Radio },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "privacy", label: "Privacy", icon: Shield },
  { key: "channels", label: "Connected channels", icon: Radio },
  { key: "sessions", label: "Active sessions", icon: Monitor },
  { key: "security", label: "Security & 2FA", icon: KeyRound },
];

function ProfilePage() {
  const [tab, setTab] = useState<TabKey>("personal");
  return (
    <div className="grid md:grid-cols-[220px_1fr] gap-6">
      <aside className="space-y-1">
        <h2 className="font-display text-xl font-semibold mb-3">Account</h2>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`w-full flex items-center gap-2 h-9 px-3 rounded-control text-sm text-left transition ${active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted"}`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </aside>
      <div className="min-w-0">
        {tab === "personal" && <PersonalSection />}
        {tab === "address" && <AddressSection />}
        {tab === "company" && <CompanySection />}
        {tab === "communication" && (
          <PrefsSection
            kind="communication"
            title="Communication preferences"
            description="How we contact you."
          />
        )}
        {tab === "notifications" && (
          <PrefsSection
            kind="notifications"
            title="Notification preferences"
            description="What we send you."
          />
        )}
        {tab === "privacy" && <PrivacySection />}
        {tab === "channels" && <ChannelsSection />}
        {tab === "sessions" && <SessionsSection />}
        {tab === "security" && <SecuritySection />}
      </div>
    </div>
  );
}

function Card({
  children,
  title,
  description,
}: {
  children: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <section className="rounded-control border border-border bg-surface overflow-hidden">
      <header className="px-6 py-4 border-b border-border">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </header>
      <div className="p-6">{children}</div>
    </section>
  );
}

/* ---------- Personal ---------- */

function PersonalSection() {
  const getFn = useServerFn(getMyProfile);
  const upFn = useServerFn(updateMyProfile);
  const upAvatar = useServerFn(uploadMyAvatar);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["portal-profile"], queryFn: () => getFn() });
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    whatsapp: "",
    job_title: "",
    timezone: "",
    locale: "",
  });

  useEffect(() => {
    if (q.data) {
      const d = q.data as Record<string, string | null>;
      setForm({
        first_name: d.first_name ?? "",
        last_name: d.last_name ?? "",
        phone: d.phone ?? "",
        whatsapp: d.whatsapp ?? "",
        job_title: d.job_title ?? "",
        timezone: d.timezone ?? "",
        locale: d.locale ?? "",
      });
    }
  }, [q.data]);

  const saveMut = useMutation({
    mutationFn: () => upFn({ data: form }),
    onSuccess: () => {
      toast.success("Profile saved");
      qc.invalidateQueries({ queryKey: ["portal-profile"] });
      qc.invalidateQueries({ queryKey: ["client-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const avatarMut = useMutation({
    mutationFn: async (file: File) => {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      return upAvatar({ data: { data_url: dataUrl, filename: file.name } });
    },
    onSuccess: () => {
      toast.success("Avatar updated");
      qc.invalidateQueries({ queryKey: ["portal-profile"] });
      qc.invalidateQueries({ queryKey: ["client-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <SectionLoading />;
  const d = q.data as { email?: string; avatar_url?: string | null; name?: string | null } | null;

  return (
    <Card title="Personal information" description="Keep your details up to date.">
      <div className="flex items-center gap-4 mb-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-muted overflow-hidden border border-border">
            {d?.avatar_url ? (
              <img src={d.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl font-semibold text-muted-foreground">
                {(d?.name ?? d?.email ?? "?").slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={avatarMut.isPending}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground grid place-items-center border-2 border-surface hover:opacity-90 disabled:opacity-50"
            aria-label="Change avatar"
          >
            {avatarMut.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Camera className="w-3.5 h-3.5" />
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) avatarMut.mutate(f);
              e.target.value = "";
            }}
          />
        </div>
        <div>
          <p className="text-sm font-medium">{d?.name || d?.email}</p>
          <p className="text-xs text-muted-foreground">PNG, JPG or WEBP — up to 4MB.</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field
          label="First name"
          value={form.first_name}
          onChange={(v) => setForm((f) => ({ ...f, first_name: v }))}
        />
        <Field
          label="Last name"
          value={form.last_name}
          onChange={(v) => setForm((f) => ({ ...f, last_name: v }))}
        />
      </div>
      <div className="mt-4">
        <Label>Email</Label>
        <Input value={d?.email ?? ""} disabled />
        <p className="text-xs text-muted-foreground mt-1">
          Contact support to change your email address.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        <Field
          label="Phone"
          value={form.phone}
          onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
          placeholder="+1 555 123 4567"
        />
        <Field
          label="WhatsApp"
          value={form.whatsapp}
          onChange={(v) => setForm((f) => ({ ...f, whatsapp: v }))}
          placeholder="+1 555 123 4567"
        />
      </div>
      <div className="mt-4">
        <Field
          label="Job title"
          value={form.job_title}
          onChange={(v) => setForm((f) => ({ ...f, job_title: v }))}
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        <Field
          label="Timezone"
          value={form.timezone}
          onChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
          placeholder="Europe/Oslo"
        />
        <Field
          label="Locale"
          value={form.locale}
          onChange={(v) => setForm((f) => ({ ...f, locale: v }))}
          placeholder="en-US"
        />
      </div>
      <div className="flex justify-end mt-6">
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          <Save className="w-4 h-4 mr-1.5" /> Save changes
        </Button>
      </div>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function SectionLoading() {
  return (
    <div className="p-8 flex items-center gap-2 text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading
    </div>
  );
}

/* ---------- Address ---------- */

type AddressRow = {
  id: string;
  label: string | null;
  address_type: string;
  street1: string;
  street2: string | null;
  city: string;
  region: string | null;
  postal_code: string | null;
  country: string;
  is_primary: boolean;
};

function AddressSection() {
  const listFn = useServerFn(listMyAddresses);
  const saveFn = useServerFn(saveMyAddress);
  const delFn = useServerFn(deleteMyAddress);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["portal-addresses"], queryFn: () => listFn() });
  const [editing, setEditing] = useState<Partial<AddressRow> | null>(null);

  const saveMut = useMutation({
    mutationFn: (d: Partial<AddressRow>) =>
      saveFn({
        data: {
          id: d.id,
          label: d.label ?? null,
          address_type: (d.address_type ?? "home") as
            "billing" | "shipping" | "home" | "work" | "other",
          street1: d.street1 ?? "",
          street2: d.street2 ?? null,
          city: d.city ?? "",
          region: d.region ?? null,
          postal_code: d.postal_code ?? null,
          country: d.country ?? "",
          is_primary: d.is_primary ?? false,
        },
      }),
    onSuccess: () => {
      toast.success("Address saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["portal-addresses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Address removed");
      qc.invalidateQueries({ queryKey: ["portal-addresses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <SectionLoading />;
  const rows = (q.data ?? []) as AddressRow[];

  return (
    <Card title="Addresses" description="Billing and shipping locations we have on file.">
      {editing ? (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field
              label="Label"
              value={editing.label ?? ""}
              onChange={(v) => setEditing((e) => ({ ...(e ?? {}), label: v }))}
              placeholder="Home"
            />
            <div>
              <Label>Type</Label>
              <select
                className="w-full h-10 rounded-control border border-input bg-background px-3 text-sm"
                value={editing.address_type ?? "home"}
                onChange={(e) =>
                  setEditing((s) => ({ ...(s ?? {}), address_type: e.target.value }))
                }
              >
                {["home", "work", "billing", "shipping", "other"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Field
            label="Street"
            value={editing.street1 ?? ""}
            onChange={(v) => setEditing((e) => ({ ...(e ?? {}), street1: v }))}
          />
          <Field
            label="Apt / Suite"
            value={editing.street2 ?? ""}
            onChange={(v) => setEditing((e) => ({ ...(e ?? {}), street2: v }))}
          />
          <div className="grid sm:grid-cols-3 gap-4">
            <Field
              label="City"
              value={editing.city ?? ""}
              onChange={(v) => setEditing((e) => ({ ...(e ?? {}), city: v }))}
            />
            <Field
              label="Region"
              value={editing.region ?? ""}
              onChange={(v) => setEditing((e) => ({ ...(e ?? {}), region: v }))}
            />
            <Field
              label="Postal code"
              value={editing.postal_code ?? ""}
              onChange={(v) => setEditing((e) => ({ ...(e ?? {}), postal_code: v }))}
            />
          </div>
          <Field
            label="Country"
            value={editing.country ?? ""}
            onChange={(v) => setEditing((e) => ({ ...(e ?? {}), country: v }))}
          />
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              id="is-primary-address"
              checked={!!editing.is_primary}
              onCheckedChange={(v) => setEditing((s) => ({ ...(s ?? {}), is_primary: v === true }))}
            />
            <Label htmlFor="is-primary-address" className="font-normal">
              Set as primary
            </Label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMut.mutate(editing)}
              disabled={saveMut.isPending || !editing.street1 || !editing.city || !editing.country}
            >
              <Save className="w-4 h-4 mr-1.5" /> Save address
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No addresses yet.</p>
          ) : (
            rows.map((a) => (
              <div
                key={a.id}
                className="flex items-start justify-between gap-3 border border-border rounded-control p-4"
              >
                <div>
                  <p className="text-sm font-medium capitalize">
                    {a.label || a.address_type}
                    {a.is_primary && (
                      <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded-control bg-primary/10 text-primary uppercase  ">
                        Primary
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {a.street1}
                    {a.street2 ? `, ${a.street2}` : ""}
                    <br />
                    {[a.city, a.region, a.postal_code].filter(Boolean).join(", ")}
                    <br />
                    {a.country}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setEditing(a)}
                    className="h-9 px-2 text-xs rounded border border-border hover:bg-muted"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Remove this address?")) delMut.mutate(a.id);
                    }}
                    className="h-9 px-2 text-xs rounded border border-destructive/40 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
          <Button
            variant="outline"
            onClick={() => setEditing({ address_type: "home", country: "" })}
          >
            <Plus className="w-4 h-4 mr-1.5" /> Add address
          </Button>
        </div>
      )}
    </Card>
  );
}

/* ---------- Company ---------- */

function CompanySection() {
  const getFn = useServerFn(getMyProfile);
  const q = useQuery({ queryKey: ["portal-profile"], queryFn: () => getFn() });
  if (q.isLoading) return <SectionLoading />;
  const d = q.data as { company_id?: string | null; job_title?: string | null } | null;
  return (
    <Card title="Company" description="Your organisation on file.">
      {d?.company_id ? (
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Company ID:</span>{" "}
            <code className="font-mono text-xs">{d.company_id}</code>
          </p>
          <p>
            <span className="text-muted-foreground">Job title:</span> {d.job_title || "—"}
          </p>
          <p className="text-xs text-muted-foreground pt-3">
            Contact your account manager to change your company details.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No company linked to your account.</p>
      )}
    </Card>
  );
}

/* ---------- Communication / Notifications / Privacy ---------- */

const LABELS: Record<string, Record<string, string>> = {
  communication: {
    email: "Email",
    sms: "SMS",
    whatsapp: "WhatsApp",
    push: "Push notifications",
    phone: "Phone calls",
  },
  notifications: {
    product_updates: "Product updates",
    invoices: "Invoice reminders",
    appointments: "Appointment reminders",
    tickets: "Support ticket updates",
    marketing: "Marketing offers",
    weekly_digest: "Weekly digest",
  },
  privacy: {
    profile_visible_to_agents: "Show my profile to support agents",
    share_activity_with_ai: "Let AI use my activity to personalize replies",
    personalized_recommendations: "Personalized recommendations",
  },
};

function PrefsSection({
  kind,
  title,
  description,
}: {
  kind: "communication" | "notifications";
  title: string;
  description: string;
}) {
  const getFn = useServerFn(getMyPreferences);
  const saveFn = useServerFn(saveMyPreferences);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["portal-prefs"], queryFn: () => getFn() });
  const [local, setLocal] = useState<Record<string, boolean> | null>(null);
  const [dnc, setDnc] = useState(false);

  useEffect(() => {
    if (q.data) {
      setLocal(q.data[kind]);
      setDnc(q.data.do_not_contact);
    }
  }, [q.data, kind]);

  const mut = useMutation({
    mutationFn: () =>
      saveFn({
        data: { [kind]: local ?? {}, ...(kind === "communication" ? { do_not_contact: dnc } : {}) },
      }),
    onSuccess: () => {
      toast.success("Preferences saved");
      qc.invalidateQueries({ queryKey: ["portal-prefs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const labels = LABELS[kind];
  const keys = useMemo(() => Object.keys(labels), [labels]);

  if (q.isLoading || !local) return <SectionLoading />;

  return (
    <Card title={title} description={description}>
      <div className="space-y-3">
        {keys.map((k) => (
          <div
            key={k}
            className="flex items-center justify-between py-2 border-b border-border last:border-b-0"
          >
            <span className="text-sm">{labels[k]}</span>
            <Switch
              checked={!!local[k]}
              onCheckedChange={(v) => setLocal((s) => ({ ...(s ?? {}), [k]: v }))}
            />
          </div>
        ))}
        {kind === "communication" && (
          <div className="flex items-center justify-between py-2 border-t border-border pt-4 mt-2">
            <div>
              <p className="text-sm font-medium text-destructive">Do not contact</p>
              <p className="text-xs text-muted-foreground">
                Silence all outbound messages across every channel.
              </p>
            </div>
            <Switch checked={dnc} onCheckedChange={setDnc} />
          </div>
        )}
      </div>
      <div className="flex justify-end mt-6">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          <Save className="w-4 h-4 mr-1.5" /> Save
        </Button>
      </div>
    </Card>
  );
}

function PrivacySection() {
  const getFn = useServerFn(getMyPreferences);
  const saveFn = useServerFn(saveMyPreferences);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["portal-prefs"], queryFn: () => getFn() });
  const [local, setLocal] = useState<Record<string, boolean> | null>(null);
  useEffect(() => {
    if (q.data) setLocal(q.data.privacy);
  }, [q.data]);
  const mut = useMutation({
    mutationFn: () => saveFn({ data: { privacy: local ?? {} } }),
    onSuccess: () => {
      toast.success("Privacy settings saved");
      qc.invalidateQueries({ queryKey: ["portal-prefs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (q.isLoading || !local) return <SectionLoading />;
  const labels = LABELS.privacy;
  return (
    <Card title="Privacy settings" description="Control how your data is used.">
      <div className="space-y-3">
        {Object.keys(labels).map((k) => (
          <div
            key={k}
            className="flex items-center justify-between py-2 border-b border-border last:border-b-0"
          >
            <span className="text-sm">{labels[k]}</span>
            <Switch
              checked={!!local[k]}
              onCheckedChange={(v) => setLocal((s) => ({ ...(s ?? {}), [k]: v }))}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end mt-6">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          <Save className="w-4 h-4 mr-1.5" /> Save
        </Button>
      </div>
    </Card>
  );
}

/* ---------- Channels ---------- */

function ChannelsSection() {
  const listFn = useServerFn(listMyChannels);
  const q = useQuery({ queryKey: ["portal-channels"], queryFn: () => listFn() });
  if (q.isLoading) return <SectionLoading />;
  const rows = (q.data ?? []) as Array<{
    id: string;
    channel: string;
    external_id: string;
    display_name: string | null;
    verified: boolean;
    last_seen_at: string | null;
  }>;
  return (
    <Card
      title="Connected channels"
      description="Where we can reach you across messaging channels."
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No connected channels yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 border border-border rounded-control p-3"
            >
              <div>
                <p className="text-sm font-medium capitalize inline-flex items-center gap-2">
                  {r.channel}
                  {r.verified && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                </p>
                <p className="text-xs text-muted-foreground">{r.display_name || r.external_id}</p>
              </div>
              <div className="text-xs text-muted-foreground">
                {r.last_seen_at
                  ? `Last active ${new Date(r.last_seen_at).toLocaleDateString()}`
                  : "—"}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------- Sessions ---------- */

function SessionsSection() {
  const listFn = useServerFn(listMySessions);
  const revokeFn = useServerFn(revokeMySession);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["portal-sessions"], queryFn: () => listFn() });
  const mut = useMutation({
    mutationFn: (p: { id?: string; all_others?: boolean }) => revokeFn({ data: p }),
    onSuccess: async () => {
      toast.success("Session revoked");
      qc.invalidateQueries({ queryKey: ["portal-sessions"] });
      // best-effort: sign out other Supabase sessions
      await supabase.auth.signOut({ scope: "others" }).catch(() => 0);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (q.isLoading) return <SectionLoading />;
  const rows = (q.data ?? []) as Array<{
    id: string;
    device: string | null;
    user_agent: string | null;
    ip_address: string | null;
    location: string | null;
    last_seen_at: string | null;
    created_at: string;
  }>;
  return (
    <Card title="Active sessions" description="Devices currently signed into your account.">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          No active sessions on record.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((s) => (
            <li
              key={s.id}
              className="flex items-start justify-between gap-3 border border-border rounded-control p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {s.device || s.user_agent?.slice(0, 60) || "Unknown device"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {[s.location, s.ip_address].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Last active {s.last_seen_at ? new Date(s.last_seen_at).toLocaleString() : "—"}
                </p>
              </div>
              <button
                onClick={() => mut.mutate({ id: s.id })}
                disabled={mut.isPending}
                className="text-xs text-destructive hover:underline shrink-0"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 1 && (
        <div className="flex justify-end mt-4">
          <Button
            variant="outline"
            onClick={() => mut.mutate({ all_others: true })}
            disabled={mut.isPending}
          >
            <LogOut className="w-4 h-4 mr-1.5" /> Sign out all other sessions
          </Button>
        </div>
      )}
    </Card>
  );
}

/* ---------- Security & 2FA ---------- */

function SecuritySection() {
  const [factors, setFactors] = useState<Array<{
    id: string;
    status: string;
    friendly_name?: string | null;
  }> | null>(null);
  const [enrolling, setEnrolling] = useState<{
    factor_id: string;
    qr: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors(
      (data?.totp ?? []).map((f) => ({
        id: f.id,
        status: f.status,
        friendly_name: f.friendly_name,
      })),
    );
  }
  useEffect(() => {
    refresh();
  }, []);

  async function beginEnroll() {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Portal ${new Date().toLocaleDateString()}`,
      });
      if (error) throw error;
      setEnrolling({ factor_id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyEnroll() {
    if (!enrolling) return;
    setBusy(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({
        factorId: enrolling.factor_id,
      });
      if (chErr) throw chErr;
      const { error } = await supabase.auth.mfa.verify({
        factorId: enrolling.factor_id,
        challengeId: ch.id,
        code: code.trim(),
      });
      if (error) throw error;
      toast.success("Two-factor authentication enabled");
      setEnrolling(null);
      setCode("");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function unenroll(id: string) {
    if (!confirm("Disable two-factor authentication for this device?")) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (error) throw error;
      toast.success("Two-factor removed");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email;
      if (!email) throw new Error("No email on record");
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Password reset email sent");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const active = (factors ?? []).filter((f) => f.status === "verified");

  return (
    <div className="space-y-4">
      <Card title="Password" description="Update your account password by email link.">
        <Button variant="outline" onClick={resetPassword} disabled={busy}>
          <KeyRound className="w-4 h-4 mr-1.5" /> Send password reset email
        </Button>
      </Card>

      <Card
        title="Two-factor authentication"
        description="Add a time-based one-time code from an authenticator app."
      >
        {enrolling ? (
          <div className="space-y-4">
            <p className="text-sm">
              Scan this QR code with Google Authenticator, 1Password, Authy, etc.
            </p>
            <div className="flex items-start gap-4">
              <img
                src={enrolling.qr}
                alt="TOTP QR code"
                className="w-40 h-40 rounded-control border border-border bg-white"
              />
              <div className="text-xs space-y-2">
                <p className="text-muted-foreground">Or enter this secret manually:</p>
                <div className="inline-flex items-center gap-1 bg-muted rounded px-2 py-1 font-mono">
                  {enrolling.secret}
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(enrolling.secret);
                      toast.success("Copied");
                    }}
                    className="ml-1"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
            <div>
              <Label>Verification code</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={8}
                placeholder="123456"
                className="max-w-[200px] font-mono"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setEnrolling(null);
                  setCode("");
                }}
              >
                Cancel
              </Button>
              <Button onClick={verifyEnroll} disabled={busy || code.length < 6}>
                <CheckCircle2 className="w-4 h-4 mr-1.5" /> Verify & enable
              </Button>
            </div>
          </div>
        ) : active.length ? (
          <div className="space-y-3">
            {active.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between border border-border rounded-control p-3"
              >
                <div>
                  <p className="text-sm font-medium inline-flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />{" "}
                    {f.friendly_name || "Authenticator app"}
                  </p>
                  <p className="text-xs text-muted-foreground">TOTP · Verified</p>
                </div>
                <button
                  onClick={() => unenroll(f.id)}
                  disabled={busy}
                  className="text-xs text-destructive hover:underline"
                >
                  Remove
                </button>
              </div>
            ))}
            <Button variant="outline" onClick={beginEnroll} disabled={busy}>
              <Plus className="w-4 h-4 mr-1.5" /> Add another device
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You don't have two-factor enabled. Adding it protects your account even if your
              password is leaked.
            </p>
            <Button onClick={beginEnroll} disabled={busy}>
              <Shield className="w-4 h-4 mr-1.5" /> Enable two-factor
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
