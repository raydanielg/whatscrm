import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Square } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/developer-tools/playground")({
  staticData: { breadcrumb: "Playground" },
  head: () => ({ meta: [{ title: `Playground — ${BRAND_NAME} Developer Tools` }] }),
  component: Playground,
});

const DEFAULT = `// Live playground — this code runs against a mocked ExtensionContext.
export default function run(ctx) {
  ctx.logger.info("hello from playground");
  ctx.builders.widget.add({
    id: "demo",
    region: "dashboard.top",
    component: () => "DemoWidget",
  });
  ctx.hooks.on("contact.created", (c) => ctx.logger.info("new contact", c.id));
  return { registered: ctx.registered };
}
`;

function Playground() {
  const formatZoned = useZonedDateFormatter();
  const [code, setCode] = useState(DEFAULT);
  const [logs, setLogs] = useState<{ level: string; msg: string; time: string }[]>([]);
  const [output, setOutput] = useState<string>("");
  const [running, setRunning] = useState(false);

  function run() {
    setRunning(true);
    const captured: typeof logs = [];
    const registered: string[] = [];
    const ctx = {
      logger: {
        info: (...a: unknown[]) =>
          captured.push({
            level: "info",
            msg: a.map(String).join(" "),
            time: formatZoned(new Date(), { timeStyle: "medium" }),
          }),
        warn: (...a: unknown[]) =>
          captured.push({
            level: "warn",
            msg: a.map(String).join(" "),
            time: formatZoned(new Date(), { timeStyle: "medium" }),
          }),
        error: (...a: unknown[]) =>
          captured.push({
            level: "error",
            msg: a.map(String).join(" "),
            time: formatZoned(new Date(), { timeStyle: "medium" }),
          }),
      },
      builders: new Proxy(
        {},
        {
          get: (_t, key) =>
            new Proxy(
              {},
              {
                get: () => (def: { id?: string }) => {
                  registered.push(`${String(key)}:${def?.id ?? "?"}`);
                },
              },
            ),
        },
      ),
      hooks: { on: () => {}, off: () => {}, emit: () => {}, filter: () => {}, action: () => {} },
      storage: { get: async () => undefined, set: async () => {} },
      registered,
    };
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
      const fn = new Function(
        "ctx",
        `${code}; return typeof run === "function" ? run(ctx) : (module && module.exports && module.exports.default ? module.exports.default(ctx) : undefined);`,
      );
      const result = fn(ctx);
      setOutput(JSON.stringify(result ?? { registered }, null, 2));
    } catch (e) {
      captured.push({
        level: "error",
        msg: e instanceof Error ? e.message : String(e),
        time: formatZoned(new Date(), { timeStyle: "medium" }),
      });
      setOutput("");
    } finally {
      setLogs(captured);
      setRunning(false);
    }
  }

  function stop() {
    setRunning(false);
  }

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-semibold">Playground</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Iterate on plugin code with a mocked ExtensionContext — no install required.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={run} disabled={running}>
            <Play className="w-3.5 h-3.5 mr-1.5" />
            Run
          </Button>
          <Button variant="secondary" onClick={stop} disabled={!running}>
            <Square className="w-3.5 h-3.5 mr-1.5" />
            Stop
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-mono">plugin.ts</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              rows={18}
              className="font-mono text-[11px] leading-relaxed"
              spellCheck={false}
            />
          </CardContent>
        </Card>
        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-xs">Console</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-control border border-border bg-muted/40 p-3 font-mono text-[11px] h-56 overflow-auto space-y-1">
                {logs.length === 0 && (
                  <div className="text-muted-foreground">Run the script to see output</div>
                )}
                {logs.map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-muted-foreground">{l.time}</span>
                    <span
                      className={
                        l.level === "error"
                          ? "text-destructive"
                          : l.level === "warn"
                            ? "text-amber-600"
                            : "text-emerald-600"
                      }
                    >
                      {l.level}
                    </span>
                    <span className="text-foreground">{l.msg}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-xs">Return value</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="rounded-control border border-border bg-muted/40 p-3 font-mono text-[11px] max-h-56 overflow-auto">
                {output || "—"}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
