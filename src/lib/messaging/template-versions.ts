/**
 * Template version-history helpers.
 *
 * Every template save used to append a snapshot, so repeated saves that did
 * not actually change anything (for example "Apply fix & resubmit" run twice,
 * or a resubmit after an already-normalized edit) produced identical versions
 * back-to-back. Snapshots are now deduplicated against the latest one.
 */

export type TemplateVersionEntry = {
  version: number;
  created_at: string;
  user_id?: string | null;
  category?: string | null;
  components?: unknown;
};

/** Order-insensitive, whitespace-insensitive fingerprint of a snapshot. */
export function templateSnapshotKey(category: unknown, components: unknown): string {
  return JSON.stringify({ category: category ?? null, components: sortDeep(components) });
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) out[key] = sortDeep(src[key]);
    return out;
  }
  return value;
}

/**
 * Returns the version list to persist. When the new snapshot is identical to
 * the most recent one, the existing list is returned unchanged.
 */
export function appendTemplateVersion(
  existing: unknown,
  next: { category: unknown; components: unknown; userId?: string | null },
): { versions: TemplateVersionEntry[]; version: number; appended: boolean } {
  const versions: TemplateVersionEntry[] = Array.isArray(existing)
    ? (existing as TemplateVersionEntry[])
    : [];
  const last = versions[versions.length - 1];
  const nextKey = templateSnapshotKey(next.category, next.components);

  if (last && templateSnapshotKey(last.category, last.components) === nextKey) {
    return { versions, version: last.version, appended: false };
  }

  const version = (last?.version ?? versions.length) + 1;
  return {
    versions: [
      ...versions,
      {
        version,
        created_at: new Date().toISOString(),
        user_id: next.userId ?? null,
        category: (next.category as string | null) ?? null,
        components: next.components,
      },
    ],
    version,
    appended: true,
  };
}
