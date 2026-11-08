import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FlaskConical, PlayCircle, CheckCircle2, XCircle, Zap } from "lucide-react";

import {
  WA_TRIGGER_LABEL,
  isHandoffRequest,
  HANDOFF_PHRASES,
  matchesLanguage,
  languageLabel,
  normalizeMinConfidence,
  DEFAULT_LANGUAGE_MIN_CONFIDENCE,
  type WaTriggerType,
} from "@/lib/messaging/wa-trigger-matching";

type TriggerType = WaTriggerType;
type ReplyType = "text" | "image" | "video" | "document" | "audio" | "location";

type Rule = {
  id: string;
  session_id: string | null;
  name: string;
  trigger_type: TriggerType;
  keywords: string[];
  reply_type: ReplyType;
  reply_text: string | null;
  media_url: string | null;
  media_caption: string | null;
  enabled: boolean;
  match_case: boolean;
  priority: number;
  cooldown_seconds: number;
  min_confidence?: number | string | null;
};

type Session = {
  id: string;
  phone_number: string | null;
  display_name: string | null;
  status: string;
};

const TRIGGER_LABEL: Record<TriggerType, string> = WA_TRIGGER_LABEL;

type Ctx = {
  message: string;
  isFirstMessage: boolean;
  isOffline: boolean;
  senderName: string;
  senderPhone: string;
};

/** A single piece of evidence explaining a match decision. */
type Evidence = { label: string; value: string; tone?: "ok" | "warn" | "muted" };

type MatchResult = { ok: boolean; reason: string; evidence: Evidence[] };

