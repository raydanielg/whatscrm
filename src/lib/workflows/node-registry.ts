/**
 * Workflow node registry — the catalog of triggers and actions the visual
 * builder can drop onto the canvas. Kept as pure data so the client can render
 * the palette without loading the server engine.
 */

export type NodeKind = "trigger" | "action" | "logic" | "ai";

export type FieldSchema = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "boolean" | "select" | "json" | "reference";
  placeholder?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  /** Reference type: 'contact' | 'template' | 'agent' | 'pipeline'  */
  reference?: string;
  helpText?: string;
};

export type NodeDefinition = {
  type: string;
  kind: NodeKind;
  category: string;
  label: string;
  description: string;
  icon: string; // lucide-react icon name
  inputs?: FieldSchema[];
  /** Output schema shape (for downstream variable mapping) */
  outputSchema?: Record<string, "string" | "number" | "boolean" | "object" | "array">;
  /** Whether this node can pause execution (e.g. delay/wait) */
  async?: boolean;
};

/** Options shared by the AI nodes. Values must match what the AI layer accepts. */
const AI_MODEL_OPTIONS = [
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (fast, default)" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite (cheapest)" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (most capable)" },
];
const TONE_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "professional and friendly", label: "Professional and friendly" },
  { value: "casual", label: "Casual" },
  { value: "formal", label: "Formal" },
  { value: "empathetic", label: "Empathetic" },
];
const LANGUAGE_OPTIONS = [
  { value: "English", label: "English" },
  { value: "Bengali", label: "Bengali (বাংলা)" },
  { value: "Hindi", label: "Hindi (हिन्दी)" },
  { value: "Arabic", label: "Arabic (العربية)" },
  { value: "Spanish", label: "Spanish" },
  { value: "French", label: "French" },
  { value: "German", label: "German" },
  { value: "Portuguese", label: "Portuguese" },
  { value: "Urdu", label: "Urdu" },
];

