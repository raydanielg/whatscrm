import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { useTenantCurrency } from "@/hooks/use-currency";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

export type SearchEntity = "contact" | "company" | "lead" | "deal" | "task";

export type SearchHit = {
  id: string;
  entity: SearchEntity;
  title: string;
  subtitle?: string | null;
  extra?: string | null;
};

const LIMIT = 8;

async function searchContacts(ws: string, q: string): Promise<SearchHit[]> {
  const { data } = await db
    .from("contacts")
    .select("id, first_name, last_name, display_name, email, job_title")
    .eq("workspace_id", ws)
    .is("deleted_at", null)
    .or(`display_name.ilike.%${sanitizeSearchTerm(q)}%,first_name.ilike.%${sanitizeSearchTerm(q)}%,last_name.ilike.%${sanitizeSearchTerm(q)}%,email.ilike.%${sanitizeSearchTerm(q)}%`)
    .limit(LIMIT);
  return (data ?? []).map((r: any) => ({
    id: r.id, entity: "contact" as const,
    title: r.display_name || [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email || "Contact",
    subtitle: r.job_title || r.email,
    extra: null,
  }));
}
async function searchCompanies(ws: string, q: string): Promise<SearchHit[]> {
  const { data } = await db
    .from("companies")
    .select("id, name, industry, website, city, country")
    .eq("workspace_id", ws)
    .is("deleted_at", null)
    .or(`name.ilike.%${sanitizeSearchTerm(q)}%,website.ilike.%${sanitizeSearchTerm(q)}%,industry.ilike.%${sanitizeSearchTerm(q)}%,city.ilike.%${sanitizeSearchTerm(q)}%`)
    .limit(LIMIT);
  return (data ?? []).map((r: any) => ({
    id: r.id, entity: "company" as const,
    title: r.name, subtitle: r.industry,
    extra: [r.city, r.country].filter(Boolean).join(", ") || r.website,
  }));
}
async function searchLeads(ws: string, q: string): Promise<SearchHit[]> {
  const { data } = await db
    .from("leads")
    .select("id, first_name, last_name, email, company_name, status, source")
    .eq("workspace_id", ws)
    .is("deleted_at", null)
    .or(`first_name.ilike.%${sanitizeSearchTerm(q)}%,last_name.ilike.%${sanitizeSearchTerm(q)}%,email.ilike.%${sanitizeSearchTerm(q)}%,company_name.ilike.%${sanitizeSearchTerm(q)}%`)
    .limit(LIMIT);
  return (data ?? []).map((r: any) => ({
    id: r.id, entity: "lead" as const,
    title: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email || "Lead",
    subtitle: r.company_name || r.email,
    extra: `${r.status ?? ""}${r.source ? ` · ${r.source}` : ""}`,
  }));
}
async function searchDeals(ws: string, q: string, fallbackCurrency: string): Promise<SearchHit[]> {
  const { data } = await db
    .from("deals")
    .select("id, title, amount, currency, status")
    .eq("workspace_id", ws)
    .is("deleted_at", null)
    .ilike("title", `%${sanitizeSearchTerm(q)}%`)
    .limit(LIMIT);
  return (data ?? []).map((r: any) => ({
    id: r.id, entity: "deal" as const,
    title: r.title,
    subtitle: `${r.currency ?? fallbackCurrency} ${Number(r.amount ?? 0).toLocaleString()}`,
    extra: r.status,
  }));
}
async function searchTasks(ws: string, q: string): Promise<SearchHit[]> {
  const { data } = await db
    .from("tasks")
    .select("id, title, status, priority, due_at")
    .eq("workspace_id", ws)
    .is("deleted_at", null)
    .ilike("title", `%${sanitizeSearchTerm(q)}%`)
    .limit(LIMIT);
  return (data ?? []).map((r: any) => ({
    id: r.id, entity: "task" as const,
    title: r.title, subtitle: r.status, extra: r.priority,
  }));
}

// Every searcher takes the tenant currency so a deal without one of its own is
// still labelled correctly; the searchers that do not need it simply ignore it.
const SEARCHERS: Record<
  SearchEntity,
  (ws: string, q: string, fallbackCurrency: string) => Promise<SearchHit[]>
> = {
  contact: searchContacts, company: searchCompanies, lead: searchLeads, deal: searchDeals, task: searchTasks,
};

export function useCrmSearch(query: string, entities?: SearchEntity[]) {
  const { data: ws } = useCurrentWorkspace();
  const tenantCurrency = useTenantCurrency();
  const q = query.trim();
  const list = useMemo(() => entities ?? (Object.keys(SEARCHERS) as SearchEntity[]), [entities]);

  const [debounced, setDebounced] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 180);
    return () => clearTimeout(t);
  }, [q]);

  return useQuery({
    queryKey: ["crm-search", ws?.id, debounced, list.join(","), tenantCurrency],
    enabled: !!ws?.id && debounced.length >= 2,
    queryFn: async (): Promise<Record<SearchEntity, SearchHit[]>> => {
      const results = await Promise.all(
        list.map((e) => SEARCHERS[e](ws!.id, debounced, tenantCurrency)),
      );
      const out = { contact: [], company: [], lead: [], deal: [], task: [] } as Record<SearchEntity, SearchHit[]>;
      list.forEach((e, i) => { out[e] = results[i]; });
      return out;
    },
    staleTime: 15_000,
  });
}
