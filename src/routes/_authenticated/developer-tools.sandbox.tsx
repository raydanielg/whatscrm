import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FlaskConical,
  RotateCcw,
  Database,
  Users,
  MessageSquare,
  Boxes,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/developer-tools/sandbox")({
  staticData: { breadcrumb: "Testing Sandbox" },
  head: () => ({ meta: [{ title: `Testing Sandbox — ${BRAND_NAME} Developer Tools` }] }),
  component: SandboxPage,
});

const SEEDS = [
  { id: "contacts", label: "500 contacts", icon: Users, on: true },
  {
    id: "conversations",
    label: "120 conversations across channels",
    icon: MessageSquare,
    on: true,
  },
  { id: "deals", label: "40 deals in the pipeline", icon: Boxes, on: true },
  { id: "campaigns", label: "6 campaigns (2 live)", icon: Boxes, on: false },
];

function SandboxPage() {
  const [seeds, setSeeds] = useState<Record<string, boolean>>(
    Object.fromEntries(SEEDS.map((s) => [s.id, s.on])),
  );
  const [status, setStatus] = useState<"idle" | "resetting">("idle");
  const [sandboxId] = useState("sbx_" + Math.random().toString(36).slice(2, 10));

  function reset() {
    setStatus("resetting");
    setTimeout(() => {
      setStatus("idle");
      toast.success("Sandbox reset with fresh seed data");
    }, 900);
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-accent/10 text-accent grid place-items-center">
            <FlaskConical className="w-4 h-4" aria-hidden />
          </div>
          <h2 className="font-display text-xl font-semibold">Testing Sandbox</h2>
          <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">
            <CheckCircle2 className="w-3 h-3 " />
            Ready
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Isolated workspace for plugin development. Data is scoped to your sandbox and can be reset
          any time.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat label="Sandbox ID" value={sandboxId} mono />
        <Stat label="Region" value="eu-west-1" />
        <Stat label="Retention" value="7 days idle" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Seed data</CardTitle>
            <p className="text-xs text-muted-foreground">
              Toggle datasets your plugin needs; reset applies changes.
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={reset} disabled={status === "resetting"}>
            <RotateCcw
              className={`w-3.5 h-3.5 mr-1.5 ${status === "resetting" ? "animate-spin" : ""}`}
            />
            {status === "resetting" ? "Resetting" : "Reset sandbox"}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {SEEDS.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <s.icon className="w-4 h-4 text-muted-foreground" aria-hidden />
                  <span className="text-sm">{s.label}</span>
                </div>
                <div className="inline-flex items-center gap-2">
                  <Checkbox
                    checked={seeds[s.id]}
                    onCheckedChange={(v) => setSeeds((prev) => ({ ...prev, [s.id]: v === true }))}
                    aria-label={s.label}
                  />
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4" /> Environment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="rounded-control border border-border bg-muted/40 p-3 font-mono text-xs overflow-x-auto">{`WACRM_API_BASE=https://sandbox.wacrm.dev/api/v1
WACRM_SANDBOX_ID=${sandboxId}
WACRM_LOG_LEVEL=debug`}</pre>
          <p className="text-xs text-muted-foreground mt-2">
            Bind your CLI to this sandbox with <code>wacrm link {sandboxId}</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-control border border-border bg-surface p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${mono ? "font-mono" : "font-display"}`}>
        {value}
      </div>
    </div>
  );
}
