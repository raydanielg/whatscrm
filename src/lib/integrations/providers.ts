/**
 * Provider manifests. Each integration is a small object — extending the platform
 * = adding a new file (or entry here) and importing it from `index.ts`.
 */
import { BRAND_NAME } from "@/lib/branding/brand";
import type { IntegrationProvider } from "./core";

export const googleWorkspace: IntegrationProvider = {
  id: "google-workspace",
  name: "Google Workspace",
  vendor: "Google",
  category: "Productivity",
  tagline: "Unified access to Gmail, Drive, Calendar, and Contacts through one connection.",
  version: "1.0.0",
  authType: "oauth2",
  scopes: [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/contacts.readonly",
  ],
  configSchema: [],
  featured: true,
  recommended: true,
  docsUrl: "https://docs.wacrm.io/integrations/google-workspace",
  capabilities: [
    { id: "list_files", label: "List Drive files", kind: "action", inputs: [{ key: "pageToken", label: "Page token", type: "string" }] },
    { id: "send_email", label: "Send email via Gmail", kind: "action", inputs: [
      { key: "to", label: "Recipient email", type: "string", required: true },
      { key: "subject", label: "Subject", type: "string", required: true },
      { key: "body", label: "Message", type: "string", required: true }] },
    { id: "create_event", label: "Create calendar event", kind: "action", inputs: [
      { key: "summary", label: "Event name", type: "string", required: true },
      { key: "start", label: "Start (ISO date/time with offset)", type: "string", required: true },
      { key: "end", label: "End (ISO date/time with offset)", type: "string", required: true }] },
  ],
  hasServerRuntime: true,
  oauthImplemented: true,
};

export const microsoft365: IntegrationProvider = {
  id: "microsoft-365",
  name: "Microsoft 365",
  vendor: "Microsoft",
  category: "Productivity",
  tagline: "Outlook mail, OneDrive files, Teams messages, and Calendar in one integration.",
  version: "1.0.0",
  authType: "oauth2",
  scopes: ["openid", "profile", "email", "offline_access", "Mail.Read", "Files.Read.All", "Calendars.ReadWrite"],
  configSchema: [],
  featured: true,
  docsUrl: "https://docs.wacrm.io/integrations/microsoft-365",
  capabilities: [
    { id: "send_mail", label: "Send Outlook email", kind: "action" },
    { id: "list_files", label: "List OneDrive files", kind: "action" },
  ],
  hasServerRuntime: true,
};

export const googleCalendar: IntegrationProvider = {
  id: "google-calendar",
  name: "Google Calendar",
  vendor: "Google",
  category: "Productivity",
  tagline: "Turn CRM activities into calendar events and sync meetings.",
  version: "1.3.0",
  authType: "oauth2",
  scopes: ["https://www.googleapis.com/auth/calendar"],
  configSchema: [
    { key: "default_calendar", label: "Default calendar", type: "text", required: true, defaultValue: "primary" },
  ],
  recommended: true,
  capabilities: [
    { id: "list_events", label: "List events", kind: "action" },
    { id: "create_event", label: "Create event", kind: "action", inputs: [
      { key: "summary", label: "Title", type: "string", required: true },
      { key: "start", label: "Start (ISO)", type: "string", required: true },
      { key: "end", label: "End (ISO)", type: "string", required: true },
    ] },
  ],
  hasServerRuntime: true,
};

export const googleDrive: IntegrationProvider = {
  id: "google-drive",
  name: "Google Drive",
  vendor: "Google",
  category: "Storage",
  tagline: "Attach and browse Drive files from conversations and deals.",
  version: "1.6.0",
  authType: "oauth2",
  scopes: ["https://www.googleapis.com/auth/drive.file"],
  configSchema: [
    { key: "root_folder", label: "Root folder ID", type: "text", required: false },
  ],
  recommended: true,
  capabilities: [
    { id: "list_files", label: "List files", kind: "action" },
    { id: "upload_file", label: "Upload file", kind: "action" },
  ],
  hasServerRuntime: true,
};

