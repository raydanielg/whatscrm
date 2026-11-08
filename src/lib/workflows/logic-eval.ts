/**
 * Shared logic-node evaluators for the workflow engine.
 * Pure, side-effect free — safe on both server and client (used for previews).
 *
 * Every function receives already-interpolated `input` (template variables
 * resolved) and returns a plain result object that becomes the node's output
 * variables in the run context.
 */

export type LogicResult = { result: boolean } & Record<string, unknown>;

const truthy = (v: unknown): boolean => {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s !== "" && s !== "false" && s !== "0" && s !== "null" && s !== "undefined";
  }
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return Boolean(v);
};

const toStr = (v: unknown, cs = true): string => {
  const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  return cs ? s : s.toLowerCase();
};

const toNum = (v: unknown): number => {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").trim());
  return Number.isNaN(n) ? NaN : n;
};

const toDate = (v: unknown): Date | null => {
  if (v == null || v === "") return null;
  if (typeof v === "string" && v.trim().toLowerCase() === "now") return new Date();
  // duration shorthand handled elsewhere; here strict date parsing
  const d = new Date(v as string | number | Date);
  return isNaN(d.getTime()) ? null : d;
};

/** Parse duration like "7d", "12h", "30m", "45s" into milliseconds. */
const parseDurationMs = (v: unknown): number | null => {
  const s = String(v ?? "").trim().toLowerCase();
  const m = /^(-?\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)?$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] ?? "s";
  const factor: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  return n * factor[unit];
};

export function evalBoolean(input: Record<string, unknown>): LogicResult {
  return { result: truthy(input.expression) };
}

export function evalNot(input: Record<string, unknown>): LogicResult {
  return { result: !truthy(input.expression) };
}

const coerceConditions = (raw: unknown): unknown[] => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : [p]; } catch { return [raw]; }
  }
  return raw == null ? [] : [raw];
};

export function evalAnd(input: Record<string, unknown>): LogicResult {
  const conds = coerceConditions(input.conditions);
  return { result: conds.length > 0 && conds.every(truthy) };
}
export function evalOr(input: Record<string, unknown>): LogicResult {
  const conds = coerceConditions(input.conditions);
  return { result: conds.some(truthy) };
}

export function evalCompareText(input: Record<string, unknown>): LogicResult {
  const cs = Boolean(input.case_sensitive);
  const l = toStr(input.left, cs);
  const r = toStr(input.right, cs);
  const op = String(input.operator ?? "equals");
  let result = false;
  switch (op) {
    case "equals": result = l === r; break;
    case "not_equals": result = l !== r; break;
    case "contains": result = l.includes(r); break;
    case "not_contains": result = !l.includes(r); break;
    case "starts_with": result = l.startsWith(r); break;
    case "ends_with": result = l.endsWith(r); break;
    case "regex": try { result = new RegExp(String(input.right ?? ""), cs ? "" : "i").test(toStr(input.left, true)); } catch { result = false; } break;
    case "is_empty": result = l.length === 0; break;
    case "is_not_empty": result = l.length > 0; break;
  }
  return { result };
}

export function evalCompareNumber(input: Record<string, unknown>): LogicResult {
  const l = toNum(input.left);
  const r = toNum(input.right);
  const u = toNum(input.right_upper);
  const op = String(input.operator ?? "eq");
  if (Number.isNaN(l) || (op !== "between" && Number.isNaN(r))) return { result: false };
  let result = false;
  switch (op) {
    case "eq": result = l === r; break;
    case "neq": result = l !== r; break;
    case "gt": result = l > r; break;
    case "gte": result = l >= r; break;
    case "lt": result = l < r; break;
    case "lte": result = l <= r; break;
    case "between": result = !Number.isNaN(u) && l >= Math.min(r, u) && l <= Math.max(r, u); break;
  }
  return { result };
}

export function evalCompareDate(input: Record<string, unknown>): LogicResult {
  const left = toDate(input.left);
  const op = String(input.operator ?? "before");
  if (!left) return { result: false };
  const now = Date.now();

  if (op === "within_last" || op === "older_than") {
    const ms = parseDurationMs(input.right);
    if (ms == null) return { result: false };
    const diff = now - left.getTime();
    return { result: op === "within_last" ? diff >= 0 && diff <= ms : diff > ms };
  }

  const right = toDate(input.right);
  if (!right) return { result: false };
  switch (op) {
    case "before": return { result: left.getTime() < right.getTime() };
    case "after": return { result: left.getTime() > right.getTime() };
    case "same_day": return {
      result: left.getUTCFullYear() === right.getUTCFullYear()
        && left.getUTCMonth() === right.getUTCMonth()
        && left.getUTCDate() === right.getUTCDate(),
    };
    case "between": {
      const upper = toDate(input.right_upper);
      if (!upper) return { result: false };
      const lo = Math.min(right.getTime(), upper.getTime());
      const hi = Math.max(right.getTime(), upper.getTime());
      return { result: left.getTime() >= lo && left.getTime() <= hi };
    }
  }
  return { result: false };
}