export const NODE_REGISTRY: NodeDefinition[] = [
  // ─── WhatsApp Triggers ───────────────────────────────────────
  {
    type: "trigger.message.received",
    kind: "trigger",
    category: "WhatsApp",
    label: "New message",
    description: "Fires when a customer sends an inbound WhatsApp message.",
    icon: "MessageCircle",
    inputs: [
      { key: "keyword", label: "Keyword filter", type: "text", placeholder: "e.g. HELP" },
      { key: "match_type", label: "Match", type: "select", options: [
        { value: "contains", label: "Contains" },
        { value: "equals", label: "Equals" },
        { value: "starts_with", label: "Starts with" },
        { value: "regex", label: "Regex" },
      ] },
      { key: "channel_id", label: "Channel", type: "reference", reference: "channel" },
    ],
    outputSchema: { message: "object", contact: "object", conversation: "object" },
  },
  {
    type: "trigger.message.delivered",
    kind: "trigger",
    category: "WhatsApp",
    label: "Message delivered",
    description: "Fires when an outbound message is delivered to the recipient.",
    icon: "CheckCheck",
    inputs: [{ key: "channel_id", label: "Channel", type: "reference", reference: "channel" }],
    outputSchema: { message: "object", contact: "object" },
  },
  {
    type: "trigger.message.read",
    kind: "trigger",
    category: "WhatsApp",
    label: "Message read",
    description: "Fires when the recipient reads (blue-ticks) an outbound message.",
    icon: "Eye",
    inputs: [{ key: "channel_id", label: "Channel", type: "reference", reference: "channel" }],
    outputSchema: { message: "object", contact: "object" },
  },
  {
    type: "trigger.template.delivered",
    kind: "trigger",
    category: "WhatsApp",
    label: "Template delivered",
    description: "Fires when a WhatsApp template message is delivered.",
    icon: "FileCheck",
    inputs: [
      { key: "template_id", label: "Template", type: "reference", reference: "wa_template" },
      { key: "channel_id", label: "Channel", type: "reference", reference: "channel" },
    ],
    outputSchema: { message: "object", template: "object", contact: "object" },
  },
  {
    type: "trigger.conversation.created",
    kind: "trigger",
    category: "WhatsApp",
    label: "Conversation created",
    description: "Fires when a new conversation is opened.",
    icon: "MessagesSquare",
    inputs: [{ key: "channel_id", label: "Channel", type: "reference", reference: "channel" }],
    outputSchema: { conversation: "object", contact: "object" },
  },
  {
    type: "trigger.conversation.closed",
    kind: "trigger",
    category: "WhatsApp",
    label: "Conversation closed",
    description: "Fires when a conversation is resolved / closed.",
    icon: "MessageSquareOff",
    inputs: [
      { key: "channel_id", label: "Channel", type: "reference", reference: "channel" },
      { key: "reason", label: "Close reason", type: "text", placeholder: "resolved" },
    ],
    outputSchema: { conversation: "object", contact: "object", agent: "object" },
  },

  // ─── CRM Triggers ────────────────────────────────────────────
  {
    type: "trigger.contact.created",
    kind: "trigger",
    category: "CRM",
    label: "New contact",
    description: "Fires when a new contact is added to the CRM.",
    icon: "UserPlus",
    inputs: [{ key: "source", label: "Source filter", type: "text", placeholder: "e.g. whatsapp" }],
    outputSchema: { contact: "object" },
  },
  {
    type: "trigger.lead.created",
    kind: "trigger",
    category: "CRM",
    label: "New lead",
    description: "Fires when a new lead is captured.",
    icon: "UserSearch",
    inputs: [
      { key: "source", label: "Source filter", type: "text", placeholder: "e.g. web_form" },
      { key: "min_score", label: "Min lead score", type: "number", placeholder: "0" },
    ],
    outputSchema: { lead: "object", contact: "object" },
  },
  {
    type: "trigger.lead.converted",
    kind: "trigger",
    category: "CRM",
    label: "Lead converted",
    description: "Fires when a lead is converted to a contact or deal.",
    icon: "UserCheck",
    outputSchema: { lead: "object", contact: "object", deal: "object" },
  },
  {
    type: "trigger.deal.created",
    kind: "trigger",
    category: "Sales",
    label: "Deal created",
    description: "Fires when a new deal is opened.",
    icon: "DollarSign",
    inputs: [
      { key: "pipeline_id", label: "Pipeline", type: "reference", reference: "pipeline" },
      { key: "min_value", label: "Min value", type: "number", placeholder: "0" },
    ],
    outputSchema: { deal: "object", contact: "object" },
  },
  {
    type: "trigger.deal.stage_changed",
    kind: "trigger",
    category: "Sales",
    label: "Deal stage changed",
    description: "Fires when a deal moves between pipeline stages.",
    icon: "TrendingUp",
    inputs: [
      { key: "pipeline_id", label: "Pipeline", type: "reference", reference: "pipeline" },
      { key: "to_stage_id", label: "To stage", type: "reference", reference: "stage" },
    ],
    outputSchema: { deal: "object", from_stage: "object", to_stage: "object" },
  },
  {
    type: "trigger.deal.won",
    kind: "trigger",
    category: "Sales",
    label: "Deal won",
    description: "Fires when a deal reaches a Won stage.",
    icon: "Trophy",
    inputs: [{ key: "pipeline_id", label: "Pipeline", type: "reference", reference: "pipeline" }],
    outputSchema: { deal: "object", contact: "object" },
  },
  {
    type: "trigger.deal.lost",
    kind: "trigger",
    category: "Sales",
    label: "Deal lost",
    description: "Fires when a deal reaches a Lost stage.",
    icon: "TrendingDown",
    inputs: [
      { key: "pipeline_id", label: "Pipeline", type: "reference", reference: "pipeline" },
      { key: "reason", label: "Lost reason", type: "text" },
    ],
    outputSchema: { deal: "object", contact: "object", reason: "string" },
  },
  {
    type: "trigger.task.created",
    kind: "trigger",
    category: "CRM",
    label: "Task created",
    description: "Fires when a task is created for an agent.",
    icon: "CheckSquare",
    inputs: [
      { key: "assignee_id", label: "Assignee filter", type: "reference", reference: "user" },
      { key: "priority", label: "Priority", type: "select", options: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ] },
    ],
    outputSchema: { task: "object", assignee: "object" },
  },
  {
    type: "trigger.campaign.completed",
    kind: "trigger",
    category: "Marketing",
    label: "Campaign completed",
    description: "Fires when a broadcast campaign finishes sending.",
    icon: "Megaphone",
    inputs: [{ key: "campaign_id", label: "Campaign", type: "reference", reference: "campaign" }],
    outputSchema: { campaign: "object", stats: "object" },
  },

  // ─── Time Triggers ───────────────────────────────────────────
  {
    type: "trigger.schedule.once",
    kind: "trigger",
    category: "Schedule",
    label: "Schedule (one-time)",
    description: "Runs once at a specific date and time.",
    icon: "CalendarClock",
    inputs: [
      { key: "run_at", label: "Run at (ISO datetime)", type: "text", placeholder: "2026-08-01T09:00:00Z", required: true },
      { key: "timezone", label: "Timezone", type: "text", placeholder: "UTC" },
    ],
  },
  {
    type: "trigger.schedule.cron",
    kind: "trigger",
    category: "Schedule",
    label: "Recurring (cron)",
    description: "Runs on a recurring schedule.",
    icon: "Clock",
    inputs: [
      { key: "cron", label: "Cron expression", type: "text", placeholder: "0 9 * * 1-5", required: true },
      { key: "timezone", label: "Timezone", type: "text", placeholder: "UTC" },
    ],
  },
  {
    type: "trigger.schedule.delay",
    kind: "trigger",
    category: "Schedule",
    label: "Delay after event",
    description: "Fires after a delay from another trigger event.",
    icon: "Hourglass",
    async: true,
    inputs: [
      { key: "duration", label: "Duration", type: "number", required: true, placeholder: "1" },
      { key: "unit", label: "Unit", type: "select", options: [
        { value: "minutes", label: "Minutes" },
        { value: "hours", label: "Hours" },
        { value: "days", label: "Days" },
      ] },
      { key: "event", label: "Source event", type: "text", placeholder: "contact.created" },
    ],
  },

  // ─── Integration Triggers ────────────────────────────────────
  {
    type: "trigger.webhook",
    kind: "trigger",
    category: "Integrations",
    label: "Webhook received",
    description: "Fires when an external service POSTs to the workflow URL.",
    icon: "Webhook",
    inputs: [
      { key: "secret", label: "Signing secret", type: "text", placeholder: "shared HMAC secret" },
      { key: "method", label: "Method", type: "select", options: [
        { value: "POST", label: "POST" },
        { value: "PUT", label: "PUT" },
        { value: "PATCH", label: "PATCH" },
      ] },
    ],
    outputSchema: { headers: "object", body: "object", query: "object" },
  },
  {
    type: "trigger.api",
    kind: "trigger",
    category: "Integrations",
    label: "API trigger",
    description: "Fires when an authenticated API call invokes this workflow.",
    icon: "Plug",
    inputs: [
      { key: "auth_scheme", label: "Auth scheme", type: "select", options: [
        { value: "bearer", label: "Bearer token" },
        { value: "api_key", label: "API key header" },
        { value: "oauth", label: "OAuth 2.0" },
      ] },
      { key: "scope", label: "Required scope", type: "text", placeholder: "workflows:invoke" },
    ],
    outputSchema: { payload: "object", caller: "object" },
  },
  {
    type: "trigger.manual",
    kind: "trigger",
    category: "Integrations",
    label: "Manual trigger",
    description: "Runs only when an agent starts it from the UI.",
    icon: "Hand",
    inputs: [
      { key: "button_label", label: "Button label", type: "text", placeholder: "Run workflow" },
      { key: "confirm", label: "Require confirmation", type: "boolean" },
    ],
    outputSchema: { user: "object", input: "object" },
  },



  // ─── Logic ───────────────────────────────────────────────────
  {
    type: "logic.if",
    kind: "logic",
    category: "Logic",
    label: "If / Else",
    description: "Branch based on a condition.",
    icon: "GitBranch",
    inputs: [
      { key: "expression", label: "Condition", type: "text", placeholder: "{{contact.tags}} contains 'vip'", required: true },
    ],
  },
  {
    type: "logic.delay",
    kind: "logic",
    category: "Logic",
    label: "Delay",
    description: "Pause execution for a duration.",
    icon: "Timer",
    async: true,
    inputs: [
      { key: "duration", label: "Duration", type: "number", required: true, placeholder: "30" },
      {
        key: "unit",
        label: "Unit",
        type: "select",
        options: [
          { value: "seconds", label: "Seconds" },
          { value: "minutes", label: "Minutes" },
          { value: "hours", label: "Hours" },
          { value: "days", label: "Days" },
        ],
      },
    ],
  },
  {
    type: "logic.switch",
    kind: "logic",
    category: "Logic",
    label: "Switch",
    description: "Route to one of many branches by value.",
    icon: "Split",
    inputs: [
      { key: "expression", label: "Value expression", type: "text", required: true, placeholder: "{{contact.status}}" },
      { key: "cases", label: "Cases (JSON)", type: "json", required: true, helpText: 'e.g. [{"value":"vip","branch":"a"},{"value":"lead","branch":"b"}]' },
      { key: "default_branch", label: "Default branch", type: "text", placeholder: "else" },
    ],
    outputSchema: { branch: "string", value: "string" },
  },
  {
    type: "logic.loop",
    kind: "logic",
    category: "Logic",
    label: "Loop over items",
    description: "Iterate over an array and run child nodes per item.",
    icon: "Repeat",
    inputs: [{ key: "items", label: "Items expression", type: "text", required: true }],
  },
  {
    type: "logic.boolean",
    kind: "logic",
    category: "Logic",
    label: "Boolean check",
    description: "Evaluate an expression as true/false and branch.",
    icon: "ToggleLeft",
    inputs: [
      { key: "expression", label: "Boolean expression", type: "text", required: true, placeholder: "{{contact.is_vip}}" },
    ],
    outputSchema: { result: "boolean" },
  },
  {
    type: "logic.compare_text",
    kind: "logic",
    category: "Logic",
    label: "Compare text",
    description: "String comparison with case sensitivity.",
    icon: "Type",
    inputs: [
      { key: "left", label: "Left value", type: "text", required: true, placeholder: "{{contact.email}}" },
      { key: "operator", label: "Operator", type: "select", required: true, options: [
        { value: "equals", label: "Equals" },
        { value: "not_equals", label: "Not equals" },
        { value: "contains", label: "Contains" },
        { value: "not_contains", label: "Does not contain" },
        { value: "starts_with", label: "Starts with" },
        { value: "ends_with", label: "Ends with" },
        { value: "regex", label: "Matches regex" },
        { value: "is_empty", label: "Is empty" },
        { value: "is_not_empty", label: "Is not empty" },
      ] },
      { key: "right", label: "Right value", type: "text", placeholder: "@acme.com" },
      { key: "case_sensitive", label: "Case sensitive", type: "boolean" },
    ],
    outputSchema: { result: "boolean" },
  },
  {
    type: "logic.compare_number",
    kind: "logic",
    category: "Logic",
    label: "Compare numbers",
    description: "Numeric comparison between two values.",
    icon: "Calculator",
    inputs: [
      { key: "left", label: "Left value", type: "text", required: true, placeholder: "{{deal.value}}" },
      { key: "operator", label: "Operator", type: "select", required: true, options: [
        { value: "eq", label: "=" },
        { value: "neq", label: "≠" },
        { value: "gt", label: ">" },
        { value: "gte", label: "≥" },
        { value: "lt", label: "<" },
        { value: "lte", label: "≤" },
        { value: "between", label: "Between" },
      ] },
      { key: "right", label: "Right value", type: "text", required: true, placeholder: "1000" },
      { key: "right_upper", label: "Upper bound (between)", type: "text" },
    ],
    outputSchema: { result: "boolean" },
  },
  {
    type: "logic.compare_date",
    kind: "logic",
    category: "Logic",
    label: "Compare dates",
    description: "Compare dates or relative time windows.",
    icon: "CalendarRange",
    inputs: [
      { key: "left", label: "Left date", type: "text", required: true, placeholder: "{{contact.last_seen_at}}" },
      { key: "operator", label: "Operator", type: "select", required: true, options: [
        { value: "before", label: "Before" },
        { value: "after", label: "After" },
        { value: "same_day", label: "Same day as" },
        { value: "within_last", label: "Within last (duration)" },
        { value: "older_than", label: "Older than (duration)" },
        { value: "between", label: "Between" },
      ] },
      { key: "right", label: "Right date / duration", type: "text", required: true, placeholder: "7d, now, 2026-01-01" },
      { key: "right_upper", label: "Upper bound (between)", type: "text" },
      { key: "timezone", label: "Timezone", type: "text", placeholder: "UTC" },
    ],
    outputSchema: { result: "boolean" },
  },
  {
    type: "logic.contains",
    kind: "logic",
    category: "Logic",
    label: "Contains",
    description: "Check if a value contains a substring or list item.",
    icon: "Search",
    inputs: [
      { key: "haystack", label: "Value / array", type: "text", required: true, placeholder: "{{contact.tags}}" },
      { key: "needle", label: "Needle", type: "text", required: true, placeholder: "vip" },
      { key: "case_sensitive", label: "Case sensitive", type: "boolean" },
    ],
    outputSchema: { result: "boolean" },
  },
  {
    type: "logic.starts_with",
    kind: "logic",
    category: "Logic",
    label: "Starts with",
    description: "Check if a string begins with a prefix.",
    icon: "ChevronsRight",
    inputs: [
      { key: "value", label: "Value", type: "text", required: true },
      { key: "prefix", label: "Prefix", type: "text", required: true },
      { key: "case_sensitive", label: "Case sensitive", type: "boolean" },
    ],
    outputSchema: { result: "boolean" },
  },
  {
    type: "logic.ends_with",
    kind: "logic",
    category: "Logic",
    label: "Ends with",
    description: "Check if a string ends with a suffix.",
    icon: "ChevronsLeft",
    inputs: [
      { key: "value", label: "Value", type: "text", required: true },
      { key: "suffix", label: "Suffix", type: "text", required: true },
      { key: "case_sensitive", label: "Case sensitive", type: "boolean" },
    ],
    outputSchema: { result: "boolean" },
  },
  {
    type: "logic.regex",
    kind: "logic",
    category: "Logic",
    label: "Regex match",
    description: "Test a value against a regular expression.",
    icon: "Regex",
    inputs: [
      { key: "value", label: "Value", type: "text", required: true, placeholder: "{{message.body}}" },
      { key: "pattern", label: "Pattern", type: "text", required: true, placeholder: "^(hi|hello)\\b" },
      { key: "flags", label: "Flags", type: "text", placeholder: "i" },
    ],
    outputSchema: { result: "boolean", groups: "array" },
  },
  {
    type: "logic.and",
    kind: "logic",
    category: "Logic",
    label: "AND (all of)",
    description: "True only when all conditions are true.",
    icon: "Ampersand",
    inputs: [
      { key: "conditions", label: "Conditions (JSON array)", type: "json", required: true, helpText: 'e.g. ["{{a.result}}","{{b.result}}"]' },
    ],
    outputSchema: { result: "boolean" },
  },
  {
    type: "logic.or",
    kind: "logic",
    category: "Logic",
    label: "OR (any of)",
    description: "True when at least one condition is true.",
    icon: "GitMerge",
    inputs: [
      { key: "conditions", label: "Conditions (JSON array)", type: "json", required: true },
    ],
    outputSchema: { result: "boolean" },
  },
  {
    type: "logic.not",
    kind: "logic",
    category: "Logic",
    label: "NOT",
    description: "Invert a boolean expression.",
    icon: "Ban",
    inputs: [
      { key: "expression", label: "Expression", type: "text", required: true, placeholder: "{{previous.result}}" },
    ],
    outputSchema: { result: "boolean" },
  },
  {
    type: "logic.decision_tree",
    kind: "logic",
    category: "Logic",
    label: "Decision tree",
    description: "Multi-branch rule set with nested conditions.",
    icon: "Network",
    inputs: [
      { key: "rules", label: "Rules (JSON)", type: "json", required: true, helpText: 'Nested rules: [{ "when": { "all": [{"left":"{{deal.value}}","op":"gte","right":1000}] }, "branch": "hot" }, { "when": { "any": [...] }, "branch": "warm" }]' },
      { key: "default_branch", label: "Default branch", type: "text", placeholder: "cold" },
    ],
    outputSchema: { branch: "string", matched: "boolean" },
  },
  {
    type: "logic.expression",
    kind: "logic",
    category: "Logic",
    label: "Expression",
    description: "Evaluate a safe expression and expose the result as a variable.",
    icon: "FunctionSquare",
    inputs: [
      { key: "name", label: "Output variable name", type: "text", required: true, placeholder: "score" },
      { key: "expression", label: "Expression", type: "textarea", required: true, placeholder: "{{deal.value}} * 0.1 + {{contact.score}}" },
      { key: "type", label: "Return type", type: "select", options: [
        { value: "auto", label: "Auto" },
        { value: "string", label: "String" },
        { value: "number", label: "Number" },
        { value: "boolean", label: "Boolean" },
        { value: "json", label: "JSON" },
      ] },
    ],
    outputSchema: { value: "string" },
  },
  {
    type: "logic.set_variable",
    kind: "logic",
    category: "Logic",
    label: "Set variable",
    description: "Store a value in the run context for later nodes.",
    icon: "Variable",
    inputs: [
      { key: "name", label: "Variable name", type: "text", required: true },
      { key: "value", label: "Value / expression", type: "textarea", required: true },
    ],
    outputSchema: { name: "string", value: "string" },
  },

  // ─── WhatsApp actions ────────────────────────────────────────
  {
    type: "action.whatsapp.send_message",
    kind: "action",
    category: "WhatsApp",
    label: "Send WhatsApp message",
    description: "Send a session or template message to a contact.",
    icon: "Send",
    inputs: [
      { key: "contact_id", label: "Contact", type: "reference", reference: "contact", required: true },
      { key: "template_id", label: "Template", type: "reference", reference: "wa_template" },
      { key: "body", label: "Free-form body", type: "textarea", placeholder: "Session message body" },
    ],
    outputSchema: { message_id: "string", status: "string" },
  },
  {
    type: "action.whatsapp.send_template",
    kind: "action",
    category: "WhatsApp",
    label: "Send WA template",
    description: "Send an approved WhatsApp template with variables.",
    icon: "FileText",
    inputs: [
      { key: "contact_id", label: "Contact", type: "reference", reference: "contact", required: true },
      { key: "template_id", label: "Template", type: "reference", reference: "wa_template", required: true },
      { key: "variables", label: "Variables (JSON)", type: "json" },
    ],
  },
  {
    type: "action.whatsapp.assign_conversation",
    kind: "action",
    category: "WhatsApp",
    label: "Assign conversation",
    description: "Assign a conversation to an agent or team.",
    icon: "UserCheck",
    inputs: [
      { key: "conversation_id", label: "Conversation", type: "reference", reference: "conversation", required: true },
      { key: "assignee_id", label: "Assignee", type: "reference", reference: "user" },
      { key: "team_id", label: "Team", type: "reference", reference: "team" },
    ],
  },
  {
    type: "action.whatsapp.add_label",
    kind: "action",
    category: "WhatsApp",
    label: "Add conversation label",
    description: "Attach a label to a conversation.",
    icon: "Tag",
    inputs: [
      { key: "conversation_id", label: "Conversation", type: "reference", reference: "conversation", required: true },
      { key: "label", label: "Label", type: "text", required: true },
      { key: "color", label: "Color", type: "text", placeholder: "#3B82F6" },
    ],
  },
  {
    type: "action.whatsapp.archive_conversation",
    kind: "action",
    category: "WhatsApp",
    label: "Archive conversation",
    description: "Archive or close a conversation.",
    icon: "Archive",
    inputs: [
      { key: "conversation_id", label: "Conversation", type: "reference", reference: "conversation", required: true },
      { key: "reason", label: "Reason", type: "text" },
    ],
  },
  {
    type: "action.crm.handoff",
    kind: "action",
    category: "WhatsApp",
    label: "Handoff to human",
    description: "Pause bot replies and route the conversation to a human agent or team.",
    icon: "Headphones",
    inputs: [
      { key: "conversation_id", label: "Conversation", type: "reference", reference: "conversation", required: true },
      { key: "assignee_id", label: "Assign to agent", type: "reference", reference: "user" },
      { key: "team_id", label: "Assign to team", type: "reference", reference: "team" },
      { key: "priority", label: "Priority", type: "select", options: [
        { value: "low", label: "Low" },
        { value: "normal", label: "Normal" },
        { value: "high", label: "High" },
        { value: "urgent", label: "Urgent" },
      ] },
      { key: "note", label: "Internal note", type: "textarea", placeholder: "Context for the agent picking this up" },
      { key: "pause_bot", label: "Pause chatbot", type: "boolean" },
    ],
    outputSchema: { handoff_id: "string", assignee_id: "string" },
  },


  // ─── CRM actions ─────────────────────────────────────────────
  // ─── CRM actions ─────────────────────────────────────────────
  {
    type: "action.contact.create",
    kind: "action",
    category: "CRM",
    label: "Create contact",
    description: "Create a new CRM contact.",
    icon: "UserPlus",
    inputs: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "phone", label: "Phone / WhatsApp", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "company", label: "Company", type: "text" },
      { key: "fields", label: "Extra fields (JSON)", type: "json" },
    ],
    outputSchema: { contact_id: "string" },
  },
  {
    type: "action.contact.update",
    kind: "action",
    category: "CRM",
    label: "Update contact",
    description: "Set fields on a contact.",
    icon: "UserCog",
    inputs: [
      { key: "contact_id", label: "Contact", type: "reference", reference: "contact", required: true },
      { key: "fields", label: "Fields (JSON)", type: "json", required: true },
    ],
  },
  {
    type: "action.lead.create",
    kind: "action",
    category: "CRM",
    label: "Create lead",
    description: "Create a new lead in the CRM.",
    icon: "UserSearch",
    inputs: [
      { key: "contact_id", label: "Contact", type: "reference", reference: "contact" },
      { key: "source", label: "Source", type: "text", placeholder: "whatsapp" },
      { key: "score", label: "Lead score", type: "number" },
      { key: "owner_id", label: "Owner", type: "reference", reference: "user" },
      { key: "fields", label: "Extra fields (JSON)", type: "json" },
    ],
    outputSchema: { lead_id: "string" },
  },
  {
    type: "action.contact.add_tag",
    kind: "action",
    category: "CRM",
    label: "Add tag",
    description: "Attach a tag to a contact.",
    icon: "Tag",
    inputs: [
      { key: "contact_id", label: "Contact", type: "reference", reference: "contact", required: true },
      { key: "tag", label: "Tag", type: "text", required: true },
    ],
  },
  {
    type: "action.deal.create",
    kind: "action",
    category: "Sales",
    label: "Create deal",
    description: "Create a deal in a pipeline stage.",
    icon: "DollarSign",
    inputs: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "pipeline_id", label: "Pipeline", type: "reference", reference: "pipeline", required: true },
      { key: "stage_id", label: "Stage", type: "reference", reference: "stage", required: true },
      { key: "value", label: "Value", type: "number" },
      { key: "contact_id", label: "Contact", type: "reference", reference: "contact" },
    ],
    outputSchema: { deal_id: "string" },
  },
  {
    type: "action.deal.update",
    kind: "action",
    category: "Sales",
    label: "Update deal",
    description: "Update a deal's stage, value, or fields.",
    icon: "TrendingUp",
    inputs: [
      { key: "deal_id", label: "Deal", type: "reference", reference: "deal", required: true },
      { key: "stage_id", label: "Stage", type: "reference", reference: "stage" },
      { key: "value", label: "Value", type: "number" },
      { key: "fields", label: "Extra fields (JSON)", type: "json" },
    ],
  },
  {
    type: "action.task.create",
    kind: "action",
    category: "Sales",
    label: "Create task",
    description: "Assign a task to an agent.",
    icon: "CheckSquare",
    inputs: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "assignee_id", label: "Assignee", type: "reference", reference: "user" },
      { key: "due_at", label: "Due at", type: "text", placeholder: "ISO datetime" },
      { key: "priority", label: "Priority", type: "select", options: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ] },
      { key: "related_to", label: "Related to (JSON)", type: "json", helpText: "e.g. { deal_id, contact_id }" },
    ],
  },
  {
    type: "action.note.create",
    kind: "action",
    category: "CRM",
    label: "Create note",
    description: "Attach an internal note to a contact, deal, or conversation.",
    icon: "StickyNote",
    inputs: [
      { key: "body", label: "Note body", type: "textarea", required: true },
      { key: "contact_id", label: "Contact", type: "reference", reference: "contact" },
      { key: "deal_id", label: "Deal", type: "reference", reference: "deal" },
      { key: "conversation_id", label: "Conversation", type: "reference", reference: "conversation" },
      { key: "pinned", label: "Pin note", type: "boolean" },
    ],
  },

  // ─── Marketing actions ───────────────────────────────────────
  {
    type: "action.marketing.add_tag",
    kind: "action",
    category: "Marketing",
    label: "Add marketing tag",
    description: "Add an audience tag to a contact for segmentation.",
    icon: "Tags",
    inputs: [
      { key: "contact_id", label: "Contact", type: "reference", reference: "contact", required: true },
      { key: "tag", label: "Tag", type: "text", required: true },
    ],
  },
  {
    type: "action.marketing.start_campaign",
    kind: "action",
    category: "Marketing",
    label: "Start campaign",
    description: "Enroll a contact into a marketing campaign or drip.",
    icon: "Megaphone",
    inputs: [
      { key: "campaign_id", label: "Campaign", type: "reference", reference: "campaign", required: true },
      { key: "contact_id", label: "Contact", type: "reference", reference: "contact" },
      { key: "variables", label: "Variables (JSON)", type: "json" },
      {
        key: "confirm_send",
        label: "I understand this sends real messages",
        type: "boolean",
        helpText: "Resuming a paused campaign lets its queued messages go out to real contacts. Leave unchecked to block the step.",
      },
    ],
  },
  {
    type: "action.marketing.stop_campaign",
    kind: "action",
    category: "Marketing",
    label: "Stop campaign",
    description: "Remove a contact from a marketing campaign.",
    icon: "MegaphoneOff",
    inputs: [
      { key: "campaign_id", label: "Campaign", type: "reference", reference: "campaign", required: true },
      { key: "contact_id", label: "Contact", type: "reference", reference: "contact" },
      { key: "reason", label: "Reason", type: "text" },
    ],
  },

  // ─── AI ──────────────────────────────────────────────────────
  {
    type: "ai.classify",
    kind: "ai",
    category: "AI",
    label: "AI classify",
    description: "Classify text into labels via Lovable AI.",
    icon: "Bot",
    inputs: [
      { key: "text", label: "Text expression", type: "textarea", required: true },
      { key: "labels", label: "Labels (comma-separated)", type: "text", required: true },
      { key: "fallback", label: "Fallback label", type: "text" },
    ],
    outputSchema: { label: "string", provider_kind: "string", model: "string" },
  },
  {
    type: "ai.summarize",
    kind: "ai",
    category: "AI",
    label: "AI summarize",
    description: "Produce a short summary of the input text.",
    icon: "Sparkles",
    inputs: [
      { key: "text", label: "Text", type: "textarea", required: true },
      { key: "max_words", label: "Max words", type: "number", placeholder: "80" },
    ],
    outputSchema: { summary: "string" },
  },
  {
    type: "ai.generate_reply",
    kind: "ai",
    category: "AI",
    label: "AI draft reply",
    description: "Generate a suggested reply for the conversation.",
    icon: "MessageSquare",
    inputs: [
      { key: "conversation_id", label: "Conversation", type: "reference", reference: "conversation", required: true },
      { key: "tone", label: "Tone", type: "select", options: [
        { value: "friendly", label: "Friendly" },
        { value: "professional", label: "Professional" },
        { value: "concise", label: "Concise" },
      ] },
    ],
    outputSchema: { draft: "string" },
  },

  // ─── Notifications ───────────────────────────────────────────
  {
    type: "action.notify.internal",
    kind: "action",
    category: "Notifications",
    label: "Notify team",
    description: "Send an in-app notification to a user or role.",
    icon: "Bell",
    inputs: [
      { key: "user_id", label: "Recipient", type: "reference", reference: "user" },
      { key: "title", label: "Title", type: "text", required: true },
      { key: "body", label: "Body", type: "textarea" },
    ],
  },
  {
    type: "action.email.send",
    kind: "action",
    category: "Notifications",
    label: "Send email",
    description: "Send a transactional email.",
    icon: "Mail",
    inputs: [
      { key: "to", label: "To", type: "text", required: true },
      { key: "subject", label: "Subject", type: "text", required: true },
      { key: "html", label: "HTML body", type: "textarea" },
    ],
  },

  // ─── Integrations ────────────────────────────────────────────
  {
    type: "action.http.request",
    kind: "action",
    category: "Integrations",
    label: "HTTP request",
    description: "Call an external HTTP API.",
    icon: "Globe",
    inputs: [
      { key: "url", label: "URL", type: "text", required: true },
      { key: "method", label: "Method", type: "select", options: [
        { value: "GET", label: "GET" },
        { value: "POST", label: "POST" },
        { value: "PUT", label: "PUT" },
        { value: "PATCH", label: "PATCH" },
        { value: "DELETE", label: "DELETE" },
      ] },
      { key: "headers", label: "Headers (JSON)", type: "json" },
      { key: "body", label: "Body (JSON)", type: "json" },
    ],
    outputSchema: { status: "number", body: "object" },
  },
  {
    type: "action.webhook.send",
    kind: "action",
    category: "Integrations",
    label: "Send webhook",
    description: "POST an HMAC-signed webhook payload to a URL.",
    icon: "Webhook",
    inputs: [
      { key: "url", label: "URL", type: "text", required: true },
      { key: "payload", label: "Payload (JSON)", type: "json", required: true },
      { key: "secret", label: "Signing secret", type: "text", placeholder: "shared HMAC secret" },
      { key: "headers", label: "Extra headers (JSON)", type: "json" },
    ],
    outputSchema: { status: "number", delivered: "boolean" },
  },
  {
    type: "action.slack.notify",
    kind: "action",
    category: "Notifications",
    label: "Slack notification",
    description: "Post a message to a Slack channel via incoming webhook.",
    icon: "Slack",
    inputs: [
      { key: "webhook_url", label: "Slack webhook URL", type: "text", required: true },
      { key: "channel", label: "Channel", type: "text", placeholder: "#sales" },
      { key: "text", label: "Message", type: "textarea", required: true },
      { key: "blocks", label: "Blocks (JSON)", type: "json" },
    ],
  },
  {
    type: "action.database.update",
    kind: "action",
    category: "Integrations",
    label: "Database update",
    description: "Update rows in a platform table (RLS-scoped).",
    icon: "Database",
    inputs: [
      { key: "table", label: "Table", type: "text", required: true, placeholder: "contacts" },
      { key: "match", label: "Match (JSON)", type: "json", required: true, helpText: "e.g. { id: '{{contact.id}}' }" },
      { key: "values", label: "Values (JSON)", type: "json", required: true },
      { key: "upsert", label: "Upsert", type: "boolean" },
    ],
    outputSchema: { rows_affected: "number" },
  },

  // ─── AI Nodes ────────────────────────────────────────────────
  // Every AI node accepts an optional `provider_id` + `model` so users can
  // pick between OpenAI, Gemini, Claude, Lovable AI, etc. via the AI Provider
  // Engine. Leave blank to use the workspace default provider.
  {
    type: "ai.reply.generate",
    kind: "ai",
    category: "AI",
    label: "Generate AI Reply",
    description: "Drafts the next customer reply using an LLM.",
    icon: "Sparkles",
    inputs: [
      { key: "conversation", label: "Conversation / message", type: "textarea", required: true, placeholder: "{{trigger.message.text}}" },
      { key: "tone", label: "Tone", type: "select", options: TONE_OPTIONS },
      { key: "goal", label: "Goal", type: "text" },
      { key: "language", label: "Language", type: "select", options: [{ value: "", label: "Auto (match customer)" }, ...LANGUAGE_OPTIONS] },
      { key: "provider_id", label: "AI Provider", type: "reference", reference: "ai_provider", helpText: "Blank = workspace default." },
      { key: "model", label: "Model", type: "select", options: AI_MODEL_OPTIONS },
      { key: "temperature", label: "Temperature", type: "number" },
      { key: "system", label: "System prompt override", type: "textarea" },
    ],
    outputSchema: { reply: "string", model: "string", provider_kind: "string" },
  },
  {
    type: "ai.summarize",
    kind: "ai",
    category: "AI",
    label: "Summarize Conversation",
    description: "Produces a factual summary of a conversation.",
    icon: "FileText",
    inputs: [
      { key: "conversation", label: "Conversation", type: "textarea", required: true },
      { key: "style", label: "Style", type: "select", options: [
        { value: "bullet-points", label: "Bullet points" },
        { value: "paragraph", label: "Paragraph" },
        { value: "tl;dr", label: "TL;DR" },
      ] },
      { key: "length", label: "Length", type: "select", options: [
        { value: "short", label: "Short" },
        { value: "medium", label: "Medium" },
        { value: "detailed", label: "Detailed" },
      ] },
      { key: "provider_id", label: "AI Provider", type: "reference", reference: "ai_provider" },
      { key: "model", label: "Model", type: "select", options: AI_MODEL_OPTIONS },
    ],
    outputSchema: { summary: "string", model: "string" },
  },
  {
    type: "ai.sentiment",
    kind: "ai",
    category: "AI",
    label: "Analyze Sentiment",
    description: "Classifies sentiment (positive/neutral/negative) with a score and emotions.",
    icon: "Smile",
    inputs: [
      { key: "text", label: "Text", type: "textarea", required: true },
      { key: "provider_id", label: "AI Provider", type: "reference", reference: "ai_provider" },
      { key: "model", label: "Model", type: "select", options: AI_MODEL_OPTIONS },
    ],
    outputSchema: { sentiment: "string", score: "number", emotions: "array", reason: "string" },
  },
  {
    type: "ai.intent",
    kind: "ai",
    category: "AI",
    label: "Detect Intent",
    description: "Identifies primary intent from a message with confidence + entities.",
    icon: "Target",
    inputs: [
      { key: "text", label: "Message", type: "textarea", required: true },
      { key: "intents", label: "Allowed intents (JSON array)", type: "json", helpText: `e.g. ["question","complaint","purchase_interest","cancellation"]` },
      { key: "provider_id", label: "AI Provider", type: "reference", reference: "ai_provider" },
      { key: "model", label: "Model", type: "select", options: AI_MODEL_OPTIONS },
    ],
    outputSchema: { intent: "string", confidence: "number", entities: "object" },
  },
  {
    type: "ai.crm_note",
    kind: "ai",
    category: "AI",
    label: "Generate CRM Note",
    description: "Creates a structured CRM note (what happened / info / next step).",
    icon: "StickyNote",
    inputs: [
      { key: "conversation", label: "Source", type: "textarea", required: true },
      { key: "provider_id", label: "AI Provider", type: "reference", reference: "ai_provider" },
      { key: "model", label: "Model", type: "select", options: AI_MODEL_OPTIONS },
    ],
    outputSchema: { note: "string" },
  },
  {
    type: "ai.email",
    kind: "ai",
    category: "AI",
    label: "Generate Email",
    description: "Drafts a subject + body for a business email.",
    icon: "Mail",
    inputs: [
      { key: "purpose", label: "Purpose / goal", type: "textarea", required: true },
      { key: "recipient", label: "Recipient context", type: "textarea" },
      { key: "context", label: "Extra context", type: "textarea" },
      { key: "tone", label: "Tone", type: "select", options: TONE_OPTIONS },
      { key: "subject", label: "Subject hint", type: "text" },
      { key: "provider_id", label: "AI Provider", type: "reference", reference: "ai_provider" },
      { key: "model", label: "Model", type: "select", options: AI_MODEL_OPTIONS },
    ],
    outputSchema: { subject: "string", body: "string" },
  },
  {
    type: "ai.rewrite",
    kind: "ai",
    category: "AI",
    label: "Rewrite Message",
    description: "Rewrites text in a different style/tone while preserving meaning.",
    icon: "PenLine",
    inputs: [
      { key: "text", label: "Text", type: "textarea", required: true },
      { key: "style", label: "Style", type: "text", placeholder: "clearer and more professional" },
      { key: "provider_id", label: "AI Provider", type: "reference", reference: "ai_provider" },
      { key: "model", label: "Model", type: "select", options: AI_MODEL_OPTIONS },
    ],
    outputSchema: { text: "string" },
  },
  {
    type: "ai.translate",
    kind: "ai",
    category: "AI",
    label: "Translate Text",
    description: "Translates text into the target language.",
    icon: "Languages",
    inputs: [
      { key: "text", label: "Text", type: "textarea", required: true },
      { key: "target_language", label: "Target language", type: "select", required: true, options: LANGUAGE_OPTIONS },
      { key: "provider_id", label: "AI Provider", type: "reference", reference: "ai_provider" },
      { key: "model", label: "Model", type: "select", options: AI_MODEL_OPTIONS },
    ],
    outputSchema: { text: "string", language: "string" },
  },
  {
    type: "ai.categorize",
    kind: "ai",
    category: "AI",
    label: "Categorize Conversation",
    description: "Assigns a category + tags to a conversation.",
    icon: "Tags",
    inputs: [
      { key: "conversation", label: "Conversation", type: "textarea", required: true },
      { key: "categories", label: "Categories (JSON array)", type: "json", helpText: `e.g. ["sales","support","billing"]` },
      { key: "provider_id", label: "AI Provider", type: "reference", reference: "ai_provider" },
      { key: "model", label: "Model", type: "select", options: AI_MODEL_OPTIONS },
    ],
    outputSchema: { category: "string", confidence: "number", tags: "array" },
  },
  {
    type: "ai.classify_lead",
    kind: "ai",
    category: "AI",
    label: "Classify Lead",
    description: "Scores a lead (0-100), grades Hot/Warm/Cold, recommends next action.",
    icon: "Flame",
    inputs: [
      { key: "lead", label: "Lead / conversation", type: "textarea", required: true },
      { key: "provider_id", label: "AI Provider", type: "reference", reference: "ai_provider" },
      { key: "model", label: "Model", type: "select", options: AI_MODEL_OPTIONS },
    ],
    outputSchema: { score: "number", grade: "string", reasons: "array", next_action: "string", buying_intent: "string" },
  },
  {
    type: "ai.extract",
    kind: "ai",
    category: "AI",
    label: "Extract Data",
    description: "Extracts structured fields (email, phone, name, company, custom fields).",
    icon: "Braces",
    inputs: [
      { key: "text", label: "Text", type: "textarea", required: true },
      { key: "fields", label: "Fields (JSON array)", type: "json", helpText: `e.g. [{"name":"email"},{"name":"budget","type":"number"}]` },
      { key: "provider_id", label: "AI Provider", type: "reference", reference: "ai_provider" },
      { key: "model", label: "Model", type: "select", options: AI_MODEL_OPTIONS },
    ],
    outputSchema: { data: "object" },
  },
  {
    type: "ai.followup",
    kind: "ai",
    category: "AI",
    label: "Generate Follow-up",
    description: "Drafts a short re-engagement follow-up message.",
    icon: "Send",
    inputs: [
      { key: "conversation", label: "Prior context", type: "textarea", required: true },
      { key: "last_contact", label: "Last contact", type: "text" },
      { key: "channel", label: "Channel", type: "select", options: [
        { value: "whatsapp", label: "WhatsApp" },
        { value: "email", label: "Email" },
        { value: "sms", label: "SMS" },
      ] },
      { key: "goal", label: "Goal", type: "text" },
      { key: "provider_id", label: "AI Provider", type: "reference", reference: "ai_provider" },
      { key: "model", label: "Model", type: "select", options: AI_MODEL_OPTIONS },
    ],
    outputSchema: { message: "string" },
  },
  {
    type: "ai.decision",
    kind: "ai",
    category: "AI",
    label: "AI Decision",
    description: "LLM picks one of the configured options based on criteria.",
    icon: "GitBranch",
    inputs: [
      { key: "context", label: "Context", type: "textarea", required: true },
      { key: "options", label: "Options (JSON array)", type: "json", required: true, helpText: `e.g. ["approve","reject","needs_review"]` },
      { key: "criteria", label: "Decision criteria", type: "textarea" },
      { key: "provider_id", label: "AI Provider", type: "reference", reference: "ai_provider" },
      { key: "model", label: "Model", type: "select", options: AI_MODEL_OPTIONS },
    ],
    outputSchema: { decision: "string", confidence: "number", reason: "string" },
  },
  // ─── Omnichannel triggers ────────────────────────────────────
  {
    type: "trigger.omnichannel.message.received",
    kind: "trigger",
    category: "Omnichannel",
    label: "Message received (any channel)",
    description: "Fires on any inbound message across WhatsApp, Instagram, Messenger, Telegram, Email, SMS, Live Chat.",
    icon: "Inbox",
    inputs: [
      { key: "channels", label: "Channels (comma-separated)", type: "text", placeholder: "whatsapp,instagram,email,sms" },
      { key: "keyword", label: "Keyword filter", type: "text" },
    ],
    outputSchema: { channel: "string", message: "object", contact: "object", conversation: "object" },
  },
  {
    type: "trigger.instagram.message.received",
    kind: "trigger",
    category: "Omnichannel",
    label: "Instagram DM received",
    description: "Fires on inbound Instagram Direct Message.",
    icon: "Instagram",
    outputSchema: { message: "object", contact: "object", conversation: "object" },
  },
  {
    type: "trigger.messenger.message.received",
    kind: "trigger",
    category: "Omnichannel",
    label: "Messenger message received",
    description: "Fires on inbound Facebook Messenger message.",
    icon: "MessageSquare",
    outputSchema: { message: "object", contact: "object", conversation: "object" },
  },
  {
    type: "trigger.telegram.message.received",
    kind: "trigger",
    category: "Omnichannel",
    label: "Telegram message received",
    description: "Fires on inbound Telegram message.",
    icon: "Send",
    outputSchema: { message: "object", contact: "object", conversation: "object" },
  },
  {
    type: "trigger.email.received",
    kind: "trigger",
    category: "Omnichannel",
    label: "Email received",
    description: "Fires on inbound email to a shared inbox.",
    icon: "Mail",
    outputSchema: { email: "object", contact: "object", conversation: "object" },
  },
  {
    type: "trigger.sms.received",
    kind: "trigger",
    category: "Omnichannel",
    label: "SMS received",
    description: "Fires on inbound SMS message.",
    icon: "Smartphone",
    outputSchema: { message: "object", contact: "object", conversation: "object" },
  },
  {
    type: "trigger.livechat.message.received",
    kind: "trigger",
    category: "Omnichannel",
    label: "Live Chat message received",
    description: "Fires on inbound Live Chat message from the website widget.",
    icon: "MessageCircle",
    outputSchema: { message: "object", contact: "object", conversation: "object" },
  },
  {
    type: "trigger.call.completed",
    kind: "trigger",
    category: "Omnichannel",
    label: "Call completed",
    description: "Fires when a voice call ends (answered, missed, voicemail).",
    icon: "PhoneCall",
    inputs: [
      { key: "outcome", label: "Outcome filter", type: "select", options: [
        { value: "any", label: "Any" },
        { value: "answered", label: "Answered" },
        { value: "missed", label: "Missed" },
        { value: "voicemail", label: "Voicemail" },
      ] },
    ],
    outputSchema: { call: "object", contact: "object", duration: "number" },
  },

  // ─── Omnichannel actions ─────────────────────────────────────
  {
    type: "action.omnichannel.send",
    kind: "action",
    category: "Omnichannel",
    label: "Send message (smart channel)",
    description: "Send a message via the contact's preferred channel with automatic fallback.",
    icon: "Send",
    inputs: [
      { key: "contact_id", label: "Contact", type: "reference", reference: "contact", required: true },
      { key: "body", label: "Message body", type: "textarea", required: true },
      { key: "preferred_channel", label: "Preferred channel", type: "select", options: [
        { value: "auto", label: "Auto (contact preference)" },
        { value: "whatsapp", label: "WhatsApp" },
        { value: "instagram", label: "Instagram" },
        { value: "messenger", label: "Messenger" },
        { value: "telegram", label: "Telegram" },
        { value: "email", label: "Email" },
        { value: "sms", label: "SMS" },
        { value: "livechat", label: "Live Chat" },
      ] },
      { key: "fallback_channels", label: "Fallback channels (comma-separated)", type: "text", placeholder: "whatsapp,email,sms" },
    ],
    outputSchema: { channel_used: "string", message_id: "string", status: "string" },
  },
  {
    type: "action.instagram.send_message",
    kind: "action",
    category: "Omnichannel",
    label: "Send Instagram DM",
    description: "Send a Direct Message on Instagram.",
    icon: "Instagram",
    inputs: [
      { key: "contact_id", label: "Contact", type: "reference", reference: "contact", required: true },
      { key: "body", label: "Message body", type: "textarea", required: true },
    ],
    outputSchema: { message_id: "string", status: "string" },
  },
  {
    type: "action.messenger.send_message",
    kind: "action",
    category: "Omnichannel",
    label: "Send Messenger message",
    description: "Send a message on Facebook Messenger.",
    icon: "MessageSquare",
    inputs: [
      { key: "contact_id", label: "Contact", type: "reference", reference: "contact", required: true },
      { key: "body", label: "Message body", type: "textarea", required: true },
    ],
    outputSchema: { message_id: "string", status: "string" },
  },
  {
    type: "action.telegram.send_message",
    kind: "action",
    category: "Omnichannel",
    label: "Send Telegram message",
    description: "Send a message on Telegram.",
    icon: "Send",
    inputs: [
      { key: "contact_id", label: "Contact", type: "reference", reference: "contact", required: true },
      { key: "body", label: "Message body", type: "textarea", required: true },
    ],
    outputSchema: { message_id: "string", status: "string" },
  },
  {
    type: "action.sms.send",
    kind: "action",
    category: "Omnichannel",
    label: "Send SMS",
    description: "Send an SMS text message via Twilio.",
    icon: "Smartphone",
    inputs: [
      { key: "contact_id", label: "Contact", type: "reference", reference: "contact", required: true },
      { key: "body", label: "Message body", type: "textarea", required: true },
    ],
    outputSchema: { message_id: "string", status: "string" },
  },
  {
    type: "action.livechat.send_message",
    kind: "action",
    category: "Omnichannel",
    label: "Send Live Chat message",
    description: "Push a message to the customer's active Live Chat session.",
    icon: "MessageCircle",
    inputs: [
      { key: "conversation_id", label: "Conversation", type: "reference", reference: "conversation", required: true },
      { key: "body", label: "Message body", type: "textarea", required: true },
    ],
    outputSchema: { message_id: "string", status: "string" },
  },
  {
    type: "action.call.initiate",
    kind: "action",
    category: "Omnichannel",
    label: "Initiate call",
    description: "Trigger an outbound voice call to the contact.",
    icon: "PhoneCall",
    inputs: [
      { key: "contact_id", label: "Contact", type: "reference", reference: "contact", required: true },
      { key: "agent_id", label: "Agent", type: "reference", reference: "user" },
      { key: "script", label: "Call script / notes", type: "textarea" },
    ],
    outputSchema: { call_id: "string", status: "string" },
  },

  // ─── Omnichannel logic (wait-for-reply & cascade) ────────────
  {
    type: "logic.wait_for_reply",
    kind: "logic",
    category: "Omnichannel",
    label: "Wait for reply",
    description: "Pause until the contact replies on any channel, or timeout expires and continue down the fallback branch.",
    icon: "Hourglass",
    async: true,
    inputs: [
      { key: "contact_id", label: "Contact", type: "reference", reference: "contact", required: true },
      { key: "channels", label: "Watch channels", type: "text", placeholder: "any | whatsapp,email,sms" },
      { key: "timeout", label: "Timeout duration", type: "number", required: true, placeholder: "24" },
      { key: "unit", label: "Timeout unit", type: "select", options: [
        { value: "minutes", label: "Minutes" },
        { value: "hours", label: "Hours" },
        { value: "days", label: "Days" },
      ] },
    ],
    outputSchema: { replied: "boolean", channel: "string", message: "object" },
  },
  {
    type: "action.omnichannel.cascade",
    kind: "action",
    category: "Omnichannel",
    label: "Multi-channel cascade",
    description: "Try channels one-by-one with a wait between each. Stops as soon as the contact replies. Falls through to CRM handoff if all fail.",
    icon: "Waypoints",
    async: true,
    inputs: [
      { key: "contact_id", label: "Contact", type: "reference", reference: "contact", required: true },
      { key: "steps", label: "Cascade steps (JSON)", type: "json", required: true, helpText: `e.g. [{"channel":"instagram","body":"Hi {{contact.name}}","wait_hours":24},{"channel":"whatsapp","body":"Following up","wait_hours":24},{"channel":"email","subject":"Checking in","body":"Hi there","wait_hours":48}]` },
      { key: "on_no_reply", label: "On all-no-reply", type: "select", options: [
        { value: "create_task", label: "Create CRM task + notify sales" },
        { value: "notify_only", label: "Notify sales only" },
        { value: "nothing", label: "Do nothing" },
      ] },
      { key: "assignee_id", label: "Assign task to", type: "reference", reference: "user" },
    ],
    outputSchema: { replied: "boolean", channel_used: "string", steps_completed: "number", task_id: "string" },
  },

  // ─── Live Chat Triggers ──────────────────────────────────────
  {
    type: "trigger.livechat.time_on_page",
    kind: "trigger",
    category: "Live Chat",
    label: "Time on page",
    description: "Fires when a visitor has spent N seconds on a page.",
    icon: "Timer",
    inputs: [
      { key: "seconds", label: "Seconds on page", type: "number", required: true, placeholder: "30" },
      { key: "page", label: "Page contains", type: "text", placeholder: "/pricing" },
    ],
    outputSchema: { visitor: "object", page: "string", seconds: "number" },
  },
  {
    type: "trigger.livechat.exit_intent",
    kind: "trigger",
    category: "Live Chat",
    label: "Exit intent",
    description: "Fires when the visitor's cursor leaves the viewport indicating they may leave.",
    icon: "LogOut",
    inputs: [
      { key: "page", label: "Page contains", type: "text", placeholder: "/checkout" },
      { key: "min_seconds", label: "Min seconds on page", type: "number", placeholder: "10" },
    ],
    outputSchema: { visitor: "object", page: "string" },
  },
  {
    type: "trigger.livechat.scroll_percent",
    kind: "trigger",
    category: "Live Chat",
    label: "Scroll percentage",
    description: "Fires when the visitor scrolls past a % of the page.",
    icon: "MousePointerClick",
    inputs: [
      { key: "percent", label: "Percent scrolled", type: "number", required: true, placeholder: "75" },
      { key: "page", label: "Page contains", type: "text", placeholder: "/blog" },
    ],
    outputSchema: { visitor: "object", page: "string", percent: "number" },
  },
  {
    type: "trigger.livechat.visited_url",
    kind: "trigger",
    category: "Live Chat",
    label: "Visited URL",
    description: "Fires when a visitor loads a page matching a URL pattern.",
    icon: "Link2",
    inputs: [
      { key: "pattern", label: "URL contains", type: "text", required: true, placeholder: "/pricing" },
      { key: "match_type", label: "Match", type: "select", options: [
        { value: "contains", label: "Contains" },
        { value: "equals", label: "Equals" },
        { value: "regex", label: "Regex" },
      ] },
    ],
    outputSchema: { visitor: "object", page: "string" },
  },
  {
    type: "trigger.livechat.returning_visitor",
    kind: "trigger",
    category: "Live Chat",
    label: "Returning visitor",
    description: "Fires on the first pageview of a returning visitor session.",
    icon: "Repeat",
    inputs: [
      { key: "min_visits", label: "Min prior visits", type: "number", placeholder: "2" },
    ],
    outputSchema: { visitor: "object", visits_count: "number" },
  },
  {
    type: "trigger.livechat.cart_value",
    kind: "trigger",
    category: "Live Chat",
    label: "Cart value threshold",
    description: "Fires when the visitor's cart value crosses a threshold. Requires the site to emit a `cart_updated` custom event with `value` property.",
    icon: "ShoppingCart",
    inputs: [
      { key: "min_value", label: "Min cart value", type: "number", required: true, placeholder: "100" },
      { key: "currency", label: "Currency", type: "text", placeholder: "USD" },
    ],
    outputSchema: { visitor: "object", cart_value: "number", currency: "string" },
  },
  {
    type: "trigger.livechat.campaign_source",
    kind: "trigger",
    category: "Live Chat",
    label: "Campaign source",
    description: "Fires when the visitor lands with matching UTM parameters.",
    icon: "Megaphone",
    inputs: [
      { key: "utm_source", label: "utm_source", type: "text", placeholder: "google" },
      { key: "utm_medium", label: "utm_medium", type: "text", placeholder: "cpc" },
      { key: "utm_campaign", label: "utm_campaign", type: "text", placeholder: "black-friday" },
    ],
    outputSchema: { visitor: "object", utm: "object" },
  },
  {
    type: "trigger.livechat.country",
    kind: "trigger",
    category: "Live Chat",
    label: "Visitor country",
    description: "Fires when a visitor is detected from a specific country (ISO).",
    icon: "Globe",
    inputs: [
      { key: "countries", label: "Countries (comma separated ISO)", type: "text", required: true, placeholder: "US, GB, DE" },
    ],
    outputSchema: { visitor: "object", country: "string" },
  },
  {
    type: "trigger.livechat.device",
    kind: "trigger",
    category: "Live Chat",
    label: "Device type",
    description: "Fires when a visitor is on a specific device class.",
    icon: "Smartphone",
    inputs: [
      { key: "device", label: "Device", type: "select", required: true, options: [
        { value: "mobile", label: "Mobile" },
        { value: "tablet", label: "Tablet" },
        { value: "desktop", label: "Desktop" },
      ] },
    ],
    outputSchema: { visitor: "object", device: "string" },
  },
  {
    type: "trigger.livechat.language",
    kind: "trigger",
    category: "Live Chat",
    label: "Visitor language",
    description: "Fires when a visitor's browser language matches.",
    icon: "Languages",
    inputs: [
      { key: "languages", label: "Languages (comma separated)", type: "text", required: true, placeholder: "en, es, fr" },
    ],
    outputSchema: { visitor: "object", language: "string" },
  },
  {
    type: "trigger.livechat.business_hours",
    kind: "trigger",
    category: "Live Chat",
    label: "Business hours",
    description: "Fires only when the workspace's business hours are open (or closed).",
    icon: "Clock",
    inputs: [
      { key: "mode", label: "Fire when", type: "select", required: true, options: [
        { value: "open", label: "Currently open" },
        { value: "closed", label: "Currently closed" },
      ] },
    ],
    outputSchema: { visitor: "object", open: "boolean" },
  },
  {
    type: "trigger.livechat.custom_event",
    kind: "trigger",
    category: "Live Chat",
    label: "Custom event",
    description: "Fires when the widget emits a named custom event (e.g. `signup_started`).",
    icon: "Zap",
    inputs: [
      { key: "event_name", label: "Event name", type: "text", required: true, placeholder: "signup_started" },
    ],
    outputSchema: { visitor: "object", event_name: "string", properties: "object" },
  },

  // ─── Live Chat Actions ───────────────────────────────────────
  {
    type: "action.livechat.open_widget",
    kind: "action",
    category: "Live Chat",
    label: "Open widget",
    description: "Auto-open the chat widget for the visitor.",
    icon: "MessageSquarePlus",
    inputs: [
      { key: "with_message", label: "Show pre-filled message", type: "textarea", placeholder: "Need help with pricing?" },
      { key: "sound", label: "Play notification sound", type: "boolean" },
    ],
    outputSchema: { pushed: "boolean" },
  },
  {
    type: "action.livechat.send_message",
    kind: "action",
    category: "Live Chat",
    label: "Send message to visitor",
    description: "Send a proactive chat message from the bot or an agent persona.",
    icon: "Send",
    inputs: [
      { key: "body", label: "Message", type: "textarea", required: true, placeholder: "Hey! Anything we can help you with?" },
      { key: "sender", label: "Sender", type: "select", options: [
        { value: "bot", label: "Bot" },
        { value: "system", label: "System" },
      ] },
    ],
    outputSchema: { message_id: "string" },
  },
  {
    type: "action.livechat.start_ai_chat",
    kind: "action",
    category: "Live Chat",
    label: "Start AI chat",
    description: "Auto-open the widget and prime the AI assistant with an opening prompt.",
    icon: "Sparkles",
    inputs: [
      { key: "chatbot_id", label: "Chatbot", type: "reference", reference: "chatbot" },
      { key: "prompt", label: "Opening prompt", type: "textarea", placeholder: "You seem interested in Pro plan. How can I help?" },
    ],
    outputSchema: { session_id: "string" },
  },
  {
    type: "action.livechat.assign_agent",
    kind: "action",
    category: "Live Chat",
    label: "Assign agent",
    description: "Route the visitor to a specific agent, department, or the queue.",
    icon: "UserCheck",
    inputs: [
      { key: "target", label: "Target", type: "select", required: true, options: [
        { value: "agent", label: "Specific agent" },
        { value: "department", label: "Department" },
        { value: "queue", label: "General queue" },
      ] },
      { key: "agent_id", label: "Agent", type: "reference", reference: "user" },
      { key: "department_id", label: "Department", type: "reference", reference: "department" },
      { key: "priority", label: "Priority", type: "select", options: [
        { value: "low", label: "Low" },
        { value: "normal", label: "Normal" },
        { value: "high", label: "High" },
        { value: "urgent", label: "Urgent" },
      ] },
    ],
    outputSchema: { assigned_to: "string", queue_id: "string" },
  },
  {
    type: "action.livechat.create_lead",
    kind: "action",
    category: "Live Chat",
    label: "Create lead",
    description: "Create a CRM lead from the current visitor.",
    icon: "UserPlus",
    inputs: [
      { key: "source", label: "Source", type: "text", placeholder: "Live Chat" },
      { key: "notes", label: "Notes", type: "textarea", placeholder: "Visitor showed high intent on pricing page." },
      { key: "score", label: "Initial score", type: "number", placeholder: "50" },
    ],
    outputSchema: { lead_id: "string" },
  },
  {
    type: "action.livechat.create_task",
    kind: "action",
    category: "Live Chat",
    label: "Create task",
    description: "Create a follow-up task linked to the visitor / contact.",
    icon: "CheckSquare",
    inputs: [
      { key: "title", label: "Title", type: "text", required: true, placeholder: "Follow up with high-intent visitor" },
      { key: "assignee_id", label: "Assignee", type: "reference", reference: "user" },
      { key: "due_in_hours", label: "Due (hours)", type: "number", placeholder: "24" },
      { key: "priority", label: "Priority", type: "select", options: [
        { value: "low", label: "Low" }, { value: "normal", label: "Normal" },
        { value: "high", label: "High" }, { value: "urgent", label: "Urgent" },
      ] },
    ],
    outputSchema: { task_id: "string" },
  },
  {
    type: "action.livechat.trigger_workflow",
    kind: "action",
    category: "Live Chat",
    label: "Trigger workflow",
    description: "Enqueue another automation with the current visitor context as input.",
    icon: "Workflow",
    inputs: [
      { key: "workflow_id", label: "Workflow", type: "reference", reference: "workflow", required: true },
      { key: "run_at_iso", label: "Run at (ISO, blank = now)", type: "text", placeholder: "" },
    ],
    outputSchema: { queued_id: "string" },
  },

  // ─── Booking / Scheduling ────────────────────────────────────
  {
    type: "trigger.booking.created",
    kind: "trigger",
    category: "Booking",
    label: "Appointment booked",
    description: "Fires when a customer books an appointment.",
    icon: "CalendarPlus",
    inputs: [
      { key: "event_type_id", label: "Meeting type", type: "reference", reference: "booking_event_type" },
    ],
    outputSchema: { appointment: "object", host_id: "string", customer: "object" },
  },
  {
    type: "trigger.booking.cancelled",
    kind: "trigger",
    category: "Booking",
    label: "Appointment cancelled",
    description: "Fires when an appointment is cancelled.",
    icon: "CalendarX",
    outputSchema: { appointment: "object", reason: "string" },
  },
  {
    type: "trigger.booking.rescheduled",
    kind: "trigger",
    category: "Booking",
    label: "Appointment rescheduled",
    description: "Fires when a customer moves an existing appointment.",
    icon: "CalendarClock",
    outputSchema: { appointment: "object", previous_start: "string" },
  },
  {
    type: "trigger.booking.no_show",
    kind: "trigger",
    category: "Booking",
    label: "Marked as no-show",
    description: "Fires when a host marks an appointment as no-show.",
    icon: "UserX",
    outputSchema: { appointment: "object" },
  },
  {
    type: "action.booking.create",
    kind: "action",
    category: "Booking",
    label: "Create appointment",
    description: "Book a new appointment for a customer.",
    icon: "CalendarCheck",
    inputs: [
      { key: "event_type_id", label: "Meeting type", type: "reference", reference: "booking_event_type", required: true },
      { key: "customer_name", label: "Customer name", type: "text", required: true },
      { key: "customer_email", label: "Customer email", type: "text" },
      { key: "customer_phone", label: "Customer phone", type: "text" },
      { key: "start_at", label: "Start (ISO)", type: "text", required: true },
    ],
    outputSchema: { appointment: "object" },
  },
  {
    type: "action.booking.cancel",
    kind: "action",
    category: "Booking",
    label: "Cancel appointment",
    description: "Cancel an existing appointment.",
    icon: "CalendarX",
    inputs: [
      { key: "appointment_id", label: "Appointment", type: "reference", reference: "appointment", required: true },
      { key: "reason", label: "Reason", type: "text" },
    ],
  },
  {
    type: "action.booking.send_link",
    kind: "action",
    category: "Booking",
    label: "Send booking link",
    description: "Send the customer a link to self-book from this event type.",
    icon: "Link",
    inputs: [
      { key: "event_type_id", label: "Meeting type", type: "reference", reference: "booking_event_type", required: true },
      { key: "channel", label: "Channel", type: "select", options: [
        { value: "whatsapp", label: "WhatsApp" },
        { value: "email", label: "Email" },
        { value: "sms", label: "SMS" },
      ], required: true },
      { key: "to", label: "Recipient", type: "text", required: true },
    ],
  },
  // ─── Booking notifications ──────────────────────────────────────
  {
    type: "trigger.appointment.created",
    kind: "trigger",
    category: "Booking",
    label: "Appointment created",
    description: "Fires when a new appointment is booked.",
    icon: "CalendarPlus",
    inputs: [
      { key: "event_type_id", label: "Event type", type: "reference", reference: "booking_event_type" },
    ],
    outputSchema: { appointment: "object", customer: "object", host: "object" },
  },
  {
    type: "trigger.appointment.rescheduled",
    kind: "trigger",
    category: "Booking",
    label: "Appointment rescheduled",
    description: "Fires when an appointment is rescheduled.",
    icon: "CalendarClock",
    outputSchema: { appointment: "object" },
  },
  {
    type: "trigger.appointment.cancelled",
    kind: "trigger",
    category: "Booking",
    label: "Appointment cancelled",
    description: "Fires when an appointment is cancelled.",
    icon: "CalendarX",
    outputSchema: { appointment: "object", reason: "string" },
  },
  {
    type: "action.booking.notify",
    kind: "action",
    category: "Booking",
    label: "Send appointment notification",
    description: "Dispatch a booking notification (confirmation, reminder, follow-up, etc.) across selected channels.",
    icon: "BellRing",
    inputs: [
      { key: "appointment_id", label: "Appointment ID", type: "text", required: true },
      { key: "kind", label: "Notification kind", type: "select", required: true, options: [
        { value: "confirmation", label: "Confirmation" },
        { value: "reschedule", label: "Reschedule" },
        { value: "cancellation", label: "Cancellation" },
        { value: "reminder", label: "Reminder" },
        { value: "follow_up", label: "Follow-up" },
        { value: "review_request", label: "Review request" },
      ] },
    ],
    outputSchema: { sent: "number" },
  },
  {
    type: "action.booking.schedule_reminders",
    kind: "action",
    category: "Booking",
    label: "Schedule reminders",
    description: "Queue reminders for an appointment using the workspace's notification rules.",
    icon: "AlarmClock",
    inputs: [
      { key: "appointment_id", label: "Appointment ID", type: "text", required: true },
    ],
    outputSchema: { scheduled: "number" },
  },
];




