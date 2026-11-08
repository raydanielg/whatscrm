import type { MetricKey } from "@/lib/bi/types";

export interface MetricCatalogItem {
  key: MetricKey;
  label: string;
  category: "conversations" | "sales" | "marketing" | "ai" | "workflow" | "crm";
  unit: "count" | "currency" | "percent";
}

export const AVAILABLE_METRICS_UI: MetricCatalogItem[] = [
  { key: "conversations.total",    label: "Conversations — Total",    category: "conversations", unit: "count" },
  { key: "conversations.open",     label: "Conversations — Open",     category: "conversations", unit: "count" },
  { key: "conversations.resolved", label: "Conversations — Resolved", category: "conversations", unit: "count" },
  { key: "messages.sent",          label: "Messages Sent",            category: "conversations", unit: "count" },
  { key: "messages.delivered",     label: "Messages Delivered",       category: "conversations", unit: "count" },
  { key: "messages.read",          label: "Messages Read",            category: "conversations", unit: "count" },
  { key: "messages.failed",        label: "Messages Failed",          category: "conversations", unit: "count" },
  { key: "deals.count",            label: "Deals — Count",            category: "sales", unit: "count" },
  { key: "deals.won",              label: "Deals Won",                category: "sales", unit: "count" },
  { key: "deals.revenue",          label: "Revenue (Won)",            category: "sales", unit: "currency" },
  { key: "deals.pipeline_value",   label: "Pipeline Value",           category: "sales", unit: "currency" },
  { key: "campaigns.sent",         label: "Campaigns — Sent",         category: "marketing", unit: "count" },
  { key: "campaigns.delivered",    label: "Campaigns — Delivered",    category: "marketing", unit: "count" },
  { key: "campaigns.ctr",          label: "Campaigns — Clicks",       category: "marketing", unit: "count" },
  { key: "ai.requests",            label: "AI Requests",              category: "ai", unit: "count" },
  { key: "ai.tokens",              label: "AI Tokens",                category: "ai", unit: "count" },
  { key: "ai.cost",                label: "AI Cost",                  category: "ai", unit: "currency" },
  { key: "workflow.runs",          label: "Workflow Runs",            category: "workflow", unit: "count" },
  { key: "workflow.errors",        label: "Workflow Errors",          category: "workflow", unit: "count" },
  { key: "contacts.new",           label: "New Contacts",             category: "crm", unit: "count" },
  { key: "leads.new",              label: "New Leads",                category: "crm", unit: "count" },
  { key: "leads.qualified",        label: "Qualified Leads",          category: "crm", unit: "count" },
];
