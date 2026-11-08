/**
 * Calendar Sync Layer — thin re-export for backwards compatibility.
 *
 * The full provider abstraction now lives in `providers/` and the
 * bi-directional sync engine in `calendar-sync-engine.server.ts`.
 */
export type { CalendarProvider, ProviderContext, BusyBlock, ExternalEvent, CalendarProviderKind } from "./providers/types";
export { providerForKind, contextFor, noopProvider } from "./providers/index.server";
export {
  fetchHostBusyBlocks,
  pushAppointmentToCalendars,
  updateAppointmentInCalendars,
  cancelAppointmentInCalendars,
} from "./calendar-sync-engine.server";
