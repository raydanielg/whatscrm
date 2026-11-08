/**
 * Search Engine — cross-channel unified search.
 *
 * Sources:
 *   - conversations (customer name, phone, email, labels, status)
 *   - messages (full-text over `messages.text`, tsv indexed)
 *   - attachments (filename, ocr_text on images/PDFs)
 *   - customers (profile fields, custom attributes)
 *
 * Backed by Postgres FTS + pg_trgm for fuzzy match. AI Engine reranks the
 * top N when semantic search is enabled.
 */

export type SearchScope = "all" | "conversations" | "messages" | "attachments" | "customers";

export interface SearchQuery {
  workspaceId: string;
  q: string;
  scope: SearchScope;
  channels?: import("../types").ChannelKind[];
  labels?: string[];
  status?: string[];
  assignedUserId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  cursor?: string;
}
