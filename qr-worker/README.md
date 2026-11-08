# WACRM WhatsApp QR Worker

Stateful companion service that holds the long-lived WhatsApp (Baileys) sockets
WACRM's serverless backend cannot host. It implements
[`docs/whatsapp-qr-worker-contract.md`](../docs/whatsapp-qr-worker-contract.md)
in both directions:

- **App → worker**: `POST /sessions`, `GET /sessions/:id/qr`, `DELETE /sessions/:id`,
  `POST /sessions/:id/send` — all Bearer-token + HMAC authenticated.
- **Worker → app**: signed webhooks to `/api/public/whatsapp/qr-webhook` with a
  unique `X-WACRM-Event-Id`, exponential-backoff retries and dead-lettering.

## 1. Generate the three shared secrets

Run locally and keep the output — the *same* values go on both sides:

```bash
openssl rand -hex 32   # WA_QR_WORKER_TOKEN
openssl rand -hex 32   # WA_QR_WORKER_SIGNING_SECRET
openssl rand -hex 32   # WA_QR_WEBHOOK_SECRET
```

## 2. Deploy on cPanel (Node.js + PM2)

```bash
# on the server
cd ~/apps
git clone <your repo> wacrm && cd wacrm/qr-worker
npm install --omit=dev
cp .env.example .env && nano .env      # paste the three secrets
mkdir -p data/auth logs
npx pm2 start ecosystem.config.cjs && npx pm2 save && npx pm2 startup
```

Notes:

- Node 20+ is required. In cPanel's *Setup Node.js App* pick the same version.
- Keep `instances: 1`. Baileys sockets are stateful and cannot be clustered.
- `data/auth` holds WhatsApp credentials — back it up, never delete it while
  sessions are connected, and exclude it from public web roots.

### Expose it over HTTPS

Create a subdomain (e.g. `wa.yourdomain.com`) and proxy it to `127.0.0.1:8787`.
Apache/LiteSpeed vhost include:

```apache
ProxyPreserveHost On
ProxyPass        / http://127.0.0.1:8787/
ProxyPassReverse / http://127.0.0.1:8787/
```

Verify: `curl https://wa.yourdomain.com/health` → `{"ok":true,...}`.
`/health` is the only unauthenticated route; everything else returns 401
without a valid token *and* signature.

### Docker alternative

```bash
docker build -t wacrm-wa-qr-worker .
docker run -d --name wa-qr --env-file .env -p 8787:8787 \
  -v $PWD/data:/app/data --restart unless-stopped wacrm-wa-qr-worker
```

## 3. Configure WACRM

Add these project secrets in WACRM (Backend → Secrets):

| Secret | Value |
| --- | --- |
| `WA_QR_WORKER_URL` | `https://wa.yourdomain.com` |
| `WA_QR_WORKER_TOKEN` | same as the worker's |
| `WA_QR_WORKER_SIGNING_SECRET` | same as the worker's |
| `WA_QR_WEBHOOK_SECRET` | same as the worker's |

Then open **Admin → WhatsApp Status** and run the health check, or start a QR
session from the WhatsApp panel — a QR code appears within a few seconds.

## Operations

- `GET /status` (authenticated) lists live sessions and dead-letter count.
- Logs: `npx pm2 logs wacrm-wa-qr-worker` (QR payloads and signatures are redacted).
- Rotating a secret: add the new value on both sides, deploy, then remove the old.