function matches(rule: Rule, ctx: Ctx): MatchResult {
  if (!rule.enabled) return { ok: false, reason: "Rule disabled", evidence: [] };
  const raw = ctx.message ?? "";
  const msg = rule.match_case ? raw : raw.toLowerCase();
  const kws = (rule.keywords ?? []).map((k) => (rule.match_case ? k : k.toLowerCase()));
  const caseEvidence: Evidence[] = [
    {
      label: "Matching",
      value: rule.match_case ? "case-sensitive" : "case-insensitive",
      tone: "muted",
    },
  ];

  switch (rule.trigger_type) {
    case "welcome":
      return ctx.isFirstMessage
        ? {
            ok: true,
            reason: "First message from contact",
            evidence: [{ label: "Context", value: "first message", tone: "ok" }],
          }
        : {
            ok: false,
            reason: "Not the first message",
            evidence: [{ label: "Context", value: "returning contact", tone: "muted" }],
          };
    case "offline":
      return ctx.isOffline
        ? {
            ok: true,
            reason: "Outside business hours",
            evidence: [{ label: "Context", value: "offline hours", tone: "ok" }],
          }
        : {
            ok: false,
            reason: "Inside business hours",
            evidence: [{ label: "Context", value: "business hours", tone: "muted" }],
          };
    case "any":
      return raw.trim()
        ? {
            ok: true,
            reason: "Any non-empty message",
            evidence: [{ label: "Length", value: `${raw.trim().length} chars`, tone: "ok" }],
          }
        : { ok: false, reason: "Empty message", evidence: [] };
    case "exact": {
      const hit = kws.find((k) => msg === k);
      return hit !== undefined
        ? {
            ok: true,
            reason: `Exact match on "${hit}"`,
            evidence: [{ label: "Keyword", value: hit, tone: "ok" }, ...caseEvidence],
          }
        : {
            ok: false,
            reason: "No exact keyword match",
            evidence: [
              { label: "Tried", value: kws.join(", ") || "—", tone: "muted" },
              ...caseEvidence,
            ],
          };
    }
    case "starts_with": {
      const hit = kws.find((k) => k && msg.startsWith(k));
      return hit
        ? {
            ok: true,
            reason: `Starts with "${hit}"`,
            evidence: [{ label: "Prefix", value: hit, tone: "ok" }, ...caseEvidence],
          }
        : {
            ok: false,
            reason: "No starts-with match",
            evidence: [
              { label: "Tried", value: kws.join(", ") || "—", tone: "muted" },
              ...caseEvidence,
            ],
          };
    }
    case "contains": {
      const hits = kws.filter((k) => k && msg.includes(k));
      return hits.length
        ? {
            ok: true,
            reason: `Contains "${hits[0]}"`,
            evidence: [
              { label: "Keywords hit", value: hits.join(", "), tone: "ok" },
              ...caseEvidence,
            ],
          }
        : {
            ok: false,
            reason: "No contained keyword",
            evidence: [
              { label: "Tried", value: kws.join(", ") || "—", tone: "muted" },
              ...caseEvidence,
            ],
          };
    }
    case "regex":
      for (const k of kws) {
        try {
          const re = new RegExp(k, rule.match_case ? "" : "i");
          const m = re.exec(raw);
          if (m) {
            return {
              ok: true,
              reason: `Regex /${k}/ matched`,
              evidence: [
                { label: "Pattern", value: `/${k}/${rule.match_case ? "" : "i"}`, tone: "ok" },
                { label: "Matched text", value: m[0] || "(empty)", tone: "ok" },
              ],
            };
          }
        } catch {
          return {
            ok: false,
            reason: `Invalid regex /${k}/`,
            evidence: [{ label: "Pattern", value: k, tone: "warn" }],
          };
        }
      }
      return {
        ok: false,
        reason: "No regex pattern matched",
        evidence: [{ label: "Tried", value: kws.join(", ") || "—", tone: "muted" }],
      };
    case "handoff": {
      const h = isHandoffRequest(raw, rule.keywords ?? []);
      if (!h.ok) {
        return {
          ok: false,
          reason: "No operator handoff intent",
          evidence: [
            {
              label: "Custom phrases",
              value: (rule.keywords ?? []).join(", ") || "none",
              tone: "muted",
            },
            {
              label: "Built-in phrases",
              value: `${HANDOFF_PHRASES.length} checked`,
              tone: "muted",
            },
          ],
        };
      }
      return {
        ok: true,
        reason: `Handoff intent detected ("${h.phrase}")`,
        evidence: [
          { label: "Intent phrase", value: `"${h.phrase}"`, tone: "ok" },
          {
            label: "Source",
            value: h.source === "custom" ? "your custom phrase" : "built-in dictionary",
            tone: "muted",
          },
          ...(h.phrases.length > 1
            ? [
                {
                  label: "Also matched",
                  value: h.phrases.slice(1, 4).join(", "),
                  tone: "muted" as const,
                },
              ]
            : []),
        ],
      };
    }
    case "language": {
      const l = matchesLanguage(
        raw,
        rule.keywords ?? [],
        rule.min_confidence == null
          ? DEFAULT_LANGUAGE_MIN_CONFIDENCE
          : normalizeMinConfidence(rule.min_confidence),
      );
      const pct = Math.round(l.confidence * 100);
      const minPct = Math.round(l.minConfidence * 100);
      const evidence: Evidence[] = [
        {
          label: "Detected",
          value:
            l.detected === "unknown" ? "unknown" : `${languageLabel(l.detected)} (${l.detected})`,
          tone: l.ok ? "ok" : "muted",
        },
        {
          label: "Confidence",
          value: `${pct}% (min ${minPct}%)`,
          tone: l.belowConfidence ? "warn" : l.ok ? "ok" : "muted",
        },
        {
          label: "Method",
          value:
            l.method === "script"
              ? "script range"
              : l.method === "stopwords"
                ? "stop-word scoring"
                : "no signal",
          tone: "muted",
        },
        {
          label: "Targets",
          value: l.targeted.length ? l.targeted.join(", ") : "any non-English",
          tone: "muted",
        },
      ];
      if (l.signals.length) {
        evidence.push({ label: "Signals", value: l.signals.slice(0, 6).join(", "), tone: "muted" });
      }
      if (l.runnerUp) {
        evidence.push({
          label: "Runner-up",
          value: `${languageLabel(l.runnerUp)} (${l.runnerUp})`,
          tone: "muted",
        });
      }

      if (l.ok) {
        return {
          ok: true,
          reason: `Detected ${languageLabel(l.detected)} (${l.detected}) at ${pct}% confidence`,
          evidence,
        };
      }
      if (l.belowConfidence) {
        return {
          ok: false,
          reason: `Detected ${languageLabel(l.detected)} but only ${pct}% confident (min ${minPct}%)`,
          evidence,
        };
      }
      return {
        ok: false,
        reason: `Detected ${languageLabel(l.detected)} (${pct}% confidence) — not targeted`,
        evidence,
      };
    }
    default:
      return { ok: false, reason: "Unknown trigger type", evidence: [] };
  }
}

