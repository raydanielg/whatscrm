/**
 * Storage management panel for workspace admins.
 *
 * Shows totals, per-type breakdown, expiring-soon count, and the most
 * recent uploads with quick delete. Uses `getMediaStats` + `deleteMediaAttachment`
 * server functions; realtime updates come from the parent conversation
 * subscription (message_attachments is already in supabase_realtime).
 */

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, HardDrive, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes } from "@/lib/messaging/media.client";
import { getMediaStats, deleteMediaAttachment, cleanupExpiredMedia } from "@/lib/messaging/media.functions";
import { toast } from "sonner";

interface Stats {
  total_files: number;
  total_bytes: number;
  image_bytes: number;
  video_bytes: number;
  audio_bytes: number;
  document_bytes: number;
  expiring_soon: number;
}
interface RecentRow {
  id: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_at: string;
  expires_at: string | null;
  download_count: number;
}

export function StorageManagementPanel({ workspaceId }: { workspaceId: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);

  const fetchStats = useServerFn(getMediaStats);
  const deleteAtt = useServerFn(deleteMediaAttachment);
  const runCleanup = useServerFn(cleanupExpiredMedia);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetchStats({ data: { workspaceId } });
      setStats(res.stats);
      setRecent(res.recent);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [workspaceId]);

  async function onDelete(id: string) {
    try {
      await deleteAtt({ data: { attachmentId: id } });
      setRecent((r) => r.filter((x) => x.id !== id));
      toast.success("File removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function onCleanup() {
    setCleaning(true);
    try {
      const res = await runCleanup({ data: { batch: 100 } });
      toast.success(`Cleaned up ${res.removed} expired file${res.removed === 1 ? "" : "s"}`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setCleaning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<HardDrive className="h-4 w-4" />} label="Total files" value={loading ? "" : String(stats?.total_files ?? 0)} />
        <StatCard label="Total size" value={loading ? "" : formatBytes(stats?.total_bytes)} />
        <StatCard label="Images" value={loading ? "" : formatBytes(stats?.image_bytes)} />
        <StatCard label="Videos" value={loading ? "" : formatBytes(stats?.video_bytes)} />
        <StatCard label="Audio" value={loading ? "" : formatBytes(stats?.audio_bytes)} />
        <StatCard label="Documents" value={loading ? "" : formatBytes(stats?.document_bytes)} />
        <StatCard
          label="Expiring within 7 days"
          value={loading ? "" : String(stats?.expiring_soon ?? 0)}
          highlight={stats && stats.expiring_soon > 0 ? true : false}
        />
        <div className="flex items-end">
          <Button variant="outline" onClick={onCleanup} disabled={cleaning} className="w-full">
            {cleaning ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
            Cleanup expired
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent uploads</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No uploads yet.</p>
          ) : (
            <ul className="divide-y">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.file_name ?? "Untitled"}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.mime_type ?? "file"} · {formatBytes(r.size_bytes)}
                      {r.download_count > 0 && ` · ${r.download_count} download${r.download_count === 1 ? "" : "s"}`}
                      {r.expires_at && ` · expires ${new Date(r.expires_at).toLocaleDateString()}`}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onDelete(r.id)}
                    aria-label={`Delete ${r.file_name ?? "file"}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, highlight, icon }: { label: string; value: string; highlight?: boolean; icon?: React.ReactNode }) {
  return (
    <Card className={highlight ? "border-amber-500/50" : undefined}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="mt-1 text-lg font-semibold ">{value}</div>
      </CardContent>
    </Card>
  );
}
