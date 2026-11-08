// Plugin & theme code templates + snippets for the developer tools hub.
// Client-safe module: pure strings, no server imports.
export type Template = {
  id: string;
  name: string;
  description: string;
  category: "plugin" | "theme" | "widget" | "workflow" | "ai-tool" | "integration";
  files: { path: string; contents: string }[];
};

const MANIFEST_JSON = (slug: string, name: string) => `{
  "slug": "${slug}",
  "name": "${name}",
  "version": "1.0.0",
  "description": "A WACRM plugin",
  "author": "Your Name",
  "license": "MIT",
  "entry": "dist/index.js",
  "permissions": ["contacts:read", "messages:read"],
  "extensionPoints": ["dashboard-widget", "sidebar-menu"],
  "engines": { "wacrm": ">=1.0.0" }
}`;

const PLUGIN_ENTRY = (slug: string) => `import { definePlugin } from "@wacrm/sdk";

export default definePlugin({
  slug: "${slug}",
  onActivate(ctx) {
    ctx.logger.info("Plugin activated");

    ctx.builders.menu.add({
      id: "${slug}-menu",
      label: "${slug}",
      icon: "sparkles",
      to: "/plugins/${slug}",
    });

    ctx.builders.widget.add({
      id: "${slug}-widget",
      region: "dashboard.top",
      component: () => import("./widgets/HelloWidget"),
    });

    ctx.hooks.on("contact.created", async (contact) => {
      ctx.logger.info("New contact", contact.id);
    });
  },
  onDeactivate(ctx) {
    ctx.logger.info("Plugin deactivated");
  },
});
`;

const README = (name: string) => `# ${name}

A WACRM plugin built with the Extension SDK.

## Develop
\`\`\`bash
wacrm dev          # hot-reload sandbox
wacrm test         # run tests
wacrm build        # bundle to dist/
wacrm publish      # publish to Marketplace
\`\`\`

See the SDK docs at /developer/tools/sdk.
`;

const BASE_TEMPLATES: Template[] = [
  {
    id: "starter",
    name: "Starter plugin",
    description: "Minimal plugin with menu, dashboard widget, and event hook.",
    category: "plugin",
    files: [
      { path: "manifest.json", contents: MANIFEST_JSON("my-plugin", "My Plugin") },
      { path: "src/index.ts", contents: PLUGIN_ENTRY("my-plugin") },
      { path: "src/widgets/HelloWidget.tsx", contents:
`export default function HelloWidget() {
  return (
    <div className="rounded-control border border-border bg-surface p-4">
      <h3 className="font-semibold">Hello from my plugin</h3>
      <p className="text-sm text-muted-foreground">Edit src/widgets/HelloWidget.tsx to get started.</p>
    </div>
  );
}
` },
      { path: "README.md", contents: README("My Plugin") },
    ],
  },
  {
    id: "ai-tool",
    name: "AI tool plugin",
    description: "Register a custom AI tool callable from the assistant.",
    category: "ai-tool",
    files: [
      { path: "manifest.json", contents: MANIFEST_JSON("ai-summarizer", "AI Summarizer") },
      { path: "src/index.ts", contents:
`import { definePlugin } from "@wacrm/sdk";
import { z } from "zod";

export default definePlugin({
  slug: "ai-summarizer",
  onActivate(ctx) {
    ctx.builders.aiTool.add({
      id: "summarize-thread",
      description: "Summarize a conversation thread into 3 bullet points.",
      inputSchema: z.object({ threadId: z.string() }),
      async execute({ threadId }, api) {
        const msgs = await api.messages.list({ threadId });
        return { summary: msgs.slice(0, 20).map(m => "- " + m.text.slice(0, 60)).join("\\n") };
      },
    });
  },
});
` },
    ],
  },
  {
    id: "workflow-node",
    name: "Workflow node plugin",
    description: "Contribute a custom node to the Workflow Builder.",
    category: "workflow",
    files: [
      { path: "manifest.json", contents: MANIFEST_JSON("wf-slack", "Slack Notifier Node") },
      { path: "src/index.ts", contents:
`import { definePlugin } from "@wacrm/sdk";

export default definePlugin({
  slug: "wf-slack",
  onActivate(ctx) {
    ctx.builders.workflowNode.add({
      id: "slack.send",
      label: "Send Slack message",
      category: "Comms",
      inputs: { channel: "string", text: "string" },
      async run({ channel, text }, api) {
        await api.http.post("https://slack.example/webhook", { channel, text });
        return { ok: true };
      },
    });
  },
});
` },
    ],
  },
  {
    id: "theme",
    name: "Custom theme",
    description: "Ship a themed look with color tokens and typography.",
    category: "theme",
    files: [
      { path: "theme.json", contents:
`{
  "slug": "midnight",
  "name": "Midnight",
  "mode": "dark",
  "tokens": {
    "primary": "#075E54",
    "background": "#0B0D10",
    "surface": "#14171B",
    "foreground": "#E6E7EA",
    "muted": "#8B8F97",
    "accent": "#F2C94C",
    "radius": "0.75rem",
    "font": "Inter"
  }
}
` },
      { path: "preview.css", contents:
`:root[data-theme="midnight"] {
  --background: 220 10% 6%;
  --surface: 220 8% 10%;
  --foreground: 220 10% 90%;
  --primary: 358 74% 37%;
}
` },
    ],
  },
  {
    id: "integration",
    name: "External integration",
    description: "OAuth-based integration with an outbound webhook.",
    category: "integration",
    files: [
      { path: "manifest.json", contents: MANIFEST_JSON("stripe-sync", "Stripe Sync") },
      { path: "src/index.ts", contents:
`import { definePlugin } from "@wacrm/sdk";

export default definePlugin({
  slug: "stripe-sync",
  onActivate(ctx) {
    ctx.builders.integration.add({
      id: "stripe",
      auth: { type: "oauth2", clientIdEnv: "STRIPE_CLIENT_ID" },
      async onEvent(evt, api) {
        if (evt.type === "invoice.paid") {
          await api.contacts.tag(evt.customerId, "paid");
        }
      },
    });
  },
});
` },
    ],
  },
];

