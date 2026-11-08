/**
 * Variable & expression engine for workflows.
 *
 * Supports:
 *  - {{path.to.value}} merge fields with nested-object traversal, array indexing
 *  - Pipes for formatting: {{contact.name | upper}}, {{deal.value | number:2}}
 *  - Inline expressions: ${ deal.value * 0.1 + 100 }
 *  - Function library: date.*, math.*, str.*
 *  - Scoped variable resolution (global / workflow / environment / contact / deal / ...)
 *
 * Everything here is pure (no DB access) so it can be reused from the client
 * builder (for live previews) and from the server engine.
 */

export type VariableScope =
  | "global"
  | "workflow"
  | "environment"
  | "contact"
  | "deal"
  | "conversation"
  | "organization"
  | "custom";

export type ScopedVariable = {
  scope: VariableScope;
  key: string;
  value: unknown;
  description?: string | null;
  is_secret?: boolean;
};

export type VariableBag = Record<string, unknown>;

/* --------------------------- Nested path access --------------------------- */

/** Read a dotted / bracketed path from a nested object. Returns `undefined` when missing. */
export function getPath(root: unknown, path: string): unknown {
  if (!path) return root;
  const parts = path
    .replace(/\[(\w+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let cur: unknown = root;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(p);
      cur = Number.isFinite(idx) ? cur[idx] : (cur as unknown as Record<string, unknown>)[p];
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[p];
    } else return undefined;
  }
  return cur;
}

/** Write a value at a dotted path, creating intermediate objects. */
export function setPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".").filter(Boolean);
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== "object" || cur[p] == null) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

/* -------------------------- Function library ------------------------------ */

const DATE_FUNCS = {
  now: () => new Date().toISOString(),
  today: () => new Date().toISOString().slice(0, 10),
  format: (iso: unknown, fmt = "YYYY-MM-DD") => {
    const d = new Date(String(iso));
    if (isNaN(d.getTime())) return "";
    const pad = (n: number, w = 2) => String(n).padStart(w, "0");
    return String(fmt)
      .replace("YYYY", String(d.getUTCFullYear()))
      .replace("MM", pad(d.getUTCMonth() + 1))
      .replace("DD", pad(d.getUTCDate()))
      .replace("HH", pad(d.getUTCHours()))
      .replace("mm", pad(d.getUTCMinutes()))
      .replace("ss", pad(d.getUTCSeconds()));
  },
  addDays: (iso: unknown, days: unknown) => {
    const d = new Date(String(iso));
    d.setUTCDate(d.getUTCDate() + Number(days || 0));
    return d.toISOString();
  },
  addHours: (iso: unknown, hours: unknown) => {
    const d = new Date(String(iso));
    d.setUTCHours(d.getUTCHours() + Number(hours || 0));
    return d.toISOString();
  },
  diffDays: (a: unknown, b: unknown) => {
    const da = new Date(String(a)).getTime();
    const db = new Date(String(b)).getTime();
    if (!isFinite(da) || !isFinite(db)) return 0;
    return Math.round((da - db) / 86_400_000);
  },
  weekday: (iso: unknown) => {
    const d = new Date(String(iso));
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  },
};

const MATH_FUNCS = {
  add: (a: unknown, b: unknown) => Number(a) + Number(b),
  sub: (a: unknown, b: unknown) => Number(a) - Number(b),
  mul: (a: unknown, b: unknown) => Number(a) * Number(b),
  div: (a: unknown, b: unknown) => (Number(b) === 0 ? 0 : Number(a) / Number(b)),
  mod: (a: unknown, b: unknown) => Number(a) % Number(b),
  round: (a: unknown, d = 0) => {
    const p = Math.pow(10, Number(d) || 0);
    return Math.round(Number(a) * p) / p;
  },
  floor: (a: unknown) => Math.floor(Number(a)),
  ceil: (a: unknown) => Math.ceil(Number(a)),
  abs: (a: unknown) => Math.abs(Number(a)),
  min: (...xs: unknown[]) => Math.min(...xs.map(Number)),
  max: (...xs: unknown[]) => Math.max(...xs.map(Number)),
  sum: (arr: unknown) => (Array.isArray(arr) ? arr.reduce<number>((s, x) => s + Number(x), 0) : 0),
  avg: (arr: unknown) =>
    Array.isArray(arr) && arr.length ? arr.reduce<number>((s, x) => s + Number(x), 0) / arr.length : 0,
  pct: (a: unknown, b: unknown) => (Number(b) === 0 ? 0 : (Number(a) / Number(b)) * 100),
};

