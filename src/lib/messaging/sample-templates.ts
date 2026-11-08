/**
 * Meta ships every new WhatsApp Business Account with a set of pre-approved
 * "sample" templates (`sample_shipping_confirmation`, `hello_world`, ).
 * They are owned by Meta, not by the WABA, so the Graph API rejects any edit
 * or delete with:
 *
 *   (#100) Sample templates cannot be edited or deleted.
 *
 * This module is client-safe (no server-only imports) so the UI and the
 * server functions agree on what counts as a sample template.
 */

/** Sample templates Meta seeds that do not carry the `sample_` prefix. */
const KNOWN_SAMPLE_NAMES = new Set(["hello_world"]);

/** Is this a Meta-owned sample template (read-only, cannot be edited/deleted)? */
export function isSampleTemplate(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return n.startsWith("sample_") || KNOWN_SAMPLE_NAMES.has(n);
}

/** Explanation shown wherever a sample template blocks an action. */
export const SAMPLE_TEMPLATE_MESSAGE =
  "Sample templates cannot be edited or deleted — they are owned by Meta. Use “Add language variant” or create a new template with your own name and copy the content across.";

/** Throwable guard for server-side edit/delete paths. */
export function assertNotSampleTemplate(name: string | null | undefined): void {
  if (isSampleTemplate(name)) {
    throw new Error(`Sample templates cannot be edited or deleted\n${SAMPLE_TEMPLATE_MESSAGE}`);
  }
}