export function evalContains(input: Record<string, unknown>): LogicResult {
  const cs = Boolean(input.case_sensitive);
  const hay = input.haystack;
  const needle = toStr(input.needle, cs);
  if (Array.isArray(hay)) return { result: hay.map((v) => toStr(v, cs)).includes(needle) };
  return { result: toStr(hay, cs).includes(needle) };
}

export function evalStartsWith(input: Record<string, unknown>): LogicResult {
  const cs = Boolean(input.case_sensitive);
  return { result: toStr(input.value, cs).startsWith(toStr(input.prefix, cs)) };
}
export function evalEndsWith(input: Record<string, unknown>): LogicResult {
  const cs = Boolean(input.case_sensitive);
  return { result: toStr(input.value, cs).endsWith(toStr(input.suffix, cs)) };
}

export function evalRegex(input: Record<string, unknown>): LogicResult & { groups: string[] } {
  try {
    const re = new RegExp(String(input.pattern ?? ""), String(input.flags ?? ""));
    const m = re.exec(String(input.value ?? ""));
    return { result: m != null, groups: m ? m.slice(1) : [] };
  } catch {
    return { result: false, groups: [] };
  }
}

export function evalIf(input: Record<string, unknown>): { branch: "true" | "false"; result: boolean } {
  const t = truthy(input.expression);
  return { branch: t ? "true" : "false", result: t };
}

export function evalSwitch(input: Record<string, unknown>): { branch: string; value: string } {
  const value = toStr(input.expression, true);
  const cases = coerceConditions(input.cases) as Array<{ value?: unknown; branch?: unknown }>;
  for (const c of cases) {
    if (c && toStr(c.value, true) === value) return { branch: String(c.branch ?? value), value };
  }
  return { branch: String(input.default_branch ?? "else"), value };
}

type Predicate = { left?: unknown; op?: string; right?: unknown; right_upper?: unknown };
type Rule = { when?: { all?: Predicate[]; any?: Predicate[]; not?: Predicate }; branch?: string };

function evalPredicate(p: Predicate): boolean {
  const op = String(p.op ?? "eq");
  // Route to text/number/date depending on op family
  const numOps = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "between"]);
  const dateOps = new Set(["before", "after", "same_day", "within_last", "older_than"]);
  if (numOps.has(op) && !Number.isNaN(toNum(p.left)) && !Number.isNaN(toNum(p.right))) {
    return evalCompareNumber({ left: p.left, right: p.right, right_upper: p.right_upper, operator: op }).result;
  }
  if (dateOps.has(op)) {
    return evalCompareDate({ left: p.left, right: p.right, right_upper: p.right_upper, operator: op }).result;
  }
  return evalCompareText({ left: p.left, right: p.right, operator: op }).result;
}

export function evalDecisionTree(input: Record<string, unknown>): { branch: string; matched: boolean } {
  const rules = coerceConditions(input.rules) as Rule[];
  for (const r of rules) {
    if (!r?.when) continue;
    const all = r.when.all ?? [];
    const any = r.when.any ?? [];
    const not = r.when.not;
    const passAll = all.length === 0 || all.every(evalPredicate);
    const passAny = any.length === 0 || any.some(evalPredicate);
    const passNot = !not || !evalPredicate(not);
    if (passAll && passAny && passNot) return { branch: String(r.branch ?? "match"), matched: true };
  }
  return { branch: String(input.default_branch ?? "else"), matched: false };
}

/**
 * Safe expression evaluator. Supports arithmetic, comparison, logical,
 * ternary, and parentheses over numbers, strings, and booleans. Interpolation
 * is expected to have already substituted `{{...}}` placeholders.
 * Rejects any identifier that isn't a literal — no property access, no calls.
 */
export function evalExpression(expr: string): unknown {
  const src = String(expr ?? "").trim();
  if (!src) return null;
  // Whitelist: digits, string literals, operators, whitespace, parens, dots, booleans, null
  const allowed = /^(?:\s|[0-9.+\-*/%(),?:!<>=&|]|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\btrue\b|\bfalse\b|\bnull\b)+$/;
  if (!allowed.test(src)) return src; // fallback: return raw string
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`"use strict"; return (${src});`);
    return fn();
  } catch {
    return null;
  }
}

export function coerceReturn(value: unknown, type: string | undefined): unknown {
  switch (type) {
    case "string": return value == null ? "" : String(value);
    case "number": { const n = Number(value); return Number.isNaN(n) ? 0 : n; }
    case "boolean": return truthy(value);
    case "json": try { return typeof value === "string" ? JSON.parse(value) : value; } catch { return value; }
    default: return value;
  }
}