export const googleSheets: IntegrationProvider = {
  id: "google-sheets",
  name: "Google Sheets",
  vendor: "Google",
  category: "Productivity",
  tagline: "Sync CRM records with spreadsheets and automate row-based workflows.",
  description:
    "Read spreadsheet data, append new CRM records, and update existing rows through the Google Sheets API.",
  version: "1.0.0",
  authType: "oauth2",
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
  ],
  configSchema: [
    {
      key: "default_spreadsheet_id",
      label: "Default spreadsheet ID",
      type: "text",
      required: false,
      placeholder: "1AbC...",
      helpText: "Optional. You can choose a spreadsheet separately in each workflow.",
    },
  ],
  featured: true,
  recommended: true,
  docsUrl: "https://developers.google.com/workspace/sheets/api/guides/authorizing",
  capabilities: [
    {
      id: "read_range",
      label: "Read rows",
      kind: "action",
      inputs: [
        { key: "spreadsheet_id", label: "Spreadsheet ID", type: "string", required: true },
        { key: "range", label: "Range", type: "string", required: true },
      ],
    },
    {
      id: "append_rows",
      label: "Append rows",
      kind: "action",
      inputs: [
        { key: "spreadsheet_id", label: "Spreadsheet ID", type: "string", required: true },
        { key: "range", label: "Range", type: "string", required: true },
        { key: "values", label: "Rows", type: "json", required: true },
      ],
    },
    {
      id: "update_range",
      label: "Update rows",
      kind: "action",
      inputs: [
        { key: "spreadsheet_id", label: "Spreadsheet ID", type: "string", required: true },
        { key: "range", label: "Range", type: "string", required: true },
        { key: "values", label: "Rows", type: "json", required: true },
      ],
    },
    { id: "watch_rows", label: "New or updated row", kind: "trigger" },
  ],
  hasServerRuntime: true,
};

export const googleContacts: IntegrationProvider = {
  id: "google-contacts",
  name: "Google Contacts",
  vendor: "Google",
  category: "CRM",
  tagline: "Two-way sync between Google Contacts and your CRM.",
  version: "1.0.0",
  authType: "oauth2",
  scopes: ["https://www.googleapis.com/auth/contacts"],
  configSchema: [
    { key: "sync_direction", label: "Sync direction", type: "select", options: ["one-way", "two-way"], defaultValue: "two-way", required: true },
  ],
  capabilities: [
    { id: "list_contacts", label: "List contacts", kind: "action" },
    { id: "upsert_contact", label: "Create or update contact", kind: "action" },
  ],
  hasServerRuntime: true,
};

export const slack: IntegrationProvider = {
  id: "slack",
  name: "Slack",
  vendor: "Slack Technologies",
  category: "Communication",
  tagline: "Route platform events to Slack channels and receive slash commands.",
  version: "3.0.1",
  authType: "oauth2",
  scopes: ["chat:write", "channels:read", "channels:history"],
  configSchema: [
    { key: "default_channel", label: "Default channel", type: "text", required: true, placeholder: "#sales" },
  ],
  featured: true,
  recommended: true,
  capabilities: [
    { id: "post_message", label: "Post message", kind: "action", inputs: [
      { key: "channel", label: "Channel", type: "string", required: true },
      { key: "text", label: "Message", type: "string", required: true },
    ] },
    { id: "slash_command", label: "Receive /wacrm command", kind: "trigger" },
  ],
  hasServerRuntime: true,
};

export const discord: IntegrationProvider = {
  id: "discord",
  name: "Discord",
  vendor: "Discord Inc.",
  category: "Communication",
  tagline: "Send channel notifications and receive interactions from Discord servers.",
  version: "1.0.0",
  authType: "webhook_url",
  configSchema: [
    { key: "webhook_url", label: "Channel webhook URL", type: "url", required: true, secret: true,
      helpText: "Server settings → Integrations → Webhooks → Copy webhook URL." },
    { key: "username", label: "Bot display name", type: "text", defaultValue: BRAND_NAME },
  ],
  capabilities: [
    { id: "post_message", label: "Post message", kind: "action", inputs: [
      { key: "text", label: "Message", type: "string", required: true },
    ] },
  ],
  hasServerRuntime: true,
};

