import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Copy, Check, Code2, Package, Boxes, Globe, ShoppingBag, Server,
  Rocket, Wand2, RefreshCw, BookOpen, Zap, Download,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/livechat/widget-sdk")({
  head: () => ({
    meta: [
      { title: `Widget SDK · ${BRAND_NAME}` },
      { name: "description", content: `Embed the ${BRAND_NAME} Live Chat widget in any stack: JS, React, Vue, Angular, WordPress, Shopify, Laravel, Next.js, Nuxt.` },
    ],
  }),
  component: WidgetSdkPage,
});

const SDK_VERSION = "1.0.0";
const CDN_BASE = "https://cdn.wacrm.app";

function CodeBlock({ code, lang = "html", label }: { code: string; lang?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch { toast.error("Copy failed"); }
  };
  return (
    <div className="rounded-control border bg-[#0B090A] text-[#F5F3F4] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[#B1A7A6]">{label || lang.toUpperCase()}</span>
          <Badge variant="secondary" className="h-5 bg-white/10 text-white/80 hover:bg-white/10 border-0">{lang}</Badge>
        </div>
        <Button size="sm" variant="ghost" className="h-7 text-white/80 hover:text-white hover:bg-white/10" onClick={doCopy}>
          {copied ? <Check className="h-3.5 w-3.5 " /> : <Copy className="h-3.5 w-3.5 " />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="p-4 overflow-x-auto text-[12.5px] leading-relaxed"><code>{code}</code></pre>
    </div>
  );
}

function WidgetSdkPage() {
  const { active: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id;
  const host = typeof window !== "undefined" ? window.location.origin : "https://your-app.example.com";

  // Pick a bot from this workspace so snippets are copy-paste ready.
  const botsQ = useQuery({
    queryKey: ["widget-sdk-bots", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chatbots")
        .select("id, name")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!workspaceId,
  });

  const [botId, setBotId] = useState<string>("");
  const [color, setColor] = useState<string>("#075E54");
  const [position, setPosition] = useState<"br" | "bl">("br");
  const [greeting, setGreeting] = useState<string>("Hi 👋 how can we help?");

  const currentBotId = botId || botsQ.data?.[0]?.id || "YOUR_BOT_ID";
  const scriptSrc = `${host}/api/public/widget.js`;
  const cfg = useMemo(() => JSON.stringify({ botId: currentBotId, host, color, position, greeting }), [currentBotId, host, color, position, greeting]);
  const cfgObj = useMemo(() => `{ botId: "${currentBotId}", host: "${host}", color: "${color}", position: "${position}", greeting: ${JSON.stringify(greeting)} }`, [currentBotId, host, color, position, greeting]);

  const htmlSnippet = `<!-- ${BRAND_NAME} Live Chat Widget -->
<script src="${scriptSrc}"
        data-config='${cfg}'
        async defer></script>`;

  const jsSnippet = `// Vanilla JS — programmatic install
(function () {
  window.WACRMChat = { config: ${cfgObj} };
  var s = document.createElement('script');
  s.src = '${scriptSrc}';
  s.async = true; s.defer = true;
  document.head.appendChild(s);
})();`;

  const reactSnippet = `// components/WACRMChat.tsx
import { useEffect } from "react";

export function WACRMChat() {
  useEffect(() => {
    if (document.getElementById("wacrm-chat")) return;
    window.WACRMChat = { config: ${cfgObj} };
    const s = document.createElement("script");
    s.id = "wacrm-chat";
    s.src = "${scriptSrc}";
    s.async = true; s.defer = true;
    document.head.appendChild(s);
  }, []);
  return null;
}`;

  const vueSnippet = `<!-- components/WACRMChat.vue -->
<script setup lang="ts">
import { onMounted } from "vue";
onMounted(() => {
  if (document.getElementById("wacrm-chat")) return;
  (window as any).WACRMChat = { config: ${cfgObj} };
  const s = document.createElement("script");
  s.id = "wacrm-chat";
  s.src = "${scriptSrc}";
  s.async = true; s.defer = true;
  document.head.appendChild(s);
});
</script>
<template><div hidden></div></template>`;

  const angularSnippet = `// wacrm-chat.component.ts
import { Component, OnInit } from "@angular/core";

@Component({ selector: "wacrm-chat", standalone: true, template: "" })
export class WACRMChatComponent implements OnInit {
  ngOnInit() {
    if (document.getElementById("wacrm-chat")) return;
    (window as any).WACRMChat = { config: ${cfgObj} };
    const s = document.createElement("script");
    s.id = "wacrm-chat";
    s.src = "${scriptSrc}";
    s.async = true; s.defer = true;
    document.head.appendChild(s);
  }
}`;

  const nextSnippet = `// app/layout.tsx  (Next.js App Router)
import Script from "next/script";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script
          id="wacrm-chat"
          src="${scriptSrc}"
          data-config='${cfg}'
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}`;

  const nuxtSnippet = `// nuxt.config.ts
export default defineNuxtConfig({
  app: {
    head: {
      script: [{
        src: "${scriptSrc}",
        async: true,
        defer: true,
        "data-config": '${cfg}',
      }],
    },
  },
});`;

  const laravelSnippet = `{{-- resources/views/layouts/app.blade.php --}}
<!-- ${BRAND_NAME} Live Chat -->
<script src="${scriptSrc}"
        data-config='${cfg}'
        async defer></script>`;

  const wordpressSnippet = `// functions.php — add to your active theme or a mu-plugin
add_action('wp_footer', function () {
  $config = ${cfg.replace(/'/g, "\\'")};
  ?>
  <script src="${scriptSrc}"
          data-config='<?php echo esc_attr($config); ?>'
          async defer></script>
  <?php
});`;

  const shopifySnippet = `{% comment %} layout/theme.liquid — before </body> {% endcomment %}
<script src="${scriptSrc}"
        data-config='${cfg}'
        async defer></script>`;

  const apiSnippet = `# Public Widget API — no auth required for these endpoints
POST   ${host}/api/public/widget/session      # create/resume a visitor session
POST   ${host}/api/public/widget/chat         # send a message, receive AI reply
GET    ${host}/api/public/widget/history      # fetch conversation history
POST   ${host}/api/public/widget/track        # log visitor events (page, click)
POST   ${host}/api/public/widget/upload       # upload attachments
POST   ${host}/api/public/widget/rate         # submit CSAT rating

# JS runtime API (after loader boots)
window.WACRMChat.open()          // open the panel
window.WACRMChat.close()         // close the panel
window.WACRMChat.toggle()        // toggle open state
window.WACRMChat.identify({ email, name, userId, metadata })
window.WACRMChat.send("Hello")   // programmatic message
window.WACRMChat.on("ready" | "message" | "open" | "close", handler)`;

  return (
    <>
      <AppTopbar
        title="Widget SDK"
        subtitle="Embed the Live Chat widget in any stack — JS, React, Vue, Angular, WordPress, Shopify, Laravel, Next.js, Nuxt."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1"><Package className="h-3 w-3" /> v{SDK_VERSION}</Badge>
            <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700"><RefreshCw className="h-3 w-3" /> Auto-updates</Badge>
          </div>
        }
      />

      <div className="p-6 space-y-6 max-w-6xl">
        {/* Installation Wizard */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-[#075E54]" /> Installation Wizard
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs">Chatbot</Label>
                <Select value={botId} onValueChange={setBotId}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue placeholder={botsQ.data?.[0]?.name || "Select a bot"} /></SelectTrigger>
                  <SelectContent>
                    {(botsQ.data ?? []).map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Accent color</Label>
                <div className="flex gap-2 mt-1">
                  <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-14 p-1" />
                  <Input value={color} onChange={(e) => setColor(e.target.value)} className="h-9" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Position</Label>
                <Select value={position} onValueChange={(v) => setPosition(v as "br" | "bl")}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="br">Bottom right</SelectItem>
                    <SelectItem value="bl">Bottom left</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Greeting</Label>
                <Input className="h-9 mt-1" value={greeting} onChange={(e) => setGreeting(e.target.value)} />
              </div>
            </div>
            <Alert>
              <Rocket className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Pick your platform below — every snippet is regenerated live with your settings. The loader script auto-updates:
                push a new version and every embedded widget picks it up on next page load.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Snippet tabs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Code2 className="h-4 w-4 text-[#075E54]" /> Installation snippets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="html">
              <TabsList className="flex flex-wrap gap-0.5">
                <TabsTrigger value="html"><Globe className="h-3.5 w-3.5 " />HTML</TabsTrigger>
                <TabsTrigger value="js"><Zap className="h-3.5 w-3.5 " />JavaScript</TabsTrigger>
                <TabsTrigger value="react"><Boxes className="h-3.5 w-3.5 " />React</TabsTrigger>
                <TabsTrigger value="vue"><Boxes className="h-3.5 w-3.5 " />Vue</TabsTrigger>
                <TabsTrigger value="angular"><Boxes className="h-3.5 w-3.5 " />Angular</TabsTrigger>
                <TabsTrigger value="next"><Boxes className="h-3.5 w-3.5 " />Next.js</TabsTrigger>
                <TabsTrigger value="nuxt"><Boxes className="h-3.5 w-3.5 " />Nuxt</TabsTrigger>
                <TabsTrigger value="wordpress"><Globe className="h-3.5 w-3.5 " />WordPress</TabsTrigger>
                <TabsTrigger value="shopify"><ShoppingBag className="h-3.5 w-3.5 " />Shopify</TabsTrigger>
                <TabsTrigger value="laravel"><Server className="h-3.5 w-3.5 " />Laravel</TabsTrigger>
              </TabsList>

              <div className="mt-4 space-y-3">
                <TabsContent value="html"><CodeBlock lang="html" label="HTML Snippet" code={htmlSnippet} /></TabsContent>
                <TabsContent value="js"><CodeBlock lang="javascript" label="Vanilla JS" code={jsSnippet} /></TabsContent>
                <TabsContent value="react"><CodeBlock lang="tsx" label="React Component" code={reactSnippet} /></TabsContent>
                <TabsContent value="vue"><CodeBlock lang="vue" label="Vue 3 Component" code={vueSnippet} /></TabsContent>
                <TabsContent value="angular"><CodeBlock lang="ts" label="Angular Standalone Component" code={angularSnippet} /></TabsContent>
                <TabsContent value="next"><CodeBlock lang="tsx" label="Next.js (App Router)" code={nextSnippet} /></TabsContent>
                <TabsContent value="nuxt"><CodeBlock lang="ts" label="Nuxt 3" code={nuxtSnippet} /></TabsContent>
                <TabsContent value="wordpress">
                  <div className="text-xs text-muted-foreground mb-2">Add to <code>functions.php</code> or install via a WordPress plugin that hooks <code>wp_footer</code>.</div>
                  <CodeBlock lang="php" label="WordPress (functions.php)" code={wordpressSnippet} />
                </TabsContent>
                <TabsContent value="shopify">
                  <div className="text-xs text-muted-foreground mb-2">Edit your theme → <code>layout/theme.liquid</code> and paste before <code>&lt;/body&gt;</code>.</div>
                  <CodeBlock lang="liquid" label="Shopify (theme.liquid)" code={shopifySnippet} />
                </TabsContent>
                <TabsContent value="laravel"><CodeBlock lang="blade" label="Laravel (Blade)" code={laravelSnippet} /></TabsContent>
              </div>
            </Tabs>
          </CardContent>
        </Card>

        {/* API reference */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-[#075E54]" /> API & Runtime reference
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CodeBlock lang="text" label="Endpoints & JS API" code={apiSnippet} />
          </CardContent>
        </Card>

        {/* Versioning & auto-updates */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4" /> Widget versioning</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <p className="text-muted-foreground">Current SDK: <span className="font-mono text-foreground">v{SDK_VERSION}</span></p>
              <p className="text-muted-foreground">Pin a specific version for reproducible installs:</p>
              <CodeBlock lang="html" code={`<script src="${CDN_BASE}/widget/v${SDK_VERSION}/widget.js" async defer></script>`} />
              <p className="text-xs text-muted-foreground">Omit the version to always get the latest stable channel.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Auto updates</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2 text-muted-foreground">
              <p>The unversioned loader (<code>/api/public/widget.js</code>) is served with short-lived cache headers, so new releases roll out to every embedded site within minutes — no code changes required.</p>
              <p>Enterprise customers can pin an exact version and control the upgrade window from Settings → Widget → Release channel.</p>
              <div className="pt-2">
                <Button size="sm" variant="outline" asChild>
                  <a href="/api/public/widget.js" target="_blank" rel="noreferrer">
                    <Download className="h-3.5 w-3.5 mr-2" /> Download loader
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