/** Runtime-registered extensions (plugins, future triggers). */
const EXTENSIONS: NodeDefinition[] = [];

/** Register a custom node/trigger at runtime. Safe to call from plugin modules. */
export function registerNode(def: NodeDefinition): void {
  if (NODE_REGISTRY.some((n) => n.type === def.type) || EXTENSIONS.some((n) => n.type === def.type)) return;
  EXTENSIONS.push(def);
}

export function getAllNodes(): NodeDefinition[] {
  return [...NODE_REGISTRY, ...EXTENSIONS];
}

export const NODE_REGISTRY_BY_TYPE: Record<string, NodeDefinition> = new Proxy(
  {} as Record<string, NodeDefinition>,
  {
    get: (_t, key: string) =>
      NODE_REGISTRY.find((n) => n.type === key) ?? EXTENSIONS.find((n) => n.type === key),
    has: (_t, key: string) => getAllNodes().some((n) => n.type === key),
    ownKeys: () => getAllNodes().map((n) => n.type),
    getOwnPropertyDescriptor: (_t, key: string) => {
      const v = getAllNodes().find((n) => n.type === key);
      return v ? { value: v, enumerable: true, configurable: true } : undefined;
    },
  },
);

export const NODE_CATEGORIES = Array.from(new Set(NODE_REGISTRY.map((n) => n.category)));

export function getTriggers(): NodeDefinition[] {
  return getAllNodes().filter((n) => n.kind === "trigger");
}
export function getActions(): NodeDefinition[] {
  return getAllNodes().filter((n) => n.kind === "action");
}
export function getAiNodes(): NodeDefinition[] {
  return getAllNodes().filter((n) => n.kind === "ai");
}
export function getActionsByCategory(): Array<{ category: string; actions: NodeDefinition[] }> {
  const map = new Map<string, NodeDefinition[]>();
  for (const n of getActions()) {
    const list = map.get(n.category) ?? [];
    list.push(n);
    map.set(n.category, list);
  }
  return Array.from(map.entries()).map(([category, actions]) => ({ category, actions }));
}


/** Group triggers by category — used by the trigger library UI. */
export function getTriggersByCategory(): Array<{ category: string; triggers: NodeDefinition[] }> {
  const map = new Map<string, NodeDefinition[]>();
  for (const n of getTriggers()) {
    const list = map.get(n.category) ?? [];
    list.push(n);
    map.set(n.category, list);
  }
  return Array.from(map.entries()).map(([category, triggers]) => ({ category, triggers }));
}