export const zoom: IntegrationProvider = {
  id: "zoom",
  name: "Zoom",
  vendor: "Zoom Video Communications",
  category: "Communication",
  tagline: "Create Zoom meetings from deals and log call recordings.",
  version: "1.0.0",
  authType: "oauth2",
  scopes: ["meeting:write", "recording:read"],
  configSchema: [],
  capabilities: [
    { id: "create_meeting", label: "Create meeting", kind: "action" },
    { id: "list_recordings", label: "List recordings", kind: "action" },
  ],
  hasServerRuntime: true,
};

export const microsoftTeams: IntegrationProvider = {
  id: "microsoft-teams",
  name: "Microsoft Teams",
  vendor: "Microsoft",
  category: "Communication",
  tagline: "Route conversations and alerts into Microsoft Teams channels.",
  version: "1.4.0",
  authType: "oauth2",
  scopes: ["ChannelMessage.Send", "Chat.ReadWrite", "Team.ReadBasic.All"],
  configSchema: [
    { key: "tenant_id", label: "Tenant ID", type: "text", required: true },
  ],
  capabilities: [
    { id: "post_message", label: "Post channel message", kind: "action" },
  ],
  hasServerRuntime: true,
};

export const resend: IntegrationProvider = {
  id: "resend",
  name: "Resend",
  vendor: "Resend",
  category: "Communication",
  tagline: "Modern email delivery with excellent deliverability.",
  version: "1.0.0",
  authType: "api_key",
  configSchema: [
    { key: "api_key", label: "API key", type: "password", required: true, secret: true, placeholder: "re_xxxxx" },
    { key: "from_email", label: "Default from address", type: "text", required: true, placeholder: "hello@example.com" },
  ],
  capabilities: [
    { id: "send_email", label: "Send transactional email", kind: "action", inputs: [
      { key: "to", label: "To", type: "string", required: true },
      { key: "subject", label: "Subject", type: "string", required: true },
      { key: "html", label: "HTML body", type: "string", required: true },
    ] },
  ],
  hasServerRuntime: true,
};

export const mailgun: IntegrationProvider = {
  id: "mailgun",
  name: "Mailgun",
  vendor: "Sinch",
  category: "Communication",
  tagline: "Enterprise email delivery with detailed analytics.",
  version: "1.0.0",
  authType: "api_key",
  configSchema: [
    { key: "domain", label: "Mailgun domain", type: "text", required: true, placeholder: "mg.example.com" },
    { key: "api_key", label: "Private API key", type: "password", required: true, secret: true },
    { key: "region", label: "Region", type: "select", options: ["US", "EU"], defaultValue: "US" },
  ],
  capabilities: [
    { id: "send_email", label: "Send email", kind: "action" },
  ],
  hasServerRuntime: true,
};

export const awsS3: IntegrationProvider = {
  id: "aws-s3",
  name: "Amazon S3",
  vendor: "Amazon Web Services",
  category: "Storage",
  tagline: "Store attachments, exports, and backups in Amazon S3 buckets.",
  version: "1.0.0",
  authType: "api_key",
  configSchema: [
    { key: "bucket", label: "Bucket name", type: "text", required: true },
    { key: "region", label: "AWS region", type: "text", required: true, placeholder: "us-east-1" },
    { key: "access_key_id", label: "Access key ID", type: "password", required: true, secret: true },
    { key: "secret_access_key", label: "Secret access key", type: "password", required: true, secret: true },
  ],
  capabilities: [
    { id: "upload_object", label: "Upload object", kind: "action" },
    { id: "signed_url", label: "Generate signed URL", kind: "action" },
    { id: "list_objects", label: "List objects", kind: "action" },
  ],
  hasServerRuntime: true,
};

export const cloudflareR2: IntegrationProvider = {
  id: "cloudflare-r2",
  name: "Cloudflare R2",
  vendor: "Cloudflare",
  category: "Storage",
  tagline: "S3-compatible object storage with zero egress fees.",
  version: "1.0.0",
  authType: "api_key",
  configSchema: [
    { key: "account_id", label: "Account ID", type: "text", required: true },
    { key: "bucket", label: "Bucket name", type: "text", required: true },
    { key: "access_key_id", label: "R2 access key ID", type: "password", required: true, secret: true },
    { key: "secret_access_key", label: "R2 secret access key", type: "password", required: true, secret: true },
  ],
  capabilities: [
    { id: "upload_object", label: "Upload object", kind: "action" },
    { id: "signed_url", label: "Generate signed URL", kind: "action" },
  ],
  hasServerRuntime: true,
};

