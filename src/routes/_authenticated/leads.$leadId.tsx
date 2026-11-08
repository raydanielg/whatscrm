import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { ActionBar } from "@/components/app/action-bar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Target,
  Mail,
  Phone,
  Building2,
  Star,
  Trash2,
  Pencil,
  UserPlus2,
  Save,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import {
  useLead,
  useUpdateLead,
  useDeleteLead,
  leadDisplayName,
  leadInitials,
  LEAD_STATUSES,
} from "@/hooks/use-leads";
import { LeadFormDialog } from "@/components/app/leads/lead-form-dialog";
import { ConvertLeadDialog } from "@/components/app/leads/convert-lead-dialog";
import { ActivityTimeline } from "@/components/app/timeline/activity-timeline";
import { LeadQualificationPanel } from "@/components/app/leads/lead-qualification-panel";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/leads/$leadId")({
  staticData: { breadcrumb: "Lead" },
  head: () => ({ meta: [{ title: "Lead" }] }),
  component: LeadDetailPage,
});

function LeadDetailPage() {
  const { leadId } = Route.useParams();
  const navigate = useNavigate();
  const { data: lead, isLoading } = useLead(leadId);
  const formatZonedDate = useZonedDateFormatter();
  const update = useUpdateLead();
  const del = useDeleteLead();
  const [edit, setEdit] = useState(false);
  const [convert, setConvert] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);

  if (isLoading)
    return (
      <>
        <AppTopbar title="Loading" />
        <main className="p-6 text-sm text-muted-foreground">Loading</main>
      </>
    );
  if (!lead)
    return (
      <>
        <AppTopbar title="Not found" />
        <main className="p-6 text-center">
          <Target className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground mb-3">Lead not found.</p>
          <Link to="/leads">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to leads
            </Button>
          </Link>
        </main>
      </>
    );

  const currentScore = score ?? lead.score;
  const currentNotes = notesDraft ?? lead.notes ?? "";

  return (
    <>
      <AppTopbar
        title={leadDisplayName(lead)}
        subtitle={lead.company_name ?? "Lead"}
        actions={
          <ActionBar
            primary={[
              !lead.converted_at && (
                <Button key="convert" size="sm" onClick={() => setConvert(true)}>
                  <UserPlus2 className="w-4 h-4 mr-1.5" /> Convert
                </Button>
              ),
              <Button key="edit" size="sm" variant="outline" onClick={() => setEdit(true)}>
                <Pencil className="w-4 h-4 mr-1.5" /> Edit
              </Button>,
            ]}
            overflow={[
              <DropdownMenuItem
                key="delete"
                className="text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </DropdownMenuItem>,
            ]}
          />
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="flex flex-wrap items-start gap-4 rounded-control border border-border bg-surface p-4">
          <Avatar className="w-14 h-14">
            <AvatarFallback className="text-lg bg-accent/10 text-accent">
              {leadInitials(lead)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-display font-semibold">{leadDisplayName(lead)}</h1>
              <Badge variant={lead.converted_at ? "default" : "secondary"}>
                {lead.converted_at ? "converted" : lead.status}
              </Badge>
              {lead.rating && (
                <Badge variant="outline" className="capitalize">
                  {lead.rating}
                </Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {lead.job_title ?? ""}
              {lead.company_name ? ` · ${lead.company_name}` : ""}
            </div>
            <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
              {lead.email && (
                <a
                  href={`mailto:${lead.email}`}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <Mail className="w-3.5 h-3.5" /> {lead.email}
                </a>
              )}
              {lead.phone && (
                <a
                  href={`tel:${lead.phone}`}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <Phone className="w-3.5 h-3.5" /> {lead.phone}
                </a>
              )}
              {lead.company_name && (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" /> {lead.company_name}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Created {formatZonedDate(lead.created_at, {})}
              </span>
            </div>
            {(lead.tags?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {lead.tags.map((t) => (
                  <Badge key={t} variant="outline" className="text-[11px]">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <aside className="rounded-control border border-border bg-surface p-4 space-y-3 text-sm h-fit">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Qualification
            </h3>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Score</span>
                <span className="text-xs font-medium">{currentScore}/100</span>
              </div>
              <Slider
                value={[currentScore]}
                min={0}
                max={100}
                step={1}
                onValueChange={([v]) => setScore(v)}
              />
              {score !== null && score !== lead.score && (
                <Button
                  size="sm"
                  className="mt-2 w-full"
                  onClick={async () => {
                    await update.mutateAsync({ id: lead.id, patch: { score } });
                    setScore(null);
                    toast.success("Score updated");
                  }}
                >
                  <Save className="w-3.5 h-3.5 mr-1.5" /> Save score
                </Button>
              )}
            </div>
            <Row label="Status">
              <select
                className="text-xs rounded border bg-background px-1.5 py-0.5"
                value={lead.status}
                onChange={(e) => update.mutate({ id: lead.id, patch: { status: e.target.value } })}
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Rating">
              <select
                className="text-xs rounded border bg-background px-1.5 py-0.5"
                value={lead.rating ?? ""}
                onChange={(e) =>
                  update.mutate({ id: lead.id, patch: { rating: e.target.value || null } })
                }
              >
                <option value="">—</option>
                <option value="hot">hot</option>
                <option value="warm">warm</option>
                <option value="cold">cold</option>
              </select>
            </Row>
            <Row label="Source" value={lead.source} />
            <Row label="Score reason" value={lead.score_reason} />
            <Row
              label="Qualified"
              value={lead.qualified_at ? formatZonedDate(lead.qualified_at, {}) : null}
            />
            <Row
              label="Disqualified"
              value={lead.disqualified_at ? formatZonedDate(lead.disqualified_at, {}) : null}
            />
            <Row
              label="Next follow-up"
              value={
                lead.next_follow_up_at
                  ? formatZonedDate(lead.next_follow_up_at, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })
                  : null
              }
            />
            {lead.converted_at && (
              <>
                <div className="border-t border-border pt-2">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Converted
                  </h3>
                </div>
                <Row
                  label="At"
                  value={formatZonedDate(lead.converted_at, {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                />
                {lead.converted_contact_id && (
                  <Link
                    to="/contacts/$contactId"
                    params={{ contactId: lead.converted_contact_id }}
                    className="text-xs text-accent hover:underline"
                  >
                    View contact →
                  </Link>
                )}
              </>
            )}
          </aside>

          <div className="space-y-4">
            <LeadQualificationPanel leadId={lead.id} />

            <div className="rounded-control border border-border bg-surface p-4">
              <h3 className="text-sm font-medium mb-2">Notes</h3>
              <Textarea
                rows={5}
                value={currentNotes}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Qualification notes, discovery findings"
              />
              {notesDraft !== null && notesDraft !== (lead.notes ?? "") && (
                <div className="flex justify-end mt-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      await update.mutateAsync({ id: lead.id, patch: { notes: notesDraft } });
                      setNotesDraft(null);
                      toast.success("Notes saved");
                    }}
                  >
                    <Save className="w-3.5 h-3.5 mr-1.5" /> Save
                  </Button>
                </div>
              )}
            </div>

            {Object.keys(lead.custom_fields ?? {}).length > 0 && (
              <div className="rounded-control border border-border bg-surface p-4">
                <h3 className="text-sm font-medium mb-2">Custom fields</h3>
                <div className="grid gap-1 text-sm">
                  {Object.entries(lead.custom_fields).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{k}</span>
                      <span className="text-xs">{String(v ?? "")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6">
          <ActivityTimeline entityType="lead" entityId={lead.id} />
        </div>
      </main>

      <LeadFormDialog open={edit} onOpenChange={setEdit} initial={lead} />
      <ConvertLeadDialog open={convert} onOpenChange={setConvert} lead={lead} />
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
            <AlertDialogDescription>The lead will be soft-deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await del.mutateAsync({ id: lead.id });
                toast.success("Lead deleted");
                navigate({ to: "/leads" });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | null;
  children?: React.ReactNode;
}) {
  if (!children && (value == null || value === "")) return null;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children ?? <span className="text-xs">{value}</span>}
    </div>
  );
}
