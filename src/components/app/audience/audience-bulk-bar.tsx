import { useState } from "react";
import { toast } from "sonner";
import { Tag, Trash2, Download, Users, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useBulkTagContacts,
  useBulkUpdateContacts,
  useBulkDeleteContacts,
  useAddContactsToList,
  toCSV,
  downloadCSV,
  type AudienceContact,
} from "@/hooks/use-audience";
import { useContactLists } from "@/hooks/use-marketing-extras";
import { PermissionGate } from "@/components/app/permission-gate";
import { useCanAct } from "@/hooks/use-permissions";

export interface AudienceBulkBarProps {
  rows: AudienceContact[];
  selected: Set<string>;
  onClear: () => void;
}

export function AudienceBulkBar({ rows, selected, onClear }: AudienceBulkBarProps) {
  const [tagInput, setTagInput] = useState("");
  const tagMut = useBulkTagContacts();
  const upMut = useBulkUpdateContacts();
  const delMut = useBulkDeleteContacts();
  const addMut = useAddContactsToList();
  const canDelete = useCanAct("contacts.delete");
  const { data: lists } = useContactLists();
  const ids = Array.from(selected);

  if (selected.size === 0) return null;

  const doExport = () => {
    const subset = rows.filter((r) => selected.has(r.id));
    downloadCSV(`audience-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(subset));
    toast.success(`Exported ${subset.length} contacts`);
  };

  return (
    <div className="sticky bottom-4 mx-auto z-40 max-w-3xl w-full">
      <div className="rounded-control border bg-background/95 backdrop-blur shadow-lg px-3 py-2 flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">{selected.size} selected</span>
        <div className="flex-1" />

        <div className="hidden sm:flex items-center gap-1">
          <Input
            className="h-9 w-40"
            placeholder="tag name"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!tagInput.trim() || tagMut.isPending}
            onClick={() =>
              tagMut.mutate(
                { ids, add: [tagInput.trim()] },
                {
                  onSuccess: () => {
                    toast.success("Tag applied");
                    setTagInput("");
                  },
                  onError: (e) => toast.error((e as Error).message),
                },
              )
            }
          >
            <Tag className="h-3.5 w-3.5 " /> Tag
          </Button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1">
              <ListPlus className="h-3.5 w-3.5" /> Add to list
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Contact lists</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(lists ?? []).length === 0 && (
              <DropdownMenuItem disabled>No lists yet</DropdownMenuItem>
            )}
            {(lists ?? []).map((l) => (
              <DropdownMenuItem
                key={l.id}
                onClick={() =>
                  addMut.mutate(
                    { listId: l.id, contactIds: ids },
                    {
                      onSuccess: () => toast.success(`Added to ${l.name}`),
                      onError: (e) => toast.error((e as Error).message),
                    },
                  )
                }
              >
                {l.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              Set status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Lifecycle</DropdownMenuLabel>
            {["lead", "customer", "prospect", "churned"].map((s) => (
              <DropdownMenuItem
                key={s}
                onClick={() =>
                  upMut.mutate(
                    { ids, patch: { lifecycle_stage: s } },
                    { onSuccess: () => toast.success(`Set to ${s}`) },
                  )
                }
              >
                {s}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                upMut.mutate(
                  { ids, patch: { do_not_contact: true } },
                  { onSuccess: () => toast.success("Marked DNC") },
                )
              }
            >
              Mark do-not-contact
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button size="sm" variant="outline" onClick={doExport} className="gap-1">
          <Download className="h-3.5 w-3.5" /> Export
        </Button>

        <PermissionGate permission="contacts.delete">
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (!canDelete) return;
              if (!confirm(`Archive ${ids.length} contacts?`)) return;
              delMut.mutate(ids, {
                onSuccess: () => {
                  toast.success("Archived");
                  onClear();
                },
              });
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </PermissionGate>

        <Button size="sm" variant="ghost" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  );
}
