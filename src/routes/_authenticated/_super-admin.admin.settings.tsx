import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GoogleConnectorSettings } from "@/components/integrations/google-connector-settings";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { GatewaySettingsPanel } from "@/components/admin/billing/gateway-settings-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DateTimePicker,
  fromLocalDateTimeString,
  toLocalDateTimeString,
} from "@/shared/components";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Save, ExternalLink, ShieldAlert } from "lucide-react";
import {
  getPlatformSettings,
  updatePlatformSetting,
  type PlatformSettingKey,
} from "@/lib/admin/platform-settings.functions";
import { platformFieldErrors } from "@/lib/admin/platform-settings-validation";
import {
  ANALYTICS_KEY_HINTS,
  ANALYTICS_PROVIDERS,
  ANALYTICS_PROVIDER_LABELS,
  type AnalyticsProvider,
} from "@/lib/analytics/config";
import { resolveWhatsAppCta } from "@/lib/marketing/whatsapp-cta";
import { FeatureToggleList } from "@/components/admin/platform/feature-toggle-list";
import { PLATFORM_RUNTIME_QUERY_KEY } from "@/hooks/use-platform-runtime";
import { PLATFORM_BRANDING_QUERY_KEY } from "@/hooks/use-platform-branding";
import { LocaleMultiSelect } from "@/components/admin/locale-multi-select";
import {
  WORLD_LANGUAGES,
  WORLD_CURRENCIES,
  WORLD_TIMEZONES,
  COMMON_LANGUAGES,
  COMMON_CURRENCIES,
  COMMON_TIMEZONES,
  DATE_FORMAT_OPTIONS,
  languageLabel,
  currencyLabel,
  timezoneLabel,
  timezoneOffsetLabel,
  isRtlLanguage,
} from "@/lib/i18n/locale-data";
import { useTenantAccent, DEFAULT_ACCENT, ACCENT_PRESETS } from "@/lib/themes/tenant-accent";
import { ImageDropUpload } from "@/components/branding/image-drop-upload";
import { useBrandName } from "@/hooks/use-brand-name";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/settings")({
  staticData: { breadcrumb: "Settings" },
  head: () => ({
    meta: [{ title: "Super Admin — Platform Settings" }, { name: "robots", content: "noindex" }],
  }),
  component: PlatformSettingsPage,
});

type Values = Record<string, unknown>;

