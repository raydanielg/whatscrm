/**
 * Published passwords for the shared demo accounts.
 *
 * Keep this module out of anything that loads in production. Import it ONLY
 * from demo-mode code paths:
 *   - `components/auth/demo-credentials.tsx` (lazy-loaded, demo mode only)
 *   - `demo.functions.ts` (server-only handler, refuses to run in production)
 *
 * Importing it from the root layout, `mode.ts`, or any shared hook would put
 * these strings back into the main production bundle.
 */
import type { DemoAccount } from "./accounts";

export const DEMO_PASSWORDS: Record<DemoAccount["key"], string> = {
  user: "User123!",
  agent: "Agent123!",
  admin: "Admin123!",
};
