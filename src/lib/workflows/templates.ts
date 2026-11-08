import type { WorkflowGraph } from "./types";

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  graph: WorkflowGraph;
};

const t = (x: number, y: number) => ({ x, y });

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "welcome-new-contact",
    name: "Welcome new contact",
    description: "Send a WhatsApp greeting when a new contact is created.",
    category: "Onboarding",
    icon: "UserPlus",
    graph: {
      nodes: [
        { id: "n1", type: "trigger.contact.created", position: t(60, 120), config: {} },
        { id: "n2", type: "logic.delay", position: t(360, 120), config: { duration: 1, unit: "minutes" } },
        { id: "n3", type: "action.whatsapp.send_message", position: t(660, 120), config: { body: "Hi {{contact.name}}, welcome aboard!" } },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
      ],
    },
  },
  {
    id: "keyword-autoreply",
    name: "Keyword auto-reply",
    description: "Reply automatically when a customer sends a keyword.",
    category: "WhatsApp",
    icon: "MessageCircle",
    graph: {
      nodes: [
        { id: "n1", type: "trigger.message.received", position: t(60, 120), config: { keyword: "HELP" } },
        { id: "n2", type: "ai.generate_reply", position: t(360, 120), config: { tone: "friendly" } },
        { id: "n3", type: "action.whatsapp.send_message", position: t(660, 120), config: { body: "{{n2.draft}}" } },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
      ],
    },
  },
  {
    id: "deal-won-notify",
    name: "Deal won → notify team",
    description: "Ping the sales channel when a deal reaches Won.",
    category: "Sales",
    icon: "TrendingUp",
    graph: {
      nodes: [
        { id: "n1", type: "trigger.deal.stage_changed", position: t(60, 120), config: {} },
        { id: "n2", type: "logic.if", position: t(360, 120), config: { expression: "{{to_stage.name}} == 'Won'" } },
        { id: "n3", type: "action.notify.internal", position: t(680, 40), config: { title: "🎉 Deal won" } },
        { id: "n4", type: "action.task.create", position: t(680, 220), config: { title: "Follow up" } },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3", branch: "true" },
        { id: "e3", source: "n2", target: "n4", branch: "false" },
      ],
    },
  },
  {
    id: "scheduled-digest",
    name: "Daily scheduled digest",
    description: "Email a summary every morning at 9am.",
    category: "Schedule",
    icon: "Clock",
    graph: {
      nodes: [
        { id: "n1", type: "trigger.schedule.cron", position: t(60, 120), config: { cron: "0 9 * * 1-5" } },
        { id: "n2", type: "ai.summarize", position: t(360, 120), config: { max_words: 120 } },
        { id: "n3", type: "action.email.send", position: t(660, 120), config: { subject: "Daily digest" } },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
      ],
    },
  },
  {
    id: "omnichannel-no-reply-cascade",
    name: "Omnichannel no-reply cascade",
    description: "Instagram → wait 24h → WhatsApp → wait 24h → Email → wait 48h → create CRM task, notify sales, schedule follow-up.",
    category: "Omnichannel",
    icon: "Waypoints",
    graph: {
      nodes: [
        { id: "n1", type: "trigger.instagram.message.received", position: t(60, 160), config: {} },
        { id: "n2", type: "logic.wait_for_reply", position: t(320, 160), config: { channels: "any", timeout: 24, unit: "hours" } },
        { id: "n3", type: "action.whatsapp.send_message", position: t(580, 260), config: { body: "Hi {{contact.name}}, following up from Instagram — any thoughts?" } },
        { id: "n4", type: "logic.wait_for_reply", position: t(840, 260), config: { channels: "any", timeout: 24, unit: "hours" } },
        { id: "n5", type: "action.email.send", position: t(1100, 360), config: { subject: "Following up", html: "Hi {{contact.name}}, just checking in one more time." } },
        { id: "n6", type: "logic.wait_for_reply", position: t(1360, 360), config: { channels: "any", timeout: 48, unit: "hours" } },
        { id: "n7", type: "action.task.create", position: t(1620, 460), config: { title: "Follow up with {{contact.name}} — 3-channel no-reply", priority: "high" } },
        { id: "n8", type: "action.notify.internal", position: t(1620, 580), config: { title: "Lead cold across 3 channels", body: "{{contact.name}} did not reply on Instagram, WhatsApp, or Email." } },
        { id: "n9", type: "action.marketing.start_campaign", position: t(1620, 700), config: {} },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3", branch: "false" },
        { id: "e3", source: "n3", target: "n4" },
        { id: "e4", source: "n4", target: "n5", branch: "false" },
        { id: "e5", source: "n5", target: "n6" },
        { id: "e6", source: "n6", target: "n7", branch: "false" },
        { id: "e7", source: "n7", target: "n8" },
        { id: "e8", source: "n8", target: "n9" },
      ],
    },
  },
  {
    id: "blank",
    name: "Blank workflow",
    description: "Start from scratch.",
    category: "Starter",
    icon: "Plus",
    graph: { nodes: [], edges: [] },
  },
];
