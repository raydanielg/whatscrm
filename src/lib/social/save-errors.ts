/**
 * Safe, distinguishable errors for the Social Studio save path.
 *
 * Two things went wrong in the composer's error handling:
 *
 *  1. `useSaveSocialPost` threw the raw PostgrestError, which is a plain object
 *     — not an `Error` instance. The composer's `e instanceof Error` check was
 *     therefore always false and every database failure collapsed into the
 *     literal string "Failed to save post", discarding a perfectly good
 *     message. On the demo project that message is
 *     `Demo mode: insert on "social_posts" is disabled` — the actual answer,
 *     thrown away one layer below the toast.
 *
 *  2. The composer caught the save and the publish call in the same `try`, so a
 *     provider failure also read as a save failure.
 *
 * `SocialSaveError` carries a machine-readable `kind` plus a message that is
 * safe to show, and `normalizeSaveError` maps driver errors onto it.
 */

/** Which layer failed, so the UI (and tests) can tell them apart. */
export type SaveFailureKind =
  | "validation"
  | "no_workspace"
  | "no_targets"
  | "unknown_target"
  | "demo_readonly"
  | "permission_denied"
  | "post_insert"
  | "targets_insert"
  | "constraint"
  | "schema_mismatch"
  | "unknown";

/** The stage that raised, for orphan cleanup and reporting. */
export type SaveStage = "validate" | "post" | "targets";

export class SocialSaveError extends Error {
  readonly kind: SaveFailureKind;
  readonly stage: SaveStage;

  constructor(kind: SaveFailureKind, stage: SaveStage, message: string) {
    super(message);
    this.name = "SocialSaveError";
    this.kind = kind;
    this.stage = stage;
  }
}

/** Shape of a supabase-js / PostgREST error, which is a plain object. */
interface DriverError {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
}

/**
 * Remove anything that could be a credential before a driver string is shown.
 *
 * Database errors should never carry tokens, but `details` can echo submitted
 * values, so long opaque blobs and anything after a secret-ish label are
 * replaced rather than trusted.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+)?/g, "[redacted]")
    .replace(
      /\b(sb_[a-z]+_|service_role|apikey|api[_-]?key|bearer|authorization|access[_-]?token|refresh[_-]?token|secret|password)\b\s*[:=]?\s*\S*/gi,
      "[redacted]",
    )
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted]");
}

function asDriverError(error: unknown): DriverError | null {
  if (!error || typeof error !== "object") return null;
  return error as DriverError;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Map a save failure onto a `SocialSaveError`.
 *
 * `stage` says which insert was running, because the same Postgres code means
 * different things for the post and for its targets.
 */
export function normalizeSaveError(error: unknown, stage: SaveStage): SocialSaveError {
  if (error instanceof SocialSaveError) return error;

  const driver = asDriverError(error);
  const code = str(driver?.code);
  const rawMessage = str(driver?.message) || (error instanceof Error ? error.message : "");
  const rawDetails = str(driver?.details);
  const message = redactSecrets(rawMessage);
  const details = redactSecrets(rawDetails);
  const where = stage === "targets" ? "post targets" : "post";

  // Demo mode raises 42501 from tg_block_demo_writes with an explanatory
  // message; surface it verbatim because it already tells the user what to do.
  if (/demo mode/i.test(message)) {
    return new SocialSaveError("demo_readonly", stage, message);
  }

  switch (code) {
    case "42501":
      return new SocialSaveError(
        "permission_denied",
        stage,
        `You do not have permission to save this ${where} in this workspace.`,
      );
    case "23503":
      return new SocialSaveError(
        "constraint",
        stage,
        stage === "targets"
          ? "One of the selected channels no longer exists. Reopen the composer and pick the channels again."
          : `Could not save the ${where}: a referenced record no longer exists.`,
      );
    case "23505":
      return new SocialSaveError(
        "constraint",
        stage,
        "That channel is already attached to this post.",
      );
    case "23502":
      return new SocialSaveError(
        "constraint",
        stage,
        `A required field on the ${where} was empty.${details ? ` (${details})` : ""}`,
      );
    case "23514":
      return new SocialSaveError(
        "constraint",
        stage,
        `The ${where} has a value this workspace does not allow.${details ? ` (${details})` : ""}`,
      );
    case "22P02":
      return new SocialSaveError(
        "constraint",
        stage,
        `The ${where} contained an identifier in the wrong format.`,
      );
    case "PGRST204":
    case "42703":
      return new SocialSaveError(
        "schema_mismatch",
        stage,
        `This build expects a field the database does not have (${message}). The app and database migrations are out of step.`,
      );
    default:
      break;
  }

  if (/row-level security/i.test(message)) {
    return new SocialSaveError(
      "permission_denied",
      stage,
      `You do not have permission to save this ${where} in this workspace.`,
    );
  }

  return new SocialSaveError(
    stage === "targets" ? "targets_insert" : "post_insert",
    stage,
    message || `Could not save the ${where}.`,
  );
}

/**
 * The string the composer shows.
 *
 * Deliberately does NOT test `instanceof Error` alone — that check is what hid
 * this failure for so long, because supabase-js throws plain objects. Anything
 * carrying a usable `message` is used, redacted, before falling back.
 */
export function describeSaveFailure(error: unknown): string {
  if (error instanceof SocialSaveError) return error.message;
  if (error instanceof Error && error.message.trim()) return redactSecrets(error.message.trim());

  const driver = asDriverError(error);
  const message = str(driver?.message).trim();
  if (message) return redactSecrets(message);

  if (typeof error === "string" && error.trim()) return redactSecrets(error.trim());
  return "Could not save the post. Please try again, or check the browser console for details.";
}
