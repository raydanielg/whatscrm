/**
 * Validation for the Telegram-only "Poll" composer attachment.
 *
 * Telegram's `sendPoll` is the only outbound poll API any connected channel
 * has (no WhatsApp Cloud, Messenger or Instagram equivalent exists), so this
 * is deliberately not part of the generic channel-attachments map.
 */

export interface PollInput {
  question: string;
  options: string[];
}

export interface PollData {
  question: string;
  options: string[];
}

export type PollValidation = { ok: true; data: PollData } | { ok: false; reason: string };

export const POLL_QUESTION_MAX = 300;
export const POLL_OPTION_MAX = 100;
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 10;

/** Validate and normalize a poll before it is persisted or sent. */
export function validatePoll(input: PollInput): PollValidation {
  const question = input.question.trim();
  if (!question) return { ok: false, reason: "Poll question is required." };
  if (question.length > POLL_QUESTION_MAX) {
    return { ok: false, reason: `Poll question must be ${POLL_QUESTION_MAX} characters or fewer.` };
  }

  const options = input.options.map((o) => o.trim()).filter((o) => o.length > 0);
  if (options.length < POLL_MIN_OPTIONS) {
    return { ok: false, reason: `A poll needs at least ${POLL_MIN_OPTIONS} options.` };
  }
  if (options.length > POLL_MAX_OPTIONS) {
    return { ok: false, reason: `A poll can have at most ${POLL_MAX_OPTIONS} options.` };
  }
  const tooLong = options.find((o) => o.length > POLL_OPTION_MAX);
  if (tooLong) {
    return {
      ok: false,
      reason: `Each poll option must be ${POLL_OPTION_MAX} characters or fewer.`,
    };
  }

  return { ok: true, data: { question, options } };
}
