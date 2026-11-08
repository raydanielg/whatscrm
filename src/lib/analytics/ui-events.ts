/**
 * Lightweight client-side UI analytics.
 *
 * Thin typed wrapper over the shared analytics runtime so in-app product
 * events go through the same configurable provider as marketing events.
 */
import { trackEvent, type AnalyticsProps } from "./client";

export type UiEventName =
  | "inbox.conversation_menu.open"
  | "inbox.conversation_menu.action"
  | "inbox.conversation_menu.close";

export type UiEventProps = AnalyticsProps;

export function trackUiEvent(name: UiEventName, props: UiEventProps = {}): void {
  trackEvent(name, { ...props, ts: Date.now() });
}
