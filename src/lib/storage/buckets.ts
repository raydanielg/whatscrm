/**
 * Canonical Supabase Storage bucket configuration.
 *
 * Every bucket name used to be spelled inline at each call site, which is how
 * `social-media` ended up with storage policies that disagreed with the path
 * its uploader produced. One table here, and one place to look when a bucket's
 * shape changes.
 *
 * All buckets are private (`public: false`): every storage policy is
 * `authenticated`-only and the app serves files through signed URLs or a
 * server-side download, never `getPublicUrl`.
 */

/** How the first segment of an object path is authorised by storage RLS. */
export type PathScope =
  /** `<workspaceId>/...` — checked with `is_workspace_member(segment, auth.uid())`. */
  | "workspace"
  /** `<userId>/...` — checked against `auth.uid()` directly. */
  | "user"
  /** `platform/...` or `org/<orgId>/...` — branding only. */
  | "branding"
  /** Written by the service role only; no `authenticated` INSERT policy. */
  | "service";

export interface BucketConfig {
  readonly id: string;
  /** Feature that owns the bucket, for orientation when reading this table. */
  readonly feature: string;
  readonly public: false;
  readonly pathScope: PathScope;
  /**
   * Size ceiling the application already enforces before uploading. Mirrored
   * onto the bucket so the server is authoritative too. `null` means the
   * feature imposes no fixed limit.
   */
  readonly maxBytes: number | null;
}

const MB = 1024 * 1024;

export const BUCKETS = {
  ATTACHMENTS: "attachments",
  AVATARS: "avatars",
  BRANDING: "branding",
  CAMPAIGN_MEDIA: "campaign-media",
  CUSTOM_FIELDS: "custom-fields",
  EXPORTS: "exports",
  KB_SOURCES: "kb-sources",
  SOCIAL_MEDIA: "social-media",
  WIDGET_UPLOADS: "widget-uploads",
} as const;

export type BucketId = (typeof BUCKETS)[keyof typeof BUCKETS];

export const BUCKET_CONFIG: Readonly<Record<BucketId, BucketConfig>> = {
  attachments: {
    id: "attachments",
    feature: "Inbox / CRM attachments",
    public: false,
    pathScope: "workspace",
    maxBytes: null,
  },
  avatars: {
    id: "avatars",
    feature: "Profile & client-portal avatars",
    public: false,
    pathScope: "user",
    maxBytes: null,
  },
  branding: {
    id: "branding",
    feature: "Platform / org branding assets",
    public: false,
    pathScope: "branding",
    maxBytes: 5 * MB,
  },
  "campaign-media": {
    id: "campaign-media",
    feature: "Campaign media",
    public: false,
    pathScope: "workspace",
    maxBytes: null,
  },
  "custom-fields": {
    id: "custom-fields",
    feature: "Custom field file values",
    public: false,
    pathScope: "workspace",
    maxBytes: null,
  },
  exports: {
    id: "exports",
    feature: "Data exports (written server-side)",
    public: false,
    pathScope: "service",
    maxBytes: null,
  },
  "kb-sources": {
    id: "kb-sources",
    feature: "Knowledge base sources",
    public: false,
    pathScope: "workspace",
    maxBytes: null,
  },
  "social-media": {
    id: "social-media",
    feature: "Social Studio composer media",
    public: false,
    pathScope: "workspace",
    maxBytes: 200 * MB,
  },
  "widget-uploads": {
    id: "widget-uploads",
    feature: "Public chat widget uploads (written server-side)",
    public: false,
    pathScope: "service",
    maxBytes: 25 * MB,
  },
};

/** Every bucket a fresh install must provision. */
export const REQUIRED_BUCKETS: readonly BucketId[] = (
  Object.keys(BUCKET_CONFIG) as BucketId[]
).sort();

/**
 * Strip a user-supplied filename down to characters that are safe in a storage
 * key. Storage keys are also RLS inputs, so `..`, `/` and control characters
 * must never survive.
 */
export function sanitizeFileName(name: string, maxLength = 120): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[^\w.-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[.\-_]+/, "")
    .slice(0, maxLength);
  return cleaned || "file";
}

/** File extension, lowercased and stripped to alphanumerics. */
export function safeExtension(name: string, fallback = "bin"): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return fallback;
  const ext = name
    .slice(dot + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return ext.slice(0, 16) || fallback;
}

/**
 * Build a workspace-scoped object key.
 *
 * The workspace id MUST be the first segment: every workspace-scoped bucket
 * policy authorises on `(storage.foldername(name))[1]`, so any other ordering
 * is rejected by RLS no matter who the caller is.
 */
export function workspaceObjectPath(
  workspaceId: string,
  segments: readonly string[],
  fileName: string,
): string {
  if (!workspaceId) throw new Error("A workspace id is required to build a storage path");
  // A segment that sanitizes down to nothing (`..`, `/`, punctuation) is
  // dropped rather than replaced by a placeholder, so traversal attempts
  // collapse out of the key instead of creating a junk folder.
  const middle = segments.map((s) => sanitizeSegment(s)).filter((s): s is string => s.length > 0);
  return [workspaceId, ...middle, sanitizeFileName(fileName)].join("/");
}

/** Like `sanitizeFileName` but yields "" instead of a fallback name. */
function sanitizeSegment(segment: string, maxLength = 64): string {
  return (segment.split(/[\\/]/).pop() ?? "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[.\-_]+/, "")
    .slice(0, maxLength);
}

/** Every bucket in this app is private, so reads must go through a signed URL. */
export function isPrivateBucket(bucket: BucketId): boolean {
  return BUCKET_CONFIG[bucket].public === false;
}
