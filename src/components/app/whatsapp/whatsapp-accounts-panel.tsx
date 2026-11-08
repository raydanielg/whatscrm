/**
 * WhatsApp Business Account management panel.
 *
 * Multi-account, multi-tenant: lists every `channel_accounts` row in the
 * current workspace, plus quick actions to connect, verify, edit the
 * business profile, disconnect, or remove.
 */

import { useMemo, useState } from "react";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Loader2,
  Phone,
  Plug,
  PlugZap,
  RefreshCw,
  Settings2,
  ShieldAlert,
  Sparkles,
  Star,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  useChannelAccounts,
  useConnectChannelAccount,
  useUpdateChannelAccount,
  useDisconnectChannelAccount,
  useDeleteChannelAccount,
  useTestChannelAccount,
  useFetchBusinessProfile,
  useUpdateBusinessProfile,
  type ChannelAccountRow,
  type ConnectInput,
} from "@/hooks/use-channel-accounts";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { WhatsAppSetupWizard } from "@/components/app/whatsapp/whatsapp-setup-wizard";
import { toast } from "sonner";
import {
  MetaSettingsHelpPanel,
  focusMetaField,
  metaFieldId,
  type MetaHelpTarget,
} from "@/components/app/whatsapp/meta-settings-help";
import {
  useSecretNameValidation,
  SecretValidationAlert,
} from "@/components/app/whatsapp/secret-name-validation";

const STATUS_STYLE: Record<
  ChannelAccountRow["status"],
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  connected: {
    label: "Connected",
    className: "bg-success/10 text-success border-success/30",
    icon: CheckCircle2,
  },
  pending: {
    label: "Pending",
    className: "bg-warning/10 text-warning border-warning/30",
    icon: Loader2,
  },
  disconnected: {
    label: "Disconnected",
    className: "bg-muted text-muted-foreground border-border",
    icon: Plug,
  },
  error: {
    label: "Error",
    className: "bg-destructive/10 text-destructive border-destructive/30",
    icon: CircleAlert,
  },
  suspended: {
    label: "Suspended",
    className: "bg-destructive/10 text-destructive border-destructive/30",
    icon: ShieldAlert,
  },
};

const VERTICALS = [
  "OTHER",
  "AUTO",
  "BEAUTY",
  "APPAREL",
  "EDU",
  "ENTERTAIN",
  "EVENT_PLAN",
  "FINANCE",
  "GROCERY",
  "GOVT",
  "HOTEL",
  "HEALTH",
  "NONPROFIT",
  "PROF_SERVICES",
  "RETAIL",
  "TRAVEL",
  "RESTAURANT",
] as const;

