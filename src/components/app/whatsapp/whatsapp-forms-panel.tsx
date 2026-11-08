import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Loader2,
  Plus,
  Trash2,
  ClipboardList,
  CheckCircle2,
  PencilLine,
  Copy,
  Inbox,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { explainFlowError } from "@/lib/messaging/flow-error-messages";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextarea } from "@/shared/components/rich-textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WhatsAppFormSubmissionsDialog } from "./whatsapp-form-submissions-dialog";
import { WhatsAppFormEditorDialog } from "./whatsapp-form-editor-dialog";
import {
  publishWhatsAppForm as publishForm,
  unpublishWhatsAppForm as unpublishForm,
} from "@/lib/messaging/whatsapp-flows.functions";
import { sbAny } from "@/lib/supabase/untyped";

type FormRow = {
  id: string;
  name: string;
  category: string;
  flow_id: string | null;
  status: string;
  description: string | null;
  submissions_count: number;
  created_at: string;
  last_published_at: string | null;
  flow_json: unknown;
};

const CATEGORIES = [
  "SIGN_UP",
  "SIGN_IN",
  "APPOINTMENT_BOOKING",
  "LEAD_GENERATION",
  "SHOPPING",
  "CONTACT_US",
  "CUSTOMER_SUPPORT",
  "SURVEY",
  "OTHER",
] as const;

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  category: z.enum(CATEGORIES),
  description: z.string().trim().max(500).optional(),
});

