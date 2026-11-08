import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DripSequenceEditor } from "@/components/app/campaigns/drip-sequence-editor";
import { AppTopbar } from "@/components/app/app-topbar";
import { Zap, Plus, Play, Pause, FileEdit, Loader2, Archive, Trash2, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/shared/components/confirm-dialog";
import {
  useDeleteArchivedDripSequence,
  useDripSequences,
  useMarketingRealtime,
  useUpsertDripSequence,
  type DripSequenceRow,
} from "@/hooks/use-marketing";
import { DRIP_PRESETS, useCreateDripFromPreset } from "@/hooks/use-scheduling";

export const Route = createFileRoute("/_authenticated/drip")({
  component: DripPage,
});

const statusClass = {
  active: "text-success bg-success/10",
  paused: "text-warning bg-warning/10",
  draft: "text-muted-foreground bg-muted",
  archived: "text-muted-foreground bg-muted opacity-60",
} as const;

const statusIcon = { active: Play, paused: Pause, draft: FileEdit, archived: FileEdit } as const;

function SequenceActions({ seq, onDelete }: { seq: DripSequenceRow; onDelete: (seq: DripSequenceRow) => void }) {
  const upsert = useUpsertDripSequence();
  const toggle = (status: "active" | "paused" | "draft" | "archived") => {
    upsert.mutate(
      { id: seq.id, status },
      {
        onSuccess: () => toast.success(`Sequence ${status}`),
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Update failed"),
      },
    );
  };
  return (
    <div className="flex items-center gap-2">
      {seq.status === "active" && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => toggle("paused")}
          disabled={upsert.isPending}
        >
          <Pause className="w-3.5 h-3.5 " /> Pause
        </Button>
      )}
      {(seq.status === "paused" || seq.status === "draft") && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => toggle("active")}
          disabled={upsert.isPending}
        >
          <Play className="w-3.5 h-3.5 " /> Activate
        </Button>
      )}
      {seq.status !== "archived" && (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => toggle("archived")}
          disabled={upsert.isPending}
        >
          <Archive className="w-3.5 h-3.5" />
        </Button>
      )}
      {seq.status === "archived" && (
        <>
          <Button size="sm" variant="outline" onClick={() => toggle("draft")} disabled={upsert.isPending}>
            <ArchiveRestore className="w-3.5 h-3.5 " /> Restore
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onDelete(seq)}>
            <Trash2 className="w-3.5 h-3.5 " /> Delete
          </Button>
        </>
      )}
    </div>
  );
}

function DripPage() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DripSequenceRow | null>(null);
  useMarketingRealtime();
  const { data: sequences, isLoading } = useDripSequences();
  const create = useCreateDripFromPreset();
  const deleteArchived = useDeleteArchivedDripSequence();

  const createSequence = (preset: (typeof DRIP_PRESETS)[number]["id"]) => {
    if (create.isPending) return;
    create.mutate(
      { preset },
      {
        onSuccess: (seq) => { toast.success(`Created "${seq.name}" as a draft sequence`); setEditingId(seq.id); },
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Could not create the sequence"),
      },
    );
  };

  return (
    <>
      <AppTopbar
        title="Drip Sequences"
        subtitle="Automated multi-step WhatsApp journeys"
        actions={
          // Was a button with no onClick at all. The backend is real — the
          // tables, the preset creator and the `drip-tick` executor all exist —
          // so it is wired to the existing preset path rather than disabled.
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
                disabled={create.isPending}
              >
                {create.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                New sequence
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              {DRIP_PRESETS.map((preset) => (
                <DropdownMenuItem
                  key={preset.id}
                  disabled={create.isPending}
                  onSelect={() => createSequence(preset.id)}
                  className="flex-col items-start gap-0.5"
                >
                  <span className="font-medium">{preset.label}</span>
                  <span className="text-xs text-muted-foreground">{preset.description}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading sequences</div>
        ) : !sequences || sequences.length === 0 ? (
          <div className="rounded-control border border-dashed border-border bg-surface p-10 text-center">
            <Zap className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
            <div className="font-medium">No drip sequences yet</div>
            <div className="text-sm text-muted-foreground mt-1">
              Build automated welcome, onboarding, and re-engagement flows triggered by segment or
              event.
            </div>
          </div>
        ) : (
          <div className="rounded-control border border-border bg-surface shadow-sm divide-y divide-border">
            {sequences.map((s) => {
              const Icon = statusIcon[s.status];
              return (
                <div key={s.id} className="p-5 flex flex-wrap items-center gap-4">
                  <div className="w-10 h-10 rounded-control bg-accent/10 text-accent grid place-items-center">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-[220px]">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 capitalize">
                      Trigger: {s.trigger_type.replace("_", " ")} · {s.enrolled_count} enrolled ·{" "}
                      {s.completed_count} completed
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-control text-xs font-medium ${statusClass[s.status]}`}
                  >
                    <Icon className="w-3 h-3" />
                    {s.status}
                  </span>
                  <SequenceActions seq={s} onDelete={setDeleteTarget} />
                  <Button size="sm" variant="outline" onClick={() => setEditingId(s.id)}>Edit sequence</Button>
                </div>
              );
            })}
          </div>
        )}
      </main>
      <DripSequenceEditor id={editingId} onClose={() => setEditingId(null)} />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`Delete “${deleteTarget?.name ?? "sequence"}”?`}
        description="This permanently removes the archived sequence and its saved steps and enrollment history. Active enrollments prevent deletion."
        confirmLabel="Delete sequence"
        destructive
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await deleteArchived.mutateAsync(deleteTarget.id);
            toast.success("Sequence deleted");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not delete sequence");
            throw error;
          }
        }}
      />
    </>
  );
}
