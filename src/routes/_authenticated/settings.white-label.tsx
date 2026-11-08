import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { getWhiteLabel, upsertWhiteLabel, verifyCustomDomain } from '@/lib/white-label/white-label.functions';
import { AppTopbar } from '@/components/app/app-topbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Palette, Globe, ImageIcon, Type, LayoutDashboard, Sidebar, Moon, Sun,
  LogIn, Loader2, Sparkles, Mail, ShieldCheck, CheckCircle2,
} from 'lucide-react';
import { useActiveOrganization } from '@/hooks/use-organization';
import { useCurrentWorkspace, useWorkspaceRole } from '@/hooks/use-workspace';
import { ImageDropUpload } from '@/components/branding/image-drop-upload';
import type { BrandingScope } from '@/lib/branding/upload';
import { ThemesSettings } from './settings.themes';
import { isValidAccent } from '@/lib/themes/accent-color';


export const Route = createFileRoute('/_authenticated/settings/white-label')({
  staticData: { breadcrumb: 'Customization' },
  head: () => ({ meta: [{ title: 'Customization — Settings' }] }),
  component: WhiteLabelSettings,
});

const empty: any = {
  brand_name: '', logo_url: '', logo_dark_url: '', favicon_url: '',
  primary_color: '', secondary_color: '', accent_color: '', background_color: '', foreground_color: '', border_color: '',
  sidebar_background: '', sidebar_foreground: '', sidebar_accent: '', sidebar_border: '',
  dashboard_background: '', dashboard_accent: '',
  font_family_sans: '', font_family_heading: '', font_family_mono: '', font_size_base: '',
  default_color_mode: 'system', dark_primary_color: '', dark_background_color: '', dark_accent_color: '',
  login_background_url: '', login_headline: '', login_subheadline: '', login_layout: 'centered',
  loader_url: '', loader_style: 'spinner',
  icon_style: 'outline', icon_stroke_width: 2, border_radius: '',
  email_logo_url: '', email_from_name: '', email_primary_color: '', email_header_color: '', custom_email_footer: '',
  custom_domain: '', support_email: '', support_url: '', meta_title: '', meta_description: '',
  social_x: '', social_instagram: '', social_facebook: '', social_tiktok: '',
  social_threads: '', social_youtube: '', social_linkedin: '', social_website: '',
  is_active: false,
};

const resetSections: Record<string, { label: string; fields: string[] }> = {
  brand: { label: 'Identity & logos', fields: ['brand_name', 'logo_url', 'logo_dark_url', 'favicon_url', 'support_email', 'support_url', 'meta_title', 'meta_description', 'social_x', 'social_instagram', 'social_facebook', 'social_tiktok', 'social_threads', 'social_youtube', 'social_linkedin', 'social_website'] },
  colors: { label: 'Other colors', fields: ['secondary_color', 'background_color', 'foreground_color', 'border_color'] },
  typography: { label: 'Typography', fields: ['font_family_sans', 'font_family_heading', 'font_family_mono', 'font_size_base'] },
  layout: { label: 'Layout', fields: ['sidebar_background', 'sidebar_foreground', 'sidebar_accent', 'sidebar_border', 'dashboard_background', 'dashboard_accent', 'icon_style', 'icon_stroke_width', 'border_radius'] },
  modes: { label: 'Default mode', fields: ['default_color_mode', 'dark_primary_color', 'dark_background_color', 'dark_accent_color'] },
  login: { label: 'Login page', fields: ['login_background_url', 'login_headline', 'login_subheadline', 'login_layout', 'loader_url', 'loader_style'] },
  email: { label: 'Email', fields: ['email_logo_url', 'email_from_name', 'email_primary_color', 'email_header_color', 'custom_email_footer'] },
  domain: { label: 'Domain', fields: ['custom_domain'] },
};

