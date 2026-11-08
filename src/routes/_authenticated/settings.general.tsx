import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Upload, X } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { APP_RELEASE_CHANNEL, APP_VERSION_LABEL } from "@/lib/app-version";
import { docsUrl } from "@/lib/docs/links";
import { SHOW_RESOURCE_LINKS } from "@/lib/docs/visibility";
import { useCurrentWorkspace, useUpdateWorkspace, useWorkspaceRole } from "@/hooks/use-workspace";
import { useBrandName } from "@/hooks/use-brand-name";
import { supabase } from "@/integrations/supabase/client";
import {
  validateBrandingFile,
  uploadBrandingAsset,
  isBrandingAssetUrl,
  removeBrandingAsset,
  BRANDING_ACCEPT,
} from "@/lib/branding/upload";

export const Route = createFileRoute("/_authenticated/settings/general")({
  component: GeneralSettings,
  head: () => ({
    meta: [
      { title: "General Settings — Workspace" },
      {
        name: "description",
        content: "Manage workspace name, description, avatar, and notification preferences.",
      },
    ],
  }),
});

function GeneralSettings() {
  const brandName = useBrandName();
  const { data: ws } = useCurrentWorkspace();
  const { data: role } = useWorkspaceRole(ws?.id);
  const canEdit = role === "owner" || role === "admin";
  const update = useUpdateWorkspace(ws?.id);
  const orgId = ws?.organization_id ?? null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [notifications, setNotifications] = useState(true);

  useEffect(() => {
    if (!ws) return;
    setName(ws.name ?? "");
    setDescription(ws.description ?? "");
    setAvatarUrl(ws.avatar_url ?? "");
    setNotifications(ws.notifications_enabled);
  }, [ws]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!ws) return;
    if (!name.trim()) {
      toast.error("Workspace name is required");
      return;
    }
    try {
      await update.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        notifications_enabled: notifications,
      });
      toast.success("Workspace saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <>
      <AppTopbar title="General" subtitle="Workspace details and preferences" />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
            <CardDescription>Basic details about this workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSave} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Workspace name</Label>
                <Input
                  id="name"
                  value={name}
                  disabled={!canEdit}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={80}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="slug">Slug</Label>
                <Input id="slug" value={ws?.slug ?? ""} disabled />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="desc">Description</Label>
                <Textarea
                  id="desc"
                  value={description}
                  disabled={!canEdit}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                  rows={3}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="avatar">Logo</Label>
                <WorkspaceLogoUpload
                  logoUrl={avatarUrl}
                  orgId={orgId}
                  disabled={!canEdit}
                  onChange={setAvatarUrl}
                />
              </div>
              <div className="flex items-center justify-between rounded-control border p-3">
                <div>
                  <Label htmlFor="notif" className="text-sm">
                    Workspace notifications
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Send activity emails to workspace members.
                  </p>
                </div>
                <Switch
                  id="notif"
                  checked={notifications}
                  disabled={!canEdit}
                  onCheckedChange={setNotifications}
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={!canEdit || update.isPending}>
                  {update.isPending ? "Saving" : "Save changes"}
                </Button>
              </div>
              {!canEdit && (
                <p className="text-xs text-muted-foreground">
                  Only owners and admins can edit workspace details.
                </p>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>About {brandName}</CardTitle>
            <CardDescription>Release information for this installation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-muted-foreground">Version</span>
              <span className="flex items-center gap-2 font-medium">
                {APP_VERSION_LABEL}
                <Badge variant="secondary">{APP_RELEASE_CHANNEL}</Badge>
              </span>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-muted-foreground">Product</span>
              <span className="font-medium">{brandName} — Omnichannel CRM</span>
            </div>
            {SHOW_RESOURCE_LINKS && <div className="pt-1">
              <Button asChild variant="outline" size="sm">
                <a href="/api/public/changelog.pdf" download>
                  <Download className="h-4 w-4" />
                  Download release notes (PDF)
                </a>
              </Button>
            </div>}
            {SHOW_RESOURCE_LINKS && <div className="flex flex-wrap items-center gap-4 pt-1">
              <a
                className="text-accent hover:underline"
                href={docsUrl()}
                target="_blank"
                rel="noopener"
              >
                Documentation
              </a>
              <a
                className="text-accent hover:underline"
                href={docsUrl("changelog")}
                target="_blank"
                rel="noopener"
              >
                Changelog
              </a>
              <a
                className="text-accent hover:underline"
                href={docsUrl("status")}
                target="_blank"
                rel="noopener"
              >
                System status
              </a>
              <a
                className="text-accent hover:underline"
                href={docsUrl("support")}
                target="_blank"
                rel="noopener"
              >
                Support
              </a>
            </div>}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

/**
 * Workspace logo upload. Workspace-level branding assets reuse the `org`
 * storage scope keyed by the workspace's parent organization — there is no
 * separate "workspace" scope in the branding bucket. Workspaces that predate
 * org linkage (organization_id === null) have nowhere to scope an upload, so
 * the control falls back to URL-only in that case.
 */
function WorkspaceLogoUpload({
  logoUrl,
  orgId,
  disabled,
  onChange,
}: {
  logoUrl: string;
  orgId: string | null;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showUrlField, setShowUrlField] = useState(!orgId);
  const canUpload = !!orgId;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !orgId) return;
    const invalid = validateBrandingFile(file);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setUploading(true);
    try {
      const prevUrl = logoUrl;
      const url = await uploadBrandingAsset(file, { kind: "org", orgId }, "workspace-logo");
      onChange(url);
      if (isBrandingAssetUrl(prevUrl) && prevUrl !== url) {
        void removeBrandingAsset(prevUrl);
      }
      toast.success("Logo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    const prevUrl = logoUrl;
    onChange("");
    if (isBrandingAssetUrl(prevUrl)) {
      void removeBrandingAsset(prevUrl);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-control bg-muted grid place-items-center overflow-hidden shrink-0 border">
          {logoUrl ? (
            <img src={logoUrl} alt="Workspace logo" className="w-full h-full object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">None</span>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={disabled || uploading || !canUpload}
              title={
                canUpload ? undefined : "This workspace has no organization to scope the upload to"
              }
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5 mr-1.5" />
              )}
              {uploading ? "Uploading" : "Upload"}
            </Button>
            {logoUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRemove}
                disabled={disabled || uploading}
              >
                <X className="w-3.5 h-3.5 mr-1.5" /> Remove
              </Button>
            )}
            {canUpload && (
              <button
                type="button"
                onClick={() => setShowUrlField((v) => !v)}
                disabled={disabled}
                className="text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-50"
              >
                {showUrlField ? "Hide URL field" : "Paste URL instead"}
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept={BRANDING_ACCEPT} hidden onChange={handleFile} />
          {showUrlField && (
            <Input
              type="url"
              value={logoUrl}
              disabled={disabled}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://"
            />
          )}
        </div>
      </div>
    </div>
  );
}
