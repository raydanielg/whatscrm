import { useBrandName } from "@/hooks/use-brand-name";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listPublicThemes,
  activateTheme,
  getActiveTheme,
  resetWorkspaceTheme,
} from "@/lib/themes/themes.functions";
import { useTheme, type Theme } from "@/shared/providers/theme-provider";
import { DEFAULT_ACCENT } from "@/lib/themes/accent-color";
import { readActiveWorkspaceId, subscribeActiveTenant } from "@/lib/tenant/active-tenant";
import { getWhiteLabel, upsertWhiteLabel } from "@/lib/white-label/white-label.functions";
import { usePlatformBranding } from "@/hooks/use-platform-branding";
import {
  ACCENT_PRESETS,
  ACCESSIBLE_ACCENT_PRESETS,
  isValidAccent,
  useTenantAccent,
  accentTint,
  accentStrong,
  accentForeground,
  evaluateAccentContrast,
  suggestAccentPairings,
} from "@/lib/themes/tenant-accent";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  CheckCircle2,
  Loader2,
  RotateCcw,
  ShoppingBag,
  Share2,
  IdCard,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/themes")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/white-label" });
  },
  staticData: { breadcrumb: "Themes" },
  head: () => ({
    meta: [
      { title: "Themes & Accent — Settings" },
      {
        name: "description",
        content:
          "Pick a workspace theme and brand accent colour applied across commerce, Social Studio and Digital Cards.",
      },
      { property: "og:title", content: "Themes & Accent — Settings" },
      {
        property: "og:description",
        content: "Pick a workspace theme and brand accent colour applied across the whole app.",
      },
    ],
  }),
  component: ThemesSettings,
});

