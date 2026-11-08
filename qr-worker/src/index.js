/**
 * WACRM WhatsApp QR worker — HTTP surface.
 * Implements docs/whatsapp-qr-worker-contract.md (Direction 1).
 */
import express from 'express';
import { config } from './config.js';
import { logger } from './logger.js';
import { authenticate } from './security.js';
import { getDeadLetters } from './webhook.js';
import {
  startSession,
  readQr,
  revokeSession,
  sendMessage,
  listSessions,
} from './sessions.js';

const app = express();
app.disable('x-powered-by');

// Raw body is required for HMAC verification — capture it during parsing.
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  }),
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const requireUuid = (req, res, next) =>
  UUID.test(req.params.session_id)
    ? next()
    : res.status(400).json({ error: 'Invalid session id' });

/** Unauthenticated liveness probe — exposes no session data. */
app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.use(authenticate);

app.get('/status', (_req, res) =>
  res.json({ ok: true, sessions: listSessions(), dead_letters: getDeadLetters().length }),
);

app.post('/sessions', async (req, res) => {
  const { session_id, workspace_id } = req.body ?? {};
  if (!UUID.test(String(session_id)) || !UUID.test(String(workspace_id))) {
    return res.status(400).json({ error: 'session_id and workspace_id must be UUIDs' });
  }
  try {
    res.json(await startSession(session_id, workspace_id));
  } catch (err) {
    logger.error({ err: String(err) }, 'startSession failed');
    res.status(500).json({ error: 'Failed to start session' });
  }
});

app.get('/sessions/:session_id/qr', requireUuid, (req, res) => {
  const state = readQr(req.params.session_id);
  if (!state) return res.status(404).json({ error: 'Unknown session' });
  res.json(state);
});

app.delete('/sessions/:session_id', requireUuid, async (req, res) => {
  res.json(await revokeSession(req.params.session_id));
});

app.post('/sessions/:session_id/send', requireUuid, async (req, res) => {
  const body = req.body ?? {};
  if (!body.to || !body.client_message_id) {
    return res.status(400).json({ error: 'to and client_message_id are required' });
  }
  try {
    res.json(await sendMessage(req.params.session_id, body));
  } catch (err) {
    const status = err.status ?? 500;
    res.status(status).json({ error: err.message ?? 'Send failed' });
  }
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

const server = app.listen(config.port, config.host, () =>
  logger.info({ port: config.port }, 'QR worker listening'),
);

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    logger.info({ signal }, 'shutting down');
    server.close(() => process.exit(0));
  });
}
