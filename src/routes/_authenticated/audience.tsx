import { useBrandName } from "@/hooks/use-brand-name";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  UsersRound,
  ListChecks,
  Star,
  Save,
  Download,
  Trash2,
  Play,
  Sparkles,
} from "lucide-react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AudienceFilterBuilder } from "@/components/app/audience/audience-filter-builder";
import { AudienceResultsTable } from "@/components/app/audience/audience-results-table";
import { AudienceBulkBar } from "@/components/app/audience/audience-bulk-bar";
import { AudienceImportDialog } from "@/components/app/audience/audience-import-dialog";
import {
  EMPTY_FILTER,
  useAudienceContacts,
  useAudienceRealtime,
  useSavedAudiences,
  useUpsertSavedAudience,
  useDeleteSavedAudience,
  toCSV,
  downloadCSV,
  type AudienceFilter,
  type SavedAudienceRow,
} from "@/hooks/use-audience";
import { useSegments } from "@/hooks/use-marketing";
import { useContactLists } from "@/hooks/use-marketing-extras";

export const Route = createFileRoute("/_authenticated/audience")({
  component: AudiencePage,
});

function AudiencePage() {
  useAudienceRealtime();
  const [filter, setFilter] = useState<AudienceFilter>(EMPTY_FILTER);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: results, isLoading } = useAudienceContacts(filter);
  const { data: saved } = useSavedAudiences();
  const { data: segments } = useSegments();
  const { data: lists } = useContactLists();

  const rows = results?.rows ?? [];
  const total = results?.total ?? 0;

  const brandName = useBrandName();

  const loadSaved = (a: SavedAudienceRow) => {
    setFilter(a.filter_definition ?? EMPTY_FILTER);
    setSelected(new Set());
  };

  return (
    <>
      <AppTopbar
        title="Audience"
        subtitle={`Segments, lists, and filters — reusable everywhere in ${brandName}`}
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto pb-24">
        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi label="Segments" value={segments?.length ?? 0} icon={<Sparkles className="h-4 w-4" />} to="/segments" />
          <Kpi label="Contact lists" value={lists?.length ?? 0} icon={<ListChecks className="h-4 w-4" />} to="/contact-lists" />
          <Kpi label="Saved audiences" value={saved?.length ?? 0} icon={<Save className="h-4 w-4" />} />
          <Kpi label="Matches" value={total} icon={<UsersRound className="h-4 w-4" />} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-6">
          {/* Sidebar: saved audiences */}
          <Card className="p-3 h-fit">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold">Saved audiences</h2>
              <Badge variant="secondary" className="text-xs">{saved?.length ?? 0}</Badge>
            </div>
            <ScrollArea className="h-[420px]">
              {(saved ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground p-2">
                  Build a filter and hit Save to reuse it in campaigns and segments.
                </p>
              )}
              <ul className="space-y-1">
                {(saved ?? []).map((a) => (
                  <SavedAudienceRow key={a.id} audience={a} onLoad={() => loadSaved(a)} />
                ))}
              </ul>
            </ScrollArea>
            <div className="mt-2 pt-2 border-t space-y-2">
              <div className="flex items-center gap-2">
                <Link to="/segments" className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">Segments</Button>
                </Link>
                <Link to="/contact-lists" className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">Lists</Button>
                </Link>
              </div>
              <AudienceImportDialog />
            </div>
          </Card>

          {/* Main */}
          <div className="space-y-4 min-w-0">
            <Card className="p-4">
              <AudienceFilterBuilder value={filter} onChange={setFilter} />
              <div className="flex items-center justify-between pt-3 mt-3 border-t flex-wrap gap-2">
                <div className="text-sm text-muted-foreground">
                  {isLoading ? "Searching" : (
                    <>
                      Matching <strong>{total.toLocaleString()}</strong> contact{total === 1 ? "" : "s"}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setFilter(EMPTY_FILTER)}>
                    Clear
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => {
                      downloadCSV(`audience-all-${Date.now()}.csv`, toCSV(rows));
                      toast.success(`Exported ${rows.length} contacts`);
                    }}
                  >
                    <Download className="h-3.5 w-3.5" /> Export all
                  </Button>
                  <SaveAudienceDialog filter={filter} />
                  <Link to="/campaigns" search={{ audience: JSON.stringify(filter) } as never}>
                    <Button size="sm" className="gap-1">
                      <Play className="h-3.5 w-3.5" /> Use in campaign
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>

            <AudienceResultsTable
              rows={rows}
              total={total}
              loading={isLoading}
              selected={selected}
              onSelectedChange={setSelected}
            />
          </div>
        </div>

        <AudienceBulkBar rows={rows} selected={selected} onClear={() => setSelected(new Set())} />
      </main>
    </>
  );
}

function Kpi({ label, value, icon, to }: { label: string; value: number; icon?: React.ReactNode; to?: string }) {
  const body = (
    <Card className="p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-semibold ">{Number(value).toLocaleString()}</div>
    </Card>
  );
  if (to) return <Link to={to}>{body}</Link>;
  return body;
}

function SavedAudienceRow({ audience, onLoad }: { audience: SavedAudienceRow; onLoad: () => void }) {
  const upsert = useUpsertSavedAudience();
  const del = useDeleteSavedAudience();
  return (
    <li className="group flex items-center gap-1 rounded-control hover:bg-muted/50 px-1">
      <button
        className="flex-1 text-left px-2 py-1.5"
        onClick={onLoad}
      >
        <div className="flex items-center gap-1.5">
          {audience.is_favorite && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
          <span className="text-sm font-medium truncate">{audience.name}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {audience.filter_definition?.conditions?.length ?? 0} conditions
          {audience.member_count > 0 && ` · ${audience.member_count}`}
        </div>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100"
        onClick={() =>
          upsert.mutate({ id: audience.id, is_favorite: !audience.is_favorite })
        }
      >
        <Star className={`h-3 w-3 ${audience.is_favorite ? "text-yellow-500 fill-yellow-500" : ""}`} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100"
        onClick={() => {
          if (confirm(`Delete "${audience.name}"?`)) del.mutate(audience.id);
        }}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </li>
  );
}

function SaveAudienceDialog({ filter }: { filter: AudienceFilter }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const upsert = useUpsertSavedAudience();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1" disabled={filter.conditions.length === 0}>
          <Save className="h-3.5 w-3.5" /> Save
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save audience</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Name (e.g. VIP DE last 30d)" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="text-xs text-muted-foreground">
            {filter.conditions.length} conditions · logic <strong>{filter.logic}</strong>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!name.trim() || upsert.isPending}
            onClick={() =>
              upsert.mutate(
                { name: name.trim(), description: description.trim() || null, filter_definition: filter },
                {
                  onSuccess: () => {
                    toast.success("Audience saved");
                    setOpen(false);
                    setName("");
                    setDescription("");
                  },
                  onError: (e) => toast.error((e as Error).message),
                },
              )
            }
          >
            Save audience
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