function WhiteLabelSettings() {
  const qc = useQueryClient();
  const { active } = useActiveOrganization();
  const currentWorkspace = useCurrentWorkspace();
  const workspaceId = currentWorkspace.active?.id ?? null;
  const workspaceRole = useWorkspaceRole(workspaceId ?? undefined);
  const { data, isLoading } = useQuery({
    queryKey: ['white-label', workspaceId],
    queryFn: () => getWhiteLabel({ data: { workspaceId } } as any),
    enabled: !!workspaceId,
  });
  const [form, setForm] = useState<any>(empty);
  const [activeTab, setActiveTab] = useState('brand-colors');
  useEffect(() => { setForm({ ...empty, ...(data?.config ?? {}) }); }, [data?.config, workspaceId]);
  const brandScope: BrandingScope = workspaceId
    ? { kind: 'workspace', workspaceId }
    : active?.id
      ? { kind: 'org', orgId: active.id }
      : { kind: 'platform' };


  const save = useMutation({
    mutationFn: () => upsertWhiteLabel({ data: { ...sanitize(form), workspaceId } }),
    onSuccess: () => { toast.success('White label saved — changes are live'); qc.invalidateQueries({ queryKey: ['white-label'] }); qc.invalidateQueries({ queryKey: ['active-theme'] }); },
    onError: (e: any) => toast.error(e.message ?? 'Save failed'),
  });

  const reset = useMutation({
    mutationFn: async () => {
      const fields = resetSections[activeTab].fields;
      const defaults = Object.fromEntries(fields.map((field) => [field, empty[field] === '' ? null : empty[field]]));
      return upsertWhiteLabel({ data: { workspaceId, ...defaults } });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['white-label'] });
      await qc.invalidateQueries({ queryKey: ['active-theme'] });
      toast.success(`${resetSections[activeTab].label} restored to defaults`);
    },
    onError: (e: Error) => toast.error(e.message ?? 'Reset failed'),
  });

  const verify = useMutation({
    mutationFn: () => verifyCustomDomain({ data: { workspaceId } } as any),
    onSuccess: () => { toast.success('Domain verified'); qc.invalidateQueries({ queryKey: ['white-label'] }); },
    onError: (e: any) => toast.error(e.message ?? 'Verification failed'),
  });

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  if (isLoading || currentWorkspace.isLoading || (workspaceId && workspaceRole.isPending)) return (
    <>
      <AppTopbar
        title="Customization"
        subtitle="Themes, colors, brand identity, and workspace appearance."
      />
      <main className="container mx-auto max-w-7xl p-6 text-muted-foreground">Loading</main>
    </>
  );

  if (!workspaceId) return (
    <>
      <AppTopbar title="Customization" />
      <main className="container mx-auto max-w-7xl p-6 text-muted-foreground">
        Select a workspace before editing its branding.
      </main>
    </>
  );

  if (workspaceRole.data !== 'owner' && workspaceRole.data !== 'admin') return (
    <>
      <AppTopbar title="Customization" />
      <main className="mx-auto max-w-6xl w-full p-6 text-muted-foreground">
        Only workspace owners and admins can manage customization.
      </main>
    </>
  );

  const savedDomain = (data?.config as any)?.custom_domain ?? '';
  const verified = savedDomain === form.custom_domain && (data?.config as any)?.custom_domain_verified;

  return (
    <>
      <AppTopbar
        title="Customization"
        subtitle="Manage workspace colors, identity, and appearance."
      />
      <main className="mx-auto max-w-6xl w-full p-6 space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-1 gap-3 bg-transparent p-4 md:grid-cols-2">
          <div role="presentation" className="rounded-control border border-border bg-muted/30 p-3 md:col-span-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visual design</p>
            <div className="flex flex-wrap gap-1">
              <TabsTrigger value="brand-colors"><Palette className="size-4 " />Brand colors</TabsTrigger>
              <TabsTrigger value="theme-library"><Moon className="size-4 " />Theme library</TabsTrigger>
              <TabsTrigger value="colors"><Palette className="size-4 " />Other colors</TabsTrigger>
              <TabsTrigger value="typography"><Type className="size-4 " />Typography</TabsTrigger>
              <TabsTrigger value="layout"><LayoutDashboard className="size-4 " />Layout</TabsTrigger>
              <TabsTrigger value="modes"><Moon className="size-4 " />Default mode</TabsTrigger>
            </div>
          </div>
          <div role="presentation" className="rounded-control border border-border bg-muted/30 p-3 md:col-span-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Brand touchpoints</p>
            <div className="flex flex-wrap gap-1">
              <TabsTrigger value="brand"><ImageIcon className="size-4 " />Identity & logos</TabsTrigger>
              <TabsTrigger value="login"><LogIn className="size-4 " />Login page</TabsTrigger>
              <TabsTrigger value="email"><Mail className="size-4 " />Email</TabsTrigger>
              <TabsTrigger value="domain"><Globe className="size-4 " />Domain</TabsTrigger>
            </div>
          </div>
        </TabsList>
        <TabsContent value="brand-colors">
          <BrandColorsPanel workspaceId={workspaceId} config={data?.config} />
        </TabsContent>
        <TabsContent value="theme-library" className="space-y-4">
          <ThemesSettings embedded />
        </TabsContent>

        {/* BRAND */}
        <TabsContent value="brand" className="space-y-4">
          <Card><CardContent className="flex items-center justify-between gap-4 p-4">
            <div><p className="font-medium">Workspace branding</p><p className="text-sm text-muted-foreground">Apply this workspace's saved logo, colors, and layout overrides. Save changes below.</p></div>
            <Switch checked={form.is_active} onCheckedChange={(v) => set('is_active', v)} aria-label="Enable workspace branding" />
          </CardContent></Card>
          <Card>
            <CardHeader><CardTitle>Brand identity</CardTitle><CardDescription>Logo, favicon, and brand name shown across the app.</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Brand name"><Input value={form.brand_name ?? ''} onChange={(e) => set('brand_name', e.target.value)} placeholder="Acme Inc" /></Field>
              <Field label="Support email"><Input value={form.support_email ?? ''} onChange={(e) => set('support_email', e.target.value)} placeholder="help@acme.com" /></Field>
              <ImageDropUpload label="Logo (light)" value={form.logo_url} onChange={(v) => set('logo_url', v)} scope={brandScope} slot="logo-light" />
              <ImageDropUpload label="Logo (dark)" value={form.logo_dark_url} onChange={(v) => set('logo_dark_url', v)} scope={brandScope} slot="logo-dark" dark />
              <ImageDropUpload label="Favicon" value={form.favicon_url} onChange={(v) => set('favicon_url', v)} scope={brandScope} slot="favicon" hint="Square PNG, SVG or ICO" />

              <Field label="Support URL"><Input value={form.support_url ?? ''} onChange={(e) => set('support_url', e.target.value)} placeholder="https://acme.com/help" /></Field>
              <Field label="Meta title" className="md:col-span-2"><Input value={form.meta_title ?? ''} onChange={(e) => set('meta_title', e.target.value)} placeholder="Acme — Customer Platform" /></Field>
              <Field label="Meta description" className="md:col-span-2"><Textarea rows={2} value={form.meta_description ?? ''} onChange={(e) => set('meta_description', e.target.value)} /></Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Social handles</CardTitle>
              <CardDescription>Used for the public footer links and as the default accounts in Social Studio. Enter a handle (without @) or a full profile URL.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="X (Twitter)"><Input value={form.social_x ?? ''} onChange={(e) => set('social_x', e.target.value)} placeholder="acmehq" /></Field>
              <Field label="Instagram"><Input value={form.social_instagram ?? ''} onChange={(e) => set('social_instagram', e.target.value)} placeholder="acmehq" /></Field>
              <Field label="Facebook Page"><Input value={form.social_facebook ?? ''} onChange={(e) => set('social_facebook', e.target.value)} placeholder="AcmeHQ" /></Field>
              <Field label="TikTok"><Input value={form.social_tiktok ?? ''} onChange={(e) => set('social_tiktok', e.target.value)} placeholder="acmehq" /></Field>
              <Field label="Threads"><Input value={form.social_threads ?? ''} onChange={(e) => set('social_threads', e.target.value)} placeholder="acmehq" /></Field>
              <Field label="YouTube"><Input value={form.social_youtube ?? ''} onChange={(e) => set('social_youtube', e.target.value)} placeholder="@acmehq" /></Field>
              <Field label="LinkedIn"><Input value={form.social_linkedin ?? ''} onChange={(e) => set('social_linkedin', e.target.value)} placeholder="company/acme" /></Field>
              <Field label="Website"><Input value={form.social_website ?? ''} onChange={(e) => set('social_website', e.target.value)} placeholder="https://acme.com" /></Field>
            </CardContent>
          </Card>
          {form.logo_url ? (
            <Card><CardHeader><CardTitle className="text-sm">Preview</CardTitle></CardHeader>
              <CardContent className="flex items-center gap-4">
                <img src={form.logo_url} alt="Logo preview" className="h-10" />
                {form.brand_name && <span className="font-semibold">{form.brand_name}</span>}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* COLORS */}
        <TabsContent value="colors" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Other colors</CardTitle><CardDescription>Optional color overrides. Clear them to use the selected theme.</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ColorField label="Secondary" value={form.secondary_color ?? ''} onChange={(v) => set('secondary_color', v)} />
              <ColorField label="Background" value={form.background_color ?? ''} onChange={(v) => set('background_color', v)} />
              <ColorField label="Text" value={form.foreground_color ?? ''} onChange={(v) => set('foreground_color', v)} />
              <ColorField label="App border" value={form.border_color ?? ''} onChange={(v) => set('border_color', v)} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* TYPOGRAPHY */}
        <TabsContent value="typography" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Typography</CardTitle><CardDescription>Font families and base size. Load the fonts via a link tag or system stack.</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Sans font family"><Input value={form.font_family_sans ?? ''} onChange={(e) => set('font_family_sans', e.target.value)} placeholder="Inter, system-ui, sans-serif" /></Field>
              <Field label="Heading font family"><Input value={form.font_family_heading ?? ''} onChange={(e) => set('font_family_heading', e.target.value)} placeholder="Cal Sans, Inter, sans-serif" /></Field>
              <Field label="Mono font family"><Input value={form.font_family_mono ?? ''} onChange={(e) => set('font_family_mono', e.target.value)} placeholder="JetBrains Mono, monospace" /></Field>
              <Field label="Base font size"><Input value={form.font_size_base ?? ''} onChange={(e) => set('font_size_base', e.target.value)} placeholder="16px" /></Field>
            </CardContent>
          </Card>
        </TabsContent>

        {/* LAYOUT (sidebar/dashboard/icons/radius) */}
        <TabsContent value="layout" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Sidebar className="size-4" />Sidebar theme</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ColorField label="Sidebar background" value={form.sidebar_background ?? ''} onChange={(v) => set('sidebar_background', v)} />
              <ColorField label="Sidebar foreground" value={form.sidebar_foreground ?? ''} onChange={(v) => set('sidebar_foreground', v)} />
              <ColorField label="Sidebar accent" value={form.sidebar_accent ?? ''} onChange={(v) => set('sidebar_accent', v)} />
              <ColorField label="Sidebar border" value={form.sidebar_border ?? ''} onChange={(v) => set('sidebar_border', v)} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><LayoutDashboard className="size-4" />Dashboard theme</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ColorField label="Dashboard background" value={form.dashboard_background ?? ''} onChange={(v) => set('dashboard_background', v)} />
              <ColorField label="Dashboard accent" value={form.dashboard_accent ?? ''} onChange={(v) => set('dashboard_accent', v)} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="size-4" />Icons & radius</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Icon style">
                <Select value={form.icon_style ?? 'outline'} onValueChange={(v) => set('icon_style', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outline">Outline</SelectItem>
                    <SelectItem value="solid">Solid</SelectItem>
                    <SelectItem value="duotone">Duotone</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Icon stroke width"><Input type="number" step="0.25" min="0.5" max="4" value={form.icon_stroke_width ?? 2} onChange={(e) => set('icon_stroke_width', Number(e.target.value))} /></Field>
              <Field label="Border radius"><Input value={form.border_radius ?? ''} onChange={(e) => set('border_radius', e.target.value)} placeholder="0.75rem" /></Field>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DARK / LIGHT */}
        <TabsContent value="modes" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Sun className="size-4" />/<Moon className="size-4" />Dark & Light</CardTitle><CardDescription>Default mode and dark-mode color overrides.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Default color mode">
                <Select value={form.default_color_mode ?? 'system'} onValueChange={(v) => set('default_color_mode', v)}>
                  <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">Follow system</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ColorField label="Dark primary" value={form.dark_primary_color ?? ''} onChange={(v) => set('dark_primary_color', v)} />
                <ColorField label="Dark background" value={form.dark_background_color ?? ''} onChange={(v) => set('dark_background_color', v)} />
                <ColorField label="Dark accent" value={form.dark_accent_color ?? ''} onChange={(v) => set('dark_accent_color', v)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* LOGIN */}
        <TabsContent value="login" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><LogIn className="size-4" />Login page</CardTitle><CardDescription>Customize the sign-in experience for your tenant.</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Layout">
                <Select value={form.login_layout ?? 'centered'} onValueChange={(v) => set('login_layout', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="centered">Centered card</SelectItem>
                    <SelectItem value="split">Split screen</SelectItem>
                    <SelectItem value="minimal">Minimal</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Background image URL"><Input value={form.login_background_url ?? ''} onChange={(e) => set('login_background_url', e.target.value)} /></Field>
              <Field label="Headline" className="md:col-span-2"><Input value={form.login_headline ?? ''} onChange={(e) => set('login_headline', e.target.value)} placeholder="Welcome back to Acme" /></Field>
              <Field label="Subheadline" className="md:col-span-2"><Textarea rows={2} value={form.login_subheadline ?? ''} onChange={(e) => set('login_subheadline', e.target.value)} /></Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Loader2 className="size-4" />Loader</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Loader style">
                <Select value={form.loader_style ?? 'spinner'} onValueChange={(v) => set('loader_style', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spinner">Spinner</SelectItem>
                    <SelectItem value="dots">Dots</SelectItem>
                    <SelectItem value="bar">Progress bar</SelectItem>
                    <SelectItem value="logo">Animated logo</SelectItem>
                    <SelectItem value="custom">Custom image</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Loader image URL (for custom / logo)"><Input value={form.loader_url ?? ''} onChange={(e) => set('loader_url', e.target.value)} /></Field>
            </CardContent>
          </Card>
        </TabsContent>

        {/* EMAIL */}
        <TabsContent value="email" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Mail className="size-4" />Email branding</CardTitle><CardDescription>Applied to every transactional and marketing email.</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="From name"><Input value={form.email_from_name ?? ''} onChange={(e) => set('email_from_name', e.target.value)} placeholder="Acme Team" /></Field>
              <ImageDropUpload label="Email logo" value={form.email_logo_url} onChange={(v) => set('email_logo_url', v)} scope={brandScope} slot="email-logo" />
              <ColorField label="Email primary color" value={form.email_primary_color ?? ''} onChange={(v) => set('email_primary_color', v)} />
              <ColorField label="Email header color" value={form.email_header_color ?? ''} onChange={(v) => set('email_header_color', v)} />
              <Field label="Email footer (HTML allowed)" className="md:col-span-2">
                <Textarea rows={4} value={form.custom_email_footer ?? ''} onChange={(e) => set('custom_email_footer', e.target.value)} />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DOMAIN */}
        <TabsContent value="domain" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Globe className="size-4" />Custom domain</CardTitle><CardDescription>Serve the tenant on your own domain.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Custom domain"><Input value={form.custom_domain ?? ''} onChange={(e) => set('custom_domain', e.target.value)} placeholder="app.acme.com" /></Field>
              {form.custom_domain ? (
                <div className="rounded-control border border-border p-4 text-sm space-y-2 bg-muted/40">
                  <p className="font-medium flex items-center gap-2">DNS setup {verified ? <Badge className="gap-1"><CheckCircle2 className="size-3" />Verified</Badge> : <Badge variant="secondary">Pending</Badge>}</p>
                  <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                    <li>Point <code className="font-mono">{form.custom_domain}</code> to your app host and configure that hostname with your hosting provider.</li>
                    <li>Add a TXT record for <code className="font-mono">_wacrm.{form.custom_domain}</code> with value <code className="font-mono">wacrm-verify={workspaceId}</code>.</li>
                  </ul>
                  {savedDomain !== form.custom_domain && <p className="text-muted-foreground">Save changes before verifying this domain.</p>}
                  <Button size="sm" variant="outline" onClick={() => verify.mutate()} disabled={verify.isPending || savedDomain !== form.custom_domain || !workspaceId}>
                    <ShieldCheck className="size-4 mr-2" />{verify.isPending ? 'Verifying' : 'Verify domain'}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {activeTab !== 'brand-colors' && activeTab !== 'theme-library' && <div className="flex flex-wrap justify-end gap-2 border-t pt-6">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={save.isPending || reset.isPending}>Reset section to defaults</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset {resetSections[activeTab].label}?</AlertDialogTitle>
              <AlertDialogDescription>This immediately clears saved settings in this section and restores its defaults. Settings in other sections are preserved.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => reset.mutate()}>Reset to defaults</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button onClick={() => save.mutate()} disabled={save.isPending || reset.isPending || !workspaceId}>
          {save.isPending ? 'Saving' : 'Save changes'}
        </Button>
      </div>}
    </main>
    </>
  );
}

function BrandColorsPanel({ workspaceId, config }: { workspaceId: string; config: any }) {
  const qc = useQueryClient();
  const savedPrimary = config?.primary_color ?? '';
  const savedAccent = config?.accent_color ?? '';
  const [primary, setPrimary] = useState(savedPrimary);
  const [accent, setAccent] = useState(savedAccent);
  useEffect(() => {
    setPrimary(savedPrimary);
    setAccent(savedAccent);
  }, [savedPrimary, savedAccent, workspaceId]);

  const update = useMutation({
    mutationFn: ({ primaryColor, accentColor, activate = true }: { primaryColor: string; accentColor: string; activate?: boolean }) =>
      upsertWhiteLabel({ data: {
        workspaceId,
        primary_color: primaryColor || null,
        accent_color: accentColor || null,
        is_active: activate ? true : Boolean(config?.is_active),
      } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['white-label'] });
      toast.success('Brand colors saved for this workspace');
    },
    onError: (error: Error) => toast.error(error.message ?? 'Could not save brand colors'),
  });
  const valid = (!primary || isValidAccent(primary)) && (!accent || isValidAccent(accent));
  const changed = primary !== savedPrimary || accent !== savedAccent;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Brand colors</CardTitle>
        <CardDescription>These two colors override the selected theme across this workspace. Saving them also enables workspace branding.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          <ColorField label="Brand color" value={primary} onChange={setPrimary} />
          <ColorField label="Accent color" value={accent} onChange={setAccent} />
        </div>
        {!valid && <p className="text-sm text-destructive">Enter a hex color such as #015941, or leave a field blank to inherit the theme.</p>}
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button onClick={() => update.mutate({ primaryColor: primary, accentColor: accent })} disabled={!changed || !valid || update.isPending}>
            {update.isPending ? 'Saving' : 'Save brand colors'}
          </Button>
          <Button variant="outline" onClick={() => update.mutate({ primaryColor: '', accentColor: '', activate: false })} disabled={update.isPending || (!savedPrimary && !savedAccent)}>
            Use theme colors
          </Button>
          {changed && <Button variant="ghost" onClick={() => { setPrimary(savedPrimary); setAccent(savedAccent); }} disabled={update.isPending}>Discard edits</Button>}
        </div>
        <p className="text-xs text-muted-foreground">“Use theme colors” clears only these two workspace overrides. It does not change the selected theme or your light/dark preference.</p>
      </CardContent>
    </Card>
  );
}

/** Send null for cleared fields so existing saved values are actually removed. */
function sanitize(form: any) {
  const out: any = {};
  for (const [k, v] of Object.entries(form)) {
    if (v === undefined) continue;
    out[k] = v === '' ? null : v;
  }
  return out;
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`space-y-1.5 block ${className}`}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const isHex = /^#[0-9a-f]{3,8}$/i.test(value);
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" value={isHex ? value : '#000000'} onChange={(e) => onChange(e.target.value)} className="h-10 w-14 rounded-control border border-input bg-background cursor-pointer" aria-label={`${label} color picker`} />
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="#111827 or 220 90% 56%" className="flex-1 font-mono text-sm" />
      </div>
    </Field>
  );
}
