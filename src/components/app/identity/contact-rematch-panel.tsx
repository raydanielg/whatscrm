import { useState } from "react";
import { PlayCircle, RefreshCw, CheckCircle2, XCircle, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import {
  useContactRematchJobs,
  useStartContactRematch,
  type ContactRematchJob,
} from "@/hooks/use-contact-rematch";

export function ContactRematchPanel() {
  const ws = useCurrentWorkspace();
  const workspaceId = ws.active?.id;
  const { data: jobs, isLoading, refetch } = useContactRematchJobs(workspaceId);
  const start = useStartContactRematch(workspaceId);

  const [scope, setScope] = useState<"whatsapp" | "all">("whatsapp");
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  const [sinceDays, setSinceDays] = useState<string>("");
  const [maxConversations, setMaxConversations] = useState<number>(1000);

  const running = jobs?.some((j) => j.status === "running" || j.status === "queued") ?? false;

  const onStart = async () => {
    if (!workspaceId) return;
    const since = sinceDays
      ? new Date(Date.now() - Number(sinceDays) * 86_400_000).toISOString()
      : null;
    try {
      const job = await start.mutateAsync({
        workspaceId,
        scope,
        unlinkedOnly,
        since,
        maxConversations,
      });
      if (job.status === "failed") {
        toast.error(job.error ?? "Re-match failed");
      } else {
        toast.success(
          `Re-match done · scanned ${job.total_scanned} · re-linked ${job.total_relinked}`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start re-match");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Bulk re-match historical conversations
          </CardTitle>
          <CardDescription>
            Re-run the current matching rules against past conversations and update linked
            contacts when a better match is found.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Scope</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as "whatsapp" | "all")}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp channels only</SelectItem>
                  <SelectItem value="all">All channels</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Max conversations</Label>
              <Input
                type="number"
                min={1}
                max={20000}
                value={maxConversations}
                onChange={(e) => setMaxConversations(Number(e.target.value) || 1000)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Only conversations from the last N days
              </Label>
              <Input
                type="number"
                min={0}
                value={sinceDays}
                onChange={(e) => setSinceDays(e.target.value)}
                placeholder="Leave blank for all time"
                className="h-9"
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch checked={unlinkedOnly} onCheckedChange={setUnlinkedOnly} id="unlinked" />
              <Label htmlFor="unlinked" className="text-sm cursor-pointer">
                Unlinked conversations only
              </Label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
            <Button size="sm" onClick={onStart} disabled={!workspaceId || running || start.isPending}>
              {start.isPending || running ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
              )}
              {running ? "Running" : "Start re-match"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Recent runs</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading</p>
          ) : !jobs || jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No re-match jobs yet.</p>
          ) : (
            <div className="space-y-2">
              {jobs.map((j) => (
                <JobRow key={j.id} job={j} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function JobRow({ job }: { job: ContactRematchJob }) {
  const started = job.started_at ? new Date(job.started_at) : new Date(job.created_at);
  const finished = job.completed_at ? new Date(job.completed_at) : null;
  const duration = finished ? Math.max(0, Math.round((finished.getTime() - started.getTime()) / 1000)) : null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-control border p-3">
      <StatusBadge status={job.status} />
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <span className="capitalize">{job.scope === "whatsapp" ? "WhatsApp" : "All channels"}</span>
          {job.unlinked_only && <span className="text-muted-foreground"> · unlinked only</span>}
          {job.since && (
            <span className="text-muted-foreground">
              {" · since "}
              {new Date(job.since).toLocaleDateString()}
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {started.toLocaleString()}
          {duration !== null && ` · ${duration}s`}
        </p>
        {job.error && (
          <p className="text-xs text-destructive mt-1 truncate" title={job.error}>
            {job.error}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Metric label="Scanned" value={job.total_scanned} />
        <Metric label="Re-linked" value={job.total_relinked} tone="primary" />
        <Metric label="Unchanged" value={job.total_unchanged} />
        <Metric label="Skipped" value={job.total_skipped} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ContactRematchJob["status"] }) {
  if (status === "running" || status === "queued") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        {status === "queued" ? "Queued" : "Running"}
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" />
        Failed
      </Badge>
    );
  }
  return (
    <Badge className="gap-1">
      <CheckCircle2 className="h-3 w-3" />
      Completed
    </Badge>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "primary";
}) {
  return (
    <div
      className={`rounded-control border px-2 py-1 text-center ${
        tone === "primary" ? "border-primary/40 bg-primary/5" : ""
      }`}
    >
      <p className="text-[11px] uppercase text-muted-foreground leading-none">
        {label}
      </p>
      <p className="text-sm font-medium  leading-tight mt-0.5">{value}</p>
    </div>
  );
}
