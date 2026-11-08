import { useEffect, useRef, useState, type FormEvent } from "react";
import { ImagePlus, Palette, X } from "lucide-react";
import { toast } from "sonner";
import { DatePicker, fromDateString, toDateString } from "@/shared/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextarea } from "@/shared/components/rich-textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreatePmProject,
  useUpdatePmProject,
  type PmProject,
} from "@/lib/project-management/client";
import { PROJECT_STATUS_LABELS, errorMessage } from "./labels";
import { uploadBrandingAsset, removeBrandingAsset } from "@/lib/branding/upload";

const COLORS = ["#075E54", "#4F70C8", "#8459A8", "#CB7A4B", "#B45972"];

type Draft = {
  name: string;
  description: string;
  status: PmProject["status"];
  color: string;
  logoUrl: string;
  startDate: string;
  dueDate: string;
};

function initialDraft(project: PmProject | null): Draft {
  return {
    name: project?.name ?? "",
    description: project?.description ?? "",
    status: project?.status ?? "planning",
    color: project?.color ?? COLORS[0],
    logoUrl: project?.logo_url ?? "",
    startDate: project?.start_date ?? "",
    dueDate: project?.due_date ?? "",
  };
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  workspaceId,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null;
  project?: PmProject | null;
}) {
  const current = project ?? null;
  const [draft, setDraft] = useState<Draft>(() => initialDraft(current));
  const [formError, setFormError] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const create = useCreatePmProject();
  const update = useUpdatePmProject();
  const pending = create.isPending || update.isPending || uploading;

  useEffect(() => {
    if (!logoFile || !open) {
      setLogoPreview(null);
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile, open]);

  useEffect(() => {
    if (!open) return;
    setDraft(initialDraft(current));
    setLogoFile(null);
    if (logoInputRef.current) logoInputRef.current.value = "";
    setFormError("");
    // Do not reset a draft on background query refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current?.id]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !workspaceId) return;
    const name = draft.name.trim();
    if (!name) {
      setFormError("Enter a project name.");
      return;
    }
    if (draft.startDate && draft.dueDate && draft.dueDate < draft.startDate) {
      setFormError("Due date must be on or after the start date.");
      return;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(draft.color)) {
      setFormError("Enter a six-digit HEX color, such as #075E54.");
      return;
    }
    setFormError("");
    try {
      const fields = {
        name,
        description: draft.description.trim() || null,
        color: draft.color,
        start_date: draft.startDate || null,
        due_date: draft.dueDate || null,
      };
      if (current) {
        let logoUrl = draft.logoUrl || null;
        if (logoFile) {
          setUploading(true);
          logoUrl = await uploadBrandingAsset(logoFile, { kind: "workspace", workspaceId }, `projects/${current.id}`);
        }
        try {
          await update.mutateAsync({
            id: current.id,
            workspace_id: workspaceId,
            ...fields,
            status: draft.status,
            ...(logoUrl !== (current.logo_url ?? null) ? { logo_url: logoUrl } : {}),
          });
        } catch (error) {
          if (logoFile) void removeBrandingAsset(logoUrl);
          throw error;
        }
        if (
          current.logo_url?.startsWith(`/api/public/branding/workspace/${workspaceId}/projects/${current.id}/`)
          && current.logo_url !== logoUrl
        ) void removeBrandingAsset(current.logo_url);
      } else {
        const created = await create.mutateAsync({ workspace_id: workspaceId, ...fields });
        if (logoFile) {
          try {
            setUploading(true);
            const logoUrl = await uploadBrandingAsset(logoFile, { kind: "workspace", workspaceId }, `projects/${created.id}`);
            try {
              await update.mutateAsync({ id: created.id, workspace_id: workspaceId, logo_url: logoUrl });
            } catch (error) {
              void removeBrandingAsset(logoUrl);
              throw error;
            }
          } catch (error) {
            toast.error(`Project created, but its logo could not be saved. ${errorMessage(error)}`);
            onOpenChange(false);
            return;
          }
        }
      }
      toast.success(current ? "Project updated" : "Project created");
      onOpenChange(false);
    } catch (error) {
      setFormError(`Could not save project. ${errorMessage(error)}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{current ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>Keep the work, people, and deadline together.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pm-project-logo">Project logo</Label>
            <div className="flex items-center gap-3">
              <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-control border bg-muted/50">
                {logoPreview || draft.logoUrl ? (
                  <img src={logoPreview || draft.logoUrl} alt="Project logo preview" className="h-full w-full object-contain" />
                ) : (
                  <ImagePlus className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <Input
                id="pm-project-logo"
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="min-w-0 flex-1"
                disabled={pending}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
                    setFormError("Use a PNG, JPG, WEBP or GIF project logo.");
                    event.target.value = "";
                    return;
                  }
                  if (file.size > 5 * 1024 * 1024) {
                    setFormError("Project logo must be 5 MB or smaller.");
                    event.target.value = "";
                    return;
                  }
                  setFormError("");
                  setLogoFile(file);
                }}
              />
              {(logoFile || draft.logoUrl) && (
                <Button type="button" size="icon" variant="ghost" aria-label="Remove project logo" disabled={pending}
                  onClick={() => {
                    setLogoFile(null);
                    if (logoInputRef.current) logoInputRef.current.value = "";
                    setDraft((d) => ({ ...d, logoUrl: "" }));
                  }}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">PNG, JPG, WEBP or GIF. Maximum 5 MB.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pm-project-name">Project name</Label>
            <Input
              id="pm-project-name"
              value={draft.name}
              maxLength={160}
              autoFocus
              aria-invalid={!!formError && !draft.name.trim()}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Website relaunch"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pm-project-description">Description</Label>
            <RichTextarea
              id="pm-project-description"
              rows={3}
              value={draft.description}
              onChange={(description) => setDraft((d) => ({ ...d, description }))}
              placeholder="What outcome should this project deliver?"
            />
          </div>
          {current && (
            <div className="space-y-1.5">
              <Label htmlFor="pm-project-status">Status</Label>
              <Select
                value={draft.status}
                onValueChange={(status) =>
                  setDraft((d) => ({ ...d, status: status as PmProject["status"] }))
                }
              >
                <SelectTrigger id="pm-project-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PROJECT_STATUS_LABELS) as PmProject["status"][]).map((status) => (
                    <SelectItem key={status} value={status}>
                      {PROJECT_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <DatePicker
                value={fromDateString(draft.startDate)}
                onChange={(value) => setDraft((d) => ({ ...d, startDate: toDateString(value) }))}
                placeholder="Select start date"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <DatePicker
                value={fromDateString(draft.dueDate)}
                onChange={(value) => setDraft((d) => ({ ...d, dueDate: toDateString(value) }))}
                placeholder="Select due date"
              />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Project color</legend>
            <div className="flex flex-wrap items-center gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="h-9 w-9 rounded-full border-2 border-background outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  style={{
                    backgroundColor: color,
                    boxShadow: draft.color === color ? `0 0 0 2px ${color}` : undefined,
                  }}
                  aria-label={`Choose color ${color}`}
                  aria-pressed={draft.color === color}
                  onClick={() => setDraft((d) => ({ ...d, color }))}
                />
              ))}
              <span className="mx-0.5 h-6 w-px bg-border" aria-hidden="true" />
              <label className="relative grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-input bg-background text-muted-foreground hover:text-foreground focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2" title="Choose custom color">
                <Palette className="h-4 w-4" aria-hidden="true" />
                <input
                  type="color"
                  aria-label="Choose custom project color"
                  value={/^#[0-9a-fA-F]{6}$/.test(draft.color) ? draft.color : COLORS[0]}
                  onChange={(event) => setDraft((d) => ({ ...d, color: event.target.value }))}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
              <Input
                aria-label="Project color HEX value"
                value={draft.color}
                onChange={(event) => setDraft((d) => ({ ...d, color: event.target.value }))}
                maxLength={7}
                spellCheck={false}
                aria-invalid={!/^#[0-9a-fA-F]{6}$/.test(draft.color)}
                className="w-28 font-mono text-xs uppercase"
                placeholder="#075E54"
              />
            </div>
          </fieldset>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !workspaceId}>
              {pending ? "Saving" : current ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
