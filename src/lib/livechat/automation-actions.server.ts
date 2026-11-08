/**
 * Live Chat action handlers invoked by the Workflow engine.
 *
 * The engine calls `runLivechatAction(type, input, ctx)` for every
 * `action.livechat.*` node. Each handler is stateless and returns a plain
 * DTO the engine records as the step output.
 *
 * "Push" actions (open_widget / send_message / start_ai_chat) enqueue a row
 * on `livechat_visitor_events` with `event_type = "automation"`. The widget
 * long-polls (via `/api/public/widget/history`) or listens to Realtime on
 * this table to react on the client — this keeps the runtime dependency
 * one-way (workflow → widget) without opening extra WebSocket surface.
 */

import type { SupabaseLike } from "@/lib/workflows/engine.server";
import { sbAny } from "@/lib/supabase/untyped";

export interface ActionCtx {
  supabase: SupabaseLike;
  workspaceId: string;
  trigger: Record<string, unknown>;
}

function s(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}
function n(v: unknown): number | null {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function pickVisitor(trigger: Record<string, unknown>): {
  visitorId: string | null;
  contactId: string | null;
  sessionId: string | null;
} {
  const v = (trigger.visitor ?? {}) as Record<string, unknown>;
  return {
    visitorId: s(v.id ?? trigger.visitor_id),
    contactId: s(v.contact_id ?? trigger.contact_id),
    sessionId: s(trigger.session_id ?? v.session_id),
  };
}

export async function runLivechatAction(
  type: string,
  input: Record<string, unknown>,
  ctx: ActionCtx,
): Promise<Record<string, unknown>> {
  const { workspaceId, supabase } = ctx;
  const { visitorId, contactId, sessionId } = pickVisitor(ctx.trigger);

  switch (type) {
    case "action.livechat.open_widget": {
      if (!visitorId) return { pushed: false, reason: "no_visitor" };
      const { error } = await sbAny(supabase).from("livechat_visitor_events").insert({
        workspace_id: workspaceId,
        visitor_id: visitorId,
        session_id: sessionId,
        event_type: "automation",
        event_name: "open_widget",
        properties: {
          message: s(input.with_message),
          sound: Boolean(input.sound),
        },
      });
      if (error) throw new Error(error.message);
      return { pushed: true };
    }

    case "action.livechat.send_message": {
      if (!visitorId) return { pushed: false, reason: "no_visitor" };
      const body = s(input.body);
      if (!body) throw new Error("body required");
      const { data, error } = await supabase
        .from("livechat_visitor_events")
        .insert({
          workspace_id: workspaceId,
          visitor_id: visitorId,
          session_id: sessionId,
          event_type: "automation",
          event_name: "send_message",
          properties: { body, sender: s(input.sender) ?? "bot" },
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { message_id: (data as { id?: string })?.id ?? null };
    }

    case "action.livechat.start_ai_chat": {
      if (!visitorId) return { pushed: false, reason: "no_visitor" };
      const { error } = await sbAny(supabase).from("livechat_visitor_events").insert({
        workspace_id: workspaceId,
        visitor_id: visitorId,
        session_id: sessionId,
        event_type: "automation",
        event_name: "start_ai_chat",
        properties: {
          chatbot_id: s(input.chatbot_id),
          prompt: s(input.prompt),
        },
      });
      if (error) throw new Error(error.message);
      return { session_id: sessionId, chatbot_id: s(input.chatbot_id) };
    }

    case "action.livechat.assign_agent": {
      const target = s(input.target) ?? "queue";
      const priority = (s(input.priority) ?? "normal") as
        | "low" | "normal" | "high" | "urgent";

      if (target === "agent" || target === "department") {
        const { error } = await sbAny(supabase).from("livechat_visitor_events").insert({
          workspace_id: workspaceId,
          visitor_id: visitorId,
          session_id: sessionId,
          event_type: "automation",
          event_name: "assign",
          properties: {
            agent_id: s(input.agent_id),
            department_id: s(input.department_id),
            priority,
          },
        });
        if (error) throw new Error(error.message);
        return {
          assigned_to: s(input.agent_id) ?? s(input.department_id),
          priority,
        };
      }

      // Queue path — insert into handoff_queue if we know the conversation.
      const conversationId = s(ctx.trigger.conversation_id);
      if (!conversationId) return { assigned_to: null, reason: "no_conversation" };
      const { data, error } = await supabase
        .from("handoff_queue")
        .insert({
          workspace_id: workspaceId,
          conversation_id: conversationId,
          priority,
          required_skills: [],
          reason: "workflow_assign",
          status: "waiting",
          entered_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { queue_id: (data as { id?: string })?.id ?? null, priority };
    }

    case "action.livechat.create_lead": {
      const source = s(input.source) ?? "Live Chat";
      const notes = s(input.notes);
      const score = n(input.score);
      const v = (ctx.trigger.visitor ?? {}) as Record<string, unknown>;

      const { data, error } = await supabase
        .from("leads")
        .insert({
          workspace_id: workspaceId,
          contact_id: contactId,
          name: s(v.display_name) ?? s(v.email) ?? "Live Chat lead",
          email: s(v.email),
          phone: s(v.phone),
          source,
          notes,
          score: score ?? 50,
          status: "new",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { lead_id: (data as { id?: string })?.id ?? null };
    }

    case "action.livechat.create_task": {
      const title = s(input.title);
      if (!title) throw new Error("title required");
      const dueHours = n(input.due_in_hours);
      const dueAt = dueHours !== null
        ? new Date(Date.now() + dueHours * 3_600_000).toISOString()
        : null;
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          workspace_id: workspaceId,
          title,
          assignee_id: s(input.assignee_id),
          contact_id: contactId,
          priority: s(input.priority) ?? "normal",
          due_date: dueAt,
          status: "open",
          source: "livechat_workflow",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { task_id: (data as { id?: string })?.id ?? null };
    }

    case "action.livechat.trigger_workflow": {
      const workflowId = s(input.workflow_id);
      if (!workflowId) throw new Error("workflow_id required");
      const runAt = s(input.run_at_iso) ?? new Date().toISOString();
      const { data, error } = await supabase
        .from("workflow_queue")
        .insert({
          workspace_id: workspaceId,
          automation_id: workflowId,
          trigger_source: "livechat_action",
          input: ctx.trigger,
          run_at: runAt,
          priority: 5,
          max_attempts: 3,
          status: "pending",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { queued_id: (data as { id?: string })?.id ?? null };
    }

    default:
      return { simulated: true, node: type };
  }
}
