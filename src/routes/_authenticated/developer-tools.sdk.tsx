import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/developer-tools/sdk")({
  staticData: { breadcrumb: "SDK Docs" },
  head: () => ({ meta: [{ title: `SDK Docs — ${BRAND_NAME} Developer Tools` }] }),
  component: SdkDocs,
});

type Api = { name: string; signature: string; desc: string };
const SECTIONS: { title: string; description: string; apis: Api[] }[] = [
  {
    title: "definePlugin",
    description: "Entry point for every plugin. Returns a manifest the runtime can load hot.",
    apis: [
      { name: "definePlugin(opts)", signature: "definePlugin({ slug, onActivate, onDeactivate })", desc: "Register lifecycle hooks and receive a typed ExtensionContext." },
    ],
  },
  {
    title: "Builders — ctx.builders.*",
    description: `Register contributions to ${BRAND_NAME}. All are hot-reversible on deactivate.`,
    apis: [
      { name: "page.add",        signature: "page.add({ path, component, title? })", desc: "Contribute a full route under /plugins/<slug>/*." },
      { name: "menu.add",        signature: "menu.add({ id, label, icon, to, order? })", desc: "Sidebar or context-menu entries." },
      { name: "widget.add",      signature: "widget.add({ id, region, component, size? })", desc: "Inject a React component into a named PluginSlot." },
      { name: "dashboardCard.add", signature: "dashboardCard.add({ id, title, component })", desc: "Card slot on the workspace dashboard." },
      { name: "report.add",      signature: "report.add({ id, title, query, viz })", desc: "Register a report in the BI catalog." },
      { name: "api.add",         signature: "api.add({ method, path, handler })", desc: "Expose a REST endpoint under /api/plugins/<slug>." },
      { name: "workflowNode.add",signature: "workflowNode.add({ id, label, inputs, run })", desc: "Contribute a node to the Workflow Builder." },
      { name: "aiTool.add",      signature: "aiTool.add({ id, description, inputSchema, execute })", desc: "Expose a tool to the AI assistant." },
      { name: "integration.add", signature: "integration.add({ id, auth, onEvent })", desc: "OAuth or API-key integration surface." },
      { name: "table.add",       signature: "table.add({ name, schema })", desc: "Create a sandboxed database table for your plugin." },
      { name: "job.add",         signature: "job.add({ id, cron, handler })", desc: "Background/cron job registered with the scheduler." },
    ],
  },
  {
    title: "Events & Hooks — ctx.hooks.*",
    description: "Subscribe to platform events or transform data through filter hooks.",
    apis: [
      { name: "on(event, handler)",     signature: "hooks.on('contact.created', fn)", desc: "React to platform events." },
      { name: "off(event, handler)",    signature: "hooks.off('contact.created', fn)", desc: "Detach a handler." },
      { name: "emit(event, payload)",   signature: "hooks.emit('my-plugin.done', data)", desc: "Emit a custom event." },
      { name: "filter(name, fn)",       signature: "hooks.filter('invoice.line_items', fn)", desc: "Transform a value via a filter (WordPress-style)." },
      { name: "action(name, fn)",       signature: "hooks.action('before.send', fn)", desc: "Run side effects at a named action." },
    ],
  },
  {
    title: "Platform APIs — ctx.api.*",
    description: `Typed clients for every ${BRAND_NAME} module. Scoped to your plugin's permissions.`,
    apis: [
      { name: "contacts",     signature: "api.contacts.list / get / update / tag", desc: "CRM contact operations." },
      { name: "messages",     signature: "api.messages.send / list", desc: "Send and read omnichannel messages." },
      { name: "whatsapp",     signature: "api.whatsapp.sendTemplate", desc: "Send WhatsApp templates via the Cloud API." },
      { name: "ai",           signature: "api.ai.chat / embed / speech", desc: "Multi-provider AI Gateway." },
      { name: "notifications",signature: "api.notifications.send", desc: "Push, email, or in-app notifications." },
      { name: "http",         signature: "api.http.get / post", desc: "Outbound HTTP with retries + audit trail." },
    ],
  },
  {
    title: "Storage & Logger",
    description: "Sandboxed persistence and structured logging.",
    apis: [
      { name: "storage.get(key)",  signature: "await ctx.storage.get('config')", desc: "Workspace-scoped KV store." },
      { name: "storage.set(k, v)", signature: "await ctx.storage.set('config', obj)", desc: "Persist JSON-serialisable values." },
      { name: "logger",            signature: "ctx.logger.info / warn / error", desc: "Structured logs surfaced in Plugin Management." },
    ],
  },
];

function SdkDocs() {
  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl font-semibold">SDK Documentation</h2>
          <Badge variant="secondary" className="text-[11px]">v1.4 · stable</Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Import from <code>@wacrm/sdk</code>. All builders are type-safe and hot-reloadable.
        </p>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base">Installation</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Snippet code="npm install @wacrm/sdk" />
          <p className="text-xs text-muted-foreground">Peer deps: <code>react &gt;= 18</code>, <code>zod &gt;= 3</code>.</p>
        </CardContent>
      </Card>

      {SECTIONS.map((s) => (
        <Card key={s.title}>
          <CardHeader>
            <CardTitle className="text-base">{s.title}</CardTitle>
            <p className="text-xs text-muted-foreground">{s.description}</p>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-y border-border bg-muted/40">
                <tr>
                  <th className="text-left px-4 py-2 font-medium w-40">API</th>
                  <th className="text-left px-4 py-2 font-medium">Signature</th>
                  <th className="text-left px-4 py-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {s.apis.map((a) => (
                  <tr key={a.name} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2 font-mono text-xs">{a.name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-accent">{a.signature}</td>
                    <td className="px-4 py-2 text-muted-foreground">{a.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Snippet({ code }: { code: string }) {
  return (
    <pre className="rounded-control border border-border bg-muted/40 p-3 font-mono text-xs overflow-x-auto"><code>{code}</code></pre>
  );
}
