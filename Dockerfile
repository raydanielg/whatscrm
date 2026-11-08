# syntax=docker/dockerfile:1.7
# WACRM — multi-stage production image.
# TanStack Start SSR bundled with Vite; runs on Node 20 (works fine on 22 too).

# ---------- 1. Dependencies ----------
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable && apk add --no-cache libc6-compat
COPY package.json .npmrc bun.lock* package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN --mount=type=cache,target=/root/.npm \
    if [ -f bun.lock ]; then npm i -g bun && bun install --frozen-lockfile; \
    elif [ -f pnpm-lock.yaml ]; then corepack prepare pnpm@latest --activate && pnpm i --frozen-lockfile; \
    elif [ -f yarn.lock ]; then corepack prepare yarn@stable --activate && yarn install --frozen-lockfile; \
    else npm ci; fi

# ---------- 2. Build ----------
FROM node:20-alpine AS build
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Public build-time env (VITE_*) is baked in here.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_APP_ENV=production
ARG VITE_APP_MODE=production
ARG APP_VERSION=6.8.9
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_APP_ENV=$VITE_APP_ENV \
    VITE_APP_MODE=$VITE_APP_MODE \
    APP_VERSION=$APP_VERSION \
    APP_MODE=$VITE_APP_MODE
# Without a preset the build targets Cloudflare Workers and `node .output/server/index.mjs`
# below would not start a server. node-server emits a standalone HTTP server.
ENV NITRO_PRESET=node-server
RUN npm run build

# ---------- 3. Runtime ----------
FROM node:20-alpine AS runtime
ARG APP_VERSION=6.8.9
LABEL org.opencontainers.image.title="WACRM" \
      org.opencontainers.image.description="WACRM omnichannel messaging platform" \
      org.opencontainers.image.version="$APP_VERSION" \
      org.opencontainers.image.vendor="WACRM"
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    APP_VERSION=$APP_VERSION
RUN addgroup -S wacrm && adduser -S wacrm -G wacrm
COPY --from=build --chown=wacrm:wacrm /app/.output ./.output
COPY --from=build --chown=wacrm:wacrm /app/package.json ./package.json

USER wacrm
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/public/health || exit 1

CMD ["node", ".output/server/index.mjs"]
