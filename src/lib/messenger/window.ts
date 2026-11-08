/**
 * Messenger standard messaging window.
 *
 * Meta accepts a normal (RESPONSE / UPDATE) message only within 24 hours of
 * the customer's last message to the Page. Outside it, the only compliant
 * option is a message tag used for its documented purpose — never applied
 * automatically to get around this rule.
 */
export const MESSENGER_STANDARD_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isOutsideMessagingWindow(
  lastInboundAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!lastInboundAt) return false;
  const at = new Date(lastInboundAt).getTime();
  if (!Number.isFinite(at)) return false;
  return now - at > MESSENGER_STANDARD_WINDOW_MS;
}
