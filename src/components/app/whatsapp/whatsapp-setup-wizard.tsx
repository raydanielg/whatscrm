/**
 * Guided WhatsApp Business (Meta Cloud API) connection wizard.
 *
 * Walks an admin through the Meta-side setup (Business Portfolio → WABA →
 * Meta app → webhook) and then persists the resulting IDs through the
 * existing `connectChannelAccount` server function, finishing with a live
 * verification call against the Graph API.
 *
 * Security notes:
 *  - The access token itself is never entered here or stored in the database.
 *    The wizard only captures the NAME of the server-side secret holding it.
 *  - The verify token is generated client-side with the Web Crypto API and is
 *    only meaningful as a shared handshake value with Meta.
 */

import { useMemo, useState } from "react";
import { WhatsAppSecretsChecklist } from "@/components/app/whatsapp/whatsapp-secrets-checklist";
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Copy, ExternalLink, Info,
  KeyRound, Loader2, PartyPopper, RefreshCw, ShieldAlert, Sparkles, Webhook,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  useConnectChannelAccount,
  useTestChannelAccount,
  type ConnectInput,
} from "@/hooks/use-channel-accounts";
import { registerWebhookVerifyToken } from "@/lib/messaging/verify-tokens.functions";
import {
  MetaSettingsHelpPanel, focusMetaField, metaFieldId, type MetaHelpTarget,
} from "@/components/app/whatsapp/meta-settings-help";


const STEPS = [
  { id: "prereq", label: "Meta setup" },
  { id: "webhook", label: "Webhook" },
  { id: "ids", label: "Identifiers" },
  { id: "secrets", label: "Token secret" },
  { id: "finish", label: "Verify" },
] as const;

const SECRET_NAME_RE = /^[A-Z_][A-Z0-9_]*$/;