function BrandColorSection() {
  const qc = useQueryClient();
  const workspaceId = useSyncExternalStore(
    subscribeActiveTenant,
    readActiveWorkspaceId,
    () => null,
  );
  const platformBranding = usePlatformBranding();
  const { data, isPending } = useQuery({
    queryKey: ["white-label", workspaceId],
    queryFn: () => getWhiteLabel({ data: { workspaceId } }),
    enabled: Boolean(workspaceId),
  });
  const config = data?.workspaceId === workspaceId ? data.config : null;
  const savedBrand = isValidAccent(config?.primary_color) ? config.primary_color : null;
  const inheritedBrand = isValidAccent(platformBranding.primaryColor)
    ? platformBranding.primaryColor
    : "#015941";
  const [draft, setDraft] = useState(savedBrand ?? inheritedBrand);

  useEffect(() => {
    setDraft(savedBrand ?? inheritedBrand);
  }, [savedBrand, inheritedBrand, workspaceId]);

  const save = useMutation({
    mutationFn: (primaryColor: string | null) =>
      upsertWhiteLabel({
        data: { workspaceId, primary_color: primaryColor, is_active: true },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["white-label"] });
      toast.success("Brand color saved for this workspace");
    },
    onError: (error: Error) => toast.error(error.message ?? "Could not save the brand color"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Brand color</CardTitle>
        <CardDescription>
          Sets the primary color for buttons, navigation, and theme gradients in this workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={!workspaceId || isPending || save.isPending}
            aria-label="Brand color hex"
            placeholder="#015941"
            className="w-36 font-mono"
          />
          <input
            type="color"
            value={isValidAccent(draft) ? draft : inheritedBrand}
            onChange={(event) => setDraft(event.target.value)}
            disabled={!workspaceId || isPending || save.isPending}
            aria-label="Pick brand color"
            className="size-9 rounded border bg-transparent p-0.5"
          />
          <span
            className="rounded-control px-3 py-2 text-sm font-medium text-white"
            style={{ background: isValidAccent(draft) ? accentStrong(draft) : inheritedBrand }}
          >
            Preview
          </span>
        </div>
        {!isValidAccent(draft) && (
          <p className="text-xs text-destructive">Enter a valid hex color, such as #015941.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => save.mutate(draft)}
            disabled={
              !workspaceId ||
              isPending ||
              save.isPending ||
              !isValidAccent(draft) ||
              draft.toLowerCase() === savedBrand?.toLowerCase()
            }
          >
            {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Save brand color
          </Button>
          {savedBrand && (
            <Button variant="outline" onClick={() => save.mutate(null)} disabled={save.isPending}>
              Use platform default
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AccentSection() {
  const qc = useQueryClient();
  const workspaceId = useSyncExternalStore(
    subscribeActiveTenant,
    readActiveWorkspaceId,
    () => null,
  );
  const { accent, savedAccent, isPreviewing, setPreviewAccent } = useTenantAccent();
  const [draft, setDraft] = useState(savedAccent);

  // Keep the draft aligned with the persisted value once it loads or changes.
  useEffect(() => {
    setDraft(savedAccent);
  }, [savedAccent]);

  const contrast = useMemo(() => evaluateAccentContrast(draft), [draft]);
  const previewFill = useMemo(() => accentStrong(accent), [accent]);
  const previewForeground = useMemo(() => accentForeground(previewFill), [previewFill]);
  // Only compute alternatives when the chosen accent actually fails or is tight.
  const suggestions = useMemo(
    () =>
      contrast.valid && (!contrast.safe || contrast.issues.length > 0)
        ? suggestAccentPairings(draft)
        : [],
    [draft, contrast],
  );

  const pick = (hex: string) => {
    setDraft(hex);
    setPreviewAccent(hex);
  };

  const save = useMutation({
    mutationFn: () => {
      return upsertWhiteLabel({ data: { workspaceId, accent_color: draft, is_active: true } });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["white-label"] });
      setPreviewAccent(null);
      toast.success("Accent saved — applied across the workspace");
    },
    onError: (e: any) => {
      const failures: string[] | undefined = e?.failures;
      const best = suggestions[0];
      toast.error(e?.message ?? "Could not save the accent", {
        description: failures?.length
          ? `${failures.join(" · ")}${best ? ` — try ${best.value} (${best.label.toLowerCase()}).` : " — try an accessible preset."}`
          : undefined,
        duration: failures?.length ? 10000 : undefined,
        action: best ? { label: `Use ${best.value}`, onClick: () => pick(best.value) } : undefined,
      });
    },
  });

  const reset = () => {
    setPreviewAccent(null);
    setDraft(savedAccent);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Brand accent</CardTitle>
          <CardDescription>
            One accent colour for this workspace, applied live to buttons, highlights, commerce,
            Social Studio and Digital Cards.
          </CardDescription>
        </div>
        {isPreviewing && <Badge variant="secondary">Unsaved preview</Badge>}
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {ACCENT_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-label={`Accent ${p.label}`}
              aria-pressed={draft.toLowerCase() === p.value.toLowerCase()}
              onClick={() => pick(p.value)}
              disabled={save.isPending}
              className={`size-8 rounded-full border-2 transition ${draft.toLowerCase() === p.value.toLowerCase() ? "border-foreground" : "border-transparent"}`}
              style={{ background: p.value }}
            />
          ))}
          <div className="flex items-center gap-2 ml-1">
            <Input
              value={draft}
              onChange={(e) => {
                const v = e.target.value;
                setDraft(v);
                if (isValidAccent(v)) setPreviewAccent(v);
              }}
              disabled={save.isPending}
              className="w-32 font-mono"
              aria-label="Custom accent hex"
              placeholder={DEFAULT_ACCENT}
            />
            <input
              type="color"
              value={isValidAccent(draft) ? draft : accent}
              onChange={(e) => pick(e.target.value)}
              disabled={save.isPending}
              aria-label="Pick accent colour"
              className="size-9 rounded border bg-transparent p-0.5"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground">Accessible presets</p>
            <Badge variant="outline" className="text-[11px]">
              WCAG AA verified
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            These accents always pass the contrast checks on light and dark surfaces, so they can be
            saved without warnings.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {ACCESSIBLE_ACCENT_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                title={`${p.label} · ${p.value}`}
                aria-label={`Accessible accent ${p.label}`}
                aria-pressed={draft.toLowerCase() === p.value.toLowerCase()}
                onClick={() => pick(p.value)}
                disabled={save.isPending}
                className={`size-8 rounded-full border-2 transition ${draft.toLowerCase() === p.value.toLowerCase() ? "border-foreground" : "border-transparent"}`}
                style={{ background: p.value }}
              />
            ))}
          </div>
        </div>

        {!isValidAccent(draft) && (
          <p className="text-xs text-destructive">
            Enter a valid hex colour, e.g. {DEFAULT_ACCENT}.
          </p>
        )}

        {/* Accessibility / contrast check for the candidate accent */}
        {contrast.valid && (
          <div
            className={`rounded-control border p-3 space-y-2 ${
              !contrast.safe
                ? "border-destructive/50 bg-destructive/5"
                : contrast.issues.length > 0
                  ? "border-amber-500/50 bg-amber-500/5"
                  : "border-emerald-500/40 bg-emerald-500/5"
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              {!contrast.safe ? (
                <>
                  <ShieldAlert className="size-4 text-destructive" aria-hidden />
                  Accessible variants will be applied
                </>
              ) : contrast.issues.length > 0 ? (
                <>
                  <AlertTriangle className="size-4 text-amber-600" aria-hidden />
                  Usable, but contrast is tight
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
                  Contrast passes WCAG AA
                </>
              )}
            </div>
            <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
              {[
                { label: "Text on accent", value: contrast.onAccent, min: 4.5 },
                { label: "Accent on light", value: contrast.onLight, min: 3 },
                { label: "Accent on dark", value: contrast.onDark, min: 3 },
              ].map((m) => (
                <div key={m.label} className="flex items-center justify-between gap-2">
                  <dt>{m.label}</dt>
                  <dd
                    className={`font-mono ${m.value < m.min ? "text-destructive" : "text-foreground"}`}
                  >
                    {m.value.toFixed(2)}:1
                  </dd>
                </div>
              ))}
            </dl>
            {contrast.issues.length > 0 && (
              <ul className="space-y-1 text-xs" role="alert">
                {contrast.issues.map((i: (typeof contrast.issues)[number]) => (
                  <li
                    key={i.id}
                    className={
                      i.severity === "fail"
                        ? "text-destructive"
                        : "text-amber-700 dark:text-amber-400"
                    }
                  >
                    {i.severity === "fail" ? "Fails" : "Borderline"}: {i.label} —{" "}
                    {i.ratio.toFixed(2)}:1, {i.severity === "fail" ? "needs" : "comfortable at"}{" "}
                    {i.required.toFixed(1)}:1.
                  </li>
                ))}
              </ul>
            )}
            {!contrast.safe && (
              <p className="text-xs text-muted-foreground">
                Your brand colour can still be saved. Buttons, badges, text, and icons will
                automatically use the accessible variants below.
              </p>
            )}

            {/* Automatic accessible pairings closest to the chosen colour */}
            {suggestions.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs font-medium">
                  {contrast.safe
                    ? "Stronger alternatives in your hue"
                    : "Accessible alternatives in your hue"}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {suggestions.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => pick(s.value)}
                      disabled={save.isPending}
                      aria-label={`Use accessible accent ${s.value} — ${s.label}`}
                      className="flex items-center gap-3 rounded-control border p-2 text-left transition hover:bg-muted/60 disabled:opacity-60"
                    >
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded text-[11px] font-semibold"
                        style={{ background: s.value, color: s.foreground }}
                        aria-hidden
                      >
                        Aa
                      </span>
                      <span className="min-w-0">
                        <span className="block font-mono text-xs">{s.value}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {s.label}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          Text {s.report.onAccent.toFixed(1)}:1 · light{" "}
                          {s.report.onLight.toFixed(1)}:1 · dark {s.report.onDark.toFixed(1)}:1
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Each pairing keeps your hue and passes WCAG AA on buttons, light and dark
                  surfaces. Selecting one previews it instantly.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Live preview of the surfaces that consume the accent */}
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: ShoppingBag, label: "Commerce", copy: "Store cards & sync status" },
            { icon: Share2, label: "Social Studio", copy: "Composer & channel chips" },
            { icon: IdCard, label: "Digital Cards", copy: "New card default accent" },
          ].map(({ icon: Icon, label, copy }) => (
            <div key={label} className="rounded-control border overflow-hidden">
              <div className="h-10" style={{ background: previewFill }} />
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Icon className="size-4" style={{ color: accent }} />
                  {label}
                </div>
                <p className="text-xs text-muted-foreground">{copy}</p>
                <div className="flex items-center gap-2">
                  <span
                    className="rounded px-2 py-0.5 text-xs font-medium"
                    style={{ background: previewFill, color: previewForeground }}
                  >
                    Primary
                  </span>
                  <span
                    className="rounded px-2 py-0.5 text-xs font-medium"
                    style={{ background: accentTint(accent), color: accent }}
                  >
                    Subtle
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => save.mutate()}
            disabled={
              !workspaceId || save.isPending || !isValidAccent(draft) || draft === savedAccent
            }
          >
            {save.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}Save accent
          </Button>
          <Button
            variant="outline"
            onClick={reset}
            disabled={!workspaceId || save.isPending || !isPreviewing}
          >
            <RotateCcw className="size-4 mr-2" />
            Discard preview
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const MODES: { value: Theme; label: string; hint: string }[] = [
  { value: "light", label: "Light", hint: "Always light surfaces" },
  { value: "dark", label: "Dark", hint: "Always dark surfaces" },
  { value: "system", label: "System", hint: "Follow your device" },
];

function AppearanceSection() {
  const { theme, setTheme, isLoading } = useTheme();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Saved to your account in the backend — no browser cache — so the same mode applies on
          every device you sign in from.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setTheme(m.value)}
            disabled={isLoading}
            aria-pressed={theme === m.value}
            className={`rounded-control border p-3 text-left transition hover:bg-muted/60 disabled:opacity-60 ${theme === m.value ? "border-primary ring-1 ring-primary" : ""}`}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              {m.label}
              {theme === m.value && <CheckCircle2 className="size-4 text-primary" aria-hidden />}
            </span>
            <span className="block text-xs text-muted-foreground">{m.hint}</span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

export function ThemesSettings({ embedded = false }: { embedded?: boolean }) {
  const brandName = useBrandName();
  const qc = useQueryClient();
  const workspaceId = useSyncExternalStore(
    subscribeActiveTenant,
    readActiveWorkspaceId,
    () => null,
  );
  const { data } = useQuery({ queryKey: ["themes"], queryFn: () => listPublicThemes({}) });
  const { data: active } = useQuery({
    queryKey: ["active-theme", workspaceId],
    queryFn: () => getActiveTheme({ data: { workspaceId } }),
    enabled: Boolean(workspaceId),
  });
  const activate = useMutation({
    mutationFn: (themeId: string) => activateTheme({ data: { themeId, workspaceId } }),
    onSuccess: () => {
      toast.success("Theme activated");
      qc.invalidateQueries({ queryKey: ["active-theme"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Activation failed"),
  });

  const resetAll = useMutation({
    mutationFn: () => resetWorkspaceTheme({ data: { workspaceId } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["active-theme"] });
      toast.success("Selected theme removed");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not reset the theme"),
  });

  return (
    <>
      {!embedded && (
        <AppTopbar
          title="Themes"
          subtitle="Pick a look for your workspace. Custom tokens live-apply to the whole UI."
        />
      )}
      <div className={embedded ? "space-y-6" : "mx-auto max-w-6xl w-full p-6 space-y-6"}>
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Selected theme</CardTitle>
              <CardDescription>
                Choose a theme below, or remove the selected theme. Brand and accent colors are
                managed in Brand colors.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={() => resetAll.mutate()}
              disabled={!workspaceId || !active?.installation || resetAll.isPending}
            >
              {resetAll.isPending ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="size-4 mr-2" />
              )}
              Remove theme
            </Button>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(data?.themes ?? []).length === 0 && (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground col-span-full">
                No themes available yet.
              </CardContent>
            </Card>
          )}
          {(data?.themes ?? []).map((t: any) => {
            const isActive = active?.installation?.theme_id === t.id;
            const swatches = Object.values(t.tokens ?? {}).slice(0, 5) as string[];
            return (
              <Card key={t.id} className={isActive ? "border-primary" : ""}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{t.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {t.publisher_name ?? brandName} · {t.install_count} installs
                      </p>
                    </div>
                    {isActive && (
                      <Badge>
                        <CheckCircle2 className="size-3 " />
                        Active
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
                    {t.description ?? "—"}
                  </p>
                  <div className="flex gap-1.5">
                    {swatches.map((c, i) => (
                      <span
                        key={i}
                        className="size-6 rounded-control border"
                        style={{ background: String(c) }}
                        aria-hidden
                      />
                    ))}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => activate.mutate(t.id)}
                    disabled={activate.isPending || isActive}
                    className="w-full"
                  >
                    {isActive ? "Active" : "Activate"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
