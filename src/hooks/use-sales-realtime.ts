import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";

/**
 * Enterprise Sales CRM realtime layer. Subscribes to all pipeline-related tables
 * for the active workspace and invalidates the relevant TanStack Query caches.
 * Mount once per page (Deals, Quotes, Invoices, Products, Forecasting, Deal detail).
 */
export function useSalesRealtime() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const wsId = active?.id;

  useEffect(() => {
    if (!wsId) return;
    const filter = `workspace_id=eq.${wsId}`;
    const channel = supabase
      .channel(`sales-crm:${wsId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deals", filter }, () => {
        qc.invalidateQueries({ queryKey: ["deals"] });
        qc.invalidateQueries({ queryKey: ["deal"] });
        qc.invalidateQueries({ queryKey: ["forecast-deals"] });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deal_stages", filter },
        () => {
          qc.invalidateQueries({ queryKey: ["deal_stages"] });
          qc.invalidateQueries({ queryKey: ["deal_pipelines"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deal_pipelines", filter },
        () => {
          qc.invalidateQueries({ queryKey: ["deal_pipelines"] });
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "quotes", filter }, () => {
        qc.invalidateQueries({ queryKey: ["quotes"] });
        qc.invalidateQueries({ queryKey: ["quote"] });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quote_line_items", filter },
        () => {
          qc.invalidateQueries({ queryKey: ["quote"] });
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices", filter }, () => {
        qc.invalidateQueries({ queryKey: ["invoices"] });
        qc.invalidateQueries({ queryKey: ["invoice"] });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoice_line_items", filter },
        () => {
          qc.invalidateQueries({ queryKey: ["invoice"] });
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter }, () => {
        qc.invalidateQueries({ queryKey: ["invoice_payments"] });
        qc.invalidateQueries({ queryKey: ["invoice"] });
        qc.invalidateQueries({ queryKey: ["invoices"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter }, () => {
        qc.invalidateQueries({ queryKey: ["products"] });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales_goals", filter },
        () => {
          qc.invalidateQueries({ queryKey: ["sales_goals"] });
          qc.invalidateQueries({ queryKey: ["forecast-goals"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [wsId, qc]);
}
