import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Users,
  GitMerge,
  Split,
  Settings2,
  Shield,
  Sparkles,
  Phone,
  Mail,
  User,
  ArrowRight,
  Filter,
} from "lucide-react";
import { ContactMatchingRulesPanel } from "@/components/app/identity/contact-matching-rules-panel";
import { ContactRematchPanel } from "@/components/app/identity/contact-rematch-panel";
import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  useDuplicateContacts,
  useIdentityConfig,
  useIdentityMerges,
  useMergeIdentityContacts,
  useSetIdentityConfig,
  useSplitMerge,
} from "@/hooks/use-identity-engine";

export const Route = createFileRoute("/_authenticated/identity")({
  component: IdentityEngineRoute,
});

function IdentityEngineRoute() {
  return (
    <>
      <AppTopbar
        title="Customer Identity Engine"
        subtitle="One customer, one CRM profile — across every channel"
      />
      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <Tabs defaultValue="duplicates">
          <TabsList>
            <TabsTrigger value="duplicates">
              <Users className="h-4 w-4 mr-1.5" />
              Duplicates
            </TabsTrigger>
            <TabsTrigger value="merges">
              <GitMerge className="h-4 w-4 mr-1.5" />
              Merge history
            </TabsTrigger>
            <TabsTrigger value="matching">
              <Filter className="h-4 w-4 mr-1.5" />
              Matching rules
            </TabsTrigger>
            <TabsTrigger value="config">
              <Settings2 className="h-4 w-4 mr-1.5" />
              Configuration
            </TabsTrigger>
          </TabsList>

          <TabsContent value="duplicates" className="mt-4">
            <DuplicatesPanel />
          </TabsContent>
          <TabsContent value="merges" className="mt-4">
            <MergeHistoryPanel />
          </TabsContent>
          <TabsContent value="matching" className="mt-4 space-y-6">
            <ContactMatchingRulesPanel />
            <ContactRematchPanel />
          </TabsContent>
          <TabsContent value="config" className="mt-4">
            <ConfigPanel />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------

function DuplicatesPanel() {
  const [window, setWindow] = useState(90);
  const { data: groups, isLoading, refetch } = useDuplicateContacts(window);
  const merge = useMergeIdentityContacts();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground">Scan window (days)</Label>
        <Input
          type="number"
          className="h-9 w-24"
          value={window}
          onChange={(e) => setWindow(Number(e.target.value) || 30)}
        />
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Rescan
        </Button>
        <Badge variant="secondary" className="ml-auto">
          {groups?.length ?? 0} groups
        </Badge>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Scanning contacts</p>
      ) : !groups || groups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <Shield className="mx-auto h-8 w-8 mb-2 opacity-60" />
            No duplicate customers detected in the selected window.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {groups.map((g, idx) => (
            <DuplicateGroupCard
              key={`${g.kind}-${g.key}-${idx}`}
              group={g}
              onMerge={async (primaryId, dupeIds) => {
                try {
                  await merge.mutateAsync({
                    primaryContactId: primaryId,
                    duplicateContactIds: dupeIds,
                    reason: `Auto-detected by ${g.kind} match`,
                  });
                  toast.success(`Merged ${dupeIds.length + 1} customers`);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Merge failed");
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type DupGroup = {
  key: string;
  kind: "phone" | "email" | "name";
  confidence: number;
  contacts: Array<{
    id: string;
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  }>;
};

function DuplicateGroupCard({
  group,
  onMerge,
}: {
  group: DupGroup;
  onMerge: (primaryId: string, dupeIds: string[]) => Promise<void>;
}) {
  const [primaryId, setPrimaryId] = useState(group.contacts[0]?.id ?? "");
  const Icon = group.kind === "phone" ? Phone : group.kind === "email" ? Mail : User;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">
            {group.kind === "phone"
              ? "Same phone number"
              : group.kind === "email"
              ? "Same email address"
              : "Same name"}
          </CardTitle>
          <code className="text-xs text-muted-foreground truncate max-w-xs">{group.key}</code>
          <Badge
            variant={group.confidence >= 0.9 ? "default" : "secondary"}
            className="ml-auto text-[11px]"
          >
            {Math.round(group.confidence * 100)}% match
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {group.contacts.map((c) => {
          const isPrimary = c.id === primaryId;
          const name =
            c.display_name ||
            [c.first_name, c.last_name].filter(Boolean).join(" ") ||
            c.email ||
            c.phone ||
            "Unknown";
          return (
            <button
              key={c.id}
              onClick={() => setPrimaryId(c.id)}
              className={`flex items-center gap-3 w-full text-left rounded-control border p-2.5 hover:bg-muted/40 transition ${
                isPrimary ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <Avatar className="h-9 w-9">
                <AvatarImage src={c.avatar_url ?? undefined} />
                <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {c.email ?? "—"} · {c.phone ?? "—"}
                </p>
              </div>
              {isPrimary && <Badge>Primary</Badge>}
            </button>
          );
        })}
        <div className="flex justify-end pt-1">
          <Button
            size="sm"
            onClick={() =>
              onMerge(
                primaryId,
                group.contacts.filter((c) => c.id !== primaryId).map((c) => c.id),
              )
            }
          >
            <GitMerge className="h-3.5 w-3.5 mr-1.5" />
            Merge into primary
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Merge history
// ---------------------------------------------------------------------------

function MergeHistoryPanel() {
  const { data, isLoading } = useIdentityMerges();
  const split = useSplitMerge();

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading merge log</p>;
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No merges yet. Merges done from the duplicates tab or contact detail will appear here.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {data.map((m) => (
        <Card key={m.id}>
          <CardContent className="py-3 flex items-center gap-3">
            <div className="text-sm">
              <p>
                <code className="text-xs">{m.merged_contact_id.slice(0, 8)}</code>{" "}
                <ArrowRight className="inline h-3 w-3" />{" "}
                <code className="text-xs">{m.primary_contact_id.slice(0, 8)}</code>
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(m.created_at).toLocaleString()} · {m.merge_reason ?? "manual"}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {m.is_reverted ? (
                <Badge variant="outline">Reverted</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await split.mutateAsync(m.id);
                      toast.success("Merge reverted");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Split failed");
                    }
                  }}
                >
                  <Split className="h-3.5 w-3.5 mr-1.5" />
                  Split back
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function ConfigPanel() {
  const { data: config } = useIdentityConfig();
  const save = useSetIdentityConfig();
  const cfg = useMemo(() => config ?? null, [config]);

  if (!cfg) return <p className="text-sm text-muted-foreground">Loading configuration</p>;

  const patch = async (p: Record<string, unknown>) => {
    try {
      await save.mutateAsync(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automatic matching</CardTitle>
          <CardDescription>Rules the identity engine applies to inbound messages.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SwitchRow
            icon={<Phone className="h-4 w-4" />}
            label="Auto-merge on phone match"
            desc="Merge contacts that share a phone or WhatsApp number."
            checked={cfg.auto_merge_on_phone}
            onCheckedChange={(v) => patch({ auto_merge_on_phone: v })}
          />
          <SwitchRow
            icon={<Mail className="h-4 w-4" />}
            label="Auto-merge on email match"
            desc="Merge contacts that share the same email address."
            checked={cfg.auto_merge_on_email}
            onCheckedChange={(v) => patch({ auto_merge_on_email: v })}
          />
          <SwitchRow
            icon={<Shield className="h-4 w-4" />}
            label="Require manual approval"
            desc="Never merge automatically — always show suggestions instead."
            checked={cfg.require_manual_approval}
            onCheckedChange={(v) => patch({ require_manual_approval: v })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <Sparkles className="h-4 w-4 inline mr-1.5" />
            AI matching
          </CardTitle>
          <CardDescription>Fuzzy identity resolution across names, spellings and handles.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SwitchRow
            icon={<Sparkles className="h-4 w-4" />}
            label="Enable AI matching"
            desc="Use language models to detect same-person duplicates."
            checked={cfg.ai_matching_enabled}
            onCheckedChange={(v) => patch({ ai_matching_enabled: v })}
          />
          <div>
            <Label className="text-sm">
              Confidence threshold ·{" "}
              <span className="">{Math.round(cfg.ai_confidence_threshold * 100)}%</span>
            </Label>
            <Slider
              min={50}
              max={99}
              step={1}
              value={[Math.round(cfg.ai_confidence_threshold * 100)]}
              onValueChange={([v]) => patch({ ai_confidence_threshold: (v ?? 85) / 100 })}
              className="mt-2"
            />
          </div>
          <div>
            <Label className="text-sm">Duplicate scan window (days)</Label>
            <Input
              type="number"
              value={cfg.duplicate_scan_window_days}
              onChange={(e) =>
                patch({ duplicate_scan_window_days: Number(e.target.value) || 90 })
              }
              className="mt-2 h-9 w-32"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SwitchRow({
  icon,
  label,
  desc,
  checked,
  onCheckedChange,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