/** Materialize user-facing template copy with the active tenant/platform name. */
export function createTemplates(brandName: string): Template[] {
  return BASE_TEMPLATES.map((template) => ({
    ...template,
    files: template.files.map((file) => ({
      ...file,
      contents: file.contents.replaceAll("WACRM", brandName),
    })),
  }));
}

export const CODE_EXAMPLES: { title: string; language: string; description: string; code: string }[] = [
  {
    title: "Register a dashboard widget",
    language: "typescript",
    description: "Inject a component into the dashboard.top region.",
    code:
`ctx.builders.widget.add({
  id: "revenue-today",
  region: "dashboard.top",
  size: "md",
  component: () => import("./RevenueToday"),
});`,
  },
  {
    title: "Add a sidebar menu item",
    language: "typescript",
    description: "Contribute an entry to the primary sidebar.",
    code:
`ctx.builders.menu.add({
  id: "reports-link",
  label: "Reports",
  icon: "bar-chart",
  to: "/plugins/reports",
  order: 40,
});`,
  },
  {
    title: "Register an event hook",
    language: "typescript",
    description: "React to platform events with typed payloads.",
    code:
`ctx.hooks.on("deal.stage_changed", async (deal) => {
  if (deal.stage === "won") {
    await ctx.api.notifications.send({
      to: deal.ownerId,
      title: \`Deal won: \${deal.name}\`,
    });
  }
});`,
  },
  {
    title: "Filter a value (WordPress-style)",
    language: "typescript",
    description: "Transform data via a filter hook.",
    code:
`ctx.hooks.filter("invoice.line_items", (items, invoice) => {
  return items.map((li) => ({ ...li, note: "via my-plugin" }));
});`,
  },
  {
    title: "Create a REST endpoint",
    language: "typescript",
    description: "Expose a public API endpoint from your plugin.",
    code:
`ctx.builders.api.add({
  method: "POST",
  path: "/webhooks/my-plugin",
  async handler(req) {
    const body = await req.json();
    return Response.json({ ok: true, received: body });
  },
});`,
  },
  {
    title: "Read plugin storage",
    language: "typescript",
    description: "Persist state per workspace, sandboxed to your plugin.",
    code:
`const config = await ctx.storage.get("config") ?? { syncedAt: 0 };
config.syncedAt = Date.now();
await ctx.storage.set("config", config);`,
  },
  {
    title: "Call the AI Gateway",
    language: "typescript",
    description: "Invoke Lovable AI with the built-in provider abstraction.",
    code:
`const reply = await ctx.api.ai.chat({
  model: "google/gemini-2.5-flash",
  messages: [{ role: "user", content: "Draft a follow-up." }],
});`,
  },
  {
    title: "Send a WhatsApp template",
    language: "typescript",
    description: "Trigger a template send through the messaging engine.",
    code:
`await ctx.api.whatsapp.sendTemplate({
  to: "+15551234567",
  templateSlug: "welcome_v3",
  variables: { name: "Ada" },
});`,
  },
];
