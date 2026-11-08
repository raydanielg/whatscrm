/**
 * Customer Identity Engine — merges per-channel identities into ONE customer.
 *
 * A customer can be reached over:
 *   - WhatsApp number
 *   - IG PSID
 *   - Messenger PSID
 *   - Telegram chat id
 *   - Email address
 *   - Live chat visitor id
 *   - SMS number
 *   - Discord/Slack/Teams user id
 *
 * The engine resolves an inbound identity to a `customer_id`, creating one
 * if needed, and stores the per-channel handle in `channel_identities`.
 */

import type { ChannelIdentity, ChannelKind, UnifiedCustomerRef } from "../types";

export interface ResolveIdentityInput {
  workspaceId: string;
  channel: ChannelKind;
  externalId: string;
  displayName?: string;
  avatarUrl?: string;
  hints?: {
    phone?: string;
    email?: string;
    /** If provided, merge into this existing customer instead of matching. */
    customerId?: string;
  };
}

export interface ResolveIdentityResult {
  customer: UnifiedCustomerRef;
  identity: ChannelIdentity;
  created: boolean;
}

/**
 * Deterministic matcher priority:
 *   1. Explicit `hints.customerId`
 *   2. Existing `channel_identities` row for (workspace, channel, externalId)
 *   3. Existing customer with matching phone (WA/SMS) or email
 *   4. Create new customer + identity
 *
 * Manual merge via UI moves identities between customer_ids.
 */
export const identityEngineContract = {
  matcherPriority: [
    "explicit_customer_id",
    "existing_channel_identity",
    "phone_or_email_match",
    "create_new",
  ] as const,
};
