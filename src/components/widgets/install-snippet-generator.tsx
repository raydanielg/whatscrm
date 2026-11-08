import { useBrandName } from "@/hooks/use-brand-name";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, Code2, Package, FileJson, Radio } from "lucide-react";
import { toast } from "sonner";

type Props = {
  widgetId: string;
  origin: string;
  widgetName?: string;
};

type LoadStrategy = "async" | "defer" | "sync";

export function InstallSnippetGenerator({ widgetId, origin, widgetName }: Props) {
  const brandName = useBrandName();
  const [strategy, setStrategy] = useState<LoadStrategy>("async");
  const [pageSelector, setPageSelector] = useState<string>("");
  const [delayMs, setDelayMs] = useState<number>(0);
  const [identify, setIdentify] = useState<boolean>(false);
  const [locale, setLocale] = useState<string>("");

  const embedUrl = `${origin}/api/public/widget/embed?w=${widgetId}`;
  const configUrl = `${origin}/api/public/widget/config?w=${widgetId}`;
  const beaconUrl = `${origin}/api/public/widget/beacon?w=${widgetId}`;

  const loadAttr = strategy === "async" ? " async" : strategy === "defer" ? " defer" : "";

  const bootOptions = useMemo(() => {
    const opts: Record<string, unknown> = { widgetId };
    if (locale) opts.locale = locale;
    if (pageSelector) opts.mountSelector = pageSelector;
    if (delayMs > 0) opts.delayMs = delayMs;
    if (identify)
      opts.identify = {
        userId: "REPLACE_WITH_USER_ID",
        email: "REPLACE_WITH_EMAIL",
        name: "REPLACE_WITH_NAME",
      };
    return opts;
  }, [widgetId, locale, pageSelector, delayMs, identify]);

  const hasCustomBoot = !!(locale || pageSelector || delayMs > 0 || identify);

  const htmlSnippet = useMemo(() => {
    const bootLine = hasCustomBoot
      ? `\n<script>window.WACRMChatConfig = ${JSON.stringify(bootOptions, null, 2)};</script>`
      : "";
    return `<!-- ${brandName} Chat Widget${widgetName ? ` — ${widgetName}` : ""} -->${bootLine}
<script${loadAttr} src="${embedUrl}"></script>`;
  }, [brandName, embedUrl, loadAttr, bootOptions, hasCustomBoot, widgetName]);

  const npmSnippet = useMemo(
    () =>
      `import { initWACRMChat } from "@wacrm/chat-widget";

initWACRMChat(${JSON.stringify({ widgetId, ...(locale ? { locale } : {}), ...(pageSelector ? { mountSelector: pageSelector } : {}), ...(delayMs > 0 ? { delayMs } : {}) }, null, 2)});`,
    [widgetId, locale, pageSelector, delayMs],
  );

  const reactSnippet = useMemo(
    () =>
      `import { useEffect } from "react";

export function WACRMChat() {
  useEffect(() => {
    const s = document.createElement("script");
    s.src = "${embedUrl}";
    s.async = true;
    document.body.appendChild(s);
    return () => { s.remove(); };
  }, []);
  return null;
}`,
    [embedUrl],
  );

  const configJson = useMemo(() => JSON.stringify(bootOptions, null, 2), [bootOptions]);

  const beaconCurl = useMemo(
    () =>
      `curl -X POST "${beaconUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{"event":"page_view","url":"https://example.com/pricing","sessionId":"SESSION_ID"}'`,
    [beaconUrl],
  );

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-xl">Install snippet generator</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            Customize how the widget loads, then copy a snippet for your stack.
          </p>
        </div>
      </div>

      {/* Options */}
      <div className="mt-5 grid gap-4 rounded-control border bg-muted/30 p-4 md:grid-cols-2">
        <div>
          <Label>Load strategy</Label>
          <Select value={strategy} onValueChange={(v) => setStrategy(v as LoadStrategy)}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="async">Async (recommended)</SelectItem>
              <SelectItem value="defer">Defer</SelectItem>
              <SelectItem value="sync">Blocking</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Locale override (optional)</Label>
          <Input
            className="mt-1"
            placeholder="en, es, no"
            value={locale}
            onChange={(e) => setLocale(e.target.value.trim())}
          />
        </div>
        <div>
          <Label>Mount selector (optional)</Label>
          <Input
            className="mt-1"
            placeholder="#chat-root"
            value={pageSelector}
            onChange={(e) => setPageSelector(e.target.value.trim())}
          />
        </div>
        <div>
          <Label>Delay before showing (ms)</Label>
          <Input
            className="mt-1"
            type="number"
            min={0}
            step={500}
            value={delayMs}
            onChange={(e) => setDelayMs(Math.max(0, Number(e.target.value) || 0))}
          />
        </div>
        <div className="flex items-center justify-between rounded-control border bg-background p-3 md:col-span-2">
          <div>
            <Label className="text-sm">Identify signed-in users</Label>
            <p className="text-muted-foreground text-xs">
              Attach a user object so agents see who is chatting.
            </p>
          </div>
          <Switch checked={identify} onCheckedChange={setIdentify} />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="html" className="mt-6">
        <TabsList>
          <TabsTrigger value="html">
            <Code2 className="mr-2 size-4" /> HTML
          </TabsTrigger>
          <TabsTrigger value="npm">
            <Package className="mr-2 size-4" /> NPM
          </TabsTrigger>
          <TabsTrigger value="react">
            <Code2 className="mr-2 size-4" /> React
          </TabsTrigger>
          <TabsTrigger value="config">
            <FileJson className="mr-2 size-4" /> Config
          </TabsTrigger>
          <TabsTrigger value="beacon">
            <Radio className="mr-2 size-4" /> Beacon
          </TabsTrigger>
        </TabsList>

        <TabsContent value="html" className="mt-4">
          <p className="text-muted-foreground text-sm">
            Paste this before <code>&lt;/body&gt;</code>.
          </p>
          <SnippetBlock code={htmlSnippet} onCopy={() => copy(htmlSnippet, "HTML snippet")} />
        </TabsContent>

        <TabsContent value="npm" className="mt-4">
          <p className="text-muted-foreground text-sm">
            For bundled apps that ship the widget as a module.
          </p>
          <SnippetBlock code={npmSnippet} onCopy={() => copy(npmSnippet, "NPM snippet")} />
        </TabsContent>

        <TabsContent value="react" className="mt-4">
          <p className="text-muted-foreground text-sm">
            Drop-in component for React / Next.js apps.
          </p>
          <SnippetBlock code={reactSnippet} onCopy={() => copy(reactSnippet, "React snippet")} />
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <p className="text-muted-foreground text-sm">
            Static config JSON returned by{" "}
            <code className="rounded bg-muted px-1">{configUrl}</code>.
          </p>
          <SnippetBlock code={configJson} onCopy={() => copy(configJson, "Config JSON")} />
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => copy(configUrl, "Config URL")}>
              <Copy className="mr-2 size-4" /> Copy config URL
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="beacon" className="mt-4">
          <p className="text-muted-foreground text-sm">
            Server-side analytics endpoint. POST events from any backend.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Input readOnly value={beaconUrl} className="font-mono text-xs" />
            <Button size="sm" variant="outline" onClick={() => copy(beaconUrl, "Beacon URL")}>
              <Copy className="mr-2 size-4" /> Copy
            </Button>
          </div>
          <div className="mt-3">
            <Label className="text-xs">Example (cURL)</Label>
            <SnippetBlock code={beaconCurl} onCopy={() => copy(beaconCurl, "Beacon example")} />
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function SnippetBlock({ code, onCopy }: { code: string; onCopy: () => void }) {
  return (
    <div className="relative mt-2">
      <pre className="overflow-x-auto rounded-control bg-muted p-4 pr-14 text-xs leading-relaxed">
        {code}
      </pre>
      <Button size="sm" variant="secondary" className="absolute right-2 top-2" onClick={onCopy}>
        <Copy className="mr-2 size-3.5" /> Copy
      </Button>
    </div>
  );
}
