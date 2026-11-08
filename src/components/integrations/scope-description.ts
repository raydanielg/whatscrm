/**
 * Best-effort humanization of OAuth scope strings so the Permissions UI
 * reads as plain language rather than raw provider scope URIs.
 */
const RULES: Array<{ match: RegExp; label: string }> = [
  { match: /gmail\.readonly/i, label: "Read your Gmail messages" },
  { match: /gmail\.send/i, label: "Send email on your behalf" },
  { match: /drive\.readonly/i, label: "Read files stored in Google Drive" },
  { match: /drive(\.\w+)?$/i, label: "Access files in Google Drive" },
  { match: /calendar(\.\w+)?$/i, label: "Read and manage your calendar" },
  { match: /contacts\.readonly/i, label: "Read your contacts" },
  { match: /userinfo\.email/i, label: "See your email address" },
  { match: /userinfo\.profile/i, label: "See your basic profile" },
  { match: /openid/i, label: "Sign you in" },
  { match: /offline_access/i, label: "Maintain access when you're offline" },
  { match: /mail\.read/i, label: "Read your Outlook mail" },
  { match: /files\.read/i, label: "Read files in OneDrive" },
  { match: /calendars\.readwrite/i, label: "Create and update calendar events" },
  { match: /channels:read/i, label: "View Slack channel list" },
  { match: /chat:write/i, label: "Post messages to Slack channels" },
];

export function describeScope(scope: string): string {
  for (const rule of RULES) if (rule.match.test(scope)) return rule.label;
  // Fallback: strip URL prefix, title-case last segment.
  const last = scope.split(/[/.:]/).filter(Boolean).at(-1) ?? scope;
  return last.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
