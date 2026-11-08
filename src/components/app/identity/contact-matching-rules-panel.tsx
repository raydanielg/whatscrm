import { useState } from "react";
import { Plus, Trash2, TestTube, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import {
  useMatchingRules,
  useUpsertMatchingRule,
  useDeleteMatchingRule,
  usePreviewMatching,
  type RuleInputData,
} from "@/hooks/use-contact-matching";
import type { MatchingRule, MatchStrategy } from "@/lib/messaging/contact-matching.functions";

const STRATEGY_LABELS: Record<MatchStrategy, string> = {
  exact: "Exact phone match",
  e164: "E.164 normalization",
  national: "National number match",
  last_n_digits: "Last N digits (suffix)",
};

const STRATEGY_DESCRIPTIONS: Record<MatchStrategy, string> = {
  exact: "Match the stored phone byte-for-byte. Fastest, strictest.",
  e164: "Normalize both sides to +<country><number>. Requires default country code.",
  national: "Strip the country code and compare the national significant number.",
  last_n_digits: "Match by the last N digits of the phone number.",
};

export function ContactMatchingRulesPanel() {
  const ws = useCurrentWorkspace();
  const workspaceId = ws.active?.id;
  const { data: rules, isLoading } = useMatchingRules(workspaceId);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact matching rules</CardTitle>
          <CardDescription>
            Rules run in priority order (lowest number first). The first
            rule that matches an existing contact wins; otherwise a new
            contact is created.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading rules</p>
          ) : (
            <>
              {(rules ?? []).map((r) => (
                <RuleRow key={r.id} rule={r} workspaceId={workspaceId!} />
              ))}
              <AddRuleRow workspaceId={workspaceId} />
            </>
          )}
        </CardContent>
      </Card>

      <PreviewCard workspaceId={workspaceId} />
    </div>
  );
}

function RuleRow({ rule, workspaceId }: { rule: MatchingRule; workspaceId: string }) {
  const [draft, setDraft] = useState<MatchingRule>(rule);
  const [dirty, setDirty] = useState(false);
  const upsert = useUpsertMatchingRule(workspaceId);
  const del = useDeleteMatchingRule(workspaceId);

  const update = (patch: Partial<MatchingRule>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const save = async () => {
    const payload: RuleInputData = {
      id: draft.id,
      workspaceId,
      priority: draft.priority,
      strategy: draft.strategy,
      default_country_code: draft.default_country_code,
      digits_to_match: draft.digits_to_match,
      enabled: draft.enabled,
      label: draft.label,
    };
    try {
      await upsert.mutateAsync(payload);
      setDirty(false);
      toast.success("Rule saved");
    } catch (e) {
      toast.error("Failed to save rule", { description: (e as Error).message });
    }
  };

  return (
    <div className="rounded-control border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="rounded-control">#{draft.priority}</Badge>
        <Input
          className="h-9 flex-1"
          placeholder="Label (optional)"
          value={draft.label ?? ""}
          onChange={(e) => update({ label: e.target.value })}
        />
        <div className="flex items-center gap-2">
          <Switch
            checked={draft.enabled}
            onCheckedChange={(v) => update({ enabled: v })}
          />
          <span className="text-xs text-muted-foreground">
            {draft.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => del.mutate(rule.id)}
          title="Delete rule"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Priority</Label>
          <Input
            type="number"
            className="h-9"
            value={draft.priority}
            onChange={(e) => update({ priority: Number(e.target.value) || 100 })}
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label className="text-xs">Strategy</Label>
          <Select
            value={draft.strategy}
            onValueChange={(v) => update({ strategy: v as MatchStrategy })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(STRATEGY_LABELS) as MatchStrategy[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STRATEGY_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          {draft.strategy === "e164" || draft.strategy === "national" ? (
            <>
              <Label className="text-xs">Default country code</Label>
              <Input
                className="h-9"
                placeholder="+1"
                value={draft.default_country_code ?? ""}
                onChange={(e) =>
                  update({ default_country_code: e.target.value || null })
                }
              />
            </>
          ) : draft.strategy === "last_n_digits" ? (
            <>
              <Label className="text-xs">Digits to match</Label>
              <Input
                type="number"
                className="h-9"
                placeholder="8"
                value={draft.digits_to_match ?? ""}
                onChange={(e) =>
                  update({
                    digits_to_match: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </>
          ) : (
            <div className="h-9" />
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {STRATEGY_DESCRIPTIONS[draft.strategy]}
      </p>

      {dirty && (
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={upsert.isPending}>
            <Save className="h-4 w-4 mr-1.5" />
            Save changes
          </Button>
        </div>
      )}
    </div>
  );
}

function AddRuleRow({ workspaceId }: { workspaceId: string | undefined }) {
  const upsert = useUpsertMatchingRule(workspaceId);

  const add = async () => {
    if (!workspaceId) return;
    try {
      await upsert.mutateAsync({
        workspaceId,
        priority: 100,
        strategy: "last_n_digits",
        digits_to_match: 8,
        enabled: true,
        label: "Last 8 digits",
      });
      toast.success("Rule added");
    } catch (e) {
      toast.error("Failed to add rule", { description: (e as Error).message });
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={add}
      disabled={!workspaceId || upsert.isPending}
    >
      <Plus className="h-4 w-4 mr-1.5" />
      Add rule
    </Button>
  );
}

function PreviewCard({ workspaceId }: { workspaceId: string | undefined }) {
  const [raw, setRaw] = useState("");
  const preview = usePreviewMatching();

  const run = () => {
    if (!workspaceId || !raw.trim()) return;
    preview.mutate({ workspaceId, rawPhone: raw.trim() });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TestTube className="h-4 w-4" />
          Test matching
        </CardTitle>
        <CardDescription>
          Enter a phone number to see how each active rule normalizes it and
          whether it matches an existing CRM contact.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            className="h-9"
            placeholder="e.g. +1 415 555 0123 or 4155550123"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
          />
          <Button size="sm" onClick={run} disabled={!raw.trim() || preview.isPending}>
            Preview
          </Button>
        </div>

        {preview.data && (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Digits only:</span>
              <code className="rounded-control bg-muted px-1.5 py-0.5">
                {preview.data.digits || "—"}
              </code>
            </div>

            <div className="rounded-control border divide-y">
              {preview.data.previews.map((p) => (
                <div
                  key={p.rule.id}
                  className="flex items-center gap-2 p-2 text-xs"
                >
                  <Badge variant="secondary" className="rounded-control">
                    #{p.rule.priority}
                  </Badge>
                  <span className="font-medium">
                    {STRATEGY_LABELS[p.rule.strategy]}
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <code className="rounded-control bg-muted px-1.5 py-0.5">
                    {p.normalized ?? "n/a"}
                  </code>
                </div>
              ))}
            </div>

            {preview.data.matchedContact ? (
              <div className="rounded-control border border-green-500/40 bg-green-500/5 p-3">
                <div className="text-xs text-muted-foreground">Matched contact</div>
                <div className="font-medium">
                  {preview.data.matchedContact.display_name ?? "(unnamed)"}
                </div>
                <code className="text-xs text-muted-foreground">
                  {preview.data.matchedContact.id}
                </code>
              </div>
            ) : (
              <div className="rounded-control border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                No existing contact matches. Inbound messages from this number
                would create a new contact.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
