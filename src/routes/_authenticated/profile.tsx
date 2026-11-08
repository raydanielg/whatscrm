import { Brand } from "@/components/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  User,
  Mail,
  Phone,
  Briefcase,
  Building2,
  Globe,
  Clock,
  Palette,
  Bell,
  Shield,
  MonitorSmartphone,
  LogOut,
  Trash2,
  Upload,
  Save,
  Loader2,
  KeyRound,
} from "lucide-react";
import { z } from "zod";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Autocomplete } from "@/shared/components/autocomplete";
import { WORLD_LANGUAGES, WORLD_TIMEZONES, timezoneOffsetLabel } from "@/lib/i18n/locale-data";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useTheme, type Theme } from "@/shared/providers/theme-provider";
import { supabase } from "@/integrations/supabase/client";
import {
  useMyProfile,
  useUpdateProfile,
  useUploadAvatar,
  useMySessions,
  useRevokeSession,
  useRegisterCurrentSession,
  useDeleteAccount,
  type NotificationPrefs,
} from "@/hooks/use-profile";
import { AvatarCropDialog } from "@/components/app/avatar-crop-dialog";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/profile")({
  staticData: { breadcrumb: "Profile", section: "Account" },
  head: () => ({
    meta: [
      { title: "Profile · Account" },
      {
        name: "description",
        content:
          "Manage your personal account: identity, preferences, notifications, security, and devices.",
      },
      { property: "og:title", content: "Profile · Account" },
      {
        property: "og:description",
        content:
          "Manage your personal account: identity, preferences, notifications, security, and devices.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

const profileSchema = z.object({
  full_name: z.string().trim().max(100).optional().nullable(),
  display_name: z.string().trim().max(100).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  job_title: z.string().trim().max(100).optional().nullable(),
  department: z.string().trim().max(100).optional().nullable(),
  bio: z.string().trim().max(1000).optional().nullable(),
});

const DATE_FORMATS = ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY", "D MMM YYYY"];
const TIME_FORMATS: Array<{ v: string; l: string }> = [
  { v: "24h", l: "24-hour (14:30)" },
  { v: "12h", l: "12-hour (2:30 PM)" },
];

function ProfilePage() {
  const { data: profile, isLoading } = useMyProfile();
  const register = useRegisterCurrentSession();

  useEffect(() => {
    register.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) {
    return (
      <>
        <AppTopbar title="Profile" subtitle="Personal account, preferences and security" />
        <div className="p-8 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading profile
        </div>
      </>
    );
  }
  if (!profile) {
    return (
      <>
        <AppTopbar title="Profile" subtitle="Personal account, preferences and security" />
        <div className="p-8 text-sm text-destructive">
          Could not load your profile. Please sign out and back in.
        </div>
      </>
    );
  }

  return (
    <>
      <AppTopbar title="Profile" subtitle="Personal account, preferences and security" />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="flex flex-wrap gap-1">
            <TabsTrigger value="general">
              <User className="w-3.5 h-3.5 mr-1.5" /> General
            </TabsTrigger>
            <TabsTrigger value="preferences">
              <Globe className="w-3.5 h-3.5 mr-1.5" /> Preferences
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell className="w-3.5 h-3.5 mr-1.5" /> Notifications
            </TabsTrigger>
            <TabsTrigger value="security">
              <Shield className="w-3.5 h-3.5 mr-1.5" /> Security
            </TabsTrigger>
            <TabsTrigger value="sessions">
              <MonitorSmartphone className="w-3.5 h-3.5 mr-1.5" /> Devices
            </TabsTrigger>
            <TabsTrigger value="danger">
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Danger zone
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <GeneralTab profile={profile} />
          </TabsContent>
          <TabsContent value="preferences">
            <PreferencesTab profile={profile} />
          </TabsContent>
          <TabsContent value="notifications">
            <NotificationsTab profile={profile} />
          </TabsContent>
          <TabsContent value="security">
            <SecurityTab />
          </TabsContent>
          <TabsContent value="sessions">
            <SessionsTab />
          </TabsContent>
          <TabsContent value="danger">
            <DangerZoneTab />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}

/* ---------------- General ---------------- */
function GeneralTab({
  profile,
}: {
  profile: NonNullable<ReturnType<typeof useMyProfile>["data"]>;
}) {
  const update = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const [form, setForm] = useState({
    full_name: profile.full_name ?? "",
    display_name: profile.display_name ?? "",
    phone: profile.phone ?? "",
    job_title: profile.job_title ?? "",
    department: profile.department ?? "",
    bio: profile.bio ?? "",
  });

  async function save() {
    const parsed = profileSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    try {
      await update.mutateAsync(form);
      toast.success("Profile updated");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Image must be under 5 MB");
    if (!file.type.startsWith("image/")) return toast.error("File must be an image");
    setPendingFile(file);
  }

  async function handleCropped(blob: Blob) {
    try {
      await uploadAvatar.mutateAsync(blob);
      setPendingFile(null);
      toast.success("Avatar updated");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const initials = useMemo(() => {
    const name = form.full_name || form.display_name || profile.email || "?";
    return name
      .split(" ")
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("");
  }, [form.full_name, form.display_name, profile.email]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal information</CardTitle>
        <CardDescription>Displayed to teammates across the app.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-5">
          <Avatar className="w-20 h-20">
            <AvatarImage src={profile.avatar_url ?? undefined} alt="Avatar" />
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploadAvatar.isPending}
              >
                {uploadAvatar.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                )}
                Upload photo
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
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
                          onClick={async () => {
                            try {
                              await update.mutateAsync({ avatar_url: url });
                              toast.success("Avatar updated");
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
                          }}
                        >
                          <img src={url} alt="" className="w-full h-full aspect-square" />
                        </button>
                      ),
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
            <p className="text-xs text-muted-foreground mt-2">PNG, JPG or WebP — max 5 MB.</p>
          </div>
        </div>
        <AvatarCropDialog
          file={pendingFile}
          saving={uploadAvatar.isPending}
          onCancel={() => setPendingFile(null)}
          onConfirm={handleCropped}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full name" icon={User}>
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="Jane Doe"
            />
          </Field>
          <Field label="Display name" icon={User}>
            <Input
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              placeholder="jane"
            />
          </Field>
          <Field label="Email" icon={Mail}>
            <Input value={profile.email ?? ""} disabled />
          </Field>
          <Field label="Phone" icon={Phone}>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+1 555 0100"
            />
          </Field>
          <Field label="Job title" icon={Briefcase}>
            <Input
              value={form.job_title}
              onChange={(e) => setForm({ ...form, job_title: e.target.value })}
              placeholder="Head of Sales"
            />
          </Field>
          <Field label="Department" icon={Building2}>
            <Input
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              placeholder="Revenue"
            />
          </Field>
        </div>

        <div>
          <Label className="text-xs  text-muted-foreground">Bio</Label>
          <Textarea
            rows={4}
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            placeholder="A short introduction — visible on your public profile."
            className="mt-1"
          />
          <p className="text-xs text-muted-foreground mt-1">{form.bio.length}/1000</p>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1.5" />
            )}
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Preferences ---------------- */
function PreferencesTab({
  profile,
}: {
  profile: NonNullable<ReturnType<typeof useMyProfile>["data"]>;
}) {
  const update = useUpdateProfile();
  const { theme, setTheme } = useTheme();
  const [form, setForm] = useState({
    language: profile.language,
    timezone: profile.timezone,
    date_format: profile.date_format,
    time_format: profile.time_format,
    theme: profile.theme,
  });

  const languageOptions = useMemo(
    () => WORLD_LANGUAGES.map((l) => ({ value: l.code, label: `${l.label} (${l.native})` })),
    [],
  );
  const timezoneOptions = useMemo(
    () =>
      WORLD_TIMEZONES.map((z) => ({
        value: z,
        label: z.replace(/_/g, " "),
        description: timezoneOffsetLabel(z),
      })),
    [],
  );

  // Preserve a value already saved for this user even if it isn't in the
  // canonical list, so an older/freeform row doesn't disappear from the field.
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
      await update.mutateAsync(form);
      setTheme(form.theme as Theme);
      toast.success("Preferences saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Regional & display preferences</CardTitle>
        <CardDescription>
          How dates, times and copy appear across <Brand />.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Language" icon={Globe}>
            <Autocomplete
              options={withSavedFallback(languageOptions, form.language)}
              value={form.language}
              onValueChange={(v) => setForm({ ...form, language: v ?? "" })}
              placeholder="Select language"
              searchPlaceholder="Search languages"
              clearable={false}
            />
          </Field>
          <Field label="Timezone" icon={Clock}>
            <Autocomplete
              options={withSavedFallback(timezoneOptions, form.timezone)}
              value={form.timezone}
              onValueChange={(v) => setForm({ ...form, timezone: v ?? "" })}
              placeholder="Select timezone"
              searchPlaceholder="Search timezones"
              clearable={false}
            />
          </Field>
          <Field label="Date format">
            <Select
              value={form.date_format}
              onValueChange={(v) => setForm({ ...form, date_format: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMATS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Time format">
            <Select
              value={form.time_format}
              onValueChange={(v) => setForm({ ...form, time_format: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_FORMATS.map((f) => (
                  <SelectItem key={f.v} value={f.v}>
                    {f.l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div>
          <Label className="text-xs  text-muted-foreground flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5" /> Theme
          </Label>
          <div className="mt-2 flex gap-2">
            {(["light", "dark", "system"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setForm({ ...form, theme: t });
                  setTheme(t);
                }}
                className={`px-4 h-10 rounded-control border text-sm capitalize transition ${form.theme === t ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-muted"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Currently applied: {theme}</p>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1.5" />
            )}
            Save preferences
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Notifications ---------------- */
function NotificationsTab({
  profile,
}: {
  profile: NonNullable<ReturnType<typeof useMyProfile>["data"]>;
}) {
  const update = useUpdateProfile();
  const [prefs, setPrefs] = useState<NotificationPrefs>(profile.notification_preferences);

  async function save() {
    try {
      await update.mutateAsync({ notification_preferences: prefs });
      toast.success("Notification preferences saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const rows: Array<{ key: keyof NotificationPrefs; label: string; desc: string; group: string }> =
    [
      {
        key: "email_marketing",
        label: "Product news & tips",
        desc: "Occasional updates about new features.",
        group: "Email",
      },
      {
        key: "email_product",
        label: "Product updates",
        desc: "Release notes and changes affecting your work.",
        group: "Email",
      },
      {
        key: "email_security",
        label: "Security alerts",
        desc: "Sign-ins from new devices or unusual activity.",
        group: "Email",
      },
      {
        key: "push_new_message",
        label: "New messages",
        desc: "When a customer sends you a new message.",
        group: "Push",
      },
      {
        key: "push_mentions",
        label: "Mentions",
        desc: "When a teammate @mentions you.",
        group: "Push",
      },
      {
        key: "push_assignments",
        label: "Assignments",
        desc: "When a conversation or deal is assigned to you.",
        group: "Push",
      },
    ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>Choose what you want to be notified about.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {["Email", "Push"].map((g) => (
          <div key={g} className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">{g}</h3>
            {rows
              .filter((r) => r.group === g)
              .map((r) => (
                <div
                  key={r.key}
                  className="flex items-center justify-between gap-4 p-3 border rounded-control"
                >
                  <div>
                    <div className="text-sm font-medium">{r.label}</div>
                    <div className="text-xs text-muted-foreground">{r.desc}</div>
                  </div>
                  <Switch
                    checked={prefs[r.key] as boolean}
                    onCheckedChange={(v) => setPrefs({ ...prefs, [r.key]: v })}
                  />
                </div>
              ))}
          </div>
        ))}
        <div>
          <Label className="text-xs  text-muted-foreground">Digest frequency</Label>
          <Select
            value={prefs.digest_frequency}
            onValueChange={(v) =>
              setPrefs({ ...prefs, digest_frequency: v as NotificationPrefs["digest_frequency"] })
            }
          >
            <SelectTrigger className="mt-1 max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="never">Never</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1.5" />
            )}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Security ---------------- */
function SecurityTab() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const pwSchema = z
    .object({
      password: z.string().min(8, "At least 8 characters"),
      confirm: z.string(),
    })
    .refine((d) => d.password === d.confirm, {
      message: "Passwords do not match",
      path: ["confirm"],
    });

  async function changePassword() {
    const parsed = pwSchema.safeParse({ password, confirm });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated");
      setPassword("");
      setConfirm("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function signOutEverywhere() {
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) return toast.error(error.message);
    toast.success("Signed out on all devices");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> Change password
          </CardTitle>
          <CardDescription>
            Use at least 8 characters. We hash passwords server-side.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 max-w-md">
          <div>
            <Label>New password</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <Label>Confirm password</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button onClick={changePassword} disabled={saving}>
            {saving ? "Updating" : "Update password"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LogOut className="w-4 h-4" /> Sign out other devices
          </CardTitle>
          <CardDescription>End every active session across all browsers and apps.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={signOutEverywhere}>
            Sign out everywhere
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Sessions / Devices ---------------- */
function SessionsTab() {
  const sessions = useMySessions();
  const revoke = useRevokeSession();
  const active = (sessions.data ?? []).filter((s) => !s.revoked_at);
  const past = (sessions.data ?? []).filter((s) => s.revoked_at).slice(0, 20);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorSmartphone className="w-4 h-4" /> Active sessions
          </CardTitle>
          <CardDescription>Devices currently signed in to your account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {active.length === 0 && (
            <p className="text-sm text-muted-foreground">No active sessions recorded.</p>
          )}
          {active.map((s) => (
            <SessionRow
              key={s.id}
              s={s}
              onRevoke={async () => {
                try {
                  await revoke.mutateAsync(s.id);
                  toast.success("Session revoked");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent login history</CardTitle>
          <CardDescription>Last 20 revoked sessions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {past.length === 0 && (
            <p className="text-sm text-muted-foreground">No past sessions yet.</p>
          )}
          {past.map((s) => (
            <SessionRow key={s.id} s={s} historical />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SessionRow({
  s,
  onRevoke,
  historical,
}: {
  s: import("@/hooks/use-profile").SessionRow;
  onRevoke?: () => void;
  historical?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border rounded-control p-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-control bg-muted grid place-items-center">
          <MonitorSmartphone className="w-4 h-4" />
        </div>
        <div>
          <div className="text-sm font-medium">
            {s.device ?? "Unknown device"}{" "}
            {!historical && (
              <Badge variant="secondary" className="ml-1 text-[11px]">
                Active
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground max-w-[420px] truncate">
            {s.user_agent ?? "—"}
          </div>
          <div className="text-xs text-muted-foreground">
            {s.location ?? s.ip_address ?? "Unknown location"} · last seen{" "}
            {new Date(s.last_seen_at).toLocaleString()}
          </div>
        </div>
      </div>
      {onRevoke && (
        <Button variant="ghost" size="sm" onClick={onRevoke}>
          <LogOut className="w-3.5 h-3.5 mr-1.5" /> Revoke
        </Button>
      )}
    </div>
  );
}

/* ---------------- Danger zone ---------------- */
function DangerZoneTab() {
  const del = useDeleteAccount();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [confirmText, setConfirmText] = useState("");

  async function handleDelete() {
    try {
      await del.mutateAsync();
      await qc.cancelQueries();
      qc.clear();
      toast.success("Account deleted");
      nav({ to: "/auth", replace: true });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive flex items-center gap-2">
          <Trash2 className="w-4 h-4" /> Delete account
        </CardTitle>
        <CardDescription>
          Permanently remove your profile data and sign you out everywhere. This action cannot be
          undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Type <span className="font-mono font-semibold text-foreground">delete my account</span> to
          enable the button.
        </p>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="delete my account"
        />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              disabled={confirmText !== "delete my account" || del.isPending}
            >
              {del.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              )}
              Delete my account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                Your profile will be anonymised and you will be signed out on every device.
                Organizations you own will remain — transfer ownership first if you want them
                removed too.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete account
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

/* ---------------- Shared ---------------- */
function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-xs  text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5" />} {label}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
