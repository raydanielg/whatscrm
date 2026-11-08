import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Globe2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { sbAny } from "@/lib/supabase/untyped";
import {
  PermissionRoleSelect,
  defaultAssignableRole,
  useAssignableRoles,
  type AssignableRole,
} from "@/components/app/team/permission-role-select";

type Rule = {
  id: string;
  workspace_id: string;
  domain: string;
  role: "admin" | "manager" | "agent" | "viewer";
  permission_role_id: string | null;
  is_active: boolean;
  created_at: string;
};

export function AutoInvitePanel({
  workspaceId,
  canManage,
}: {
  workspaceId: string;
  canManage: boolean;
}) {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState("");
  const { roles } = useAssignableRoles();
  const [selectedRole, setSelectedRole] = useState<AssignableRole | undefined>();
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("workspace_auto_invite_rules" as never)
      .select("id, workspace_id, domain, role, permission_role_id, is_active, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRules((data as unknown as Rule[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`auto-invite-${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workspace_auto_invite_rules",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    const clean = domain.trim().toLowerCase().replace(/^@/, "");
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(clean)) {
      toast.error("Enter a valid domain, e.g. company.com");
      return;
    }
    setSaving(true);
    const chosen = selectedRole ?? defaultAssignableRole(roles);
    if (!chosen) {
      setSaving(false);
      toast.error("No assignable role is available");
      return;
    }
    const { error } = await sbAny(supabase)
      .from("workspace_auto_invite_rules" as never)
      .insert({
        workspace_id: workspaceId,
        domain: clean,
        role: chosen.workspaceRole,
        permission_role_id: chosen.id,
      } as never);
    setSaving(false);
    if (error) {
      toast.error(
        error.message.includes("duplicate") ? "That domain already has a rule" : error.message,
      );
      return;
    }
    setDomain("");
    toast.success(`Anyone with @${clean} will auto-join as ${chosen.name}`);
  }

  async function toggleActive(rule: Rule, next: boolean) {
    const { error } = await supabase
      .from("workspace_auto_invite_rules" as never)
      .update({ is_active: next } as never)
      .eq("id", rule.id);
    if (error) toast.error(error.message);
  }

  async function updateRole(rule: Rule, next: AssignableRole) {
    const { error } = await supabase
      .from("workspace_auto_invite_rules" as never)
      .update({ role: next.workspaceRole, permission_role_id: next.id } as never)
      .eq("id", rule.id);
    if (error) toast.error(error.message);
  }

  async function removeRule(rule: Rule) {
    const { error } = await supabase
      .from("workspace_auto_invite_rules" as never)
      .delete()
      .eq("id", rule.id);
    if (error) toast.error(error.message);
    else toast.success("Rule removed");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-control border border-border bg-surface p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 mt-0.5 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            When someone signs up or signs in with a{" "}
            <strong className="text-foreground">verified</strong> email on an approved domain,
            they're automatically added to this workspace with the role you set. Unverified emails
            are ignored.
          </div>
        </div>
      </div>

      {canManage && (
        <form onSubmit={addRule} className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full">
            <Label htmlFor="ai-domain" className="mb-1.5 block">
              Domain
            </Label>
            <div className="relative">
              <Globe2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="ai-domain"
                placeholder="company.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="pl-9"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="w-full sm:w-40">
            <Label htmlFor="ai-role" className="mb-1.5 block">
              Role
            </Label>
            <PermissionRoleSelect
              value={(selectedRole ?? defaultAssignableRole(roles))?.id}
              onChange={setSelectedRole}
            />
          </div>
          <Button type="submit" disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add rule
          </Button>
        </form>
      )}

      <div className="rounded-control border border-border overflow-hidden">
        {loading ? (
          <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading rules
          </div>
        ) : !rules || rules.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No auto-invite rules yet.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">@{r.domain}</span>
                    {!r.is_active && <Badge variant="secondary">Paused</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Added {new Date(r.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="w-32">
                  <PermissionRoleSelect
                    value={r.permission_role_id ?? undefined}
                    onChange={(role) => updateRole(r, role)}
                    disabled={!canManage}
                    className="h-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={r.is_active}
                    onCheckedChange={(v) => toggleActive(r, v)}
                    disabled={!canManage}
                    aria-label={r.is_active ? "Pause rule" : "Activate rule"}
                  />
                </div>
                {canManage && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Delete rule">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove auto-invite rule?</AlertDialogTitle>
                        <AlertDialogDescription>
                          New users with an @{r.domain} email will no longer be auto-added. Existing
                          members are not affected.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => removeRule(r)}>Remove</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Call after successful login to apply any matching domain rules for the current user. */
export async function applyAutoInviteRulesForCurrentUser(): Promise<number> {
  const { data, error } = await (
    supabase.rpc as never as (
      fn: string,
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  )("apply_my_auto_invite_rules");
  if (error) {
    // Non-fatal: don't block login on this.
    console.warn("apply_my_auto_invite_rules failed:", error.message);
    return 0;
  }
  return Array.isArray(data) ? data.length : 0;
}
