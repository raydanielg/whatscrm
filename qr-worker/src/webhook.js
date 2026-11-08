/**
 * Worker → WACRM webhook sender.
 *
 * At-least-once delivery: every event gets a stable X-WACRM-Event-Id and is
 * retried with exponential backoff on 5xx/network failures. WACRM dedupes by
 * event id, so retrying the *same* id is always safe. 4xx is terminal.
 */
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { sign } from './security.js';
import { logger } from './logger.js';

const BACKOFF_MS = [5_000, 30_000, 300_000, 1_800_000, 7_200_000];
const deadLetter = [];

export function getDeadLetters() {
  return deadLetter.slice(-100);
}

async function post(eventId, body) {
  const rawBody = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const res = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-WACRM-Timestamp': timestamp,
      'X-WACRM-Signature': `sha256=${sign(config.webhookSecret, timestamp, rawBody)}`,
      'X-WACRM-Event-Id': eventId,
    },
    body: rawBody,
  });
  return res;
}

/**
 * Fire a webhook event. Never throws — failures are retried in the background
 * and dead-lettered after the final attempt.
 */
export function emit(sessionId, workspaceId, eventType, data = {}) {
  const eventId = randomUUID();
  const body = {
    session_id: sessionId,
    workspace_id: workspaceId,
    event_type: eventType,
    data,
  };

  const attempt = async (n) => {
    try {
      const res = await post(eventId, body);
      if (res.ok) {
        logger.debug({ eventType, sessionId, eventId }, 'webhook delivered');
        return;
      }
      if (res.status >= 400 && res.status < 500) {
        logger.error(
          { eventType, sessionId, eventId, status: res.status },
          'webhook rejected (terminal)',
        );
        deadLetter.push({ eventId, eventType, sessionId, status: res.status, at: Date.now() });
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (n >= BACKOFF_MS.length) {
        logger.error({ eventType, sessionId, eventId, err: String(err) }, 'webhook dead-lettered');
        deadLetter.push({ eventId, eventType, sessionId, error: String(err), at: Date.now() });
        return;
      }
      const delay = BACKOFF_MS[n];
      logger.warn({ eventType, eventId, delay, err: String(err) }, 'webhook retry scheduled');
      setTimeout(() => attempt(n + 1), delay).unref?.();
    }
  };

  attempt(0);
  return eventId;
}
