/**
 * Semver + Dependency + Version Manager.
 *
 * Minimal semver: MAJOR.MINOR.PATCH with optional -prerelease and range
 * operators ^, ~, >=, >, <=, <, = , and `*` / `x`. Sufficient for
 * plugin/theme manifests without pulling in a third-party dep.
 *
 * The Dependency Manager topologically orders plugins for load and
 * verifies that all required dependencies are installed + compatible.
 */

export type Semver = { major: number; minor: number; patch: number; pre?: string };

export function parseSemver(v: string): Semver | null {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+]([0-9A-Za-z.-]+))?$/.exec(v.trim());
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] };
}

export function compareSemver(a: Semver, b: Semver): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  // A version without prerelease is greater than one with.
  if (a.pre && !b.pre) return -1;
  if (!a.pre && b.pre) return 1;
  return (a.pre ?? '').localeCompare(b.pre ?? '');
}

/** Match `range` against `version`. Supports ^, ~, >=, >, <=, <, =, and *. */
export function satisfies(version: string, range: string): boolean {
  const r = range.trim();
  if (r === '*' || r === '' || r === 'x') return true;
  const v = parseSemver(version);
  if (!v) return false;

  const ops: Array<[string, (a: Semver, b: Semver) => boolean]> = [
    ['>=', (a, b) => compareSemver(a, b) >= 0],
    ['<=', (a, b) => compareSemver(a, b) <= 0],
    ['>', (a, b) => compareSemver(a, b) > 0],
    ['<', (a, b) => compareSemver(a, b) < 0],
    ['=', (a, b) => compareSemver(a, b) === 0],
  ];

  // Space-separated compound ranges: ">=1.0.0 <2.0.0"
  const parts = r.split(/\s+/);
  for (const part of parts) {
    if (part.startsWith('^')) {
      const b = parseSemver(part.slice(1));
      if (!b) return false;
      // ^1.2.3 → >=1.2.3 <2.0.0
      if (compareSemver(v, b) < 0) return false;
      const upper: Semver = { major: b.major + 1, minor: 0, patch: 0 };
      if (compareSemver(v, upper) >= 0) return false;
      continue;
    }
    if (part.startsWith('~')) {
      const b = parseSemver(part.slice(1));
      if (!b) return false;
      // ~1.2.3 → >=1.2.3 <1.3.0
      if (compareSemver(v, b) < 0) return false;
      const upper: Semver = { major: b.major, minor: b.minor + 1, patch: 0 };
      if (compareSemver(v, upper) >= 0) return false;
      continue;
    }
    let matched = false;
    for (const [op, cmp] of ops) {
      if (part.startsWith(op)) {
        const b = parseSemver(part.slice(op.length));
        if (!b || !cmp(v, b)) return false;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Bare version → exact
      const b = parseSemver(part);
      if (!b || compareSemver(v, b) !== 0) return false;
    }
  }
  return true;
}

export type DepSpec = { slug: string; range: string };

/** Topologically order plugins by dependency (Kahn's algorithm). */
export function topologicalOrder<T extends { slug: string; dependencies?: DepSpec[] }>(items: T[]): T[] {
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  const indeg = new Map<string, number>();
  const edges = new Map<string, string[]>();
  for (const item of items) {
    indeg.set(item.slug, indeg.get(item.slug) ?? 0);
    for (const dep of item.dependencies ?? []) {
      if (!bySlug.has(dep.slug)) continue; // missing deps handled separately
      edges.set(dep.slug, [...(edges.get(dep.slug) ?? []), item.slug]);
      indeg.set(item.slug, (indeg.get(item.slug) ?? 0) + 1);
    }
  }
  const queue: string[] = [];
  for (const [slug, n] of indeg) if (n === 0) queue.push(slug);
  const out: T[] = [];
  while (queue.length) {
    const s = queue.shift()!;
    const it = bySlug.get(s);
    if (it) out.push(it);
    for (const next of edges.get(s) ?? []) {
      indeg.set(next, (indeg.get(next) ?? 0) - 1);
      if (indeg.get(next) === 0) queue.push(next);
    }
  }
  // Any leftover implies a cycle — append in original order so caller can flag them.
  if (out.length < items.length) {
    for (const it of items) if (!out.includes(it)) out.push(it);
  }
  return out;
}

export type DependencyResolution =
  | { ok: true }
  | { ok: false; missing?: DepSpec[]; incompatible?: Array<DepSpec & { installed: string }> };

export function resolveDependencies(
  target: { dependencies?: DepSpec[] },
  installed: Array<{ slug: string; version: string }>,
): DependencyResolution {
  const missing: DepSpec[] = [];
  const incompatible: Array<DepSpec & { installed: string }> = [];
  for (const dep of target.dependencies ?? []) {
    const found = installed.find((i) => i.slug === dep.slug);
    if (!found) missing.push(dep);
    else if (!satisfies(found.version, dep.range)) incompatible.push({ ...dep, installed: found.version });
  }
  if (missing.length || incompatible.length) return { ok: false, missing, incompatible };
  return { ok: true };
}
