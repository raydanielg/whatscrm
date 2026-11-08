/**
 * useTenantTimezone — the single source of truth for the IANA timezone the
 * CRM displays dates/times in. Mirrors `useTenantCurrency` in
 * `src/hooks/use-currency.ts`.
 *
 * Resolution order: the signed-in user's own profile timezone (a personal
 * preference — someone working remotely from the business's own timezone),
 * then the active organization's timezone, then the browser's own timezone.
 * Previously neither of the first two was ever read anywhere — this is what
 * makes the Locale settings' timezone picker actually do something.
 */
import { useMyProfile } from "@/hooks/use-profile";
import { useActiveOrganization } from "@/hooks/use-organization";
import { formatInTimezone, zonedDayLabel } from "@/lib/datetime/timezone";

export function useTenantTimezone(): string {
  const { data: profile } = useMyProfile();
  const { active } = useActiveOrganization();
  const profileTz = (profile?.timezone ?? "").trim();
  if (profileTz) return profileTz;
  const orgTz = (active?.timezone ?? "").trim();
  if (orgTz) return orgTz;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** `(date, options) => string` bound to the resolved tenant timezone. */
export function useZonedDateFormatter(): (
  date: Date | string | number,
  options: Intl.DateTimeFormatOptions,
) => string {
  const tz = useTenantTimezone();
  return (date, options) => formatInTimezone(date, tz, options);
}

/** "Today" / "Yesterday" / "Month d, yyyy", computed in the tenant timezone. */
export function useZonedDayLabel(): (date: Date | string | number) => string {
  const tz = useTenantTimezone();
  return (date) => zonedDayLabel(date, tz);
}
