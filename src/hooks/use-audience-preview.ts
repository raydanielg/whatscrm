/**
 * Count, before anything is queued, how many contacts a campaign can actually
 * reach and how many will be skipped.
 *
 * The Review step used to show only the audience's name. An operator could
 * therefore launch a campaign into a segment where every contact lacked a
 * usable WhatsApp number and only discover it from the run report. This resolves
 * the same audience the server resolves, and partitions it with the same
 * `partitionRecipients` rule the enqueue path uses, so the number on screen is
 * the number that will be queued.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sbAny } from "@/lib/supabase/untyped";
import {
  partitionRecipients,
  type IneligibleRecipient,
} from "@/lib/marketing/recipient-eligibility";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Hard cap on the preview. Beyond this the count is reported as partial. */
export const AUDIENCE_PREVIEW_LIMIT = 5000;

export interface AudienceSelection {
  workspaceId: string | undefined;
  segmentId?: string | null;
  contactListId?: string | null;
  respectOptOut: boolean;
}

export interface AudiencePreview {
  eligible: number;
  skipped: number;
  total: number;
  /** True when the audience is larger than the preview cap. */
  partial: boolean;
  /** Skip reasons and how many contacts hit each, for the Review step. */
  reasons: Array<{ reason: IneligibleRecipient["reason"]; count: number }>;
}

async function resolveContactIds(sel: AudienceSelection): Promise<string[]> {
  const ws = sel.workspaceId!;
  if (sel.contactListId) {
    const { data } = await sbAny(supabase)
      .from("contact_list_members")
      .select("contact_id")
      .eq("list_id", sel.contactListId)
      .limit(AUDIENCE_PREVIEW_LIMIT + 1);
    return ((data ?? []) as any[]).map((r) => r.contact_id).filter(Boolean);
  }
  if (sel.segmentId) {
    const { data } = await sbAny(supabase)
      .from("segment_members")
      .select("contact_id")
      .eq("segment_id", sel.segmentId)
      .limit(AUDIENCE_PREVIEW_LIMIT + 1);
    return ((data ?? []) as any[]).map((r) => r.contact_id).filter(Boolean);
  }
  const { data } = await sbAny(supabase)
    .from("contacts")
    .select("id")
    .eq("workspace_id", ws)
    .limit(AUDIENCE_PREVIEW_LIMIT + 1);
  return ((data ?? []) as any[]).map((r) => r.id);
}

export function useAudiencePreview(sel: AudienceSelection, enabled = true) {
  return useQuery<AudiencePreview>({
    queryKey: [
      "audience-preview",
      sel.workspaceId,
      sel.contactListId ?? null,
      sel.segmentId ?? null,
      sel.respectOptOut,
    ],
    enabled: enabled && !!sel.workspaceId,
    staleTime: 30_000,
    queryFn: async () => {
      const ids = await resolveContactIds(sel);
      const partial = ids.length > AUDIENCE_PREVIEW_LIMIT;
      const capped = ids.slice(0, AUDIENCE_PREVIEW_LIMIT);
      if (capped.length === 0) {
        return { eligible: 0, skipped: 0, total: 0, partial: false, reasons: [] };
      }

      const { data: contacts } = await sbAny(supabase)
        .from("contacts")
        .select("id, phone, whatsapp")
        .eq("workspace_id", sel.workspaceId!)
        .in("id", capped);

      let optedOut = new Set<string>();
      if (sel.respectOptOut) {
        const { data: consent } = await sbAny(supabase)
          .from("consent_records")
          .select("contact_id, status")
          .eq("workspace_id", sel.workspaceId!)
          .in("contact_id", capped);
        optedOut = new Set(
          ((consent ?? []) as any[])
            .filter((r) => r.status === "opted_out" || r.status === "unsubscribed")
            .map((r) => r.contact_id as string),
        );
      }

      const { eligible, ineligible } = partitionRecipients(
        ((contacts ?? []) as any[]).map((c) => ({
          id: c.id,
          phone: c.phone,
          whatsapp: c.whatsapp,
        })),
        optedOut,
      );

      const byReason = new Map<IneligibleRecipient["reason"], number>();
      for (const r of ineligible) byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + 1);

      return {
        eligible: eligible.length,
        skipped: ineligible.length,
        total: eligible.length + ineligible.length,
        partial,
        reasons: [...byReason.entries()].map(([reason, count]) => ({ reason, count })),
      };
    },
  });
}
