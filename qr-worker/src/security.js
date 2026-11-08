/**
 * Inbound request authentication for app → worker calls.
 *
 * Every request must carry:
 *   Authorization:       Bearer <WA_QR_WORKER_TOKEN>
 *   X-WACRM-Timestamp: unix seconds (rejected if skew > 300s)
 *   X-WACRM-Signature: sha256=<hex HMAC(signingSecret, `${ts}.${rawBody}`)>
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

function safeEqual(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

export function sign(secret, timestamp, rawBody) {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

/** Express middleware — rejects any request that is not a verified app call. */
export function authenticate(req, res, next) {
  const auth = req.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!safeEqual(token, config.workerToken)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const timestamp = req.get('x-wacrm-timestamp') || '';
  const provided = (req.get('x-wacrm-signature') || '').replace(/^sha256=/, '');
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return res.status(400).json({ error: 'Bad timestamp' });
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > config.maxSkewSeconds) {
    return res.status(401).json({ error: 'Timestamp outside allowed window' });
  }

  const rawBody = req.rawBody ?? '';
  const expected = sign(config.signingSecret, timestamp, rawBody);
  if (!safeEqual(provided, expected)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  return next();
}
