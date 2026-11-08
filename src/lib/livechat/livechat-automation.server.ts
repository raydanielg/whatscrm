/**
 * Live Chat automation dispatcher.
 *
 * Called from the public widget-track endpoint after every visitor event.
 * Walks active automations whose trigger is a `trigger.livechat.*` node and
 * enqueues a workflow_queue row for each match. Match evaluation is cheap:
 * a single scan through the workspace's Live Chat automations with a shallow
 * config check. Anything heavier (session state, aggregates) is delegated
 * to the workflow engine itself.
 */

import type { SupabaseLike } from "@/lib/workflows/engine.server";
import { sbAny } from "@/lib/supabase/untyped";

type Visitor = {
  id: string;
  workspace_id: string;
  session_id?: string | null;
  contact_id?: string | null;
  display_name?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  language?: string | null;
  device_type?: string | null;
  visits_count?: number | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
};

type EventInput = {
  eventType: "pageview" | "custom" | "identify" | string;
  eventName?: string | null;
  url?: string | null;
  properties?: Record<string, unknown> | null;
};

type AutomationRow = {
  id: string;
  workspace_id: string;
  status: string | null;
  graph: {
    nodes: Array<{ id: string; type: string; config?: Record<string, unknown> }>;
    edges?: unknown[];
  } | null;
};

function includesCi(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack || !needle) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function matches(
  triggerType: string,
  cfg: Record<string, unknown>,
  visitor: Visitor,
  ev: EventInput,
): boolean {
  const url = ev.url ?? "";
  const props = ev.properties ?? {};

  switch (triggerType) {
    case "trigger.livechat.time_on_page": {
      if (ev.eventName !== "time_on_page") return false;
      const need = Number(cfg.seconds ?? 0);
      const have = Number((props as Record<string, unknown>).seconds ?? 0);
      const pageOk = !cfg.page || includesCi(url, String(cfg.page));
      return have >= need && pageOk;
    }
    case "trigger.livechat.exit_intent": {
      if (ev.eventName !== "exit_intent") return false;
      const pageOk = !cfg.page || includesCi(url, String(cfg.page));
      const minSec = Number(cfg.min_seconds ?? 0);
      const have = Number((props as Record<string, unknown>).seconds ?? 0);
      return pageOk && have >= minSec;
    }
    case "trigger.livechat.scroll_percent": {
      if (ev.eventName !== "scroll") return false;
      const need = Number(cfg.percent ?? 0);
      const have = Number((props as Record<string, unknown>).percent ?? 0);
      const pageOk = !cfg.page || includesCi(url, String(cfg.page));
      return have >= need && pageOk;
    }
    case "trigger.livechat.visited_url": {
      if (ev.eventType !== "pageview") return false;
      const pattern = String(cfg.pattern ?? "");
      if (!pattern) return false;
      const mode = String(cfg.match_type ?? "contains");
      if (mode === "equals") return url === pattern;
      if (mode === "regex") {
        try {
          return new RegExp(pattern).test(url);
        } catch {
          return false;
        }
      }
      return includesCi(url, pattern);
    }
    case "trigger.livechat.returning_visitor": {
      if (ev.eventType !== "pageview") return false;
      const min = Number(cfg.min_visits ?? 2);
      return (visitor.visits_count ?? 0) >= min;
    }
    case "trigger.livechat.cart_value": {
      if (ev.eventName !== "cart_updated") return false;
      const min = Number(cfg.min_value ?? 0);
      const have = Number((props as Record<string, unknown>).value ?? 0);
      return have >= min;
    }
    case "trigger.livechat.campaign_source": {
      if (ev.eventType !== "pageview") return false;
      const src = cfg.utm_source ? String(cfg.utm_source) : null;
      const med = cfg.utm_medium ? String(cfg.utm_medium) : null;
      const camp = cfg.utm_campaign ? String(cfg.utm_campaign) : null;
      if (src && (visitor.utm_source ?? "").toLowerCase() !== src.toLowerCase()) return false;
      if (med && (visitor.utm_medium ?? "").toLowerCase() !== med.toLowerCase()) return false;
      if (camp && (visitor.utm_campaign ?? "").toLowerCase() !== camp.toLowerCase()) return false;
      return !!(src || med || camp);
    }
    case "trigger.livechat.country": {
      const list = String(cfg.countries ?? "")
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);
      return !!visitor.country && list.includes(visitor.country.toUpperCase());
    }
    case "trigger.livechat.device": {
      const want = String(cfg.device ?? "").toLowerCase();
      return !!visitor.device_type && visitor.device_type.toLowerCase() === want;
    }
    case "trigger.livechat.language": {
      const list = String(cfg.languages ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const l = (visitor.language ?? "").toLowerCase().split("-")[0];
      return !!l && list.some((x) => x === l);
    }
    case "trigger.livechat.business_hours": {
      // Simple heuristic — real business-hours check happens inside the engine
      // if the workflow uses an ai/logic node. Here we always allow through and
      // let the engine skip via a condition node when needed.
      return true;
    }
    case "trigger.livechat.custom_event": {
      if (ev.eventType !== "custom") return false;
      return ev.eventName === String(cfg.event_name ?? "");
    }
    default:
      return false;
  }
}

export async function dispatchLivechatAutomations(opts: {
  supabase: SupabaseLike;
  workspaceId: string;
  visitor: Visitor;
  event: EventInput;
}): Promise<{ enqueued: number }> {
  const { supabase, workspaceId, visitor, event } = opts;

  const { data: rows } = await supabase
    .from("automations")
    .select("id, workspace_id, status, graph")
    .eq("workspace_id", workspaceId)
    .eq("status", "active");

  const automations = (rows as AutomationRow[] | null) ?? [];
  if (!automations.length) return { enqueued: 0 };

  const toEnqueue: Array<{ id: string; triggerType: string; cfg: Record<string, unknown> }> = [];

  for (const a of automations) {
    const trigger = a.graph?.nodes?.find((n) => n.type.startsWith("trigger.livechat."));
    if (!trigger) continue;
    const cfg = (trigger.config ?? {}) as Record<string, unknown>;
    if (matches(trigger.type, cfg, visitor, event)) {
      toEnqueue.push({ id: a.id, triggerType: trigger.type, cfg });
    }
  }

  if (!toEnqueue.length) return { enqueued: 0 };

  const now = new Date().toISOString();
  const inputBase = {
    visitor,
    session_id: visitor.session_id ?? null,
    contact_id: visitor.contact_id ?? null,
    event: {
      type: event.eventType,
      name: event.eventName ?? null,
      url: event.url ?? null,
      properties: event.properties ?? {},
    },
  };

  const rowsToInsert = toEnqueue.map((m) => ({
    workspace_id: workspaceId,
    automation_id: m.id,
    trigger_source: `livechat:${m.triggerType}`,
    input: inputBase,
    run_at: now,
    priority: 5,
    max_attempts: 3,
    status: "pending",
  }));

  const { error } = await sbAny(supabase).from("workflow_queue").insert(rowsToInsert);
  if (error) {
    // Non-fatal — tracking must never break for a workflow issue.
    console.warn("[livechat-automation] enqueue failed:", error.message);
    return { enqueued: 0 };
  }
  return { enqueued: rowsToInsert.length };
}
