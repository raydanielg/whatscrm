/**
 * Tenant-scoped repair targets for unsupported channel providers.
 *
 * Client-safe constants shared by the in-app notification banner and the
 * workspace-scoped repair server functions. Kept out of the `.functions.ts`
 * module so server-function splitting never strips them.
 */

/**
 * Providers that can be written back to `channel_accounts.provider`: the
 * intersection of the database `messaging_provider` enum and the values the
 * inbox knows how to route.
 */
export const TENANT_REMAP_TARGETS = ["whatsapp_cloud", "twilio", "dialog360"] as const;

export type TenantRemapTarget = (typeof TENANT_REMAP_TARGETS)[number];

export const TENANT_REMAP_LABELS: Record<TenantRemapTarget, string> = {
  whatsapp_cloud: "WhatsApp Cloud API (Meta)",
  twilio: "Twilio",
  dialog360: "360dialog",
};
