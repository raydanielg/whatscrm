// Shared types for the Export Center (client-safe)
export type ExportDataset =
  | "report" | "crm_contacts" | "crm_companies" | "crm_deals" | "crm_leads"
  | "campaigns" | "conversations" | "messages" | "tasks" | "activities";

export type ExportFormat = "pdf" | "excel" | "csv" | "json";

export type ExportStatus = "queued" | "running" | "success" | "failed" | "cancelled";

export type ExportRecurrence = "once" | "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

export interface ExportFilters {
  from?: string;
  to?: string;
  status?: string;
  tags?: string[];
  limit?: number;
  [key: string]: unknown;
}

export interface DatasetOption {
  id: ExportDataset;
  label: string;
  description: string;
  category: "reports" | "crm" | "marketing" | "conversations" | "operations";
  requiresReport?: boolean;
}

export const DATASET_CATALOG: DatasetOption[] = [
  { id: "report", label: "Saved Report", description: "Export the rows produced by a saved BI report", category: "reports", requiresReport: true },
  { id: "crm_contacts", label: "Contacts", description: "All CRM contacts with core fields", category: "crm" },
  { id: "crm_companies", label: "Companies", description: "All companies in the CRM", category: "crm" },
  { id: "crm_deals", label: "Deals", description: "Deals with stage, amount, and owner", category: "crm" },
  { id: "crm_leads", label: "Leads", description: "Leads with qualification data", category: "crm" },
  { id: "campaigns", label: "Campaigns", description: "Marketing campaigns and performance summary", category: "marketing" },
  { id: "conversations", label: "Conversations", description: "Conversation index with contact & status", category: "conversations" },
  { id: "messages", label: "Messages", description: "Individual message log entries", category: "conversations" },
  { id: "tasks", label: "Tasks", description: "Open and completed tasks", category: "operations" },
  { id: "activities", label: "Activity Feed", description: "Recent user & system activities", category: "operations" },
];

export const FORMAT_LABELS: Record<ExportFormat, string> = {
  pdf: "PDF", excel: "Excel (.xlsx)", csv: "CSV", json: "JSON",
};

export const RECURRENCE_LABELS: Record<ExportRecurrence, string> = {
  once: "One-time",
  daily: "Every day",
  weekly: "Every Monday",
  monthly: "First of every month",
  quarterly: "Every quarter",
  yearly: "Every year",
};

export const RECURRENCE_CRON: Record<Exclude<ExportRecurrence, "once">, string> = {
  daily: "0 8 * * *",
  weekly: "0 8 * * 1",
  monthly: "0 8 1 * *",
  quarterly: "0 8 1 1,4,7,10 *",
  yearly: "0 8 1 1 *",
};
