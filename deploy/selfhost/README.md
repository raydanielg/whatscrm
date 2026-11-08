# WACRM — Self-Hosted Deployment (VPS, no Supabase Cloud)

Stack: self-hosted Supabase (official docker stack: Postgres + GoTrue Auth +
PostgREST + Realtime + Storage + Envoy API gateway) + WACRM app + nginx.

## Requirements

- VPS: 4GB+ RAM (8GB recommended), Ubuntu 22.04/24.04 or Debian
- Ports open: **80** (app), **8000** (Supabase API + Studio)
- Postgres (5432/6543) is bound to localhost only — never exposed.

## Deploy

```bash
# from the project root on the VPS
bash deploy/selfhost/setup.sh <PUBLIC_IP>
```

The script will:

1. Install Docker if missing
2. Generate all Supabase secrets (`utils/generate-keys.sh`) + app secrets
3. Write `deploy/selfhost/supabase/.env` and `.env.production`
4. Pull the Supabase images, build the WACRM app image, start everything
5. Apply all migrations in `supabase/migrations/` in order
6. Create the pg_cron Vault secrets (`wacrm_cron_base_url`, `wacrm_cron_token`)

## Endpoints

| What             | URL                        |
| ---------------- | -------------------------- |
| App              | `http://<IP>`              |
| Supabase API     | `http://<IP>:8000`         |
| Supabase Studio  | `http://<IP>:8000` (basic auth — credentials in `supabase/.env`) |

## Optional: WhatsApp QR worker (Baileys)

```bash
cd deploy/selfhost/supabase
docker compose --profile qr up -d
```

Then set `WA_QR_WORKER_URL=http://qr-worker:8787` (+ token secrets) in
`.env.production` and `docker compose restart app`.

## HTTPS / webhooks

WhatsApp Cloud API and Meta webhooks **require HTTPS** — a bare IP will not
work for inbound messages. Cheapest fix without buying a domain: use a free
`sslip.io` hostname (`app.<IP>.sslip.io`), re-run `setup.sh` with that hostname,
and add TLS (Caddy or certbot). Then configure `APP_ORIGIN`, `SITE_URL`,
`SUPABASE_PUBLIC_URL`, `API_EXTERNAL_URL` to the `https://` URL.

## Postgres access

```bash
ssh -L 5432:127.0.0.1:5432 user@<IP>
psql postgresql://postgres:<POSTGRES_PASSWORD>@127.0.0.1:5432/postgres
```
