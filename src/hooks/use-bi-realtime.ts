// Invalidates BI-related react-query caches whenever the BI publication tables change.
// Mount once at the top of the BI hub so every tab benefits from fresh data without polling.
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const BI_TABLES = ["bi_kpi_snapshots", "bi_report_runs", "bi_calc_queue", "bi_widgets", "bi_dashboards"] as const;

export function useBiRealtime(workspaceId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!workspaceId) return;
    const channel = supabase.channel(`bi:${workspaceId}`);
    for (const table of BI_TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `workspace_id=eq.${workspaceId}` },
        () => {
          // Coarse-grained invalidation — cheap, correct, and keeps every BI tab in sync.
          qc.invalidateQueries({ queryKey: ["bi"], exact: false });
          qc.invalidateQueries({ queryKey: ["bi.health", workspaceId] });
          qc.invalidateQueries({ queryKey: ["bi.reports.min", workspaceId] });
        },
      );
    }
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [workspaceId, qc]);
}