export function WhatsAppFormsPanel() {
  const { data: ws } = useCurrentWorkspace();
  const workspaceId = ws?.id;
  const formatZoned = useZonedDateFormatter();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submissionsFor, setSubmissionsFor] = useState<FormRow | null>(null);
  const [editorFor, setEditorFor] = useState<FormRow | null>(null);

  const forms = useQuery({
    queryKey: ["wa-forms", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_forms")
        .select(
          "id,name,category,flow_id,status,description,submissions_count,created_at,last_published_at,flow_json",
        )
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FormRow[];
    },
  });

  const stats = useMemo(() => {
    const list = forms.data ?? [];
    return {
      total: list.length,
      published: list.filter((f) => f.status === "PUBLISHED").length,
      drafts: list.filter((f) => f.status === "DRAFT").length,
      submissions: list.reduce((s, f) => s + (f.submissions_count ?? 0), 0),
    };
  }, [forms.data]);

  const togglePublish = useMutation({
    mutationFn: async (form: FormRow) => {
      if (form.status === "PUBLISHED") {
        return await unpublishForm({ data: { formId: form.id } });
      }
      return await publishForm({ data: { formId: form.id } });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["wa-forms", workspaceId] });
      const warnings = (res as { warnings?: string[] })?.warnings ?? [];
      if (warnings.length) {
        toast.warning("Published with warnings from Meta", { description: warnings.join(" · ") });
      } else {
        toast.success("Form updated");
      }
    },
    onError: (e: unknown, form: FormRow) => {
      const f = explainFlowError(form.status === "PUBLISHED" ? "unpublish" : "publish", e);
      toast.error(f.title, { description: f.description });
    },
  });

  const removeForm = useMutation({
    mutationFn: async (form: FormRow) => {
      if (!workspaceId) throw new Error("Workspace not loaded");
      // Deprecate at Meta first if published (so the Flow slot is freed).
      if (form.status === "PUBLISHED") {
        try {
          await unpublishForm({ data: { formId: form.id } });
        } catch {
          // Best-effort — proceed with local delete even if Meta deprecation fails.
        }
      }
      // Workspace filter is defence-in-depth; RLS also enforces this.
      const { error } = await sbAny(supabase)
        .from("whatsapp_forms")
        .delete()
        .eq("id", form.id)
        .eq("workspace_id", workspaceId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wa-forms", workspaceId] });
      toast.success("Form deleted");
    },
    onError: (e: unknown) => {
      const f = explainFlowError("delete", e);
      toast.error(f.title, { description: f.description });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-xl flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            WhatsApp Forms
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Collect leads instantly through WhatsApp with smart, automated forms.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} disabled={!workspaceId} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Form
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Forms" value={stats.total} />
        <StatCard label="Published" value={stats.published} tone="success" />
        <StatCard label="Drafts" value={stats.drafts} tone="muted" />
        <StatCard label="Submissions" value={stats.submissions} />
      </div>

      {forms.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading forms
        </div>
      ) : (forms.data ?? []).length === 0 ? (
        <div className="rounded-control border border-dashed border-border p-10 text-center">
          <ClipboardList className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
          <div className="font-medium text-sm">No WhatsApp forms yet</div>
          <div className="text-xs text-muted-foreground mt-1">
            Click <span className="font-medium text-foreground">Add Form</span> to build your first
            Flow.
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {(forms.data ?? []).map((form) => {
            const published = form.status === "PUBLISHED";
            return (
              <div key={form.id} className="rounded-control border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-medium text-sm truncate">{form.name}</div>
                      <Badge variant={published ? "default" : "secondary"} className="text-[11px]">
                        {form.status}
                      </Badge>
                      <Badge variant="outline" className="text-[11px]">
                        {form.category}
                      </Badge>
                    </div>
                    {form.description && (
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {form.description}
                      </div>
                    )}
                    <div className="text-[11px] text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      {form.flow_id && (
                        <span className="flex items-center gap-1">
                          Flow ID
                          <button
                            className="font-mono text-foreground/80 hover:underline inline-flex items-center gap-1"
                            onClick={() => {
                              navigator.clipboard.writeText(form.flow_id!);
                              toast.success("Flow ID copied");
                            }}
                          >
                            {form.flow_id}
                            <Copy className="w-3 h-3" />
                          </button>
                        </span>
                      )}
                      <span>
                        Created {formatZoned(new Date(form.created_at), { dateStyle: "medium" })}
                      </span>
                      <span>{form.submissions_count} submissions</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => setEditorFor(form)}
                      title="Edit steps"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      Edit steps
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => setSubmissionsFor(form)}
                      title="View submissions"
                    >
                      <Inbox className="w-3.5 h-3.5" />
                      Submissions
                      {form.submissions_count > 0 && (
                        <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[11px]">
                          {form.submissions_count}
                        </Badge>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant={published ? "outline" : "default"}
                      className="gap-1.5"
                      disabled={togglePublish.isPending || removeForm.isPending}
                      onClick={() => togglePublish.mutate(form)}
                    >
                      {togglePublish.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : published ? (
                        <PencilLine className="w-3.5 h-3.5" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      {published ? "Unpublish" : "Publish"}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={togglePublish.isPending || removeForm.isPending}
                      onClick={() => {
                        if (confirm(`Delete "${form.name}"?`)) removeForm.mutate(form);
                      }}
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        workspaceId={workspaceId}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["wa-forms", workspaceId] });
          setDialogOpen(false);
        }}
      />

      <WhatsAppFormSubmissionsDialog
        open={!!submissionsFor}
        onOpenChange={(v) => !v && setSubmissionsFor(null)}
        formId={submissionsFor?.id ?? null}
        formName={submissionsFor?.name ?? null}
        workspaceId={workspaceId}
      />

      <WhatsAppFormEditorDialog
        open={!!editorFor}
        onOpenChange={(v) => !v && setEditorFor(null)}
        formId={editorFor?.id ?? null}
        formName={editorFor?.name ?? null}
        initialFlow={editorFor?.flow_json ?? null}
        workspaceId={workspaceId}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["wa-forms", workspaceId] });
          setEditorFor(null);
        }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "muted";
}) {
  const valueClass =
    tone === "success"
      ? "text-primary"
      : tone === "muted"
        ? "text-muted-foreground"
        : "text-foreground";
  return (
    <div className="rounded-control border border-border bg-card p-4">
      <div className={`font-display font-semibold text-2xl ${valueClass}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function AddFormDialog({
  open,
  onOpenChange,
  workspaceId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string | undefined;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("CONTACT_US");
  const [description, setDescription] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("No workspace");
      const parsed = formSchema.safeParse({ name, category, description });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
      const { error } = await sbAny(supabase)
        .from("whatsapp_forms")
        .insert({
          workspace_id: workspaceId,
          name: parsed.data.name,
          category: parsed.data.category,
          description: parsed.data.description || null,
          status: "DRAFT",
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Form created");
      setName("");
      setDescription("");
      onCreated();
    },
    onError: (e: unknown) => {
      const f = explainFlowError("create", e);
      toast.error(f.title, { description: f.description });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New WhatsApp form</DialogTitle>
          <DialogDescription>
            Create a WhatsApp Flow to collect leads and structured responses inside the chat.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contact Form"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as (typeof CATEGORIES)[number])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <RichTextarea
              rows={2}
              maxLength={500}
              value={description}
              onChange={(v) => setDescription(v)}
              placeholder="What is this form for?"
            />
          </div>
          <div className="rounded-control border border-dashed border-border p-3 text-xs text-muted-foreground flex gap-2">
            <FileText className="w-4 h-4 shrink-0 mt-0.5" />
            Forms start as drafts. Publish to sync the Flow with Meta and get a Flow ID.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !workspaceId}>
            {create.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
