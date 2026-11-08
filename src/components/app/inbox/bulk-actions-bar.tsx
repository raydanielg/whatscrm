import { useState } from "react";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Download,
  Link2,
  Loader2,
  MoreHorizontal,
  Tag,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import { BulkLinkContactDialog } from "./bulk-link-contact-dialog";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { LabelChip } from "./label-manager";
import { useCurrentWorkspace, useWorkspaceMembers } from "@/hooks/use-workspace";
import {
  useBulkTagConversations,
  useBulkUpdateConversations,
  useExportConversations,
  useLabels,
} from "@/hooks/use-inbox-organization";
import { menuItemClass } from "@/lib/menu-item-class";
import { cn } from "@/lib/utils";

type Panel = "root" | "assign" | "tag";

export function BulkActionsBar({
  selectedIds,
  onClear,
}: {
  selectedIds: string[];
  onClear: () => void;
}) {
  const { active: workspace } = useCurrentWorkspace();
  const { data: members = [] } = useWorkspaceMembers(workspace?.id);
  const { data: labels = [] } = useLabels();
  const bulkUpdate = useBulkUpdateConversations();
  const bulkTag = useBulkTagConversations();
  const doExport = useExportConversations();
  const [pickedLabels, setPickedLabels] = useState<Set<string>>(new Set());
  const [linkContactOpen, setLinkContactOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>("root");

  if (selectedIds.length === 0) return null;

  const closeMenu = () => {
    setOpen(false);
    setPanel("root");
  };

  const run = async (patch: Record<string, unknown>, verb: string) => {
    try {
      const n = await bulkUpdate.mutateAsync({ ids: selectedIds, patch });
      toast.success(`${verb} ${n} conversation${n === 1 ? "" : "s"}`);
      closeMenu();
      onClear();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const assignTo = async (userId: string) => {
    await run(
      { assigned_to: userId === "unassigned" ? "" : userId },
      "Assigned",
    );
  };

  const applyTags = async () => {
    try {
      const n = await bulkTag.mutateAsync({
        ids: selectedIds,
        labelIds: Array.from(pickedLabels),
      });
      toast.success(`Tagged ${n} assignment${n === 1 ? "" : "s"}`);
      setPickedLabels(new Set());
      closeMenu();
      onClear();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const rootItems: Array<{
    key: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    onClick: () => void;
    hasChildren?: boolean;
    danger?: boolean;
    disabled?: boolean;
  }> = [
    {
      key: "assign",
      icon: UserCheck,
      label: "Assign",
      onClick: () => setPanel("assign"),
      hasChildren: true,
    },
    {
      key: "tag",
      icon: Tag,
      label: "Tag",
      onClick: () => setPanel("tag"),
      hasChildren: true,
    },
    {
      key: "link",
      icon: Link2,
      label: "Link contact",
      onClick: () => {
        closeMenu();
        setLinkContactOpen(true);
      },
    },
    {
      key: "archive",
      icon: Archive,
      label: "Archive",
      disabled: bulkUpdate.isPending,
      onClick: () => run({ is_archived: true }, "Archived"),
    },
    {
      key: "export",
      icon: Download,
      label: "Export",
      disabled: doExport.isPending,
      onClick: async () => {
        await doExport.mutateAsync(selectedIds);
        toast.success("Export downloaded");
        closeMenu();
      },
    },
    {
      key: "delete",
      icon: Trash2,
      label: "Delete",
      danger: true,
      disabled: bulkUpdate.isPending,
      onClick: () => run({ delete: true }, "Deleted"),
    },
  ];

  return (
    <div className="border-t border-border bg-background/95 backdrop-blur px-3 py-2 flex items-center gap-2 shadow-lg">
      <span className="text-xs font-medium">
        {selectedIds.length} selected
      </span>

      <div className="flex-1" />

      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setPanel("root");
        }}
      >
        <PopoverTrigger asChild>
          <Button size="sm" variant="secondary" className="h-7 gap-1 text-xs">
            <MoreHorizontal className="h-3.5 w-3.5" />
            Actions
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-48 p-0 overflow-hidden">
          {panel === "root" && (
            <div
              key="root"
              className="py-2 px-2 animate-in fade-in-0 slide-in-from-left-2 duration-200 ease-out"
            >
              {rootItems.map((it) => {
                const Icon = it.icon;
                return (
                  <button
                    key={it.key}
                    type="button"
                    disabled={it.disabled}
                    onClick={it.onClick}
                    className={menuItemClass(
                      "default",
                      "w-full text-xs",
                      it.danger && "text-destructive",
                      it.disabled && "pointer-events-none opacity-50",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="flex-1 text-left">{it.label}</span>
                    {it.hasChildren && (
                      <ChevronRight className="h-3.5 w-3.5 opacity-60" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {panel !== "root" && (
            <div
              key={panel}
              className="flex flex-col animate-in fade-in-0 slide-in-from-right-2 duration-200 ease-out"
            >
              <div className="flex items-center gap-2 border-b border-border h-9 px-2">
                <button
                  type="button"
                  onClick={() => setPanel("root")}
                  aria-label="Back to actions"
                  className="inline-flex items-center gap-1 h-7 px-1.5 -ml-1 rounded-control text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Back
                </button>
                <span className="text-xs font-medium">
                  {panel === "assign" ? "Assign to" : "Add tags"}
                </span>
              </div>

              {panel === "assign" && (
                <div className="py-2 px-2 max-h-64 overflow-y-auto">
                  <button
                    type="button"
                    className={menuItemClass("default", "w-full text-xs")}
                    onClick={() => assignTo("unassigned")}
                  >
                    Unassign
                  </button>
                  {members.map((m) => (
                    <button
                      key={m.user_id}
                      type="button"
                      className={menuItemClass("default", "w-full text-xs")}
                      onClick={() => assignTo(m.user_id)}
                    >
                      {m.display_name ?? m.email ?? "Unnamed"}
                    </button>
                  ))}
                  {members.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      No members
                    </p>
                  )}
                </div>
              )}

              {panel === "tag" && (
                <div className="flex flex-col">
                  <div className="py-2 px-2 max-h-56 overflow-y-auto">
                    {labels.map((l) => (
                      <label
                        key={l.id}
                        className={menuItemClass(
                          "default",
                          "w-full text-xs cursor-pointer",
                        )}
                      >
                        <Checkbox
                          checked={pickedLabels.has(l.id)}
                          onCheckedChange={(v) =>
                            setPickedLabels((s) => {
                              const n = new Set(s);
                              if (v) n.add(l.id);
                              else n.delete(l.id);
                              return n;
                            })
                          }
                        />
                        <LabelChip label={l} />
                      </label>
                    ))}
                    {labels.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-3">
                        No labels yet.
                      </p>
                    )}
                  </div>
                  <div className="border-t border-border p-2">
                    <Button
                      size="sm"
                      className="w-full h-7"
                      disabled={pickedLabels.size === 0 || bulkTag.isPending}
                      onClick={applyTags}
                    >
                      {bulkTag.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Apply tags"
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>

      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={onClear}
        aria-label="Clear selection"
      >
        <X className="h-3.5 w-3.5" />
      </Button>

      <BulkLinkContactDialog
        open={linkContactOpen}
        onOpenChange={setLinkContactOpen}
        conversationIds={selectedIds}
        onLinked={() => onClear()}
      />
    </div>
  );
}
