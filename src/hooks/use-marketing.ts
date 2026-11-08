import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { sbAny } from "@/lib/supabase/untyped";

/* ---------- Types ---------- */

export type CampaignRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  message_body: string | null;
  status: string;
  type: string;
  channel: string;
  template_id: string | null;
  template_variables: Record<string, unknown>;
  media_url: string | null;
  segment_id: string | null;
  audience_tags: string[] | null;
  audience_snapshot: Record<string, unknown>;
  timezone: string;
  send_window: Record<string, unknown> | null;
  throttle_per_minute: number;
  ab_test: Record<string, unknown> | null;
  respect_opt_out: boolean;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  replied_count: number;
  clicked_count: number;
  failed_count: number;
  opted_out_count: number;
  created_at: string;
  updated_at: string;
};

export type SegmentRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  filter_definition: { conditions: Array<Record<string, unknown>>; logic: "AND" | "OR" };
  is_dynamic: boolean;
  member_count: number;
  last_computed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ConsentRow = {
  id: string;
  workspace_id: string;
  contact_id: string;
  channel: string;
  purpose: string;
  status: "opted_in" | "opted_out" | "pending" | "unsubscribed";
  source: string | null;
  effective_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DripSequenceRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "paused" | "archived";
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  segment_id: string | null;
  exit_conditions: unknown[];
  respect_opt_out: boolean;
  enrolled_count: number;
  completed_count: number;
  created_at: string;
  updated_at: string;
};

export type DripStepRow = {
  id: string;
  sequence_id: string;
  step_order: number;
  step_type: string;
  name: string | null;
  delay_seconds: number;
  template_id: string | null;
  message_body: string | null;
  media_url: string | null;
  variables: Record<string, unknown>;
  condition: Record<string, unknown> | null;
  actions: unknown[];
};

/* ---------- Campaigns ---------- */

export function useCampaigns() {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["campaigns", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("workspace_id", active!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CampaignRow[];
    },
  });
}

export function useCampaign(campaignId: string | undefined) {
  return useQuery({
    queryKey: ["campaign", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("id", campaignId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as CampaignRow | null;
    },
  });
}

export function useUpsertCampaign() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: Partial<CampaignRow> & { id?: string }) => {
      const payload = { ...input, workspace_id: input.workspace_id ?? active!.id };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await sbAny(supabase).from("campaigns").upsert(payload as any).select().single();
      if (error) throw error;
      return data as unknown as CampaignRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });
}

export function useCampaignRecipients(campaignId: string | undefined) {
  return useQuery({
    queryKey: ["campaign-recipients", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_recipients")
        // `contacts` stores the number as `phone`; selecting `phone_number`
        // made PostgREST reject the whole query, which is why the Recipients
        // panel never loaded. Aliased so consumers keep reading `phone_number`.
        .select("*, contact:contacts(id, first_name, last_name, phone_number:phone, avatar_url)")
        .eq("campaign_id", campaignId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCampaignEvents(campaignId: string | undefined) {
  return useQuery({
    queryKey: ["campaign-events", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_events")
        .select("*")
        .eq("campaign_id", campaignId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ---------- Segments ---------- */

export function useSegments() {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["segments", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_segments")
        .select("*")
        .eq("workspace_id", active!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SegmentRow[];
    },
  });
}

export function useUpsertSegment() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: Partial<SegmentRow> & { id?: string }) => {
      const payload = { ...input, workspace_id: input.workspace_id ?? active!.id };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await sbAny(supabase).from("customer_segments").upsert(payload as any).select().single();
      if (error) throw error;
      return data as unknown as SegmentRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["segments"] }),
  });
}

export function useDeleteSegment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny(supabase).from("customer_segments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["segments"] }),
  });
}

/* ---------- Consent ---------- */

export function useConsentRecords(opts?: { contactId?: string; status?: ConsentRow["status"] }) {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["consent-records", active?.id, opts?.contactId, opts?.status],
    enabled: !!active?.id,
    queryFn: async () => {
      let q = supabase
        .from("consent_records")
        .select("*, contact:contacts(id, first_name, last_name, phone_number:phone)")
        .eq("workspace_id", active!.id)
        .order("effective_at", { ascending: false })
        .limit(500);
      if (opts?.contactId) q = q.eq("contact_id", opts.contactId);
      if (opts?.status) q = q.eq("status", opts.status);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRecordConsent() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: Partial<ConsentRow>) => {
      const payload = { ...input, workspace_id: input.workspace_id ?? active!.id };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await sbAny(supabase).from("consent_records").insert(payload as any).select().single();
      if (error) throw error;
      return data as unknown as ConsentRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["consent-records"] }),
  });
}

/* ---------- Drip sequences ---------- */

export function useDripSequences() {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["drip-sequences", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drip_sequences")
        .select("*")
        .eq("workspace_id", active!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DripSequenceRow[];
    },
  });
}

