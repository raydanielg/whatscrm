import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TemplateEditorDialog } from "@/components/app/whatsapp/whatsapp-templates-panel";
import type { ChannelAccountRow } from "@/hooks/use-channel-accounts";

/**
 * Non-indexed probe page used by
 * `tests/e2e/whatsapp-template-header-upload.spec.ts`.
 *
 * Mounts the real `TemplateEditorDialog` (same component the WhatsApp
 * Templates panel uses) with a stub workspace/account so the regression spec
 * can drive the header media upload flow end to end while stubbing the
 * `/_serverFn/*` RPC calls at the network layer.
 */
export const Route = createFileRoute("/whatsapp-template-header-probe")({
  head: () => ({
    meta: [
      { title: "WhatsApp Template Header Probe" },
      {
        name: "description",
        content: "Internal test surface for WhatsApp template header media uploads.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Probe,
});

export const PROBE_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
export const PROBE_ACCOUNT_ID = "00000000-0000-4000-8000-000000000002";

const ACCOUNTS = [
  {
    id: PROBE_ACCOUNT_ID,
    display_name: "Probe WABA",
    provider: "whatsapp_cloud",
    channel: "whatsapp",
    status: "connected",
  },
] as unknown as ChannelAccountRow[];

function Probe() {
  const [open, setOpen] = useState(true);

  return (
    <div className="min-h-screen bg-background p-6">
      <Button data-testid="wa-probe-open" onClick={() => setOpen(true)}>
        Open template editor
      </Button>
      <TemplateEditorDialog
        open={open}
        onOpenChange={setOpen}
        workspaceId={PROBE_WORKSPACE_ID}
        channelAccountId={PROBE_ACCOUNT_ID}
        accounts={ACCOUNTS}
      />
    </div>
  );
}