export function WhatsAppAccountsPanel() {
  const { data: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id;
  const { data, isLoading } = useChannelAccounts(workspaceId);
  const [connectOpen, setConnectOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const accounts = useMemo(
    () => (data?.accounts ?? []) as unknown as ChannelAccountRow[],
    [data?.accounts],
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-xl">WhatsApp Business Accounts</h2>
          <p className="text-sm text-muted-foreground">
            Connect Meta WhatsApp Cloud API accounts. Multiple phone numbers and multiple business
            accounts per workspace are supported.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2" disabled={!workspaceId}>
                <Sparkles className="w-4 h-4" /> Setup wizard
              </Button>
            </DialogTrigger>
            <WhatsAppSetupWizard workspaceId={workspaceId} onDone={() => setWizardOpen(false)} />
          </Dialog>
          <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-2" disabled={!workspaceId}>
                <PlugZap className="w-4 h-4" /> Manual connect
              </Button>
            </DialogTrigger>
            <ConnectDialog workspaceId={workspaceId} onDone={() => setConnectOpen(false)} />
          </Dialog>
        </div>
      </header>

      <Alert>
        <ShieldAlert className="w-4 h-4" />
        <AlertTitle>Secure token handling</AlertTitle>
        <AlertDescription className="text-xs">
          Access tokens are never stored in the database. Each account references an environment
          secret by name. Add the secret in <span className="font-mono">Cloud → Secrets</span>{" "}
          before verifying.
        </AlertDescription>
      </Alert>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-control border border-dashed border-border p-10 text-center">
          <Plug className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">No WhatsApp accounts connected</p>
          <p className="text-xs text-muted-foreground mt-1">
            Connect your first Meta Business Account to start receiving and sending messages.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((a) => (
            <AccountCard key={a.id} account={a} workspaceId={workspaceId} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function AccountCard({
  account,
  workspaceId,
}: {
  account: ChannelAccountRow;
  workspaceId: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const formatZoned = useZonedDateFormatter();

  const test = useTestChannelAccount(workspaceId);
  const disconnect = useDisconnectChannelAccount(workspaceId);
  const remove = useDeleteChannelAccount(workspaceId);
  const style = STATUS_STYLE[account.status];
  const StatusIcon = style.icon;

  const meta = account.metadata ?? {};
  const verifiedName = (meta as { verified_name?: string }).verified_name;
  const codeVerification = (meta as { code_verification_status?: string }).code_verification_status;
  const qualityRating = (meta as { quality_rating?: string }).quality_rating;
  const throughput = (meta as { throughput?: { level?: string } }).throughput?.level;
  const tokenExpiresAt = (meta as { token_expires_at?: string | null }).token_expires_at;
  const tokenScopes = (meta as { token_scopes?: string[] | null }).token_scopes;

  const publicOrigin =
    typeof window !== "undefined" ? window.location.origin : "https://wrapcoders.bid";
  const webhookUrl = `${publicOrigin}/api/public/webhooks/whatsapp`;

  return (
    <div className="rounded-control border border-border bg-surface">
      <div className="p-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{account.display_name}</span>
            {account.is_default && <Star className="w-3.5 h-3.5 text-warning fill-warning/40" />}
            <Badge variant="outline" className={`text-xs gap-1 ${style.className}`}>
              <StatusIcon
                className={`w-3 h-3 ${account.status === "pending" ? "animate-spin" : ""}`}
              />
              {style.label}
            </Badge>
            {verifiedName && (
              <Badge variant="outline" className="text-xs gap-1">
                <BadgeCheck className="w-3 h-3" /> {verifiedName}
              </Badge>
            )}
          </div>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Phone className="w-3 h-3" /> {account.phone_number ?? "—"}
            </span>
            <span>
              WABA <span className="font-mono">{truncate(account.waba_id, 14)}</span>
            </span>
            <span>
              Phone ID <span className="font-mono">{truncate(account.phone_number_id, 14)}</span>
            </span>
            <span>
              Token secret{" "}
              <span className="font-mono">{account.access_token_secret_name ?? "—"}</span>
            </span>
          </div>
          {account.status_reason && (
            <p className="mt-2 text-xs text-destructive">{account.status_reason}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => test.mutate(account.id)}
            disabled={test.isPending}
          >
            {test.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Verify
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setProfileOpen(true)}
          >
            <Zap className="w-3.5 h-3.5" /> Profile
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing(true)}>
            <Settings2 className="w-3.5 h-3.5" /> Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} className="gap-1">
            {open ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border p-4 grid gap-3 md:grid-cols-2 text-xs">
          <DetailRow label="Code verification" value={codeVerification ?? "—"} />
          <DetailRow label="Quality rating" value={qualityRating ?? "—"} />
          <DetailRow label="Throughput" value={throughput ?? "—"} />
          <DetailRow
            label="Token expires"
            value={
              tokenExpiresAt
                ? formatZoned(new Date(tokenExpiresAt), { dateStyle: "medium", timeStyle: "short" })
                : "System user (long-lived)"
            }
          />
          <DetailRow label="Token scopes" value={tokenScopes?.join(", ") ?? "—"} />
          <DetailRow
            label="Last verified"
            value={
              account.last_verified_at
                ? formatZoned(new Date(account.last_verified_at), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "Never"
            }
          />
          <div className="md:col-span-2">
            <Label className="text-xs">Webhook URL (paste into Meta App → Webhooks)</Label>
            <Input readOnly value={webhookUrl} className="mt-1 font-mono text-xs h-9" />
            <Label className="text-xs mt-3 block">Verify token</Label>
            <Input
              readOnly
              value={account.verify_token ?? ""}
              className="mt-1 font-mono text-xs h-9"
            />
          </div>
          <Separator className="md:col-span-2" />
          <div className="md:col-span-2 flex items-center justify-between">
            <div className="text-muted-foreground">
              Created {formatZoned(new Date(account.created_at), { dateStyle: "medium" })}
            </div>
            <div className="flex gap-2">
              {account.status !== "disconnected" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => disconnect.mutate(account.id)}
                  disabled={disconnect.isPending}
                >
                  Disconnect
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (
                    confirm(
                      "Permanently remove this WhatsApp account? Message history stays intact.",
                    )
                  ) {
                    remove.mutate(account.id);
                  }
                }}
                disabled={remove.isPending}
              >
                <Trash2 className="w-3.5 h-3.5 " /> Remove
              </Button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <EditDialog account={account} workspaceId={workspaceId} onClose={() => setEditing(false)} />
      )}
      {profileOpen && (
        <BusinessProfileDialog
          account={account}
          workspaceId={workspaceId}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground  text-[11px]">{label}</div>
      <div className="mt-0.5 font-medium text-foreground break-words">{value}</div>
    </div>
  );
}

function truncate(v: string | null, n = 14): string {
  if (!v) return "—";
  return v.length <= n ? v : `${v.slice(0, n - 2)}`;
}

// ---------------------------------------------------------------------------
// Connect dialog
// ---------------------------------------------------------------------------

function ConnectDialog({
  workspaceId,
  onDone,
}: {
  workspaceId: string | undefined;
  onDone: () => void;
}) {
  const connect = useConnectChannelAccount(workspaceId);
  const [form, setForm] = useState<Omit<ConnectInput, "workspaceId">>({
    displayName: "",
    phoneNumber: "",
    phoneNumberId: "",
    wabaId: "",
    businessId: "",
    accessTokenSecretName: "WHATSAPP_ACCESS_TOKEN",
    appSecretName: "WHATSAPP_APP_SECRET",
    verifyToken: generateVerifyToken(),
    isDefault: false,
  });

  const secretValidation = useSecretNameValidation(workspaceId, [
    { name: form.accessTokenSecretName, severity: "required" as const },
    ...(form.appSecretName ? [{ name: form.appSecretName, severity: "recommended" as const }] : []),
  ]);

  const submit = () => {
    if (!workspaceId) return;
    if (secretValidation.missingRequired.length > 0) return;
    connect.mutate({ ...form, workspaceId }, { onSuccess: onDone });
  };

  return (
    <DialogContent className="w-[calc(100vw-2rem)] max-w-lg min-w-0 max-h-[85vh] overflow-y-auto overflow-x-hidden">
      <DialogHeader>
        <DialogTitle>Connect WhatsApp Business Account</DialogTitle>
        <DialogDescription>
          Enter your Meta phone number and WABA identifiers. Access tokens live in project secrets —
          reference them by name.
        </DialogDescription>
      </DialogHeader>
      <div className="grid min-w-0 gap-3 py-2">
        <FormField label="Display name" required>
          <Input
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            placeholder="Support (EU)"
          />
        </FormField>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Phone number" hint="With country code">
            <Input
              value={form.phoneNumber ?? ""}
              onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
              placeholder="+14155551234"
            />
          </FormField>
          <FormField label="Phone number ID" required hint="From Meta phone_number_id">
            <Input
              id={metaFieldId("phoneNumberId")}
              value={form.phoneNumberId}
              onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })}
              placeholder="102290129340398"
            />
          </FormField>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="WABA ID" required>
            <Input
              id={metaFieldId("wabaId")}
              value={form.wabaId}
              onChange={(e) => setForm({ ...form, wabaId: e.target.value })}
              placeholder="105954999999999"
            />
          </FormField>
          <FormField label="Business ID">
            <Input
              id={metaFieldId("businessId")}
              value={form.businessId ?? ""}
              onChange={(e) => setForm({ ...form, businessId: e.target.value })}
              placeholder="Optional"
            />
          </FormField>
        </div>
        <Separator />
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Access token secret name" required hint="Uppercase, underscores">
            <Input
              id={metaFieldId("accessTokenSecretName")}
              value={form.accessTokenSecretName}
              onChange={(e) =>
                setForm({ ...form, accessTokenSecretName: e.target.value.toUpperCase() })
              }
              className="font-mono"
            />
          </FormField>
          <FormField label="App secret name" hint="For webhook signature">
            <Input
              id={metaFieldId("appSecretName")}
              value={form.appSecretName ?? ""}
              onChange={(e) => setForm({ ...form, appSecretName: e.target.value.toUpperCase() })}
              className="font-mono"
            />
          </FormField>
        </div>
        <SecretValidationAlert validation={secretValidation} />
        <MetaSettingsHelpPanel onJump={(t: MetaHelpTarget) => focusMetaField(t.field)} />
        <FormField label="Verify token" hint="Paste into Meta App → Webhooks (Verify token)">
          <div className="flex min-w-0 gap-2">
            <Input
              id={metaFieldId("verifyToken")}
              value={form.verifyToken}
              onChange={(e) => setForm({ ...form, verifyToken: e.target.value })}
              className="min-w-0 flex-1 font-mono"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => setForm({ ...form, verifyToken: generateVerifyToken() })}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={form.isDefault ?? false}
            onCheckedChange={(v) => setForm({ ...form, isDefault: v })}
          />
          Set as default account for this workspace
        </label>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          onClick={submit}
          disabled={
            connect.isPending ||
            !form.displayName ||
            !form.phoneNumberId ||
            !form.wabaId ||
            !form.verifyToken ||
            secretValidation.isChecking ||
            secretValidation.missingRequired.length > 0
          }
        >
          {connect.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Connect
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function generateVerifyToken() {
  const bytes = new Uint8Array(24);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Edit dialog
// ---------------------------------------------------------------------------

function EditDialog({
  account,
  workspaceId,
  onClose,
}: {
  account: ChannelAccountRow;
  workspaceId: string | undefined;
  onClose: () => void;
}) {
  const update = useUpdateChannelAccount(workspaceId);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [displayName, setDisplayName] = useState(account.display_name);
  const [tokenName, setTokenName] = useState(
    account.access_token_secret_name ?? "WHATSAPP_ACCESS_TOKEN",
  );
  const [appSecretName, setAppSecretName] = useState(
    account.app_secret_name ?? "WHATSAPP_APP_SECRET",
  );
  const [verifyToken, setVerifyToken] = useState(account.verify_token ?? "");
  const [isDefault, setIsDefault] = useState(account.is_default);

  const secretValidation = useSecretNameValidation(workspaceId, [
    { name: tokenName, severity: "required" as const },
    ...(appSecretName ? [{ name: appSecretName, severity: "recommended" as const }] : []),
  ]);

  const submit = () => {
    if (secretValidation.missingRequired.length > 0) {
      setShowAdvanced(true);
      return;
    }
    update.mutate(
      {
        id: account.id,
        displayName,
        accessTokenSecretName: tokenName.toUpperCase(),
        appSecretName: appSecretName.toUpperCase() || null,
        verifyToken,
        isDefault,
      },
      { onSuccess: onClose },
    );
  };

  const usingDefaults =
    tokenName === "WHATSAPP_ACCESS_TOKEN" &&
    (appSecretName === "WHATSAPP_APP_SECRET" || !appSecretName);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg min-w-0 max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Edit WhatsApp account</DialogTitle>
          <DialogDescription>
            Give this phone number a name. Everything else is technical setup you normally only
            touch once.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-4 py-2">
          <FormField
            label="Display name"
            hint="Only shown inside the platform, so your team can tell numbers apart."
          >
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </FormField>

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
            Default account for this workspace
          </label>

          <Separator />

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {showAdvanced ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            Advanced — Meta connection settings
            {usingDefaults && !showAdvanced && (
              <Badge variant="outline" className="ml-1 text-[11px]">
                Using defaults
              </Badge>
            )}
          </button>

          {showAdvanced && (
            <div className="grid min-w-0 gap-4 rounded border border-border bg-muted/30 p-3">
              <Alert>
                <Sparkles className="w-4 h-4" />
                <AlertTitle>What are these?</AlertTitle>
                <AlertDescription className="text-xs leading-relaxed">
                  These are <strong>not</strong> your actual passwords. The first two are just the{" "}
                  <em>names</em> of secrets stored safely in Cloud → Secrets. Leave them at the
                  defaults unless you run several Meta apps.
                </AlertDescription>
              </Alert>

              <FormField
                label="1. Access token name"
                hint="Name of the secret holding your Meta permanent token. Default: WHATSAPP_ACCESS_TOKEN. The secret with this exact name must exist in Cloud → Secrets."
              >
                <div className="flex min-w-0 gap-2">
                  <Input
                    id={metaFieldId("accessTokenSecretName")}
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value.toUpperCase())}
                    className="min-w-0 flex-1 font-mono"
                    placeholder="WHATSAPP_ACCESS_TOKEN"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setTokenName("WHATSAPP_ACCESS_TOKEN")}
                  >
                    Default
                  </Button>
                </div>
              </FormField>

              <FormField
                label="2. App secret name"
                hint="Name of the secret holding your Meta App Secret — used to check that incoming webhooks really come from Meta. Default: WHATSAPP_APP_SECRET."
              >
                <div className="flex min-w-0 gap-2">
                  <Input
                    id={metaFieldId("appSecretName")}
                    value={appSecretName}
                    onChange={(e) => setAppSecretName(e.target.value.toUpperCase())}
                    className="min-w-0 flex-1 font-mono"
                    placeholder="WHATSAPP_APP_SECRET"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setAppSecretName("WHATSAPP_APP_SECRET")}
                  >
                    Default
                  </Button>
                </div>
              </FormField>

              <FormField
                label="3. Verify token"
                hint="A random password you paste into Meta's webhook setup. It must match on both sides — generate one, save, then copy it into Meta."
              >
                <div className="flex min-w-0 gap-2">
                  <Input
                    id={metaFieldId("verifyToken")}
                    value={verifyToken}
                    onChange={(e) => setVerifyToken(e.target.value)}
                    className="min-w-0 flex-1 font-mono"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setVerifyToken(generateVerifyToken())}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </FormField>
            </div>
          )}

          <SecretValidationAlert validation={secretValidation} />
          {
            <MetaSettingsHelpPanel
              onJump={(t: MetaHelpTarget) => {
                setShowAdvanced(true);
                requestAnimationFrame(() => {
                  if (!focusMetaField(t.field)) {
                    toast.info(
                      "That field is set up in the connection wizard's step: " + t.wizardStep,
                    );
                  }
                });
              }}
            />
          }
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={
              update.isPending ||
              secretValidation.isChecking ||
              secretValidation.missingRequired.length > 0
            }
          >
            {update.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Business profile dialog
// ---------------------------------------------------------------------------

function BusinessProfileDialog({
  account,
  workspaceId,
  onClose,
}: {
  account: ChannelAccountRow;
  workspaceId: string | undefined;
  onClose: () => void;
}) {
  const fetchProfile = useFetchBusinessProfile();
  const update = useUpdateBusinessProfile(workspaceId);
  const [loaded, setLoaded] = useState(false);
  const [about, setAbout] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [vertical, setVertical] = useState("OTHER");
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);

  const load = async () => {
    const res = await fetchProfile.mutateAsync(account.id);
    const p = res.profile;
    if (p) {
      setAbout(p.about ?? "");
      setDescription(p.description ?? "");
      setAddress(p.address ?? "");
      setEmail(p.email ?? "");
      setWebsite(p.websites?.[0] ?? "");
      setVertical(p.vertical ?? "OTHER");
      setPictureUrl(p.profile_picture_url ?? null);
    }
    setLoaded(true);
  };

  const submit = () => {
    update.mutate(
      {
        id: account.id,
        about: about || undefined,
        description: description || undefined,
        address: address || undefined,
        email: email || undefined,
        websites: website ? [website] : undefined,
        vertical: vertical as (typeof VERTICALS)[number],
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Business profile</DialogTitle>
          <DialogDescription>
            Editing the WhatsApp Business Profile shown to customers.
          </DialogDescription>
        </DialogHeader>
        {!loaded ? (
          <div className="py-6 text-center">
            <Button onClick={load} disabled={fetchProfile.isPending}>
              {fetchProfile.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Load current profile
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 py-2 max-h-[60vh] overflow-y-auto">
            {pictureUrl && (
              <div className="flex items-center gap-3">
                <img
                  src={pictureUrl}
                  alt="Profile"
                  className="w-16 h-16 rounded-full border border-border object-cover"
                />
                <span className="text-xs text-muted-foreground">
                  Profile picture is managed by Meta. Upload changes via WhatsApp Manager.
                </span>
              </div>
            )}
            <FormField label="About (max 139 chars)">
              <Input value={about} onChange={(e) => setAbout(e.target.value)} maxLength={139} />
            </FormField>
            <FormField label="Description">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={512}
                rows={3}
              />
            </FormField>
            <FormField label="Address">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={256} />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Email">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </FormField>
              <FormField label="Website">
                <Input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://"
                />
              </FormField>
            </div>
            <FormField label="Category">
              <select
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
                className="h-9 px-3 rounded-control border border-input bg-surface text-sm w-full"
              >
                {VERTICALS.map((v) => (
                  <option key={v} value={v}>
                    {v.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {loaded && (
            <Button onClick={submit} disabled={update.isPending}>
              {update.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Save profile
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function FormField({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <Label className="text-xs  text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <div className="mt-1 min-w-0">{children}</div>
      {hint && (
        <p className="mt-1 min-w-0 break-words text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
          {hint}
        </p>
      )}
    </div>
  );
}