const STRING_FUNCS = {
  upper: (s: unknown) => String(s ?? "").toUpperCase(),
  lower: (s: unknown) => String(s ?? "").toLowerCase(),
  trim: (s: unknown) => String(s ?? "").trim(),
  capitalize: (s: unknown) => {
    const v = String(s ?? "");
    return v ? v[0].toUpperCase() + v.slice(1) : "";
  },
  title: (s: unknown) =>
    String(s ?? "")
      .toLowerCase()
      .replace(/\b\w/g, (m) => m.toUpperCase()),
  replace: (s: unknown, a: unknown, b: unknown) => String(s ?? "").split(String(a ?? "")).join(String(b ?? "")),
  slice: (s: unknown, a: unknown, b?: unknown) => String(s ?? "").slice(Number(a) || 0, b == null ? undefined : Number(b)),
  length: (s: unknown) => (Array.isArray(s) ? s.length : String(s ?? "").length),
  split: (s: unknown, sep: unknown) => String(s ?? "").split(String(sep ?? "")),
  join: (arr: unknown, sep: unknown) => (Array.isArray(arr) ? arr.join(String(sep ?? "")) : ""),
  default: (s: unknown, fallback: unknown) => (s == null || s === "" ? fallback : s),
  contains: (s: unknown, needle: unknown) => String(s ?? "").includes(String(needle ?? "")),
  startsWith: (s: unknown, needle: unknown) => String(s ?? "").startsWith(String(needle ?? "")),
  endsWith: (s: unknown, needle: unknown) => String(s ?? "").endsWith(String(needle ?? "")),
  json: (v: unknown) => {
    try { return JSON.stringify(v); } catch { return ""; }
  },
  number: (v: unknown, digits: unknown = 2) => {
    const n = Number(v);
    if (!isFinite(n)) return "";
    return n.toFixed(Number(digits) || 0);
  },
};

export const FUNCTION_LIBRARY = {
  date: DATE_FUNCS,
  math: MATH_FUNCS,
  str: STRING_FUNCS,
} as const;

/* -------------------------- Pipe / filter parser -------------------------- */

