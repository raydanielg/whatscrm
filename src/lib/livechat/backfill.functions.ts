/**
 * One-time backfill that links pre-existing widget (Live Chat) sessions to
 * unified Inbox conversations.
 *
 * Sessions created before the inbox-bridge shipped have
 * `chatbot_sessions.conversation_id = null`, so they never appear in the
 * Inbox. This server function walks those orphan sessions for one workspace,
 * creates the mirrored conversation (+ placeholder contact) and replays the
 * chat transcript into `public.messages`.
 *
 * Idempotent: sessions already linked are skipped, and the client only calls
 * it once per workspace (see `use-livechat-backfill`).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  workspaceId: z.string().uuid(),
  /** Safety cap so a huge history can't block the Inbox request. */
  limit: z.number().int().min(1).max(500).optional(),
});

type SessionRow = {
  id: string;
  chatbot_id: string | null;
  contact_id: string | null;
  status: string | null;
  handoff_reason: string | null;
  routed_to: string | null;
  routed_department_id: string | null;
  routed_agent_id: string | null;
};

export const backfillLivechatInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }) => {
    // RLS check: the caller must be able to see this workspace.
    const { data: ws, error: wsErr } = await context.supabase
      .from("workspaces")
      .select("id")
      .eq("id", data.workspaceId)
      .maybeSingle();
    if (wsErr) throw new Error(wsErr.message);
    if (!ws) throw new Error("Workspace not found");

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const {
      ensureConversationForSession,
      bridgeMessage,
      markConversationHandoff,
    } = await import("@/lib/livechat/inbox-bridge.server");

    const { data: rows, error } = await supabaseAdmin
      .from("chatbot_sessions")
      .select(
        "id, chatbot_id, contact_id, status, handoff_reason, routed_to, routed_department_id, routed_agent_id",
      )
      .eq("workspace_id", data.workspaceId)
      .in("channel", ["livechat", "webchat", "web", "widget"])
      .is("conversation_id", null)
      .order("created_at", { ascending: true })
      .limit(data.limit ?? 200);
    if (error) throw new Error(error.message);

    const sessions = ((rows ?? []) as unknown) as SessionRow[];
    let linked = 0;
    let messages = 0;

    for (const s of sessions) {
      const conversationId = await ensureConversationForSession({
        workspaceId: data.workspaceId,
        sessionId: s.id,
        contactId: s.contact_id,
        chatbotId: s.chatbot_id,
        routing: {
          departmentId: s.routed_department_id,
          agentId: s.routed_agent_id,
          routedTo: s.routed_to ?? "ai",
        },
      });
      if (!conversationId) continue;
      linked += 1;

      const { data: msgs } = await supabaseAdmin
        .from("chatbot_messages")
        .select("role, content")
        .eq("session_id", s.id)
        .order("created_at", { ascending: true })
        .limit(500);

      for (const m of (((msgs ?? []) as unknown) as { role: string; content: string }[])) {
        if (!m.content?.trim() || m.role === "system" || m.role === "tool") continue;
        await bridgeMessage({
          workspaceId: data.workspaceId,
          conversationId,
          direction: m.role === "user" ? "inbound" : "outbound",
          body: m.content,
          fromBot: m.role !== "user",
        });
        messages += 1;
      }

      if (s.status === "handed_off" || s.routed_to === "human") {
        await markConversationHandoff(conversationId, s.handoff_reason ?? null);
      }
    }

    return { scanned: sessions.length, linked, messages };
  });
