import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  API_CONFIG_SECTIONS,
  DEFAULT_API_CONFIG_SECTION,
  isApiConfigSection,
} from "@/components/app/settings/api-config-sections";

/**
 * Legacy `/settings#<hash>` entry point.
 *
 * Every panel now lives on its own route (`/api-config/<section>` for API
 * Configurations, `/settings/<page>` for account panels). This route only
 * translates old hash deep links into the new paths so bookmarks keep working.
 */
export const apiSections = API_CONFIG_SECTIONS.map((s) => ({ id: s.id, label: s.label, icon: s.icon }));

/** The Settings page no longer renders its own left rail. */
export const settingsSections: { id: string; label: string; icon: unknown }[] = [];

const ACCOUNT_HASH_ROUTES: Record<string, string> = {
  workspace: "/settings/general",
  security: "/settings/security",
  billing: "/settings/billing",
  birthdays: "/settings/birthdays",
  "task-reminders": "/settings/task-reminders",
  notifications: "/settings/notifications",
};

export function resolveLegacySettingsHash(hash: string | undefined): string {
  const key = (hash ?? "").replace(/^#/, "");
  if (ACCOUNT_HASH_ROUTES[key]) return ACCOUNT_HASH_ROUTES[key];
  if (isApiConfigSection(key)) return `/api-config/${key}`;
  return `/api-config/${DEFAULT_API_CONFIG_SECTION}`;
}

export const Route = createFileRoute("/_authenticated/settings/")({
  beforeLoad: ({ location }) => {
    throw redirect({ to: resolveLegacySettingsHash(location.hash), replace: true });
  },
});