function EvidenceList({ items }: { items: Evidence[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {items.map((e, i) => (
        <span
          key={`${e.label}-${i}`}
          className={`inline-flex max-w-full items-center gap-1 rounded-control border px-1.5 py-0.5 text-[11px] leading-4 [overflow-wrap:anywhere] ${
            e.tone === "ok"
              ? "border-success/40 bg-success/10 text-foreground"
              : e.tone === "warn"
                ? "border-warning/40 bg-warning/10 text-foreground"
                : "border-border bg-muted/50 text-muted-foreground"
          }`}
        >
          <span className="font-medium">{e.label}:</span>
          <span className="break-words">{e.value}</span>
        </span>
      ))}
    </div>
  );
}

function renderVars(tpl: string, ctx: Ctx) {
  return tpl
    .replaceAll("{{name}}", ctx.senderName || "there")
    .replaceAll("{{phone}}", ctx.senderPhone || "")
    .replaceAll("{{time}}", new Date().toLocaleTimeString());
}

export function WaChatbotTestConsole({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string | null;
}) {
  const [sessionId, setSessionId] = useState<string>("__all__");
  const [message, setMessage] = useState("Hi");
  const [isFirstMessage, setIsFirstMessage] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [senderName, setSenderName] = useState("Alex");
  const [senderPhone, setSenderPhone] = useState("+15551234567");
  const [ran, setRan] = useState(false);

  const { data: sessions = [] } = useQuery<Session[]>({
    enabled: !!workspaceId && open,
    queryKey: ["wa-qr-sessions", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_qr_sessions")
        .select("id, phone_number, display_name, status")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Session[];
    },
  });

  const { data: rules = [], isLoading } = useQuery<Rule[]>({
    enabled: !!workspaceId && open,
    queryKey: ["wa-auto-replies-all", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_auto_replies")
        .select(
          "id, session_id, name, trigger_type, keywords, reply_type, reply_text, media_url, media_caption, enabled, match_case, priority, cooldown_seconds, min_confidence",
        )
        .eq("workspace_id", workspaceId!)
        .order("priority", { ascending: true })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Rule[];
    },
  });

  const scoped = useMemo(() => {
    return rules.filter((r) =>
      sessionId === "__all__" ? true : r.session_id === sessionId || r.session_id === null,
    );
  }, [rules, sessionId]);

  const ctx: Ctx = { message, isFirstMessage, isOffline, senderName, senderPhone };

  const evaluated = useMemo(
    () => scoped.map((r) => ({ rule: r, result: matches(r, ctx) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, message, isFirstMessage, isOffline, senderName, senderPhone],
  );

  const winner = evaluated.find((e) => e.result.ok) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" /> WA Chatbot Test Console
          </DialogTitle>
          <DialogDescription>
            Simulate an incoming WhatsApp message and preview which auto-reply rule will trigger.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Instance</Label>
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All instances</SelectItem>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.display_name || s.phone_number || s.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sender name</Label>
            <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} />
          </div>
          <div>
            <Label>Sender phone</Label>
            <Input value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} />
          </div>
          <div className="flex items-end gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Checkbox
                id="first-message"
                checked={isFirstMessage}
                onCheckedChange={(v) => setIsFirstMessage(v === true)}
              />
              <Label htmlFor="first-message" className="font-normal">
                First message
              </Label>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Checkbox
                id="offline-hours"
                checked={isOffline}
                onCheckedChange={(v) => setIsOffline(v === true)}
              />
              <Label htmlFor="offline-hours" className="font-normal">
                Offline hours
              </Label>
            </div>
          </div>
          <div className="md:col-span-2">
            <Label>Incoming message</Label>
            <Textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Hi, I need help with my order"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={() => setRan(true)} disabled={isLoading}>
            <PlayCircle className="h-4 w-4 " /> Simulate
          </Button>
        </div>

        {ran && (
          <div className="space-y-3">
            {winner ? (
              <div className="border rounded-control p-3 bg-success/5 border-success/30">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span className="font-medium">Would trigger: {winner.rule.name}</span>
                  <Badge variant="outline" className="rounded-control">
                    {TRIGGER_LABEL[winner.rule.trigger_type]}
                  </Badge>
                  <Badge variant="secondary" className="rounded-control">
                    Priority {winner.rule.priority}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{winner.result.reason}</div>
                <EvidenceList items={winner.result.evidence} />
                {winner.rule.reply_text && (
                  <div className="mt-3 rounded-control bg-background border p-3 text-sm whitespace-pre-wrap">
                    {renderVars(winner.rule.reply_text, ctx)}
                  </div>
                )}
                {winner.rule.media_url && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Sends {winner.rule.reply_type}: {winner.rule.media_url}
                  </div>
                )}
              </div>
            ) : (
              <div className="border rounded-control p-3 bg-muted/40 flex items-center gap-2">
                <XCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">No rule would trigger for this message.</span>
              </div>
            )}

            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Evaluation trace ({evaluated.length} rule{evaluated.length === 1 ? "" : "s"})
              </div>
              <div className="max-h-64 overflow-auto rounded-control border divide-y">
                {evaluated.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">
                    No rules configured for this scope.
                  </div>
                ) : (
                  evaluated.map(({ rule, result }, i) => {
                    const isWinner = winner?.rule.id === rule.id;
                    const skipped = winner && !isWinner && result.ok;
                    return (
                      <div key={rule.id} className="p-2.5 text-sm flex items-start gap-2">
                        <div className="w-5 text-xs text-muted-foreground  pt-0.5">{i + 1}.</div>
                        {result.ok ? (
                          <Zap
                            className={`h-4 w-4 mt-0.5 shrink-0 ${isWinner ? "text-success" : "text-muted-foreground"}`}
                          />
                        ) : (
                          <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/60" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`truncate ${isWinner ? "font-medium" : ""}`}>
                              {rule.name}
                            </span>
                            <Badge variant="outline" className="rounded-control text-xs">
                              {TRIGGER_LABEL[rule.trigger_type]}
                            </Badge>
                            {isWinner && <Badge className="rounded-control text-xs">Winner</Badge>}
                            {skipped && (
                              <Badge variant="outline" className="rounded-control text-xs">
                                Skipped (lower priority)
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{result.reason}</div>
                          <EvidenceList items={result.evidence} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
