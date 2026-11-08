/**
 * Baileys session manager.
 *
 * One long-lived WhatsApp socket per WACRM session id. Auth credentials are
 * persisted per session under config.authDir so a worker restart reconnects
 * without a new QR scan.
 */
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { Boom } from '@hapi/boom';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { config } from './config.js';
import { logger } from './logger.js';
import { emit } from './webhook.js';

/** sessionId -> { sock, status, qr, qrExpiresAt, workspaceId, meta, sends } */
const sessions = new Map();

const QR_TTL_MS = 60_000;

export function getSession(sessionId) {
  return sessions.get(sessionId) ?? null;
}

export function listSessions() {
  return [...sessions.entries()].map(([id, s]) => ({
    session_id: id,
    workspace_id: s.workspaceId,
    status: s.status,
    phone_number: s.meta.phone_number ?? null,
  }));
}

function authPath(sessionId) {
  // sessionId is validated as a UUID by the route layer before reaching here.
  return path.join(config.authDir, sessionId);
}

function toJid(phone) {
  const digits = String(phone).replace(/[^\d]/g, '');
  return `${digits}@s.whatsapp.net`;
}

export async function startSession(sessionId, workspaceId) {
  const existing = sessions.get(sessionId);
  if (existing && existing.status !== 'disconnected' && existing.status !== 'error') {
    return { worker_session_id: sessionId };
  }

  const dir = authPath(sessionId);
  await mkdir(dir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion();

  const entry = {
    sock: null,
    status: 'pending',
    qr: null,
    qrExpiresAt: null,
    workspaceId,
    meta: {},
    sends: new Map(), // client_message_id -> { message_id, status, at }
    closing: false,
  };
  sessions.set(sessionId, entry);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['WACRM', 'Chrome', '1.0.0'],
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  entry.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      entry.qr = qr;
      entry.status = 'awaiting_scan';
      entry.qrExpiresAt = new Date(Date.now() + QR_TTL_MS).toISOString();
      emit(sessionId, workspaceId, 'session.qr_updated', { qr_expires_at: entry.qrExpiresAt });
    }

    if (connection === 'connecting' && entry.status === 'awaiting_scan' && !qr) {
      entry.status = 'scanned';
      entry.qr = null;
      emit(sessionId, workspaceId, 'session.scanned', {});
    }

    if (connection === 'open') {
      entry.status = 'connected';
      entry.qr = null;
      entry.qrExpiresAt = null;
      entry.meta = {
        phone_number: sock.user?.id ? `+${sock.user.id.split(':')[0]}` : null,
        display_name: sock.user?.name ?? null,
        device_platform: 'whatsapp-web',
      };
      emit(sessionId, workspaceId, 'session.connected', entry.meta);
      logger.info({ sessionId }, 'session connected');
    }

    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;

      if (entry.closing || loggedOut) {
        entry.status = 'disconnected';
        emit(sessionId, workspaceId, 'session.disconnected', {
          reason: loggedOut ? 'logged_out' : 'revoked',
        });
        sessions.delete(sessionId);
        if (loggedOut) rm(dir, { recursive: true, force: true }).catch(() => {});
        return;
      }

      // Transient drop — Baileys needs a fresh socket, reconnect with backoff.
      entry.status = 'connecting';
      logger.warn({ sessionId, code }, 'connection closed, reconnecting');
      setTimeout(() => {
        startSession(sessionId, workspaceId).catch((err) => {
          entry.status = 'error';
          emit(sessionId, workspaceId, 'session.error', { error: String(err) });
        });
      }, 3_000).unref?.();
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const m = msg.message ?? {};
      const text =
        m.conversation ??
        m.extendedTextMessage?.text ??
        m.imageMessage?.caption ??
        m.videoMessage?.caption ??
        null;
      let msgType = 'text';
      if (m.imageMessage) msgType = 'image';
      else if (m.videoMessage) msgType = 'video';
      else if (m.audioMessage) msgType = 'audio';
      else if (m.documentMessage) msgType = 'document';
      const contextInfo = m.extendedTextMessage?.contextInfo
        ?? m.imageMessage?.contextInfo
        ?? m.videoMessage?.contextInfo
        ?? m.audioMessage?.contextInfo
        ?? m.documentMessage?.contextInfo;

      emit(sessionId, workspaceId, 'message.received', {
        from: `+${(msg.key.remoteJid || '').split('@')[0]}`,
        type: msgType,
        text,
        media_url: null,
        waba_message_id: msg.key.id,
        message_id: msg.key.id,
        context_message_id: contextInfo?.stanzaId ?? null,
        timestamp: Number(msg.messageTimestamp || Math.floor(Date.now() / 1000)),
      });
    }
  });

  sock.ev.on('messages.update', (updates) => {
    const map = { 1: 'sent', 2: 'sent', 3: 'delivered', 4: 'read', 5: 'read', 0: 'failed' };
    for (const u of updates) {
      const status = map[u.update?.status];
      if (!status) continue;
      emit(sessionId, workspaceId, 'message.status', {
        waba_message_id: u.key?.id,
        message_id: u.key?.id,
        status,
        error: null,
      });
    }
  });

  return { worker_session_id: sessionId };
}

export function readQr(sessionId) {
  const entry = sessions.get(sessionId);
  if (!entry) return null;
  const expired = entry.qrExpiresAt && Date.parse(entry.qrExpiresAt) < Date.now();
  return {
    qr: expired ? null : entry.qr,
    status: entry.status,
    phone_number: entry.meta.phone_number ?? null,
    display_name: entry.meta.display_name ?? null,
    device_platform: entry.meta.device_platform ?? null,
    error: entry.error ?? null,
  };
}

export async function revokeSession(sessionId) {
  const entry = sessions.get(sessionId);
  if (entry) {
    entry.closing = true;
    try {
      await entry.sock?.logout();
    } catch {
      try {
        entry.sock?.end?.(undefined);
      } catch {
        /* socket already gone */
      }
    }
    sessions.delete(sessionId);
  }
  await rm(authPath(sessionId), { recursive: true, force: true }).catch(() => {});
  return { ok: true };
}

/** Idempotent send — repeats of the same client_message_id never resend. */
export async function sendMessage(sessionId, payload) {
  const entry = sessions.get(sessionId);
  if (!entry || entry.status !== 'connected') {
    const err = new Error('Session not connected');
    err.status = 409;
    throw err;
  }

  const key = payload.client_message_id;
  const prior = entry.sends.get(key);
  if (prior) return { message_id: prior.message_id, status: prior.status };

  const jid = toJid(payload.to);
  let content;
  switch (payload.type) {
    case 'image':
      content = { image: { url: payload.media_url }, caption: payload.caption ?? undefined };
      break;
    case 'video':
      content = { video: { url: payload.media_url }, caption: payload.caption ?? undefined };
      break;
    case 'audio':
      content = { audio: { url: payload.media_url }, mimetype: 'audio/mp4' };
      break;
    case 'document':
      content = {
        document: { url: payload.media_url },
        fileName: payload.caption || 'document',
      };
      break;
    default:
      content = { text: payload.text ?? '' };
  }

  const sent = await entry.sock.sendMessage(jid, content);
  const result = { message_id: sent?.key?.id ?? key, status: 'queued', at: Date.now() };
  entry.sends.set(key, result);

  // Prune the dedupe map beyond the retention window.
  for (const [k, v] of entry.sends) {
    if (Date.now() - v.at > config.dedupeTtlMs) entry.sends.delete(k);
  }

  return { message_id: result.message_id, status: result.status };
}
