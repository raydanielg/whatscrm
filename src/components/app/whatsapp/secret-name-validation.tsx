/**
 * Pre-save validation for WhatsApp secret *names*.
 *
 * Before an account can be saved, we verify that every secret name the admin
 * typed actually exists in Cloud → Secrets. Values are never fetched — the
 * server only reports presence — but the guidance is concrete enough to fix.
 */

import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  checkWhatsAppSecrets,
  type SecretCheck,
  type SecretSeverity,
} from "@/lib/messaging/secrets-checklist.functions";

export interface SecretNameInput {
  name: string;
  severity: SecretSeverity;
}

export interface SecretNameValidation {
  /** True while the check is running. */
  isChecking: boolean;
  /** Names that do not exist in Cloud → Secrets. */
  missing: SecretCheck[];
  /** Missing names flagged as required — these block saving. */
  missingRequired: SecretCheck[];
  /** Everything resolved (nothing required is missing). */
  ok: boolean;
  checked: boolean;
}

function SecretName({ children }: { children: string }) {
  return (
    <code className="inline-block max-w-full whitespace-normal break-all rounded bg-muted px-1 py-0.5 align-baseline font-mono font-semibold [overflow-wrap:anywhere]">
      {children}
    </code>
  );
}

function useDebounced<T>(value: T, delay = 500): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Validates that the given secret names exist server-side. */
export function useSecretNameValidation(
  workspaceId: string | undefined,
  names: SecretNameInput[],
): SecretNameValidation {
  const check = useServerFn(checkWhatsAppSecrets);

  const cleaned = useMemo(
    () =>
      names
        .map((n) => ({ name: n.name.trim(), severity: n.severity }))
        .filter((n) => n.name.length > 0)
        .slice(0, 20),
    [names],
  );
  const key = useDebounced(JSON.stringify(cleaned));

  const query = useQuery({
    queryKey: ["whatsapp", "secret-name-validation", workspaceId, key],
    enabled: Boolean(workspaceId) && cleaned.length > 0,
    staleTime: 15_000,
    retry: false,
    queryFn: () =>
      check({
        data: {
          workspaceId: workspaceId as string,
          secretNames: JSON.parse(key) as SecretNameInput[],
        },
      }),
  });

  const wanted = new Set(cleaned.map((n) => n.name));
  const relevant = (query.data?.secrets ?? []).filter((s) => wanted.has(s.name));
  const missing = relevant.filter((s) => !s.present);

  return {
    isChecking: query.isFetching,
    missing,
    missingRequired: missing.filter((s) => s.severity === "required"),
    ok: query.isSuccess && missing.filter((s) => s.severity === "required").length === 0,
    checked: query.isSuccess,
  };
}

/** Inline feedback shown inside the connect/edit dialogs. */
export function SecretValidationAlert({ validation }: { validation: SecretNameValidation }) {
  if (validation.isChecking) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Checking that these secrets exist in Cloud → Secrets
      </div>
    );
  }

  if (!validation.checked) return null;

  if (validation.missing.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="w-3.5 h-3.5" />
        All referenced secrets exist in Cloud → Secrets.
      </div>
    );
  }

  return (
    <Alert
      variant={validation.missingRequired.length > 0 ? "destructive" : "default"}
      className="min-w-0 max-w-full overflow-hidden [&_*]:min-w-0 [&_*]:max-w-full"
    >
      <AlertTriangle className="w-4 h-4" />
      <AlertTitle>
        {validation.missingRequired.length > 0
          ? "Missing secret — you can't save yet"
          : "Optional secret is missing"}
      </AlertTitle>
      <AlertDescription className="min-w-0 max-w-full space-y-3 text-xs leading-relaxed break-words whitespace-normal [overflow-wrap:anywhere]">
        {validation.missing.map((s) => (
          <div key={s.name} className="min-w-0 max-w-full space-y-1 break-words [overflow-wrap:anywhere]">
            <p className="min-w-0 max-w-full whitespace-normal break-words [overflow-wrap:anywhere]">
              <SecretName>{s.name}</SecretName>{" "}
              {s.severity === "required" ? "(required)" : "(recommended)"} does not exist in
              Cloud → Secrets.
            </p>
            <p className="min-w-0 max-w-full whitespace-normal break-words text-muted-foreground [overflow-wrap:anywhere]">{s.purpose}</p>
            <p className="min-w-0 max-w-full whitespace-normal break-words [overflow-wrap:anywhere]">
              <span className="font-medium">How to fix: </span>
              {s.remedy ? (
                s.remedy
              ) : (
                <>
                  Save the value in Cloud → Secrets using exactly the name <SecretName>{s.name}</SecretName>.
                </>
              )}
            </p>
          </div>
        ))}
        <p className="min-w-0 max-w-full whitespace-normal break-words text-muted-foreground [overflow-wrap:anywhere]">
          Add the secret in <strong>Cloud → Secrets</strong>, then reopen this dialog — or change
          the name above to match a secret you already created.
        </p>
      </AlertDescription>
    </Alert>
  );
}