function applyPipe(value: unknown, pipe: string): unknown {
  const [name, ...args] = pipe.split(":").map((s) => s.trim());
  const fn =
    (STRING_FUNCS as Record<string, (...a: unknown[]) => unknown>)[name] ??
    (MATH_FUNCS as Record<string, (...a: unknown[]) => unknown>)[name] ??
    (DATE_FUNCS as Record<string, (...a: unknown[]) => unknown>)[name];
  if (!fn) return value;
  const parsedArgs = args.map((a) => {
    if (/^-?\d+(\.\d+)?$/.test(a)) return Number(a);
    if (a === "true") return true;
    if (a === "false") return false;
    if (/^['"].*['"]$/.test(a)) return a.slice(1, -1);
    return a;
  });
  try { return fn(value, ...parsedArgs); } catch { return value; }
}

/* ------------------------- Inline expression eval ------------------------- */

/** Evaluate ${...} arithmetic with variable references — no arbitrary JS. */
export function evalInlineExpression(expr: string, vars: VariableBag): unknown {
  // Substitute identifiers first
  const substituted = expr.replace(/[a-zA-Z_][a-zA-Z0-9_.$\[\]]*/g, (ident) => {
    // Skip function names — resolved via FUNCTION_LIBRARY below
    if (/^(date|math|str)\./.test(ident)) return ident;
    const v = getPath(vars, ident);
    if (v == null) return "null";
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return JSON.stringify(v);
  });

  // Rewrite `date.fn(a,b)` calls into a placeholder we execute manually.
  // For simplicity we support one level of function calls.
  const callRe = /(date|math|str)\.([a-zA-Z_]+)\(([^)]*)\)/g;
  const resolvedCalls = substituted.replace(callRe, (_m, ns, fn, argstr) => {
    const args = argstr.split(",").map((s: string) => s.trim()).filter(Boolean).map((a: string) => {
      try { return JSON.parse(a); } catch { return a.replace(/^["']|["']$/g, ""); }
    });
    const nsFns = (FUNCTION_LIBRARY as Record<string, Record<string, (...a: unknown[]) => unknown>>)[ns];
    const f = nsFns?.[fn];
    if (!f) return "null";
    try { return JSON.stringify(f(...args)); } catch { return "null"; }
  });

  // Only allow arithmetic, comparison, boolean ops, and literals now
  if (!/^[\s\d+\-*/%().,<>=!&|?:'"`\[\]{}truefalsnl\-eE]*$/.test(resolvedCalls.replace(/"[^"]*"/g, ""))) {
    return resolvedCalls;
  }
  try {
    // eslint-disable-next-line no-new-func
    return Function(`"use strict"; return (${resolvedCalls || "null"});`)();
  } catch {
    return resolvedCalls;
  }
}

/* ------------------------------ Interpolation ----------------------------- */

/** Resolve a single `{{ path | pipe:arg | pipe }}` token. */
function resolveMergeToken(token: string, vars: VariableBag): unknown {
  const parts = token.split("|").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return "";
  const path = parts[0];
  let value: unknown;
  // Literal detection: quoted strings or numbers
  if (/^['"].*['"]$/.test(path)) value = path.slice(1, -1);
  else if (/^-?\d+(\.\d+)?$/.test(path)) value = Number(path);
  else value = getPath(vars, path);
  for (let i = 1; i < parts.length; i++) value = applyPipe(value, parts[i]);
  return value;
}

/** Recursively interpolate `{{ ... }}` and `${ ... }` in strings / objects / arrays. */
export function interpolate(value: unknown, vars: VariableBag): unknown {
  if (typeof value === "string") {
    let out = value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr) => {
      const v = resolveMergeToken(String(expr), vars);
      if (v == null) return "";
      return typeof v === "string" ? v : JSON.stringify(v);
    });
    out = out.replace(/\$\{\s*([^}]+?)\s*\}/g, (_, expr) => {
      const v = evalInlineExpression(String(expr), vars);
      if (v == null) return "";
      return typeof v === "string" ? v : JSON.stringify(v);
    });
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => interpolate(v, vars));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = interpolate(v, vars);
    return out;
  }
  return value;
}

/* --------------------------- Bag composition ------------------------------ */

/**
 * Compose a variable bag from scoped rows plus per-run inputs. Later scopes
 * override earlier ones so run-time data (`trigger`, `steps`) always wins.
 */
export function composeBag(scoped: ScopedVariable[], runtime: VariableBag = {}): VariableBag {
  const bag: VariableBag = {
    // Scope namespaces — always defined so `{{env.foo}}` never throws
    global: {},
    env: {},
    environment: {},
    workflow: {},
    contact: {},
    deal: {},
    conversation: {},
    organization: {},
    custom: {},
  };
  for (const v of scoped) {
    const alias = v.scope === "environment" ? "env" : v.scope;
    const target = bag[alias] as Record<string, unknown>;
    // Redact secrets in preview-only bags via a separate helper below.
    target[v.key] = v.value;
  }
  return { ...bag, ...runtime };
}

/** Return the bag with secret values redacted — useful for client-side previews. */
export function redactSecrets(bag: VariableBag, scoped: ScopedVariable[]): VariableBag {
  const secrets = new Set(scoped.filter((s) => s.is_secret).map((s) => `${s.scope}.${s.key}`));
  const out: VariableBag = JSON.parse(JSON.stringify(bag));
  for (const key of secrets) {
    const [scope, k] = key.split(".");
    const alias: string = scope === "environment" ? "env" : scope;
    const target = out[alias] as Record<string, unknown> | undefined;
    if (target && k in target) target[k] = "••••••••";
  }
  return out;
}

/* -------------------------- Merge-field catalogue ------------------------- */

/** Static suggestions surfaced in the expression builder. */
export const MERGE_FIELD_SUGGESTIONS: Array<{ group: string; path: string; description: string }> = [
  { group: "Trigger", path: "trigger.message.text", description: "Incoming message text" },
  { group: "Trigger", path: "trigger.message.from", description: "Sender phone number" },
  { group: "Trigger", path: "trigger.event", description: "Trigger event name" },
  { group: "Contact", path: "contact.id", description: "Contact ID" },
  { group: "Contact", path: "contact.name", description: "Contact full name" },
  { group: "Contact", path: "contact.email", description: "Contact email" },
  { group: "Contact", path: "contact.phone", description: "Contact phone" },
  { group: "Contact", path: "contact.tags", description: "Contact tags (array)" },
  { group: "Deal", path: "deal.id", description: "Deal ID" },
  { group: "Deal", path: "deal.value", description: "Deal amount" },
  { group: "Deal", path: "deal.stage", description: "Current pipeline stage" },
  { group: "Deal", path: "deal.owner", description: "Assigned agent" },
  { group: "Conversation", path: "conversation.id", description: "Conversation ID" },
  { group: "Conversation", path: "conversation.status", description: "Open / closed / snoozed" },
  { group: "Organization", path: "organization.name", description: "Workspace name" },
  { group: "Actor", path: "actor.userId", description: "User who launched the run" },
];
