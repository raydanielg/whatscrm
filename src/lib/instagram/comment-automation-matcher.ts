/**
 * Priority + conflict-aware matcher for Instagram comment automations.
 *
 * Given a set of automations that fire on `instagram_comment` and an incoming
 * comment, decide which ones actually run.
 *
 * Rules:
 *  - Only `status === "active"` automations are considered.
 *  - Automations are sorted by `trigger_config.priority` ascending (default 100).
 *    Lower priority number = runs first.
 *  - Ties fall back to `updated_at` descending (most recent wins).
 *  - When an automation matches, it is appended to the result list.
 *  - If that automation's `conflict_mode` is `"stop_on_match"` (default),
 *    iteration halts — no lower-priority automations run for this comment.
 *  - If it is `"run_all"`, iteration continues to the next candidate.
 *
 * This module is deliberately dependency-free so it can be shared by
 * server-side webhook processors and client-side test simulators.
 */

export type CommentAutomationConfig = {
  instagram_account_id?: string;
  post_scope?: "all" | "specific";
  post_ids?: string[];
  keywords?: string[];
  match_mode?: "any" | "all" | "exact";
  priority?: number;
  conflict_mode?: "stop_on_match" | "run_all";
  [key: string]: unknown;
};

export type AutomationCandidate = {
  id: string;
  status: string;
  updated_at?: string | null;
  trigger_config: CommentAutomationConfig | null | undefined;
};

export type CommentEvent = {
  text: string;
  instagram_account_id?: string;
  post_id?: string;
};

export type MatchResult<T extends AutomationCandidate> = {
  automation: T;
  reason: string;
};

function keywordMatch(text: string, cfg: CommentAutomationConfig): boolean {
  const keywords = (cfg.keywords ?? []).map((k) => k.toLowerCase()).filter(Boolean);
  if (keywords.length === 0) return true;
  const t = text.toLowerCase().trim();
  const mode = cfg.match_mode ?? "any";
  if (mode === "exact") return keywords.some((k) => t === k);
  const hits = keywords.filter((k) => t.includes(k));
  if (mode === "all") return hits.length === keywords.length;
  return hits.length > 0;
}

function scopeMatch(cfg: CommentAutomationConfig, postId: string | undefined): boolean {
  if (cfg.post_scope !== "specific") return true;
  if (!postId) return false;
  return (cfg.post_ids ?? []).includes(postId);
}

function accountMatch(cfg: CommentAutomationConfig, accountId: string | undefined): boolean {
  if (!cfg.instagram_account_id) return true;
  if (!accountId) return true; // simulator may omit account
  return cfg.instagram_account_id === accountId;
}

export function sortByPriority<T extends AutomationCandidate>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const pa = a.trigger_config?.priority ?? 100;
    const pb = b.trigger_config?.priority ?? 100;
    if (pa !== pb) return pa - pb;
    return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
  });
}

/**
 * Resolve which active automations should run for a given comment,
 * respecting per-automation priority and conflict_mode.
 */
export function resolveMatchingAutomations<T extends AutomationCandidate>(
  rows: T[],
  event: CommentEvent,
): MatchResult<T>[] {
  const active = rows.filter((r) => r.status === "active");
  const ordered = sortByPriority(active);
  const winners: MatchResult<T>[] = [];

  for (const row of ordered) {
    const cfg = row.trigger_config ?? {};
    if (!accountMatch(cfg, event.instagram_account_id)) continue;
    if (!scopeMatch(cfg, event.post_id)) continue;
    if (!keywordMatch(event.text, cfg)) continue;

    winners.push({
      automation: row,
      reason: `Matched at priority ${cfg.priority ?? 100}`,
    });

    if ((cfg.conflict_mode ?? "stop_on_match") === "stop_on_match") break;
  }

  return winners;
}
