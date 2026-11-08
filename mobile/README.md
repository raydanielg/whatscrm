# WACRM Mobile (React Native + Expo)

Production-ready architecture for the native Android/iOS companion apps to the WACRM web platform. **This folder does not run inside Lovable's preview** — copy it into a standalone Expo project (or open it directly outside Lovable) and run it with the Expo CLI.

## Stack

- Expo SDK 51 + Expo Router (typed routes, file-based navigation)
- React Native 0.74, TypeScript strict
- TanStack Query + MMKV persistence (offline-first cache)
- Supabase JS v2 (auth, DB, realtime) with SecureStore-backed session
- Zustand (persisted app state, MMKV)
- React Hook Form + Zod (forms & validation)
- Expo Notifications (push), Expo SecureStore, Expo Localization, i18next
- React Native Reanimated + Gesture Handler for premium interactions

## Architecture

```
mobile/
├── app/                        # Expo Router — screens
│   ├── _layout.tsx             # Providers (Theme, Query, Auth, Network, Push)
│   ├── index.tsx               # Session redirect
│   ├── (auth)/sign-in.tsx      # Public auth stack
│   └── (tabs)/                 # Authenticated tabs: Inbox, CRM, Commerce, More
├── src/
│   ├── api/                    # supabase client, react-query client
│   ├── auth/                   # AuthProvider (shared with web contract)
│   ├── components/             # Screen, Button, Input (theme-aware, 44pt targets)
│   ├── offline/                # outbox + NetworkGate (auto-flush on reconnect)
│   ├── realtime/               # useRealtimeTable — Postgres CDC → query invalidation
│   ├── notifications/          # Expo Push registration + push_tokens upsert
│   ├── stores/                 # Zustand + MMKV
│   ├── theme/                  # Semantic tokens matching the web (#075E54 primary)
│   └── i18n/                   # Locale-aware strings
```

## Shared with the web platform

- **Same backend**: reads Supabase URL and anon key from `app.json → expo.extra`; identical tables, RLS policies, and server routes.
- **Same auth model**: `auth.users` sessions persisted in Keychain / Keystore via `expo-secure-store`.
- **Same permission model**: RLS + `user_roles` (has_role RPC) enforce the same access rules on device.
- **Same business logic**: calls Supabase directly for reads and calls TanStack server routes (`/api/v1/*`, `/api/public/*`) via `fetch(env.API_BASE_URL + ...)` for privileged actions.
- **Same design tokens**: `theme/tokens.ts` mirrors the web's `#075E54` primary, 10px radii, Inter-style hierarchy.

## Offline-first

1. Every list read is cached via TanStack Query, persisted to MMKV for 24h.
2. Mutations while offline enqueue to `src/offline/outbox.ts` (insert/update/delete envelopes with attempt counters).
3. `NetworkGate` polls connectivity (`expo-network`); on reconnect it flushes the outbox and invalidates queries — screens refresh automatically.
4. Persist `queryClient` cache with `persistQueryClient` + `createAsyncStoragePersister` on MMKV.

## Realtime sync

`useRealtimeTable(table, queryKey, filter?)` opens a `postgres_changes` channel and invalidates the given query key on any INSERT/UPDATE/DELETE. Enable per table via migration:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
```

## Push notifications

`src/notifications/push.ts` registers the device with Expo Push and upserts the token into a `push_tokens` table `(user_id, token, platform, updated_at)`. Send from server code with:

```
POST https://exp.host/--/api/v2/push/send
{ "to": token, "title": "...", "body": "..." }
```

Add the table on the backend side:

```sql
CREATE TABLE public.push_tokens (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, token)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_tokens TO authenticated;
GRANT ALL ON public.push_tokens TO service_role;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tokens" ON public.push_tokens FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

## Tablet support

- `orientation: default` in `app.json` allows landscape.
- `ios.supportsTablet: true` enables iPad layouts.
- Screens use flexbox with responsive spacing tokens; add split-view layouts by branching on `useWindowDimensions()` where useful (`width >= 768`).

## Running (outside Lovable)

```bash
cd mobile
npm install
npx expo start           # dev with Expo Go for quick preview
# For push notifications and native modules (MMKV, SecureStore), use a dev build:
npx expo prebuild
npx expo run:ios         # or run:android
```

## Production builds

Configure EAS in `eas.json` (already scaffolded), then:

```bash
eas build --platform android
eas build --platform ios
eas submit -p ios
eas submit -p android
```

## Enterprise readiness checklist

- [x] Sessions stored in Keychain/Keystore (not AsyncStorage)
- [x] Token refresh paused when app is backgrounded
- [x] Offline-first cache + mutation outbox
- [x] Realtime invalidation hooks
- [x] Push token registration
- [x] Semantic theming (light/dark auto)
- [x] i18n scaffolding
- [x] Tablet / iPad support
- [x] TypeScript strict, path aliases
- [x] EAS build config

Extend by adding role-gated screens (query `has_role`), a KB search screen, ticket detail with attachments (Expo File System + Supabase Storage signed URLs), and voice notes (Expo AV).