function generateVerifyToken() {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `wa_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate rounded border border-border bg-muted/40 px-2.5 py-2 text-xs font-mono">
          {value}
        </code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5 shrink-0"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              toast.error("Could not copy — select the text manually");
            }
          }}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function StepLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
    >
      {children} <ExternalLink className="w-3 h-3" />
    </a>
  );
}

interface WizardProps {
  workspaceId: string | undefined;
  onDone: () => void;
}

export function WhatsAppSetupWizard({ workspaceId, onDone }: WizardProps) {
  const [step, setStep] = useState(0);

  // Step 0 — Meta prerequisites
  const [hasPortfolio, setHasPortfolio] = useState(false);
  const [hasWaba, setHasWaba] = useState(false);
  const [hasApp, setHasApp] = useState(false);

  // Step 1 — webhook
  const [verifyToken, setVerifyToken] = useState(generateVerifyToken);
  const [webhookSaved, setWebhookSaved] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [tokenRegistered, setTokenRegistered] = useState(false);


  // Step 2 — identifiers
  const [displayName, setDisplayName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [businessId, setBusinessId] = useState("");

  // Step 3 — secrets
  const [accessTokenSecretName, setAccessTokenSecretName] = useState("WHATSAPP_ACCESS_TOKEN");
  const [appSecretName, setAppSecretName] = useState("");
  const [secretSaved, setSecretSaved] = useState(false);
  const [isDefault, setIsDefault] = useState(true);

  // Step 4 — result
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; message: string } | null>(null);

  const connect = useConnectChannelAccount(workspaceId);
  const test = useTestChannelAccount(workspaceId);

  const webhookUrl = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://wrapcoders.bid";
    return `${origin}/api/public/webhooks/whatsapp`;
  }, []);

  const canAdvance = useMemo(() => {
    switch (step) {
      case 0:
        return hasPortfolio && hasWaba && hasApp;
      case 1:
        return webhookSaved && verifyToken.trim().length >= 8;
      case 2:
        return (
          displayName.trim().length > 0 &&
          phoneNumberId.trim().length > 0 &&
          wabaId.trim().length > 0
        );
      case 3:
        return (
          secretSaved &&
          SECRET_NAME_RE.test(accessTokenSecretName.trim()) &&
          (appSecretName.trim() === "" || SECRET_NAME_RE.test(appSecretName.trim()))
        );
      default:
        return false;
    }
  }, [
    step, hasPortfolio, hasWaba, hasApp, webhookSaved, verifyToken,
    displayName, phoneNumberId, wabaId, accessTokenSecretName, appSecretName, secretSaved,
  ]);

  const busy = connect.isPending || test.isPending;

  async function handleFinish() {
    if (!workspaceId) {
      toast.error("No active workspace selected");
      return;
    }
    const payload: ConnectInput = {
      workspaceId,
      displayName: displayName.trim(),
      phoneNumber: phoneNumber.trim() || undefined,
      phoneNumberId: phoneNumberId.trim(),
      wabaId: wabaId.trim(),
      businessId: businessId.trim() || undefined,
      accessTokenSecretName: accessTokenSecretName.trim(),
      appSecretName: appSecretName.trim() || undefined,
      verifyToken: verifyToken.trim(),
      isDefault,
    };

    try {
      const created = await connect.mutateAsync(payload);
      const id = (created as { account?: { id?: string } })?.account?.id ?? null;
      setCreatedId(id);
      setStep(4);

      if (id) {
        const result = (await test.mutateAsync(id)) as {
          ok?: boolean;
          error?: string;
          phone?: { display_phone_number?: string; verified_name?: string };
        };
        setVerifyResult({
          ok: !!result?.ok,
          message: result?.ok
            ? `Live connection confirmed for ${result.phone?.display_phone_number ?? "your number"}${
                result.phone?.verified_name ? ` (${result.phone.verified_name})` : ""
              }.`
            : result?.error ?? "Verification failed. Check the token secret and IDs.",
        });
      }
    } catch {
      // mutation hooks already surface a toast
    }
  }

  return (
    <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" /> WhatsApp Business setup wizard
        </DialogTitle>
        <DialogDescription>
          Five guided steps: prepare Meta, wire the webhook, save your identifiers, point at the
          token secret, then verify the live connection.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            Step {Math.min(step + 1, STEPS.length)} of {STEPS.length} — {STEPS[step].label}
          </span>
          <span>{Math.round(((step + (step === 4 ? 1 : 0)) / STEPS.length) * 100)}%</span>
        </div>
        <Progress value={((step + (step === 4 ? 1 : 0)) / STEPS.length) * 100} className="h-1.5" />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {STEPS.map((s, i) => (
            <Badge
              key={s.id}
              variant="outline"
              className={
                i < step
                  ? "text-xs gap-1 bg-success/10 text-success border-success/30"
                  : i === step
                    ? "text-xs gap-1 bg-primary/10 text-primary border-primary/30"
                    : "text-xs gap-1 text-muted-foreground"
              }
            >
              {i < step && <Check className="w-3 h-3" />}
              {s.label}
            </Badge>
          ))}
        </div>
      </div>

      <Separator />

      {/* ---------------------------------------------------------------- */}
      {step === 0 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            These are done on Meta&apos;s side. Tick each one as you complete it — the personal
            Accounts Centre page is <em>not</em> where this happens.
          </p>

          <ChecklistItem
            checked={hasPortfolio}
            onChange={setHasPortfolio}
            title="1. Business Portfolio"
            body={
              <>
                Open <StepLink href="https://business.facebook.com">business.facebook.com</StepLink> and
                create (or select) a Business Portfolio for your company, then add your Facebook Page to it.
              </>
            }
          />
          <ChecklistItem
            checked={hasWaba}
            onChange={setHasWaba}
            title="2. WhatsApp Business Account (WABA)"
            body={
              <>
                In the portfolio go to <span className="font-medium">WhatsApp Accounts</span> and create a
                WABA, then add a phone number. The number must not currently be active in the WhatsApp or
                WhatsApp Business consumer app.
              </>
            }
          />
          <ChecklistItem
            checked={hasApp}
            onChange={setHasApp}
            title="3. Meta app with the WhatsApp product"
            body={
              <>
                At <StepLink href="https://developers.facebook.com/apps">developers.facebook.com</StepLink>{" "}
                create a <span className="font-medium">Business</span> type app, add the{" "}
                <span className="font-medium">WhatsApp</span> product, and link the WABA from step 2.
              </>
            }
          />

          <Alert>
            <Info className="w-4 h-4" />
            <AlertTitle>Before you can message real customers</AlertTitle>
            <AlertDescription className="text-xs">
              Meta requires business verification on the portfolio. Until then you can only message the
              test numbers listed in your app.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            In your Meta app, open <span className="font-medium">WhatsApp → Configuration → Webhooks</span>{" "}
            and click <span className="font-medium">Edit</span>. Paste these two values.
          </p>

          <CopyField
            label="Callback URL"
            value={webhookUrl}
            hint="Meta calls this endpoint. It must be reachable over public HTTPS — publish the app first if it isn't live yet."
          />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Verify token</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 text-xs"
                onClick={() => { setVerifyToken(generateVerifyToken()); setTokenRegistered(false); }}
              >
                <RefreshCw className="w-3 h-3" /> Regenerate
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id={metaFieldId("verifyToken")}
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                className="font-mono text-xs"
                maxLength={128}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 shrink-0"
                onClick={async () => {
                  await navigator.clipboard.writeText(verifyToken);
                  toast.success("Verify token copied");
                }}
              >
                <Copy className="w-3.5 h-3.5" /> Copy
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="gap-1.5"
                disabled={!workspaceId || registering || verifyToken.trim().length < 8}
                onClick={async () => {
                  if (!workspaceId) return;
                  setRegistering(true);
                  try {
                    await registerWebhookVerifyToken({
                      data: { workspaceId, token: verifyToken.trim() },
                    });
                    setTokenRegistered(true);
                    toast.success("Verify token registered — Meta can validate the URL now");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not register the token");
                  } finally {
                    setRegistering(false);
                  }
                }}
              >
                {registering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                {tokenRegistered ? "Registered" : "Register token"}
              </Button>
              {tokenRegistered && (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Ready for Meta's “Verify and save”
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Register the token here <span className="font-medium">before</span> clicking “Verify and save” in
              Meta — otherwise the callback URL check fails with “couldn't be validated”. It is saved with the
              account at the end of the wizard.
            </p>
          </div>


          <div className="rounded-control border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium flex items-center gap-1.5">
              <Webhook className="w-3.5 h-3.5" /> Subscribe to these webhook fields
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["messages", "message_template_status_update", "phone_number_quality_update", "account_update"].map((f) => (
                <code key={f} className="rounded bg-background border border-border px-1.5 py-0.5 text-[11px] font-mono">
                  {f}
                </code>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <Checkbox checked={webhookSaved} onCheckedChange={(v) => setWebhookSaved(v === true)} className="mt-0.5" />
            <span className="text-sm">
              I saved the callback URL and verify token in Meta and the webhook verified successfully.
            </span>
          </label>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Find these in your Meta app under <span className="font-medium">WhatsApp → API Setup</span>.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Account name"
              required
              value={displayName}
              onChange={setDisplayName}
              placeholder="Wrapcoders Support"
              hint="Internal label shown across the app."
            />
            <Field
              label="Display phone number"
              value={phoneNumber}
              onChange={setPhoneNumber}
              placeholder="+880 1850 348685"
              hint="Optional — refreshed automatically on verify."
            />
            <Field
              label="Phone Number ID"
              required
              mono
              id={metaFieldId("phoneNumberId")}
              value={phoneNumberId}
              onChange={setPhoneNumberId}
              placeholder="123456789012345"
              hint="Numeric ID next to your number in API Setup."
            />
            <Field
              label="WhatsApp Business Account ID"
              required
              mono
              id={metaFieldId("wabaId")}
              value={wabaId}
              onChange={setWabaId}
              placeholder="987654321098765"
              hint="Also shown in API Setup as WABA ID."
            />
            <Field
              label="Business Portfolio ID"
              mono
              id={metaFieldId("businessId")}
              value={businessId}
              onChange={setBusinessId}
              placeholder="Optional"
              hint="Optional — used for catalog and commerce features."
            />
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {step === 3 && (
        <div className="space-y-4">
          <Alert>
            <ShieldAlert className="w-4 h-4" />
            <AlertTitle>The token itself never touches this form</AlertTitle>
            <AlertDescription className="text-xs">
              You create the token in Meta, paste it into <span className="font-medium">Cloud → Secrets</span>,
              and type only the secret&apos;s <em>name</em> below. The value stays server-side.
            </AlertDescription>
          </Alert>

          <div className="rounded-control border border-border bg-muted/20 p-3 space-y-3">
            <p className="text-xs font-medium flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" /> How to create the permanent access token
            </p>

            <NumberedStep n={1} title="Open Business Settings → System Users">
              Go to <StepLink href="https://business.facebook.com/settings/system-users">
                business.facebook.com → Users → System users
              </StepLink>{" "}
              and click <span className="font-medium">Add</span>. Name it e.g.{" "}
              <code className="font-mono">whatsapp-api</code> and give it the{" "}
              <span className="font-medium">Admin</span> role.
            </NumberedStep>

            <NumberedStep n={2} title="Assign the app and the WhatsApp account">
              With the system user selected, click <span className="font-medium">Add assets</span>. Under{" "}
              <span className="font-medium">Apps</span> pick your Meta app and enable{" "}
              <span className="font-medium">Full control (Manage app)</span>. Repeat under{" "}
              <span className="font-medium">WhatsApp accounts</span> for your WABA with{" "}
              <span className="font-medium">Full control</span>.
              <span className="mt-1 block text-[11px] italic">
                Skipping this is why the permission list shows “No permissions available”.
              </span>
            </NumberedStep>

            <NumberedStep n={3} title="Generate the token">
              Click <span className="font-medium">Generate new token</span>, choose your app, set{" "}
              <span className="font-medium">Token expiration: Never</span>, and tick both{" "}
              <code className="font-mono">whatsapp_business_messaging</code> and{" "}
              <code className="font-mono">whatsapp_business_management</code>. Copy the token — Meta shows
              it only once.
            </NumberedStep>

            <NumberedStep n={4} title="Save it in Cloud → Secrets">
              In this app open <span className="font-medium">Cloud → Secrets</span>, add a secret named{" "}
              <code className="font-mono">{accessTokenSecretName || "WHATSAPP_ACCESS_TOKEN"}</code> and paste
              the token as its value. Save.
            </NumberedStep>

            <NumberedStep n={5} title="Optional — app secret for webhook signatures">
              In <StepLink href="https://developers.facebook.com/apps">your Meta app</StepLink> under{" "}
              <span className="font-medium">Settings → Basic</span>, reveal the{" "}
              <span className="font-medium">App secret</span> and store it as a second secret (e.g.{" "}
              <code className="font-mono">WHATSAPP_APP_SECRET</code>) so inbound webhooks are signature-verified.
            </NumberedStep>
          </div>

          <Field
            label="Access token secret name"
            required
            mono
            id={metaFieldId("accessTokenSecretName")}
            value={accessTokenSecretName}
            onChange={(v) => setAccessTokenSecretName(v.toUpperCase())}
            placeholder="WHATSAPP_ACCESS_TOKEN"
            hint="UPPER_SNAKE_CASE — must match the secret name you saved in Cloud → Secrets exactly."
            invalid={!SECRET_NAME_RE.test(accessTokenSecretName.trim())}
          />
          <Field
            label="App secret name"
            mono
            id={metaFieldId("appSecretName")}
            value={appSecretName}
            onChange={(v) => setAppSecretName(v.toUpperCase())}
            placeholder="WHATSAPP_APP_SECRET"
            hint="Optional — enables signature validation on incoming webhooks."
            invalid={appSecretName.trim() !== "" && !SECRET_NAME_RE.test(appSecretName.trim())}
          />

          <label className="flex items-start gap-2.5 cursor-pointer">
            <Checkbox checked={secretSaved} onCheckedChange={(v) => setSecretSaved(v === true)} className="mt-0.5" />
            <span className="text-sm">
              I saved the token in Cloud → Secrets under exactly this name.
            </span>
          </label>

          <WhatsAppSecretsChecklist
            autoRun={false}
            secretNames={[
              { name: accessTokenSecretName.trim(), severity: "required" as const },
              ...(appSecretName.trim()
                ? [{ name: appSecretName.trim(), severity: "recommended" as const }]
                : []),
            ]}
          />


          <div className="flex items-center justify-between rounded-control border border-border p-3">
            <div>
              <p className="text-sm font-medium">Make this the default account</p>
              <p className="text-xs text-muted-foreground">Used when a send doesn&apos;t specify a number.</p>
            </div>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
          </div>
        </div>
      )}


      {/* ---------------------------------------------------------------- */}
      {step === 4 && (
        <div className="space-y-4">
          {busy && !verifyResult ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Saving the account and calling Meta</p>
            </div>
          ) : verifyResult?.ok ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <PartyPopper className="w-8 h-8 text-success" />
              <p className="font-medium">WhatsApp is connected</p>
              <p className="text-sm text-muted-foreground max-w-sm">{verifyResult.message}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <Alert variant="destructive">
                <ShieldAlert className="w-4 h-4" />
                <AlertTitle>Saved, but verification did not pass</AlertTitle>
                <AlertDescription className="text-xs">
                  {verifyResult?.message ?? "The account was created but Meta could not be reached."}
                </AlertDescription>
              </Alert>
              <p className="text-xs text-muted-foreground">
                The account is saved as pending. Fix the token secret or IDs, then press{" "}
                <span className="font-medium">Verify</span> on the account card — nothing is lost.
              </p>
              {createdId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={test.isPending}
                  onClick={async () => {
                    const r = (await test.mutateAsync(createdId)) as { ok?: boolean; error?: string };
                    setVerifyResult({
                      ok: !!r?.ok,
                      message: r?.ok ? "Live connection confirmed." : r?.error ?? "Verification failed.",
                    });
                  }}
                >
                  {test.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Retry verification
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {step !== 4 && (
        <MetaSettingsHelpPanel
          onJump={(t: MetaHelpTarget) => {
            const next = STEPS.findIndex((x) => x.id === t.wizardStep);
            if (next >= 0) setStep(next);
            setTimeout(() => focusMetaField(t.field), 60);
          }}
        />
      )}

      <Separator />

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5"
          disabled={step === 0 || step === 4 || busy}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </Button>

        {step === 4 ? (
          <Button type="button" size="sm" onClick={onDone} disabled={busy} className="gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Done
          </Button>
        ) : step === 3 ? (
          <Button type="button" size="sm" disabled={!canAdvance || busy} onClick={handleFinish} className="gap-1.5">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
            Save &amp; verify
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={!canAdvance}
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            className="gap-1.5"
          >
            Continue <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </DialogContent>
  );
}

// ---------------------------------------------------------------------------

function ChecklistItem({
  checked, onChange, title, body,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-control border p-3 cursor-pointer transition-colors ${
        checked ? "border-success/40 bg-success/5" : "border-border hover:bg-muted/40"
      }`}
    >
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{body}</p>
      </div>
    </label>
  );
}

function Field({
  id, label, value, onChange, placeholder, hint, required, mono, invalid,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  mono?: boolean;
  invalid?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${mono ? "font-mono text-xs" : ""} ${invalid ? "border-destructive" : ""}`}
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NumberedStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium">{title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