function useSettings() {
  const qc = useQueryClient();
  const getFn = useServerFn(getPlatformSettings);
  const setFn = useServerFn(updatePlatformSetting);

  const q = useQuery({ queryKey: ["admin", "platform-settings"], queryFn: () => getFn() });

  const save = useMutation({
    mutationFn: (input: { key: PlatformSettingKey; value: Values }) => setFn({ data: input }),
    onSuccess: (_r, v) => {
      toast.success(`${v.key} saved`);
      qc.invalidateQueries({ queryKey: ["admin", "platform-settings"] });
      // General/Branding drive the app shell (name, logo, favicon, accent) —
      // refresh the public branding cache so the change lands immediately.
      qc.invalidateQueries({ queryKey: PLATFORM_BRANDING_QUERY_KEY });
      // Maintenance / feature toggles / auth / security / localization are
      // enforced app-wide through the public runtime config.
      qc.invalidateQueries({ queryKey: PLATFORM_RUNTIME_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["white-label"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const read = (key: PlatformSettingKey): Values =>
    (q.data?.[key]?.value as Values | undefined) ?? {};

  return { q, save, read };
}

function PlatformSettingsPage() {
  return (
    <AdminPageShell
      title="Platform Settings"
      description="Global defaults inherited by every workspace. Only superadmin can save changes."
    >
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="flex h-auto w-auto flex-wrap justify-start gap-1 p-1">
          {[
            ["general", "General"],
            ["branding", "Branding"],
            ["localization", "Localization"],
            ["smtp", "SMTP"],
            ["storage", "Storage"],
            ["security", "Security"],
            ["authentication", "Authentication"],
            ["billing", "Billing"],
            ["payments", "Payments"],
            ["whatsapp", "WhatsApp"],
            ["ai", "AI Providers"],
            ["api", "API"],
            ["integrations", "Integrations"],
            ["notifications", "Notifications"],
            ["email_templates", "Email Templates"],
            ["maintenance", "Maintenance"],
            ["analytics", "Analytics"],
            ["feature_flags", "Feature Toggles"],
          ].map(([v, l]) => (
            <TabsTrigger key={v} value={v}>
              {l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <GeneralPanel />
        </TabsContent>
        <TabsContent value="branding" className="mt-4">
          <BrandingPanel />
        </TabsContent>
        <TabsContent value="localization" className="mt-4">
          <LocalizationPanel />
        </TabsContent>
        <TabsContent value="smtp" className="mt-4">
          <SmtpPanel />
        </TabsContent>
        <TabsContent value="storage" className="mt-4">
          <StoragePanel />
        </TabsContent>
        <TabsContent value="security" className="mt-4">
          <SecurityPanel />
        </TabsContent>
        <TabsContent value="authentication" className="mt-4">
          <AuthPanel />
        </TabsContent>
        <TabsContent value="billing" className="mt-4">
          <BillingPanel />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <PaymentsPanel />
        </TabsContent>
        <TabsContent value="whatsapp" className="mt-4">
          <WhatsAppPanel />
        </TabsContent>
        <TabsContent value="ai" className="mt-4">
          <LinkOutPanel
            to="/admin/ai-providers"
            label="AI Providers dashboard"
            description="Configure providers, models, keys, defaults, and quotas."
          />
        </TabsContent>
        <TabsContent value="api" className="mt-4">
          <ApiPanel />
        </TabsContent>
        <TabsContent value="integrations" className="mt-4">
          <GoogleConnectorSettings />
        </TabsContent>
        <TabsContent value="notifications" className="mt-4">
          <NotificationsPanel />
        </TabsContent>
        <TabsContent value="email_templates" className="mt-4">
          <EmailTemplatesPanel />
        </TabsContent>
        <TabsContent value="maintenance" className="mt-4">
          <MaintenancePanel />
        </TabsContent>
        <TabsContent value="analytics" className="mt-4">
          <AnalyticsPanel />
        </TabsContent>
        <TabsContent value="feature_flags" className="mt-4">
          <FeatureFlagsPanel />
        </TabsContent>
      </Tabs>
    </AdminPageShell>
  );
}

/* ---------- generic helpers ---------- */

function useLocalDraft<T extends Values>(source: T): [T, (patch: Partial<T>) => void, () => void] {
  const [draft, setDraft] = useState<T>(source);
  useEffect(() => {
    setDraft(source);
  }, [JSON.stringify(source)]); // eslint-disable-line react-hooks/exhaustive-deps
  const patch = (p: Partial<T>) => setDraft((d) => ({ ...d, ...p }));
  const reset = () => setDraft(source);
  return [draft, patch, reset];
}

function SectionCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
      {footer && <div className="flex justify-end gap-2 p-4 border-t bg-muted/30">{footer}</div>}
    </Card>
  );
}

function SaveButton({
  onSave,
  saving,
  disabled,
}: {
  onSave: () => void;
  saving: boolean;
  disabled?: boolean;
}) {
  return (
    <Button onClick={onSave} disabled={saving || disabled}>
      <Save className="h-4 w-4 " /> {saving ? "Saving" : "Save changes"}
    </Button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function LinkOutPanel({
  to,
  label,
  description,
}: {
  to: string;
  label: string;
  description: string;
}) {
  return (
    <SectionCard title={label} description={description}>
      <Button asChild variant="outline">
        <Link to={to}>
          Open <ExternalLink className="h-4 w-4 ml-1" />
        </Link>
      </Button>
    </SectionCard>
  );
}

/* ---------- General ---------- */

type GeneralValues = {
  platform_name?: string;
  support_email?: string;
  primary_url?: string;
  tagline?: string;
  default_org_size?: number;
  whatsapp_cta_enabled?: boolean;
  whatsapp_token?: string;
  whatsapp_message?: string;
  whatsapp_cta_label?: string;
  whatsapp_fallback_url?: string;
};

function GeneralPanel() {
  const { q, save, read } = useSettings();
  const saved = read("general") as GeneralValues;
  const [d, patch, reset] = useLocalDraft(saved);
  const [touched, setTouched] = useState(false);
  const errors = platformFieldErrors("general", { platform_name: "", ...d });
  const dirty = JSON.stringify(saved) !== JSON.stringify(d);

  const submit = () => {
    setTouched(true);
    const errCount = Object.keys(errors).length;
    if (errCount) {
      toast.error(`Fix ${errCount} field${errCount > 1 ? "s" : ""} before saving`);
      return;
    }
    save.mutate({ key: "general", value: d });
    setTouched(false);
  };

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading</p>;

  return (
    <SectionCard
      title="General"
      description="Platform identity. The name and logo appear in the sidebar, footer, emails and browser tab for every workspace that has not set its own white label."
      footer={
        <>
          {dirty && (
            <Button variant="ghost" onClick={reset}>
              Discard
            </Button>
          )}
          <SaveButton onSave={submit} saving={save.isPending} />
        </>
      }
    >
      {dirty && (
        <Badge variant="outline" className="w-fit">
          Unsaved changes
        </Badge>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Platform name" hint="Shown in the sidebar, footer and page titles.">
          <Input
            value={d.platform_name ?? ""}
            onChange={(e) => patch({ platform_name: e.target.value })}
            placeholder={`${BRAND_NAME}`}
            aria-invalid={touched && !!errors["platform_name"]}
          />
          <FieldError show={touched} message={errors["platform_name"]} />
        </Field>
        <Field label="Tagline" hint="Short descriptor used on sign-in and marketing surfaces.">
          <Input
            value={d.tagline ?? ""}
            onChange={(e) => patch({ tagline: e.target.value })}
            placeholder="Customer conversations, unified"
          />
          <FieldError show={touched} message={errors["tagline"]} />
        </Field>
        <Field label="Primary URL" hint="Canonical app URL used in emails and links.">
          <Input
            value={d.primary_url ?? ""}
            onChange={(e) => patch({ primary_url: e.target.value })}
            placeholder="https://app.wacrm.com"
            aria-invalid={touched && !!errors["primary_url"]}
          />
          <FieldError show={touched} message={errors["primary_url"]} />
        </Field>
        <Field label="Support email" hint="Rendered as the Contact link in the app footer.">
          <Input
            type="email"
            value={d.support_email ?? ""}
            onChange={(e) => patch({ support_email: e.target.value })}
            placeholder="support@example.com"
            aria-invalid={touched && !!errors["support_email"]}
          />
          <FieldError show={touched} message={errors["support_email"]} />
        </Field>
        <Field label="Default seats per new org" hint="Applied when a new workspace is created.">
          <Input
            type="number"
            min={1}
            value={d.default_org_size ?? 5}
            onChange={(e) => patch({ default_org_size: Number(e.target.value) })}
            aria-invalid={touched && !!errors["default_org_size"]}
          />
          <FieldError show={touched} message={errors["default_org_size"]} />
        </Field>
      </div>

      <div className="grid gap-4 rounded-control border p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label className="text-sm font-medium">WhatsApp chat button</Label>
            <p className="text-xs text-muted-foreground">
              Shows a prominent click-to-chat button on the marketing site that opens WhatsApp with
              a prefilled message.
            </p>
          </div>
          <Switch
            checked={d.whatsapp_cta_enabled !== false}
            onCheckedChange={(v) => patch({ whatsapp_cta_enabled: v })}
          />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <Field
            label="Channel token"
            hint="Phone number with country code (+971501234567) or a wa.me link."
          >
            <Input
              value={d.whatsapp_token ?? ""}
              onChange={(e) => patch({ whatsapp_token: e.target.value })}
              placeholder="+971501234567"
              aria-invalid={touched && !!errors["whatsapp_token"]}
            />
            <FieldError show={touched} message={errors["whatsapp_token"]} />
          </Field>
          <Field
            label="Fallback link"
            hint="Used when no token is set. An https URL or an in-app path such as /contact."
          >
            <Input
              value={d.whatsapp_fallback_url ?? ""}
              onChange={(e) => patch({ whatsapp_fallback_url: e.target.value })}
              placeholder="/contact"
              aria-invalid={touched && !!errors["whatsapp_fallback_url"]}
            />
            <FieldError show={touched} message={errors["whatsapp_fallback_url"]} />
          </Field>
          <Field label="Button label">
            <Input
              value={d.whatsapp_cta_label ?? ""}
              onChange={(e) => patch({ whatsapp_cta_label: e.target.value })}
              placeholder="Chat on WhatsApp"
            />
            <FieldError show={touched} message={errors["whatsapp_cta_label"]} />
          </Field>
          <Field label="Prefilled message" hint="{site} and {page} are replaced automatically.">
            <Input
              value={d.whatsapp_message ?? ""}
              onChange={(e) => patch({ whatsapp_message: e.target.value })}
              placeholder="Hi! I'd like to know more about {site}."
            />
            <FieldError show={touched} message={errors["whatsapp_message"]} />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground break-all">
          Preview:{" "}
          {
            resolveWhatsAppCta(
              {
                enabled: d.whatsapp_cta_enabled !== false,
                token: d.whatsapp_token ?? null,
                message: d.whatsapp_message ?? null,
                label: d.whatsapp_cta_label ?? null,
                fallbackUrl: d.whatsapp_fallback_url ?? null,
              },
              { site: d.platform_name || `${BRAND_NAME}`, page: "/" },
            ).href
          }
        </p>
      </div>

      <BrandPreview
        name={d.platform_name || `${BRAND_NAME}`}
        tagline={d.tagline}
        logoUrl={(read("branding") as { logo_url?: string }).logo_url}
      />
    </SectionCard>
  );
}

/* ---------- Branding ---------- */

type BrandingValues = {
  logo_url?: string;
  dark_logo_url?: string;
  favicon_url?: string;
  social_image_url?: string;
  primary_color?: string;
  accent_color?: string;
  footer_html?: string;
};

function BrandingPanel() {
  const { q, save, read } = useSettings();
  const saved = read("branding") as BrandingValues;
  const [d, patch, reset] = useLocalDraft(saved);
  const [touched, setTouched] = useState(false);
  const { setPreviewAccent } = useTenantAccent();
  const errors = platformFieldErrors("branding", d);
  const dirty = JSON.stringify(saved) !== JSON.stringify(d);
  const generalName =
    (read("general") as { platform_name?: string }).platform_name || `${BRAND_NAME}`;

  // Live-preview the accent while editing; restore the saved one on unmount.
  useEffect(() => () => setPreviewAccent(null), [setPreviewAccent]);

  const submit = () => {
    setTouched(true);
    const errCount = Object.keys(errors).length;
    if (errCount) {
      toast.error(`Fix ${errCount} field${errCount > 1 ? "s" : ""} before saving`);
      return;
    }
    save.mutate({ key: "branding", value: d });
    setTouched(false);
    setPreviewAccent(null);
  };

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading</p>;

  return (
    <SectionCard
      title="Branding"
      description="Logos, colors and footer copy applied across the app. A workspace with its own active white label overrides these values."
      footer={
        <>
          {dirty && (
            <Button
              variant="ghost"
              onClick={() => {
                reset();
                setPreviewAccent(null);
              }}
            >
              Discard
            </Button>
          )}
          <SaveButton onSave={submit} saving={save.isPending} />
        </>
      }
    >
      {dirty && (
        <Badge variant="outline" className="w-fit">
          Unsaved changes
        </Badge>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Logo (light)" hint="Sidebar and footer on light backgrounds.">
          <ImageDropUpload
            label="Light logo"
            value={d.logo_url}
            onChange={(v) => patch({ logo_url: v })}
            scope={{ kind: "platform" }}
            slot="logo-light"
          />
          <FieldError show={touched} message={errors["logo_url"]} />
        </Field>
        <Field label="Logo (dark)" hint="Used when the app is in dark mode.">
          <ImageDropUpload
            label="Dark logo"
            value={d.dark_logo_url}
            onChange={(v) => patch({ dark_logo_url: v })}
            scope={{ kind: "platform" }}
            slot="logo-dark"
            dark
          />
          <FieldError show={touched} message={errors["dark_logo_url"]} />
        </Field>
        <Field label="Favicon" hint="Applied to the browser tab on every page.">
          <ImageDropUpload
            label="Favicon"
            value={d.favicon_url}
            onChange={(v) => patch({ favicon_url: v })}
            scope={{ kind: "platform" }}
            slot="favicon"
            hint="Square PNG, SVG or ICO · 32×32 or larger"
          />
          <FieldError show={touched} message={errors["favicon_url"]} />
        </Field>
        <Field
          label="Social share image"
          hint="Used for link previews on WhatsApp, X, LinkedIn and Slack."
        >
          <ImageDropUpload
            label="Social image"
            value={d.social_image_url}
            onChange={(v) => patch({ social_image_url: v })}
            scope={{ kind: "platform" }}
            slot="social-image"
            hint="PNG or JPEG · 1200×630 recommended"
          />
          <FieldError show={touched} message={errors["social_image_url"]} />
        </Field>

        <Field label="Primary color" hint="Base --primary token for buttons and highlights.">
          <div className="flex gap-2">
            <Input
              type="color"
              value={d.primary_color || "#2563eb"}
              onChange={(e) => patch({ primary_color: e.target.value })}
              className="w-16 p-1"
              aria-label="Pick primary color"
            />
            <Input
              value={d.primary_color ?? ""}
              onChange={(e) => patch({ primary_color: e.target.value })}
              placeholder="#2563eb"
              aria-invalid={touched && !!errors["primary_color"]}
            />
          </div>
          <FieldError show={touched} message={errors["primary_color"]} />
        </Field>
        <Field label="Accent color" hint="Platform-wide accent; previewed live while you edit.">
          <div className="flex gap-2">
            <Input
              type="color"
              value={d.accent_color || DEFAULT_ACCENT}
              onChange={(e) => {
                patch({ accent_color: e.target.value });
                setPreviewAccent(e.target.value);
              }}
              className="w-16 p-1"
              aria-label="Pick accent color"
            />
            <Input
              value={d.accent_color ?? ""}
              onChange={(e) => {
                patch({ accent_color: e.target.value });
                setPreviewAccent(e.target.value);
              }}
              placeholder={DEFAULT_ACCENT}
              aria-invalid={touched && !!errors["accent_color"]}
            />
          </div>
          <FieldError show={touched} message={errors["accent_color"]} />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {ACCENT_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                title={p.label}
                aria-label={`Use ${p.label} accent`}
                onClick={() => {
                  patch({ accent_color: p.value });
                  setPreviewAccent(p.value);
                }}
                className="h-10 w-10 rounded-full border border-border"
                style={{ background: p.value }}
              />
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                patch({ accent_color: "" });
                setPreviewAccent(null);
              }}
            >
              Reset
            </Button>
          </div>
        </Field>
      </div>

      <Field
        label="Footer copy"
        hint="Plain text or simple HTML shown in the app footer. Scripts and inline handlers are removed."
      >
        <Textarea
          rows={3}
          value={d.footer_html ?? ""}
          onChange={(e) => patch({ footer_html: e.target.value })}
        />
        <FieldError show={touched} message={errors["footer_html"]} />
      </Field>

      <BrandPreview
        name={generalName}
        logoUrl={d.logo_url}
        accent={d.accent_color}
        primary={d.primary_color}
        footerHtml={d.footer_html}
      />
    </SectionCard>
  );
}

function FieldError({ show, message }: { show: boolean; message?: string }) {
  if (!show || !message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

function BrandPreview({
  name,
  tagline,
  logoUrl,
  accent,
  primary,
  footerHtml,
}: {
  name: string;
  tagline?: string;
  logoUrl?: string;
  accent?: string;
  primary?: string;
  footerHtml?: string;
}) {
  return (
    <div className="rounded-control border overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-6 max-w-[120px] object-contain" />
        ) : (
          <span
            className="flex h-6 w-6 items-center justify-center rounded-control text-xs font-semibold text-white"
            style={{ background: accent || primary || DEFAULT_ACCENT }}
          >
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name}</p>
          {tagline && <p className="truncate text-xs text-muted-foreground">{tagline}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 py-3">
        <span
          className="rounded-control px-3 py-1.5 text-xs font-medium text-white"
          style={{ background: primary || accent || DEFAULT_ACCENT }}
        >
          Primary action
        </span>
        <span
          className="rounded-control border px-3 py-1.5 text-xs"
          style={{ borderColor: accent || DEFAULT_ACCENT, color: accent || DEFAULT_ACCENT }}
        >
          Accent
        </span>
      </div>
      {footerHtml && (
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          {footerHtml.replace(/<[^>]*>/g, "")}
        </div>
      )}
    </div>
  );
}

/* ---------- Localization ---------- */

function LocalizationPanel() {
  const { save, read } = useSettings();
  const [d, patch] = useLocalDraft(
    read("localization") as {
      default_language?: string;
      enabled_languages?: string[];
      default_currency?: string;
      enabled_currencies?: string[];
      default_timezone?: string;
      enabled_timezones?: string[];
      date_format?: string;
      time_format?: "12h" | "24h";
      rtl_auto?: boolean;
      allow_user_language?: boolean;
      fallback_language?: string;
    },
  );

  const enabledLangs = d.enabled_languages?.length ? d.enabled_languages : COMMON_LANGUAGES;
  const enabledCurrencies = d.enabled_currencies?.length ? d.enabled_currencies : COMMON_CURRENCIES;
  const enabledTzs = d.enabled_timezones?.length ? d.enabled_timezones : COMMON_TIMEZONES;

  const langOptions = useMemo(
    () =>
      WORLD_LANGUAGES.map((l) => ({
        value: l.code,
        label: `${l.label} — ${l.native}`,
        hint: l.rtl ? `${l.code} · RTL` : l.code,
      })),
    [],
  );
  const currencyOptions = useMemo(
    () =>
      WORLD_CURRENCIES.map((c) => ({
        value: c.code,
        label: `${c.code} — ${c.label}`,
        hint: c.symbol,
      })),
    [],
  );
  const tzOptions = useMemo(
    () =>
      WORLD_TIMEZONES.map((z) => ({
        value: z,
        label: z.replace(/_/g, " "),
        hint: timezoneOffsetLabel(z),
      })),
    [],
  );

  const defaultLang = d.default_language ?? "en";
  const defaultCurrency = d.default_currency ?? "USD";
  const defaultTz = d.default_timezone ?? "UTC";

  // The default must always be part of the enabled set.
  const langChoices = Array.from(new Set([...enabledLangs, defaultLang]));
  const currencyChoices = Array.from(new Set([...enabledCurrencies, defaultCurrency]));
  const tzChoices = Array.from(new Set([...enabledTzs, defaultTz]));

  const sample = useMemo(() => {
    try {
      return {
        money: new Intl.NumberFormat(defaultLang, {
          style: "currency",
          currency: defaultCurrency,
        }).format(1234.56),
        time: new Intl.DateTimeFormat(defaultLang, {
          timeZone: defaultTz,
          dateStyle: "medium",
          timeStyle: "short",
          hour12: (d.time_format ?? "24h") === "12h",
        }).format(new Date()),
      };
    } catch {
      return { money: `${defaultCurrency} 1,234.56`, time: new Date().toISOString() };
    }
  }, [defaultLang, defaultCurrency, defaultTz, d.time_format]);

  return (
    <SectionCard
      title="Localization"
      description="Languages, currencies, and timezones offered platform-wide. Every ISO 4217 currency and IANA timezone is available."
      footer={
        <SaveButton
          onSave={() =>
            save.mutate({
              key: "localization",
              value: {
                ...d,
                enabled_languages: langChoices,
                enabled_currencies: currencyChoices,
                enabled_timezones: tzChoices,
              },
            })
          }
          saving={save.isPending}
        />
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Default language">
          <Select value={defaultLang} onValueChange={(v) => patch({ default_language: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {langChoices.map((l) => (
                <SelectItem key={l} value={l}>
                  {languageLabel(l)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Default currency">
          <Select value={defaultCurrency} onValueChange={(v) => patch({ default_currency: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {currencyChoices.map((c) => (
                <SelectItem key={c} value={c}>
                  {currencyLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Default timezone">
          <Select value={defaultTz} onValueChange={(v) => patch({ default_timezone: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {tzChoices.map((z) => (
                <SelectItem key={z} value={z}>
                  {timezoneLabel(z)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <LocaleMultiSelect
          label="Enabled languages"
          description={`${WORLD_LANGUAGES.length} languages available`}
          options={langOptions}
          selected={enabledLangs}
          onChange={(next) => patch({ enabled_languages: next })}
        />
        <LocaleMultiSelect
          label="Enabled currencies"
          description={`${WORLD_CURRENCIES.length} ISO 4217 currencies`}
          options={currencyOptions}
          selected={enabledCurrencies}
          onChange={(next) => patch({ enabled_currencies: next })}
        />
        <LocaleMultiSelect
          label="Enabled timezones"
          description={`${WORLD_TIMEZONES.length} IANA timezones`}
          options={tzOptions}
          selected={enabledTzs}
          onChange={(next) => patch({ enabled_timezones: next })}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Date format">
          <Select
            value={d.date_format ?? "YYYY-MM-DD"}
            onValueChange={(v) => patch({ date_format: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_FORMAT_OPTIONS.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Time format">
          <Select
            value={d.time_format ?? "24h"}
            onValueChange={(v) => patch({ time_format: v as "12h" | "24h" })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="12h">12-hour</SelectItem>
              <SelectItem value="24h">24-hour</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Translation fallback language">
          <Select
            value={d.fallback_language ?? "en"}
            onValueChange={(v) => patch({ fallback_language: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {langChoices.map((l) => (
                <SelectItem key={l} value={l}>
                  {languageLabel(l)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-control border p-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Automatic right-to-left</div>
            <p className="text-xs text-muted-foreground">
              Flip layout direction for Arabic, Hebrew, Farsi, Urdu and other RTL languages.
            </p>
          </div>
          <Switch checked={d.rtl_auto ?? true} onCheckedChange={(v) => patch({ rtl_auto: v })} />
        </div>
        <div className="flex items-center justify-between rounded-control border p-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Let members pick their language</div>
            <p className="text-xs text-muted-foreground">
              Users may choose any enabled language; otherwise everyone uses the default.
            </p>
          </div>
          <Switch
            checked={d.allow_user_language ?? true}
            onCheckedChange={(v) => patch({ allow_user_language: v })}
          />
        </div>
      </div>

      <div className="rounded-control border bg-muted/30 p-3 text-xs text-muted-foreground">
        Preview · {sample.money} · {sample.time}
        {isRtlLanguage(defaultLang) && " · layout renders right-to-left"}
      </div>
    </SectionCard>
  );
}

/* ---------- SMTP ---------- */

function SmtpPanel() {
  const { save, read } = useSettings();
  const [d, patch] = useLocalDraft(
    read("smtp") as {
      provider?: string;
      host?: string;
      port?: number;
      username?: string;
      from_name?: string;
      from_email?: string;
      reply_to?: string;
      use_tls?: boolean;
      use_managed_email?: boolean;
    },
  );
  return (
    <SectionCard
      title="SMTP / Email delivery"
      description="Uses the platform's built-in email delivery by default. Override with custom SMTP if needed."
      footer={
        <SaveButton onSave={() => save.mutate({ key: "smtp", value: d })} saving={save.isPending} />
      }
    >
      <div className="flex items-center justify-between rounded-control border p-3">
        <div>
          <div className="text-sm font-medium">Use built-in managed email</div>
          <p className="text-xs text-muted-foreground">
            Recommended. Handles suppression, retries, and unsubscribe links.
          </p>
        </div>
        <Switch
          checked={d.use_managed_email ?? true}
          onCheckedChange={(v) => patch({ use_managed_email: v })}
        />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="From name">
          <Input value={d.from_name ?? ""} onChange={(e) => patch({ from_name: e.target.value })} />
        </Field>
        <Field label="From email">
          <Input
            value={d.from_email ?? ""}
            onChange={(e) => patch({ from_email: e.target.value })}
          />
        </Field>
        <Field label="Reply-to">
          <Input value={d.reply_to ?? ""} onChange={(e) => patch({ reply_to: e.target.value })} />
        </Field>
        <Field label="Provider">
          <Input
            value={d.provider ?? "resend"}
            onChange={(e) => patch({ provider: e.target.value })}
            placeholder="resend | smtp"
          />
        </Field>
      </div>
      {!(d.use_managed_email ?? true) && (
        <div className="grid md:grid-cols-3 gap-4">
          <Field label="Host">
            <Input value={d.host ?? ""} onChange={(e) => patch({ host: e.target.value })} />
          </Field>
          <Field label="Port">
            <Input
              type="number"
              value={d.port ?? 587}
              onChange={(e) => patch({ port: Number(e.target.value) })}
            />
          </Field>
          <Field label="Username">
            <Input value={d.username ?? ""} onChange={(e) => patch({ username: e.target.value })} />
          </Field>
          <div className="flex items-center justify-between rounded-control border p-3 md:col-span-3">
            <Label>Use TLS</Label>
            <Switch checked={d.use_tls ?? true} onCheckedChange={(v) => patch({ use_tls: v })} />
          </div>
          <p className="text-xs text-muted-foreground md:col-span-3 flex gap-1 items-center">
            <ShieldAlert className="h-3 w-3" />
            SMTP password is stored as a platform secret, not here.
          </p>
        </div>
      )}
    </SectionCard>
  );
}

/* ---------- Storage ---------- */

function StoragePanel() {
  const { save, read } = useSettings();
  const [d, patch] = useLocalDraft(
    read("storage") as {
      provider?: string;
      bucket?: string;
      region?: string;
      max_upload_mb?: number;
      allowed_mime?: string;
      per_org_quota_gb?: number;
      virus_scan?: boolean;
    },
  );
  return (
    <SectionCard
      title="Storage"
      description="Object storage defaults and per-tenant quotas."
      footer={
        <SaveButton
          onSave={() => save.mutate({ key: "storage", value: d })}
          saving={save.isPending}
        />
      }
    >
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Provider">
          <Input
            value={d.provider ?? "supabase"}
            onChange={(e) => patch({ provider: e.target.value })}
            placeholder="supabase | s3 | r2 | gcs"
          />
        </Field>
        <Field label="Default bucket">
          <Input value={d.bucket ?? ""} onChange={(e) => patch({ bucket: e.target.value })} />
        </Field>
        <Field label="Region">
          <Input value={d.region ?? ""} onChange={(e) => patch({ region: e.target.value })} />
        </Field>
        <Field label="Max upload (MB)">
          <Input
            type="number"
            value={d.max_upload_mb ?? 50}
            onChange={(e) => patch({ max_upload_mb: Number(e.target.value) })}
          />
        </Field>
        <Field label="Per-org quota (GB)">
          <Input
            type="number"
            value={d.per_org_quota_gb ?? 25}
            onChange={(e) => patch({ per_org_quota_gb: Number(e.target.value) })}
          />
        </Field>
      </div>
      <Field label="Allowed MIME types (comma-separated)" hint="Leave empty to allow all.">
        <Input
          value={d.allowed_mime ?? ""}
          onChange={(e) => patch({ allowed_mime: e.target.value })}
          placeholder="image/*, application/pdf"
        />
      </Field>
      <div className="flex items-center justify-between rounded-control border p-3">
        <Label>Virus scan uploaded files</Label>
        <Switch checked={d.virus_scan ?? false} onCheckedChange={(v) => patch({ virus_scan: v })} />
      </div>
    </SectionCard>
  );
}

/* ---------- Security ---------- */

function SecurityPanel() {
  const { save, read } = useSettings();
  const [d, patch] = useLocalDraft(
    read("security") as {
      password_min_length?: number;
      password_require_symbols?: boolean;
      password_require_numbers?: boolean;
      password_hibp?: boolean;
      session_timeout_minutes?: number;
      max_failed_attempts?: number;
      lockout_minutes?: number;
      ip_allowlist?: string;
      force_https?: boolean;
    },
  );
  return (
    <>
      <SectionCard
        title="Security"
        description="Password, session, and lockout defaults."
        footer={
          <SaveButton
            onSave={() => save.mutate({ key: "security", value: d })}
            saving={save.isPending}
          />
        }
      >
        <div className="grid md:grid-cols-3 gap-4">
          <Field label="Password min length">
            <Input
              type="number"
              value={d.password_min_length ?? 12}
              onChange={(e) => patch({ password_min_length: Number(e.target.value) })}
            />
          </Field>
          <Field label="Session timeout (minutes)">
            <Input
              type="number"
              value={d.session_timeout_minutes ?? 60}
              onChange={(e) => patch({ session_timeout_minutes: Number(e.target.value) })}
            />
          </Field>
          <Field label="Max failed attempts">
            <Input
              type="number"
              value={d.max_failed_attempts ?? 5}
              onChange={(e) => patch({ max_failed_attempts: Number(e.target.value) })}
            />
          </Field>
          <Field label="Lockout duration (minutes)">
            <Input
              type="number"
              value={d.lockout_minutes ?? 15}
              onChange={(e) => patch({ lockout_minutes: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <ToggleRow
            label="Require symbols"
            checked={d.password_require_symbols ?? true}
            onChange={(v) => patch({ password_require_symbols: v })}
          />
          <ToggleRow
            label="Require numbers"
            checked={d.password_require_numbers ?? true}
            onChange={(v) => patch({ password_require_numbers: v })}
          />
          <ToggleRow
            label="Check against HIBP"
            checked={d.password_hibp ?? true}
            onChange={(v) => patch({ password_hibp: v })}
          />
          <ToggleRow
            label="Force HTTPS"
            checked={d.force_https ?? true}
            onChange={(v) => patch({ force_https: v })}
          />
        </div>
        <Field label="Global IP allowlist (comma-separated CIDRs)" hint="Empty = allow all.">
          <Input
            value={d.ip_allowlist ?? ""}
            onChange={(e) => patch({ ip_allowlist: e.target.value })}
            placeholder="10.0.0.0/8, 192.168.1.0/24"
          />
        </Field>
      </SectionCard>
      <div className="mt-3">
        <LinkOutPanel
          to="/admin/security"
          label="Security Center"
          description="View live security events, IP allowlists, and 2FA enforcement per tenant."
        />
      </div>
    </>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-control border p-3">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/* ---------- Analytics ---------- */

type AnalyticsValues = {
  provider?: AnalyticsProvider;
  key?: string;
  host?: string;
  track_page_views?: boolean;
  require_consent?: boolean;
  debug?: boolean;
};

function AnalyticsPanel() {
  const { q, save, read } = useSettings();
  const saved = read("analytics") as AnalyticsValues;
  const [d, patch] = useLocalDraft(saved);
  const [touched, setTouched] = useState(false);
  const provider = d.provider ?? "none";
  const errors = platformFieldErrors("analytics", d);

  const submit = () => {
    setTouched(true);
    const errCount = Object.keys(errors).length;
    if (errCount) {
      toast.error(`Fix ${errCount} field${errCount > 1 ? "s" : ""} before saving`);
      return;
    }
    save.mutate({ key: "analytics", value: d });
    setTouched(false);
  };

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading</p>;

  return (
    <SectionCard
      title="Analytics"
      description="Track landing CTAs, pricing clicks and lead form submissions with the provider of your choice. Only public identifiers are stored — they are visible in the browser."
      footer={<SaveButton onSave={submit} saving={save.isPending} />}
    >
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Provider">
          <Select
            value={provider}
            onValueChange={(v) => patch({ provider: v as AnalyticsProvider })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANALYTICS_PROVIDERS.map((p) => (
                <SelectItem key={p} value={p}>
                  {ANALYTICS_PROVIDER_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid gap-1.5">
          <Field label="Identifier" hint={ANALYTICS_KEY_HINTS[provider]}>
            <Input
              value={d.key ?? ""}
              onChange={(e) => patch({ key: e.target.value })}
              placeholder={
                provider === "ga4"
                  ? "G-XXXXXXXXXX"
                  : provider === "gtm"
                    ? "GTM-XXXXXXX"
                    : provider === "posthog"
                      ? "phc_..."
                      : "wacrm.app"
              }
              disabled={provider === "none"}
            />
          </Field>
          <FieldError show={touched} message={errors["key"]} />
        </div>
      </div>

      {(provider === "posthog" || provider === "plausible") && (
        <div className="grid gap-1.5">
          <Field
            label="Ingest host"
            hint="Leave empty for the vendor default (EU cloud for PostHog, plausible.io for Plausible)."
          >
            <Input
              value={d.host ?? ""}
              onChange={(e) => patch({ host: e.target.value })}
              placeholder="https://eu.i.posthog.com"
            />
          </Field>
          <FieldError show={touched} message={errors["host"]} />
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-3">
        <ToggleRow
          label="Track page views"
          checked={d.track_page_views ?? true}
          onChange={(v) => patch({ track_page_views: v })}
        />
        <ToggleRow
          label="Require cookie consent"
          checked={d.require_consent ?? true}
          onChange={(v) => patch({ require_consent: v })}
        />
        <ToggleRow
          label="Debug to console"
          checked={d.debug ?? false}
          onChange={(v) => patch({ debug: v })}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Events emitted: <code>page_view</code>, <code>cta_click</code>, <code>nav_click</code>,{" "}
        <code>pricing_click</code>, <code>whatsapp_click</code>, <code>lead_form_start</code>,{" "}
        <code>lead_form_submit</code>, <code>lead_form_success</code>, <code>lead_form_error</code>.
      </p>
    </SectionCard>
  );
}

/* ---------- Authentication ---------- */

function AuthPanel() {
  const { save, read } = useSettings();
  const [d, patch] = useLocalDraft(
    read("authentication") as {
      allow_signups?: boolean;
      require_email_verification?: boolean;
      require_mfa?: boolean;
      enable_google?: boolean;
      enable_apple?: boolean;
      enable_saml_sso?: boolean;
      enable_magic_link?: boolean;
      invite_only?: boolean;
      default_role?: string;
    },
  );
  return (
    <SectionCard
      title="Authentication"
      description="Sign-in methods, MFA policy, and defaults for new users."
      footer={
        <SaveButton
          onSave={() => save.mutate({ key: "authentication", value: d })}
          saving={save.isPending}
        />
      }
    >
      <div className="grid md:grid-cols-2 gap-3">
        <ToggleRow
          label="Allow public signups"
          checked={d.allow_signups ?? true}
          onChange={(v) => patch({ allow_signups: v })}
        />
        <ToggleRow
          label="Invite-only workspaces"
          checked={d.invite_only ?? false}
          onChange={(v) => patch({ invite_only: v })}
        />
        <ToggleRow
          label="Require email verification"
          checked={d.require_email_verification ?? true}
          onChange={(v) => patch({ require_email_verification: v })}
        />
        <ToggleRow
          label="Require MFA for all users"
          checked={d.require_mfa ?? false}
          onChange={(v) => patch({ require_mfa: v })}
        />
        <ToggleRow
          label="Enable Google OAuth"
          checked={d.enable_google ?? true}
          onChange={(v) => patch({ enable_google: v })}
        />
        <ToggleRow
          label="Enable Apple OAuth"
          checked={d.enable_apple ?? false}
          onChange={(v) => patch({ enable_apple: v })}
        />
        <ToggleRow
          label="Enable SAML SSO"
          checked={d.enable_saml_sso ?? false}
          onChange={(v) => patch({ enable_saml_sso: v })}
        />
        <ToggleRow
          label="Enable magic links"
          checked={d.enable_magic_link ?? false}
          onChange={(v) => patch({ enable_magic_link: v })}
        />
      </div>
      <Field label="Default role for new users">
        <Input
          value={d.default_role ?? "member"}
          onChange={(e) => patch({ default_role: e.target.value })}
        />
      </Field>
    </SectionCard>
  );
}

/* ---------- Billing ---------- */

function BillingPanel() {
  const { save, read } = useSettings();
  const [d, patch] = useLocalDraft(
    read("billing") as {
      default_currency?: string;
      trial_days?: number;
      grace_period_days?: number;
      auto_charge?: boolean;
      invoice_prefix?: string;
      tax_inclusive?: boolean;
      company_name?: string;
      company_address?: string;
      vat_id?: string;
    },
  );
  return (
    <>
      <SectionCard
        title="Billing"
        description="Default trial, grace, and invoice presentation."
        footer={
          <SaveButton
            onSave={() => save.mutate({ key: "billing", value: d })}
            saving={save.isPending}
          />
        }
      >
        <div className="grid md:grid-cols-3 gap-4">
          <Field label="Default currency">
            <Input
              value={d.default_currency ?? "USD"}
              onChange={(e) => patch({ default_currency: e.target.value })}
            />
          </Field>
          <Field label="Trial length (days)">
            <Input
              type="number"
              value={d.trial_days ?? 14}
              onChange={(e) => patch({ trial_days: Number(e.target.value) })}
            />
          </Field>
          <Field label="Payment grace period (days)">
            <Input
              type="number"
              value={d.grace_period_days ?? 7}
              onChange={(e) => patch({ grace_period_days: Number(e.target.value) })}
            />
          </Field>
          <Field label="Invoice prefix">
            <Input
              value={d.invoice_prefix ?? "INV-"}
              onChange={(e) => patch({ invoice_prefix: e.target.value })}
            />
          </Field>
          <Field label="Company name">
            <Input
              value={d.company_name ?? ""}
              onChange={(e) => patch({ company_name: e.target.value })}
            />
          </Field>
          <Field label="Tax / VAT ID">
            <Input value={d.vat_id ?? ""} onChange={(e) => patch({ vat_id: e.target.value })} />
          </Field>
        </div>
        <Field label="Company address">
          <Textarea
            rows={2}
            value={d.company_address ?? ""}
            onChange={(e) => patch({ company_address: e.target.value })}
          />
        </Field>
        <div className="grid md:grid-cols-2 gap-3">
          <ToggleRow
            label="Auto-charge on renewal"
            checked={d.auto_charge ?? true}
            onChange={(v) => patch({ auto_charge: v })}
          />
          <ToggleRow
            label="Prices are tax-inclusive"
            checked={d.tax_inclusive ?? false}
            onChange={(v) => patch({ tax_inclusive: v })}
          />
        </div>
      </SectionCard>
      <div className="mt-3">
        <LinkOutPanel
          to="/admin/billing"
          label="Billing dashboard"
          description="Invoices, dunning, and revenue analytics."
        />
      </div>
    </>
  );
}

/* ---------- Payments ---------- */

function PaymentsPanel() {
  const brandName = useBrandName();
  const { save, read } = useSettings();
  const [d, patch] = useLocalDraft(
    read("payments") as {
      webhook_base_url?: string;
      auto_capture?: boolean;
      statement_descriptor?: string;
      retry_failed_payments?: boolean;
    },
  );
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Payment gateways</CardTitle>
          <CardDescription>
            Add a gateway, configure its keys and webhook, switch sandbox/live, enable or disable
            it, and pick the platform default. Disabled gateways cannot start new checkouts anywhere
            in the app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GatewaySettingsPanel compact />
        </CardContent>
      </Card>

      <SectionCard
        title="Checkout defaults"
        description="Applied to every gateway unless overridden per gateway."
        footer={
          <SaveButton
            onSave={() => save.mutate({ key: "payments", value: d })}
            saving={save.isPending}
          />
        }
      >
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Webhook base URL" hint="Used when generating gateway webhook endpoints.">
            <Input
              value={d.webhook_base_url ?? ""}
              onChange={(e) => patch({ webhook_base_url: e.target.value })}
              placeholder="https:///api/public/webhooks"
            />
          </Field>
          <Field label="Statement descriptor" hint="Shown on customer card statements.">
            <Input
              value={d.statement_descriptor ?? ""}
              onChange={(e) => patch({ statement_descriptor: e.target.value })}
              placeholder={brandName}
            />
          </Field>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <ToggleRow
            label="Capture payments automatically"
            checked={d.auto_capture ?? true}
            onChange={(v) => patch({ auto_capture: v })}
          />
          <ToggleRow
            label="Retry failed payments"
            checked={d.retry_failed_payments ?? true}
            onChange={(v) => patch({ retry_failed_payments: v })}
          />
        </div>
      </SectionCard>

      <LinkOutPanel
        to="/admin/gateways"
        label="Payment Gateways dashboard"
        description="Payment history, refunds, retries and provider sync."
      />
    </div>
  );
}

/* ---------- WhatsApp ---------- */

function WhatsAppPanel() {
  const { save, read } = useSettings();
  const [d, patch] = useLocalDraft(
    read("whatsapp") as {
      api_version?: string;
      default_business_id?: string;
      rate_limit_per_second?: number;
      template_review_required?: boolean;
      media_max_mb?: number;
    },
  );
  return (
    <>
      <SectionCard
        title="WhatsApp defaults"
        description="Cloud API version, rate limiting, and template policy."
        footer={
          <SaveButton
            onSave={() => save.mutate({ key: "whatsapp", value: d })}
            saving={save.isPending}
          />
        }
      >
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Graph API version">
            <Input
              value={d.api_version ?? "v20.0"}
              onChange={(e) => patch({ api_version: e.target.value })}
            />
          </Field>
          <Field label="Default WABA ID">
            <Input
              value={d.default_business_id ?? ""}
              onChange={(e) => patch({ default_business_id: e.target.value })}
            />
          </Field>
          <Field label="Global rate limit (msgs/sec)">
            <Input
              type="number"
              value={d.rate_limit_per_second ?? 80}
              onChange={(e) => patch({ rate_limit_per_second: Number(e.target.value) })}
            />
          </Field>
          <Field label="Media max size (MB)">
            <Input
              type="number"
              value={d.media_max_mb ?? 16}
              onChange={(e) => patch({ media_max_mb: Number(e.target.value) })}
            />
          </Field>
        </div>
        <ToggleRow
          label="Require internal review before submitting templates"
          checked={d.template_review_required ?? true}
          onChange={(v) => patch({ template_review_required: v })}
        />
      </SectionCard>
      <div className="mt-3">
        <LinkOutPanel
          to="/admin/whatsapp"
          label="WhatsApp Platform"
          description="Manage WABAs, phone numbers, and webhooks."
        />
      </div>
    </>
  );
}

/* ---------- API ---------- */

function ApiPanel() {
  const { save, read } = useSettings();
  const [d, patch] = useLocalDraft(
    read("api") as {
      public_api_enabled?: boolean;
      default_rate_limit_per_minute?: number;
      cors_origins?: string;
      deprecated_versions?: string;
      require_api_key?: boolean;
    },
  );
  return (
    <SectionCard
      title="Public API"
      description="Rate limits, CORS, and access defaults for the platform REST API."
      footer={
        <SaveButton onSave={() => save.mutate({ key: "api", value: d })} saving={save.isPending} />
      }
    >
      <div className="grid md:grid-cols-2 gap-3">
        <ToggleRow
          label="Public API enabled"
          checked={d.public_api_enabled ?? true}
          onChange={(v) => patch({ public_api_enabled: v })}
        />
        <ToggleRow
          label="Require API key"
          checked={d.require_api_key ?? true}
          onChange={(v) => patch({ require_api_key: v })}
        />
      </div>
      <Field label="Default rate limit (requests / minute)">
        <Input
          type="number"
          value={d.default_rate_limit_per_minute ?? 300}
          onChange={(e) => patch({ default_rate_limit_per_minute: Number(e.target.value) })}
        />
      </Field>
      <Field label="CORS origins (comma-separated)" hint="* allows any origin.">
        <Input
          value={d.cors_origins ?? "*"}
          onChange={(e) => patch({ cors_origins: e.target.value })}
        />
      </Field>
      <Field label="Deprecated versions" hint="Return warning header for these versions.">
        <Input
          value={d.deprecated_versions ?? ""}
          onChange={(e) => patch({ deprecated_versions: e.target.value })}
          placeholder="v1, v1.1"
        />
      </Field>
    </SectionCard>
  );
}

/* ---------- Notifications ---------- */

function NotificationsPanel() {
  const { save, read } = useSettings();
  const [d, patch] = useLocalDraft(
    read("notifications") as {
      channels?: {
        email?: boolean;
        sms?: boolean;
        push?: boolean;
        in_app?: boolean;
        webhook?: boolean;
      };
      digest_frequency?: string;
      system_status_channel?: string;
    },
  );
  const c = d.channels ?? { email: true, in_app: true, push: false, sms: false, webhook: false };
  return (
    <SectionCard
      title="Notifications"
      description="Delivery channels enabled by default for all tenants."
      footer={
        <SaveButton
          onSave={() => save.mutate({ key: "notifications", value: d })}
          saving={save.isPending}
        />
      }
    >
      <div className="grid md:grid-cols-2 gap-3">
        <ToggleRow
          label="Email"
          checked={c.email ?? true}
          onChange={(v) => patch({ channels: { ...c, email: v } })}
        />
        <ToggleRow
          label="In-app"
          checked={c.in_app ?? true}
          onChange={(v) => patch({ channels: { ...c, in_app: v } })}
        />
        <ToggleRow
          label="Push (mobile / web)"
          checked={c.push ?? false}
          onChange={(v) => patch({ channels: { ...c, push: v } })}
        />
        <ToggleRow
          label="SMS"
          checked={c.sms ?? false}
          onChange={(v) => patch({ channels: { ...c, sms: v } })}
        />
        <ToggleRow
          label="Webhook fan-out"
          checked={c.webhook ?? false}
          onChange={(v) => patch({ channels: { ...c, webhook: v } })}
        />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Default digest frequency">
          <Select
            value={d.digest_frequency ?? "daily"}
            onValueChange={(v) => patch({ digest_frequency: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="realtime">Real-time</SelectItem>
              <SelectItem value="hourly">Hourly</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="System status channel URL" hint="Slack / Teams / Discord webhook.">
          <Input
            value={d.system_status_channel ?? ""}
            onChange={(e) => patch({ system_status_channel: e.target.value })}
          />
        </Field>
      </div>
    </SectionCard>
  );
}

/* ---------- Email templates ---------- */

type EmailVariable = { token: string; desc: string };

const COMMON_EMAIL_VARS: EmailVariable[] = [
  { token: "{{user.first_name}}", desc: "Recipient's first name" },
  { token: "{{user.full_name}}", desc: "Recipient's full name" },
  { token: "{{user.email}}", desc: "Recipient's email address" },
  { token: "{{org.name}}", desc: "Workspace / organization name" },
  { token: "{{platform.name}}", desc: "Product name" },
  { token: "{{support.email}}", desc: "Support contact email" },
];

type EmailTemplateDef = {
  k: string;
  label: string;
  subject: string;
  body: string;
  variables: EmailVariable[];
};

const EMAIL_TEMPLATE_DEFS: EmailTemplateDef[] = [
  {
    k: "welcome",
    label: "Welcome",
    subject: "Welcome to {{platform.name}}, {{user.first_name}}!",
    body: 'Hi {{user.first_name}},\n\nWelcome to {{platform.name}}! Your workspace "{{org.name}}" is ready to go.\n\nGet started: {{action.url}}\n\nIf you have any questions, just reply to this email or reach us at {{support.email}}.\n\n— The {{platform.name}} team',
    variables: [
      ...COMMON_EMAIL_VARS,
      { token: "{{action.url}}", desc: "Link to the app / onboarding" },
    ],
  },
  {
    k: "verify_email",
    label: "Verify email",
    subject: "Verify your email for {{platform.name}}",
    body: "Hi {{user.first_name}},\n\nPlease confirm your email address to activate your account.\n\nVerify now: {{verify.link}}\n\nThis link expires in {{verify.expires_in}}. If you didn't create this account, you can ignore this email.",
    variables: [
      ...COMMON_EMAIL_VARS,
      { token: "{{verify.link}}", desc: "One-time email verification link" },
      { token: "{{verify.expires_in}}", desc: "Link expiry window, e.g. 24 hours" },
    ],
  },
  {
    k: "reset_password",
    label: "Reset password",
    subject: "Reset your {{platform.name}} password",
    body: "Hi {{user.first_name}},\n\nWe received a request to reset your password.\n\nReset it here: {{reset.link}}\n\nThis link expires in {{reset.expires_in}}. If you didn't request this, you can safely ignore this email — your password won't change.",
    variables: [
      ...COMMON_EMAIL_VARS,
      { token: "{{reset.link}}", desc: "One-time password reset link" },
      { token: "{{reset.expires_in}}", desc: "Link expiry window, e.g. 1 hour" },
    ],
  },
  {
    k: "invite",
    label: "Team invitation",
    subject: "{{inviter.name}} invited you to join {{org.name}} on {{platform.name}}",
    body: 'Hi,\n\n{{inviter.name}} has invited you to join "{{org.name}}" as {{invite.role}} on {{platform.name}}.\n\nAccept the invitation: {{invite.link}}\n\nThis invite expires on {{invite.expires_at}}.',
    variables: [
      ...COMMON_EMAIL_VARS,
      { token: "{{inviter.name}}", desc: "Name of the person who sent the invite" },
      { token: "{{invite.role}}", desc: "Role being granted" },
      { token: "{{invite.link}}", desc: "Invite acceptance link" },
      { token: "{{invite.expires_at}}", desc: "Invite expiry date" },
    ],
  },
  {
    k: "trial_ending",
    label: "Trial ending",
    subject: "Your {{platform.name}} trial ends in {{trial.days_left}} days",
    body: 'Hi {{user.first_name}},\n\nYour trial for "{{org.name}}" ends on {{trial.end_date}}. Add a payment method to keep your workspace active without interruption.\n\nManage billing: {{billing.url}}',
    variables: [
      ...COMMON_EMAIL_VARS,
      { token: "{{trial.end_date}}", desc: "Trial expiry date" },
      { token: "{{trial.days_left}}", desc: "Days remaining in the trial" },
      { token: "{{billing.url}}", desc: "Link to billing settings" },
    ],
  },
  {
    k: "payment_failed",
    label: "Payment failed",
    subject: "Action needed: payment failed for {{org.name}}",
    body: "Hi {{user.first_name}},\n\nWe couldn't collect payment of {{invoice.amount}} for invoice {{invoice.number}}.\n\nPlease update your payment method to avoid service interruption: {{billing.url}}",
    variables: [
      ...COMMON_EMAIL_VARS,
      { token: "{{invoice.number}}", desc: "Invoice number" },
      { token: "{{invoice.amount}}", desc: "Amount due, formatted" },
      { token: "{{billing.url}}", desc: "Link to billing settings" },
    ],
  },
  {
    k: "invoice",
    label: "Invoice",
    subject: "Invoice {{invoice.number}} from {{platform.name}}",
    body: "Hi {{user.first_name}},\n\nYour invoice {{invoice.number}} for {{invoice.amount}} is ready.\n\nDue date: {{invoice.due_date}}\nView invoice: {{invoice.url}}\n\nThank you for your business.",
    variables: [
      ...COMMON_EMAIL_VARS,
      { token: "{{invoice.number}}", desc: "Invoice number" },
      { token: "{{invoice.amount}}", desc: "Invoice total, formatted" },
      { token: "{{invoice.due_date}}", desc: "Payment due date" },
      { token: "{{invoice.url}}", desc: "Link to view/download the invoice" },
    ],
  },
];

/** Splice `token` into `current` at the field's cursor (or the end, when the ref isn't mounted yet). */
function insertTokenInto(
  el: HTMLInputElement | HTMLTextAreaElement | null,
  current: string,
  token: string,
): string {
  if (!el) return current + token;
  const start = el.selectionStart ?? current.length;
  const end = el.selectionEnd ?? current.length;
  return current.slice(0, start) + token + current.slice(end);
}

function EmailTemplatesPanel() {
  const { save, read } = useSettings();
  const source = read("email_templates") as Record<
    string,
    { subject?: string; body?: string; enabled?: boolean }
  >;
  const [d, patch] = useLocalDraft(source as Values);
  const [active, setActive] = useState(EMAIL_TEMPLATE_DEFS[0].k);
  const def = EMAIL_TEMPLATE_DEFS.find((t) => t.k === active) ?? EMAIL_TEMPLATE_DEFS[0];
  const cur =
    (d[active] as { subject?: string; body?: string; enabled?: boolean } | undefined) ?? {};
  const [activeField, setActiveField] = useState<"subject" | "body">("body");
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const updateCurrent = (p: Partial<typeof cur>) => patch({ [active]: { ...cur, ...p } });

  function insertVariable(token: string) {
    const field = activeField;
    const el = field === "subject" ? subjectRef.current : bodyRef.current;
    const value = field === "subject" ? (cur.subject ?? "") : (cur.body ?? "");
    const next = insertTokenInto(el, value, token);
    updateCurrent(field === "subject" ? { subject: next } : { body: next });
    const caret = (el?.selectionStart ?? value.length) + token.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  }

  function handleDrop(field: "subject" | "body", e: React.DragEvent) {
    e.preventDefault();
    const token = e.dataTransfer.getData("text/plain");
    if (!token) return;
    setActiveField(field);
    const el = field === "subject" ? subjectRef.current : bodyRef.current;
    const value = field === "subject" ? (cur.subject ?? "") : (cur.body ?? "");
    updateCurrent(
      field === "subject"
        ? { subject: insertTokenInto(el, value, token) }
        : { body: insertTokenInto(el, value, token) },
    );
  }

  return (
    <SectionCard
      title="Email templates"
      description="Override the built-in subject and body for each transactional email."
      footer={
        <SaveButton
          onSave={() => save.mutate({ key: "email_templates", value: d })}
          saving={save.isPending}
        />
      }
    >
      <div className="flex flex-wrap gap-2">
        {EMAIL_TEMPLATE_DEFS.map((t) => (
          <button key={t.k} type="button" onClick={() => setActive(t.k)}>
            <Badge
              variant={active === t.k ? "default" : "outline"}
              className="py-1.5 cursor-pointer"
            >
              {t.label}
            </Badge>
          </button>
        ))}
      </div>
      <ToggleRow
        label="Send this email"
        checked={cur.enabled ?? true}
        onChange={(v) => updateCurrent({ enabled: v })}
      />

      <div className="grid gap-4 md:grid-cols-[1fr_260px]">
        <div className="min-w-0 space-y-4">
          <Field label="Subject">
            <Input
              ref={subjectRef}
              value={cur.subject ?? ""}
              onFocus={() => setActiveField("subject")}
              onChange={(e) => updateCurrent({ subject: e.target.value })}
              onDrop={(e) => handleDrop("subject", e)}
              onDragOver={(e) => e.preventDefault()}
              placeholder={def.subject}
            />
          </Field>
          <Field
            label="Body"
            hint="Click or drag a variable from the right to insert it at the cursor."
          >
            <Textarea
              ref={bodyRef}
              rows={10}
              value={cur.body ?? ""}
              onFocus={() => setActiveField("body")}
              onChange={(e) => updateCurrent({ body: e.target.value })}
              onDrop={(e) => handleDrop("body", e)}
              onDragOver={(e) => e.preventDefault()}
              placeholder={def.body}
            />
          </Field>
          {!cur.subject && !cur.body && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => updateCurrent({ subject: def.subject, body: def.body })}
            >
              Use default template
            </Button>
          )}
        </div>

        <div className="min-w-0 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Variables — click or drag into Subject/Body
          </p>
          <div className="flex flex-col gap-1.5">
            {def.variables.map((v) => (
              <button
                key={v.token}
                type="button"
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", v.token)}
                onClick={() => insertVariable(v.token)}
                title={v.desc}
                className="flex cursor-grab flex-col items-start rounded-control border bg-muted/30 px-2 py-1.5 text-left text-xs hover:bg-muted active:cursor-grabbing"
              >
                <code className="font-mono text-[11px] text-accent">{v.token}</code>
                <span className="text-[11px] text-muted-foreground">{v.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

/* ---------- Maintenance ---------- */

function MaintenancePanel() {
  const { save, read } = useSettings();
  const [d, patch] = useLocalDraft(
    read("maintenance") as {
      enabled?: boolean;
      scheduled_at?: string;
      ends_at?: string;
      message?: string;
      allowed_ips?: string;
      read_only?: boolean;
    },
  );
  return (
    <SectionCard
      title="Maintenance mode"
      description="Take the platform offline for maintenance. Superadmin can still sign in."
      footer={
        <SaveButton
          onSave={() => save.mutate({ key: "maintenance", value: d })}
          saving={save.isPending}
        />
      }
    >
      <div className="grid md:grid-cols-2 gap-3">
        <ToggleRow
          label="Maintenance mode enabled"
          checked={d.enabled ?? false}
          onChange={(v) => patch({ enabled: v })}
        />
        <ToggleRow
          label="Read-only mode (allow reads, block writes)"
          checked={d.read_only ?? false}
          onChange={(v) => patch({ read_only: v })}
        />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Starts at">
          <DateTimePicker
            value={fromLocalDateTimeString(d.scheduled_at ?? "")}
            onChange={(v) => patch({ scheduled_at: toLocalDateTimeString(v) })}
          />
        </Field>
        <Field label="Ends at">
          <DateTimePicker
            value={fromLocalDateTimeString(d.ends_at ?? "")}
            onChange={(v) => patch({ ends_at: toLocalDateTimeString(v) })}
          />
        </Field>
      </div>
      <Field label="Message shown to users">
        <Textarea
          rows={3}
          value={d.message ?? ""}
          onChange={(e) => patch({ message: e.target.value })}
          placeholder="We'll be back shortly. Thanks for your patience!"
        />
      </Field>
      <Field
        label="Bypass IPs (comma-separated)"
        hint="These IPs can still access the platform during maintenance."
      >
        <Input
          value={d.allowed_ips ?? ""}
          onChange={(e) => patch({ allowed_ips: e.target.value })}
        />
      </Field>
    </SectionCard>
  );
}

/* ---------- Feature toggles ---------- */

const DEFAULT_FLAGS: Array<{ k: string; label: string; description: string; defaultOn: boolean }> =
  [
    {
      k: "ai_assistant",
      label: "AI Assistant",
      description: "Inbox reply suggestions and summaries.",
      defaultOn: true,
    },
    {
      k: "sales_crm",
      label: "Sales CRM",
      description: "Deals, pipelines, quotes, and invoices.",
      defaultOn: true,
    },
    {
      k: "marketing",
      label: "Marketing campaigns",
      description: "Broadcasts, segments, and drip flows.",
      defaultOn: true,
    },
    {
      k: "automations",
      label: "Workflow automations",
      description: "No-code automation builder.",
      defaultOn: true,
    },
    {
      k: "bi",
      label: "Business Intelligence",
      description: "Reports, dashboards, and forecasts.",
      defaultOn: true,
    },
    {
      k: "kb_rag",
      label: "Knowledge base (RAG)",
      description: "AI-searchable knowledge base.",
      defaultOn: true,
    },
    {
      k: "voice_notes",
      label: "Voice notes",
      description: "Voice messages in conversations.",
      defaultOn: true,
    },
    {
      k: "project_management",
      label: "Project management",
      description: "Projects, tasks, boards, and team workload.",
      defaultOn: true,
    },
    {
      k: "commerce",
      label: "Ecommerce",
      description: "Catalog, payment links, inventory, and shipping.",
      defaultOn: true,
    },
    {
      k: "booking",
      label: "Appointments & booking",
      description: "Booking pages, scheduling, and calendar sync.",
      defaultOn: true,
    },
    {
      k: "helpdesk",
      label: "Helpdesk",
      description: "Support tickets and customer satisfaction surveys.",
      defaultOn: true,
    },
    {
      k: "live_chat",
      label: "Live chat",
      description: "Website chat widget and live chat bots.",
      defaultOn: true,
    },
    {
      k: "chatbots",
      label: "Chatbots",
      description: "WhatsApp and website chatbot builder.",
      defaultOn: true,
    },
    {
      k: "beta_features",
      label: "Beta features",
      description: "Show experimental features to opt-in workspaces.",
      defaultOn: false,
    },
  ];

function FeatureFlagsPanel() {
  const { save, read } = useSettings();
  const source = (read("feature_flags") as Record<string, boolean>) ?? {};
  const [d, patch] = useLocalDraft(source as Values);
  return (
    <SectionCard
      title="Feature toggles"
      description="Enable or disable modules across the platform. Expand a module to manage its sub-features, then save your changes."
      footer={
        <SaveButton
          onSave={() => save.mutate({ key: "feature_flags", value: d })}
          saving={save.isPending}
        />
      }
    >
      <FeatureToggleList flags={DEFAULT_FLAGS} values={d} onChange={patch} />
    </SectionCard>
  );
}