export function useDripSequence(sequenceId: string | undefined) {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["drip-sequence", sequenceId, active?.id],
    enabled: !!sequenceId && !!active?.id,
    queryFn: async () => {
      const [{ data: seq, error: seqErr }, { data: steps, error: stepsErr }] = await Promise.all([
        sbAny(supabase).from("drip_sequences").select("*").eq("id", sequenceId!).eq("workspace_id", active!.id).maybeSingle(),
        sbAny(supabase).from("drip_steps").select("*").eq("sequence_id", sequenceId!).order("step_order"),
      ]);
      if (seqErr) throw seqErr;
      if (stepsErr) throw stepsErr;
      return {
        sequence: seq as unknown as DripSequenceRow | null,
        steps: (steps ?? []) as unknown as DripStepRow[],
      };
    },
  });
}

export function useUpsertDripSequence() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: Partial<DripSequenceRow> & { id?: string }) => {
      if (!active?.id) throw new Error("No workspace");
      const { id, workspace_id: _ignored, ...changes } = input;
      if (id && changes.status === "active") {
        const { data, error } = await sbAny(supabase).rpc("activate_drip_sequence", { _sequence_id: id, _workspace_id: active.id });
        if (error) throw error;
        return data as DripSequenceRow;
      }
      const table = sbAny(supabase).from("drip_sequences");
      // Partial status updates must not pass through INSERT's required-name
      // validation before ON CONFLICT. Scope updates to the active workspace.
      const request = id
        ? table.update(changes).eq("id", id).eq("workspace_id", active.id)
        : table.insert({ ...changes, workspace_id: active.id });
      const { data, error } = await request.select().single();
      if (error) throw error;
      return data as unknown as DripSequenceRow;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["drip-sequences"] });
      if (vars.id) qc.invalidateQueries({ queryKey: ["drip-sequence", vars.id] });
    },
  });
}

export function useDeleteArchivedDripSequence() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!active?.id) throw new Error("No workspace");
      const { count, error: enrollmentError } = await sbAny(supabase)
        .from("drip_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("sequence_id", id)
        .eq("status", "active");
      if (enrollmentError) throw enrollmentError;
      if (count) throw new Error("This sequence still has active enrollments. Finish or cancel them before deleting it.");
      const { data, error } = await sbAny(supabase)
        .from("drip_sequences")
        .delete()
        .eq("id", id)
        .eq("workspace_id", active.id)
        .eq("status", "archived")
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Only an archived sequence in this workspace can be deleted.");
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["drip-sequences"] });
      qc.removeQueries({ queryKey: ["drip-sequence", id] });
    },
  });
}

export function useSaveDripSequence() {
  const { active } = useCurrentWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name: string; description: string; trigger_type: string; steps: Partial<DripStepRow>[] }) => {
      if (!active?.id) throw new Error("No workspace");
      const { data, error } = await sbAny(supabase).rpc("save_drip_sequence", {
        _workspace_id: active.id, _sequence_id: input.id,
        _header: { name: input.name.trim(), description: input.description, trigger_type: input.trigger_type },
        _steps: input.steps,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["drip-sequences"] });
      qc.invalidateQueries({ queryKey: ["drip-sequence", id] });
    },
  });
}

export function useEnrollDripContact() {
  const { active } = useCurrentWorkspace();
  const qc=useQueryClient();
  return useMutation({
    mutationFn: async ({ sequenceId, contactId }: { sequenceId: string; contactId: string }) => {
      if (!active?.id) throw new Error("No workspace");
      const { data,error }=await sbAny(supabase).rpc("enroll_drip_contact",{ _workspace_id:active.id,_sequence_id:sequenceId,_contact_id:contactId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey:["drip-sequences"] }),
  });
}

/* ---------- Realtime ---------- */

export function useMarketingRealtime() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  useEffect(() => {
    if (!active?.id) return;

    // Throttle campaigns invalidations so bursts of recipient/event updates
    // don't thrash the dashboard queries.
    let campaignsTimer: ReturnType<typeof setTimeout> | null = null;
    const invalidateCampaigns = () => {
      if (campaignsTimer) return;
      campaignsTimer = setTimeout(() => {
        campaignsTimer = null;
        qc.invalidateQueries({ queryKey: ["campaigns"] });
        qc.invalidateQueries({ queryKey: ["campaign"] });
      }, 500);
    };

    const channel = supabase
      .channel(`marketing-${active.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "campaigns" }, () => {
        qc.invalidateQueries({ queryKey: ["campaigns"] });
        qc.invalidateQueries({ queryKey: ["campaign"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_recipients" }, () => {
        qc.invalidateQueries({ queryKey: ["campaign-recipients"] });
        invalidateCampaigns();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_events" }, () => {
        qc.invalidateQueries({ queryKey: ["campaign-events"] });
        invalidateCampaigns();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_dispatch_queue" }, () => {
        qc.invalidateQueries({ queryKey: ["campaign-dispatch-pending"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_segments" }, () => qc.invalidateQueries({ queryKey: ["segments"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "consent_records" }, () => qc.invalidateQueries({ queryKey: ["consent-records"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "drip_sequences" }, () => qc.invalidateQueries({ queryKey: ["drip-sequences"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "drip_steps" }, () => qc.invalidateQueries({ queryKey: ["drip-sequence"] }))
      .subscribe();
    return () => {
      if (campaignsTimer) clearTimeout(campaignsTimer);
      supabase.removeChannel(channel);
    };
  }, [active?.id, qc]);
}

