/**
 * Super Admin — create/edit dialog for an AI provider.
 *
 * Credentials are never stored in the database: only the NAME of the backend
 * secret holding the API key is persisted, and the value is read from the
 * server environment at call time.
 */
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import {
  listAiProviderTargets,
  PROVIDER_KINDS,
  savePlatformAiProvider,
  type ProviderKindInfo,
} from "@/lib/admin/ai-providers.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ProviderDraft = {
  id?: string;
  workspaceId?: string;
  kind: string;
  name: string;
  baseUrl: string;
  apiKeySecretName: string;
  organizationId: string;
  enabled: boolean;
  isDefault: boolean;
  priority: number;
};

export const emptyDraft: ProviderDraft = {
  kind: "gemini",
  name: "Google Gemini",
  baseUrl: "",
  apiKeySecretName: "GEMINI_API_KEY",
  organizationId: "",
  enabled: true,
  isDefault: true,
  priority: 10,
};

export function ProviderEditorDialog({
  open,
  onOpenChange,
  draft,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  draft: ProviderDraft | null;
}) {
  const qc = useQueryClient();
  const fetchTargets = useServerFn(listAiProviderTargets);
  const save = useServerFn(savePlatformAiProvider);

  const [form, setForm] = React.useState<ProviderDraft>(draft ?? emptyDraft);
  const [allWorkspaces, setAllWorkspaces] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setForm(draft ?? emptyDraft);
      setAllWorkspaces(false);
    }
  }, [open, draft]);

  const {
    data: targets,
    error: targetsError,
    isLoading: targetsLoading,
    refetch: refetchTargets,
  } = useQuery({
    queryKey: ["admin", "ai-provider-targets"],
    queryFn: () => fetchTargets(),
    enabled: open,
    staleTime: 60_000,
  });

  const kinds: ProviderKindInfo[] = targets?.kinds?.length ? targets.kinds : PROVIDER_KINDS;
  const kindInfo = kinds.find((k) => k.kind === form.kind);
  const isEdit = Boolean(form.id);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: form.id,
          workspaceId: allWorkspaces ? undefined : form.workspaceId,
          applyToAllWorkspaces: allWorkspaces,
          kind: form.kind as never,
          name: form.name.trim(),
          baseUrl: form.baseUrl.trim() || null,
          apiKeySecretName: form.apiKeySecretName.trim() || null,
          organizationId: form.organizationId.trim() || null,
          enabled: form.enabled,
          isDefault: form.isDefault,
          priority: form.priority,
        },
      }),
    onSuccess: (res) => {
      toast.success(
        isEdit ? "Provider updated" : `Provider created for ${res.ids?.length ?? 0} workspace(s)`,
      );
      qc.invalidateQueries({ queryKey: ["admin", "ai-providers"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function pickKind(kind: string) {
    const info = kinds.find((k) => k.kind === kind);
    setForm((f) => ({
      ...f,
      kind,
      name: isEdit ? f.name : (info?.label ?? kind),
      baseUrl: info?.defaultBaseUrl ?? "",
      apiKeySecretName: info?.suggestedSecretName ?? "",
    }));
  }

  const canSave =
    form.name.trim().length > 0 && (isEdit || allWorkspaces || Boolean(form.workspaceId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Configure provider" : "Add AI provider"}</DialogTitle>
          <DialogDescription>
            API keys are read from backend secrets at request time — only the secret name is stored.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {!isEdit && (
            <div className="space-y-2">
              <Label>Workspace</Label>
              <Select
                value={allWorkspaces ? "__all__" : (form.workspaceId ?? "")}
                onValueChange={(v) => {
                  if (v === "__all__") {
                    setAllWorkspaces(true);
                  } else {
                    setAllWorkspaces(false);
                    setForm((f) => ({ ...f, workspaceId: v }));
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a workspace" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All workspaces (platform-wide)</SelectItem>
                  {(targets?.workspaces ?? []).map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                      {w.organizationName ? ` — ${w.organizationName}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {targetsLoading && (
                <p className="text-xs text-muted-foreground">Loading workspaces</p>
              )}
              {targetsError && (
                <p className="text-xs text-destructive" role="alert">
                  Could not load workspaces: {(targetsError as Error).message}{" "}
                  <button type="button" className="underline" onClick={() => refetchTargets()}>
                    Retry
                  </button>
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Provider kind</Label>
            <Select value={form.kind} onValueChange={pickKind}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {kinds.map((k) => (
                  <SelectItem key={k.kind} value={k.kind}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prov-name">Display name</Label>
            <Input
              id="prov-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prov-url">Base URL</Label>
            <Input
              id="prov-url"
              value={form.baseUrl}
              placeholder={kindInfo?.defaultBaseUrl || "https://"}
              onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prov-secret">API key secret name</Label>
            <Input
              id="prov-secret"
              className="font-mono text-xs"
              value={form.apiKeySecretName}
              placeholder={kindInfo?.suggestedSecretName || "MY_PROVIDER_API_KEY"}
              onChange={(e) => setForm((f) => ({ ...f, apiKeySecretName: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground">
              Name of the backend secret holding the key. Add the secret first, then reference it
              here.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prov-org">Organization ID (optional)</Label>
            <Input
              id="prov-org"
              value={form.organizationId}
              onChange={(e) => setForm((f) => ({ ...f, organizationId: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="prov-priority">Priority</Label>
              <Input
                id="prov-priority"
                type="number"
                min={1}
                max={1000}
                value={form.priority}
                onChange={(e) =>
                  setForm((f) => ({ ...f, priority: Number(e.target.value) || 100 }))
                }
              />
            </div>
            <div className="space-y-3 pt-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
                />
                Enabled
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.isDefault}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isDefault: v }))}
                />
                Default provider
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSave || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            {isEdit ? "Save changes" : "Create provider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
