import { createFileRoute, Link } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { Radio, Plus } from "lucide-react";
import { useCampaigns, useMarketingRealtime } from "@/hooks/use-marketing";

export const Route = createFileRoute("/_authenticated/broadcasts")({
  component: BroadcastsPage,
});

function BroadcastsPage() {
  useMarketingRealtime();
  const { data: all, isLoading } = useCampaigns();
  const broadcasts = (all ?? []).filter((c) => c.type === "broadcast" || c.channel === "whatsapp");

  return (
    <>
      <AppTopbar
        title="Broadcasts"
        subtitle="One-to-many messaging campaigns"
        actions={
          <Link
            to="/campaigns"
            // A broadcast IS a campaign — one that never repeats. Rather than
            // dropping the operator on the campaign list to work out what to
            // click, this opens the campaign wizard already in one-time
            // broadcast mode.
            search={{ new: "broadcast" as const }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> New broadcast
          </Link>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading</div>
        ) : broadcasts.length === 0 ? (
          <div className="rounded-control border border-dashed border-border bg-surface p-10 text-center">
            <Radio className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
            <div className="font-medium">No broadcasts yet</div>
            <div className="text-sm text-muted-foreground mt-1">
              Create a broadcast to reach an audience with a single message.
            </div>
            <Link
              to="/campaigns"
              search={{ new: "broadcast" as const }}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" /> New broadcast
            </Link>
          </div>
        ) : (
          <div className="rounded-control border border-border bg-surface shadow-sm divide-y divide-border">
            {broadcasts.map((c) => (
              <Link
                key={c.id}
                to="/campaigns/$campaignId"
                params={{ campaignId: c.id }}
                className="p-4 flex items-center gap-3 hover:bg-muted/40 transition"
              >
                <div className="w-9 h-9 bg-accent/10 text-accent grid place-items-center">
                  <Radio className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.total_recipients.toLocaleString()} recipients · sent{" "}
                    {c.sent_count.toLocaleString()} · delivered {c.delivered_count.toLocaleString()}
                  </div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-control bg-muted capitalize">
                  {c.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
