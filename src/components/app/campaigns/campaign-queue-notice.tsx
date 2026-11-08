export function CampaignQueueNotice({
  campaign,
  stats,
  now = Date.now(),
}: {
  campaign: {
    status: string;
    started_at?: string | null;
    scheduled_at?: string | null;
    created_at: string;
  };
  stats?: { pending: number; processing: number; sent: number; failed: number; skipped: number };
  now?: number;
}) {
  const started = Date.parse(campaign.started_at ?? campaign.scheduled_at ?? campaign.created_at);
  if (
    campaign.status !== "running" ||
    !stats ||
    !Number.isFinite(started) ||
    now - started < 15 * 60 * 1000 ||
    stats.pending + stats.processing === 0 ||
    stats.sent + stats.failed + stats.skipped > 0
  )
    return null;
  return (
    <div
      role="status"
      className="rounded-control border border-warning/30 bg-warning/10 p-4 text-sm space-y-1"
    >
      <p className="font-medium">
        This campaign has queued messages but no completed deliveries after 15 minutes.
      </p>
      <p>
        Check the Deliveries tab for errors. An administrator should verify the dispatcher schedule,
        server logs, and release readiness; missing cron jobs, unapplied database updates, or a
        mismatched cron token can prevent progress. Messages will remain queued until delivery
        resumes.
      </p>
    </div>
  );
}