export const zapier: IntegrationProvider = {
  id: "zapier",
  name: "Zapier",
  vendor: "Zapier",
  category: "Automation",
  tagline: "Push platform events to 6000+ apps and receive Zapier actions.",
  version: "2.0.0",
  authType: "webhook_url",
  configSchema: [
    { key: "webhook_url", label: "Zap catch-hook URL", type: "url", required: true, secret: true },
  ],
  featured: true,
  recommended: true,
  capabilities: [
    { id: "trigger_zap", label: "Trigger Zap", kind: "action" },
    { id: "receive_action", label: "Receive Zap action", kind: "trigger" },
  ],
  hasServerRuntime: true,
};

export const make: IntegrationProvider = {
  id: "make",
  name: "Make",
  vendor: "Celonis",
  category: "Automation",
  tagline: "Automate multi-step workflows with Make scenarios.",
  version: "1.0.1",
  authType: "webhook_url",
  configSchema: [
    { key: "webhook_url", label: "Scenario webhook URL", type: "url", required: true, secret: true },
  ],
  capabilities: [
    { id: "trigger_scenario", label: "Trigger scenario", kind: "action" },
  ],
  hasServerRuntime: true,
};

export const n8n: IntegrationProvider = {
  id: "n8n",
  name: "n8n",
  vendor: "n8n GmbH",
  category: "Automation",
  tagline: "Self-hosted automation. Trigger n8n workflows from platform events.",
  version: "1.5.0",
  authType: "webhook_url",
  configSchema: [
    { key: "webhook_url", label: "n8n webhook URL", type: "url", required: true, secret: true },
    { key: "auth_header", label: "Optional auth header", type: "password", secret: true },
  ],
  recommended: true,
  capabilities: [
    { id: "trigger_workflow", label: "Trigger workflow", kind: "action" },
  ],
  hasServerRuntime: true,
};

export const webhookTrigger: IntegrationProvider = {
  id: "webhook-trigger",
  name: "Inbound Webhook",
  vendor: BRAND_NAME,
  category: "Developer",
  tagline: "Start workflows when an external service POSTs to your unique URL.",
  version: "1.0.0",
  authType: "signed_request",
  configSchema: [
    { key: "signature_header", label: "Signature header name", type: "text", defaultValue: "X-Signature" },
    { key: "signing_secret", label: "Signing secret (optional)", type: "password", secret: true,
      helpText: "If set, we verify HMAC-SHA256(body) matches this header." },
  ],
  capabilities: [
    { id: "webhook_received", label: "Webhook received", kind: "trigger" },
  ],
  hasServerRuntime: true,
};

export const httpConnector: IntegrationProvider = {
  id: "http-connector",
  name: "HTTP Connector",
  vendor: BRAND_NAME,
  category: "Developer",
  tagline: "Universal HTTP client — call any REST API from workflows.",
  version: "1.0.0",
  authType: "api_key",
  configSchema: [
    { key: "base_url", label: "Base URL", type: "url", required: true, placeholder: "https://api.example.com" },
    { key: "auth_scheme", label: "Auth scheme", type: "select", options: ["none", "bearer", "basic", "custom_header"], defaultValue: "bearer" },
    { key: "credential", label: "Credential value", type: "password", secret: true,
      helpText: "For Bearer: token. For Basic: 'user:pass'. For Custom header: raw header value." },
    { key: "custom_header_name", label: "Custom header name", type: "text", placeholder: "X-Api-Key" },
    { key: "timeout_ms", label: "Timeout (ms)", type: "text", defaultValue: "10000" },
  ],
  capabilities: [
    { id: "http_request", label: "HTTP request", kind: "action", inputs: [
      { key: "method", label: "Method", type: "string", required: true },
      { key: "path", label: "Path", type: "string", required: true },
      { key: "body", label: "JSON body", type: "json" },
    ] },
  ],
  hasServerRuntime: true,
};

export const ALL_PROVIDERS = [
  googleWorkspace, microsoft365, googleCalendar, googleDrive, googleSheets, googleContacts,
  slack, discord, zoom, microsoftTeams,
  resend, mailgun,
  awsS3, cloudflareR2,
  zapier, make, n8n,
  webhookTrigger, httpConnector,
] as const;
