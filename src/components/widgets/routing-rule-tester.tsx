import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, Trophy, EyeOff, Bot, FlaskConical } from "lucide-react";
import { evaluateRoutingRules, type VisitorSample } from "@/lib/widgets/rule-evaluator";
import type { RoutingRule } from "@/lib/widgets/widgets.functions";

const SAMPLES: { label: string; sample: VisitorSample }[] = [
  { label: "Home page (English)", sample: { url: "https://acme.com/", language: "en", now: new Date().toISOString() } },
  { label: "Pricing page (English)", sample: { url: "https://acme.com/pricing", language: "en", now: new Date().toISOString() } },
  { label: "Blog article (Spanish)", sample: { url: "https://acme.com/blog/hello-world", language: "es", now: new Date().toISOString() } },
  { label: "Checkout (French)", sample: { url: "https://acme.com/checkout?step=2", language: "fr", now: new Date().toISOString() } },
  { label: "After hours (2am UTC)", sample: { url: "https://acme.com/", language: "en", now: new Date(new Date().setUTCHours(2, 0, 0, 0)).toISOString() } },
];

interface Props {
  rules: RoutingRule[];
  chatbots: { id: string; name: string }[];
}

export function RoutingRuleTester({ rules, chatbots }: Props) {
  const [visitor, setVisitor] = useState<VisitorSample>(SAMPLES[0].sample);
  const botName = useMemo(() => new Map(chatbots.map((b) => [b.id, b.name])), [chatbots]);
  const result = useMemo(() => evaluateRoutingRules(rules, visitor), [rules, visitor]);

  const setSample = (label: string) => {
    const s = SAMPLES.find((x) => x.label === label);
    if (s) setVisitor({ ...s.sample, now: new Date().toISOString() });
  };

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <FlaskConical className="size-5 text-primary" />
        <div>
          <h3 className="font-bold text-lg">Test routing rules</h3>
          <p className="text-muted-foreground text-sm">Simulate a visitor to see which rule wins before you save.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div>
            <Label>Preset scenario</Label>
            <Select onValueChange={setSample}>
              <SelectTrigger><SelectValue placeholder="Load a sample visitor" /></SelectTrigger>
              <SelectContent>
                {SAMPLES.map((s) => <SelectItem key={s.label} value={s.label}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Visitor URL</Label>
            <Input value={visitor.url} onChange={(e) => setVisitor({ ...visitor, url: e.target.value })} placeholder="https://acme.com/pricing" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Browser language</Label>
              <Input value={visitor.language} onChange={(e) => setVisitor({ ...visitor, language: e.target.value })} placeholder="en" />
            </div>
            <div>
              <Label>Timezone</Label>
              <Input value={visitor.timezone ?? ""} onChange={(e) => setVisitor({ ...visitor, timezone: e.target.value })} placeholder="UTC" />
            </div>
          </div>
          <div>
            <Label>Simulated time</Label>
            <Input
              type="datetime-local"
              value={new Date(visitor.now).toISOString().slice(0, 16)}
              onChange={(e) => setVisitor({ ...visitor, now: new Date(e.target.value).toISOString() })}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => setVisitor({ ...visitor, now: new Date().toISOString() })}>
            Use current time
          </Button>
        </div>

        <div className="space-y-3">
          <Card className={`p-4 ${result.winner ? "border-primary bg-primary/5" : "border-dashed"}`}>
            <div className="flex items-center gap-2">
              <Trophy className={`size-4 ${result.winner ? "text-primary" : "text-muted-foreground"}`} />
              <span className="font-bold text-sm">Result</span>
            </div>
            {result.winner ? (
              <div className="mt-2 space-y-1 text-sm">
                <div>Rule <span className="font-medium">{result.winner.ruleName}</span> wins</div>
                {result.winner.action.hideWidget ? (
                  <div className="flex items-center gap-1.5 text-muted-foreground"><EyeOff className="size-3.5" /> Widget hidden for this visitor</div>
                ) : (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Bot className="size-3.5" />
                    Route to: {result.winner.action.chatbotId ? (botName.get(result.winner.action.chatbotId) ?? "Unknown") : "Default chatbot"}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-2 text-muted-foreground text-sm">No rule matched — falls back to the default chatbot.</p>
            )}
          </Card>

          <div className="space-y-2">
            {result.rules.length === 0 && <p className="text-muted-foreground text-sm">Add a routing rule to test it.</p>}
            {result.rules.map((r) => (
              <div key={r.ruleId} className={`rounded-control border p-3 text-sm ${r.winner ? "border-primary" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{r.ruleName}</span>
                  {r.winner ? <Badge>Winner</Badge> : r.matched ? <Badge variant="secondary">Matches</Badge> : <Badge variant="outline">Skipped</Badge>}
                </div>
                <ul className="mt-2 space-y-1">
                  {r.conditions.length === 0 && <li className="text-muted-foreground text-xs">No conditions — rule never matches.</li>}
                  {r.conditions.map((c) => (
                    <li key={c.index} className="flex items-start gap-2 text-xs">
                      {c.matched ? <Check className="mt-0.5 size-3.5 text-emerald-600" /> : <X className="mt-0.5 size-3.5 text-muted-foreground" />}
                      <span className={c.matched ? "" : "text-muted-foreground"}>{c.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
