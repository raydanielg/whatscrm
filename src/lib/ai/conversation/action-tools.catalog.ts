/**
 * Client-safe re-export of the action tool catalog metadata.
 * (The .server module is not importable from browser code.)
 */
export const ACTION_TOOL_CATALOG = [
  { name: "create_contact",    label: "Create Contact",    group: "CRM",          description: "Add a contact to the CRM." },
  { name: "update_contact",    label: "Update Contact",    group: "CRM",          description: "Patch an existing contact." },
  { name: "create_lead",       label: "Create Lead",       group: "Sales",        description: "Create a lead." },
  { name: "create_deal",       label: "Create Deal",       group: "Sales",        description: "Open a deal in the pipeline." },
  { name: "create_task",       label: "Create Task",       group: "Productivity", description: "Create a follow-up task." },
  { name: "create_note",       label: "Create Note",       group: "Productivity", description: "Attach an internal note." },
  { name: "book_appointment",  label: "Book Appointment",  group: "Productivity", description: "Schedule a meeting." },
  { name: "list_meeting_slots",label: "List Meeting Slots",group: "Booking",      description: "List available booking slots for an event type." },
  { name: "book_meeting",      label: "Book Meeting",      group: "Booking",      description: "Create a real booking appointment." },
  { name: "cancel_meeting",    label: "Cancel Meeting",    group: "Booking",      description: "Cancel a booking appointment." },
  { name: "send_whatsapp",     label: "Send WhatsApp",     group: "Messaging",    description: "Queue an outbound WhatsApp message." },
  { name: "send_email",        label: "Send Email",        group: "Messaging",    description: "Queue an outbound email." },
  { name: "generate_invoice",  label: "Generate Invoice",  group: "Commerce",     description: "Create a draft invoice." },
  { name: "check_order",       label: "Check Order",       group: "Commerce",     description: "Look up an order / invoice." },
  { name: "update_crm",        label: "Update CRM",        group: "CRM",          description: "Generic record patch." },
  { name: "run_workflow",      label: "Run Workflow",      group: "Automation",   description: "Enqueue a saved automation." },
  { name: "webhook_call",      label: "Webhook Call",      group: "External",     description: "POST JSON to a webhook URL." },
  { name: "http_request",      label: "HTTP Request",      group: "External",     description: "Generic HTTP fetch." },
] as const;

export type ActionToolName = (typeof ACTION_TOOL_CATALOG)[number]["name"];
