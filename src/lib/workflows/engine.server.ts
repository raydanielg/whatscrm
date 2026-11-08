import { createHmac } from "node:crypto";
import type { WorkflowGraph, WorkflowRunStatus, StepStatus } from "./types";
import {
  evalIf, evalSwitch, evalBoolean, evalNot, evalAnd, evalOr,
  evalCompareText, evalCompareNumber, evalCompareDate,
  evalContains, evalStartsWith, evalEndsWith, evalRegex,
  evalDecisionTree, evalExpression, coerceReturn,
} from "./logic-eval";
import { AI_NODE_HANDLERS } from "./ai-eval.server";
import { interpolate as sharedInterpolate } from "./variables";
import { sbAny } from "@/lib/supabase/untyped";
import { startCampaignForWorkflow, stopCampaignForWorkflow } from "./marketing-actions.server";

/**
 * Shared workflow execution primitive.
 *
 * Runs a DAG start-to-finish against any Supabase client (RLS user client for
 * manual runs, service-role client for queue workers). Records a `workflow_run`
 * plus one `workflow_run_step` per node, interpolates `{{path}}` variables,
 * and executes the built-in action set.
 */

export type SupabaseLike = {
  from: (table: string) => any;
};

export type ExecuteOptions = {
  supabase: SupabaseLike;
  automation: {
    id: string;
    workspace_id: string;
    version: number | null;
    graph: WorkflowGraph;
    runs_count?: number | null;
  };
  triggerSource: string;
  input: Record<string, unknown>;
  actorUserId?: string | null;
  dryRun?: boolean;
  /** Preallocated queue job id — status of the row will be updated on completion. */
  queueJobId?: string | null;
};

export type ExecuteResult = {
  runId: string;
  status: WorkflowRunStatus;
  error: { message: string; nodeId?: string } | null;
  durationMs: number;
};

export async function executeAutomation(opts: ExecuteOptions): Promise<ExecuteResult> {
  const { supabase, automation, triggerSource, input } = opts;
  const graph = automation.graph ?? { nodes: [], edges: [] };
  const startedAt = Date.now();

  const { data: run, error: runErr } = await supabase
    .from("workflow_runs")
    .insert({
      workspace_id: automation.workspace_id,
      automation_id: automation.id,
      version: automation.version ?? 1,
      status: "running" satisfies WorkflowRunStatus,
      trigger_source: triggerSource,
      input: input as any,
    })
    .select("id")
    .single();

  if (runErr || !run) throw new Error(`Failed to start run: ${runErr?.message}`);

  const ordered = orderNodes(graph);

  // Load scoped variables (global / env / workflow-scoped) for this workspace.
  const { data: varRows } = await supabase
    .from("workflow_variables")
    .select("scope, key, value, is_secret")
    .eq("workspace_id", automation.workspace_id)
    .or(`automation_id.is.null,automation_id.eq.${automation.id}`);
  const { composeBag } = await import("./variables");
  const scopedVars = ((varRows ?? []) as Array<{ scope: never; key: string; value: unknown; is_secret: boolean }>);
  const baseBag = composeBag(scopedVars, {});

  const variables: Record<string, unknown> = {
    ...baseBag,
    trigger: input,
    actor: { userId: opts.actorUserId ?? null },
  };

  let finalStatus: WorkflowRunStatus = "success";
  let runError: { message: string; nodeId?: string } | null = null;

  for (let i = 0; i < ordered.length; i++) {
    const node = ordered[i];
    const stepStart = Date.now();

    const { data: step, error: stepErr } = await supabase
      .from("workflow_run_steps")
      .insert({
        run_id: run.id,
        workspace_id: automation.workspace_id,
        node_id: node.id,
        node_type: node.type,
        status: "running" satisfies StepStatus,
        sort_order: i,
        input: interpolate(node.config, variables) as any,
      })
      .select("id")
      .single();

    if (stepErr || !step) {
      finalStatus = "failed";
      runError = { message: `Step insert failed: ${stepErr?.message}`, nodeId: node.id };
      break;
    }

    // Per-node retry with exponential backoff + per-node timeout.
    //   retry:      { attempts?: number (1-5), backoff_ms?: number }
    //   timeout_ms: hard ceiling per attempt (default 30s, max 60s)
    const retryCfg = (node.config?.retry ?? {}) as { attempts?: number; backoff_ms?: number };
    const maxAttempts = Math.min(5, Math.max(1, Number(retryCfg.attempts ?? 1)));
    const baseBackoff = Math.min(10_000, Math.max(0, Number(retryCfg.backoff_ms ?? 300)));
    const timeoutMs = Math.min(60_000, Math.max(1_000, Number(node.config?.timeout_ms ?? 30_000)));

    let attempt = 0;
    let lastErr: unknown = null;
    while (attempt < maxAttempts) {
      attempt++;
      try {
        const output = await withTimeout(
          executeNode(node, variables, {
            supabase,
            workspaceId: automation.workspace_id,
            workflowId: automation.id,
            dryRun: !!opts.dryRun,
          }),
          timeoutMs,
          `Node ${node.type} timed out after ${timeoutMs}ms`,
        );
        variables[node.id] = output ?? null;

        await supabase
          .from("workflow_run_steps")
          .update({
            status: "success",
            output: (output ?? null) as any,
            duration_ms: Date.now() - stepStart,
            finished_at: new Date().toISOString(),
            attempts: attempt,
          })
          .eq("id", step.id);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts) {
          const wait = baseBackoff * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, Math.min(wait, 5_000)));
        }
      }
    }

    if (lastErr) {
      const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
      await supabase
        .from("workflow_run_steps")
        .update({
          status: "failed",
          error: { message, attempts: attempt },
          duration_ms: Date.now() - stepStart,
          finished_at: new Date().toISOString(),
          attempts: attempt,
        })
        .eq("id", step.id);
      finalStatus = "failed";
      runError = { message, nodeId: node.id };
      break;
    }
  }


  const durationMs = Date.now() - startedAt;

  await supabase
    .from("workflow_runs")
    .update({
      status: finalStatus,
      output: variables as any,
      error: (runError ?? null) as any,
      duration_ms: durationMs,
      finished_at: new Date().toISOString(),
    })
    .eq("id", run.id);

  await supabase
    .from("automations")
    .update({
      last_run_at: new Date().toISOString(),
      last_run_status: finalStatus,
      runs_count: (automation.runs_count ?? 0) + 1,
    })
    .eq("id", automation.id);

  return { runId: run.id as string, status: finalStatus, error: runError, durationMs };
}

function orderNodes(graph: WorkflowGraph) {
  const trigger = graph.nodes.find((n) => n.type.startsWith("trigger."));
  if (!trigger) return graph.nodes;
  const seen = new Set<string>([trigger.id]);
  const ordered = [trigger];
  const queue = [trigger.id];
  while (queue.length) {
    const id = queue.shift()!;
    for (const edge of graph.edges.filter((e) => e.source === id)) {
      if (seen.has(edge.target)) continue;
      const next = graph.nodes.find((n) => n.id === edge.target);
      if (!next) continue;
      seen.add(next.id);
      ordered.push(next);
      queue.push(next.id);
    }
  }
  return ordered;
}

function interpolate(value: unknown, vars: Record<string, unknown>): unknown {
  return sharedInterpolate(value, vars);
}

/** Pragmatic address check: one "@", no spaces, a dotted domain. Not full RFC 5322. */
export function isValidEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Accepts an object, or a JSON string holding one; anything else yields {}. */
function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { /* ignore */ }
  }
  return {};
}

/** Literal-host SSRF guard (no DNS lookup): http(s) only, no loopback / private ranges. */
function assertSafeWebhookUrl(raw: string): void {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Invalid webhook URL"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http(s) webhook URLs are allowed");
  const h = u.hostname.toLowerCase();
  const blocked =
    h === "localhost" || h === "0.0.0.0" || h.endsWith(".local") ||
    h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd") ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h) || /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./.test(h);
  if (blocked) throw new Error("Private / loopback webhook hosts are not allowed");
}

async function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}


/**
 * Target conversation for inbox nodes: the node's configured `conversation_id`
 * first, otherwise the conversation carried by the run context (trigger payload).
 */
export function resolveConversationId(
  input: Record<string, unknown>,
  vars: Record<string, unknown>,
): string {
  const trigger = (vars.trigger ?? {}) as { conversation_id?: unknown; conversation?: { id?: unknown } | null };
  const fromTrigger = trigger.conversation_id ?? trigger.conversation?.id ?? "";
  return String(input.conversation_id || fromTrigger || "").trim();
}

/**
 * Normalises a phone number to E.164 (`+` then 8-15 digits, first digit 1-9).
 * Spaces, dashes, dots and parentheses are accepted and removed. Returns null
 * when the value cannot be a valid international number.
 */
export function toE164(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-().]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(cleaned) ? cleaned : null;
}

export async function executeNode(
  node: { id: string; type: string; config: Record<string, unknown> },
  vars: Record<string, unknown>,
  ctx: { supabase: SupabaseLike; workspaceId: string; workflowId?: string; dryRun: boolean },
): Promise<unknown> {
  const input = interpolate(node.config, vars) as Record<string, unknown>;
  if (node.type.startsWith("trigger.")) return input;

  if (node.type.startsWith("ai.")) {
    const handler = AI_NODE_HANDLERS[node.type];
    if (!handler) throw new Error(`Unknown AI node: ${node.type}`);
    if (ctx.dryRun) return { skipped: true, ai: true, node: node.type };
    return handler(input, { workspaceId: ctx.workspaceId, dryRun: ctx.dryRun });
  }

  switch (node.type) {
    case "logic.delay": {
      const unit = String(input.unit ?? "seconds");
      const factor = unit === "minutes" ? 60_000 : unit === "hours" ? 3_600_000 : unit === "days" ? 86_400_000 : 1_000;
      const ms = Math.min(Number(input.duration ?? 0) * factor, 5_000);
      await new Promise((r) => setTimeout(r, ms));
      return { delayed_ms: ms };
    }
    case "logic.if":
      return evalIf(input);
    case "logic.switch":
      return evalSwitch(input);
    case "logic.boolean":
      return evalBoolean(input);
    case "logic.not":
      return evalNot(input);
    case "logic.and":
      return evalAnd(input);
    case "logic.or":
      return evalOr(input);
    case "logic.compare_text":
      return evalCompareText(input);
    case "logic.compare_number":
      return evalCompareNumber(input);
    case "logic.compare_date":
      return evalCompareDate(input);
    case "logic.contains":
      return evalContains(input);
    case "logic.starts_with":
      return evalStartsWith(input);
    case "logic.ends_with":
      return evalEndsWith(input);
    case "logic.regex":
      return evalRegex(input);
    case "logic.decision_tree":
      return evalDecisionTree(input);
    case "logic.expression": {
      const raw = evalExpression(String(input.expression ?? ""));
      return { value: coerceReturn(raw, input.type as string | undefined) };
    }
    case "logic.set_variable":
      return { name: String(input.name ?? ""), value: input.value };

    case "action.notify.internal": {
      if (ctx.dryRun) return { skipped: true };
      // notifications has no workspace_id column (it has organization_id) and
      // user_id is NOT NULL; RLS only lets a user insert their own rows, so
      // write through the guarded service-role client after confirming the
      // recipient belongs to this workspace's organization.
      const recipientId = String(input.user_id ?? "").trim();
      if (!recipientId) return { skipped: true, reason: "no_recipient" };
      const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
      const admin = sbAny(supabaseAdmin);
      const { data: ws, error: wsErr } = await admin
        .from("workspaces")
        .select("organization_id")
        .eq("id", ctx.workspaceId)
        .maybeSingle();
      if (wsErr) throw new Error(wsErr.message);
      const organizationId: string | null = ws?.organization_id ?? null;
      if (!organizationId) throw new Error("Workspace organization not found");
      const { data: member, error: memErr } = await admin
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("user_id", recipientId)
        .maybeSingle();
      if (memErr) throw new Error(memErr.message);
      if (!member) return { skipped: true, reason: "recipient_not_in_organization" };
      const { error } = await admin.from("notifications").insert({
        user_id: recipientId,
        organization_id: organizationId,
        channel: "in_app",
        status: "unread",
        title: String(input.title ?? "Workflow notification"),
        body: input.body ?? null,
        category: "workflow",
        action_url: ctx.workflowId ? `/automations/${ctx.workflowId}` : "/automations",
        data: { source: "workflow", workspace_id: ctx.workspaceId, workflow_id: ctx.workflowId },
      });
      if (error) throw new Error(error.message);
      return { delivered: true };
    }
    case "action.contact.add_tag": {
      if (ctx.dryRun) return { skipped: true };
      const contactId = String(input.contact_id ?? "");
      const tag = String(input.tag ?? "").trim();
      if (!contactId || !tag) throw new Error("contact_id and tag required");
      const { data: contact } = await ctx.supabase
        .from("contacts")
        .select("id, tags")
        .eq("id", contactId)
        .single();
      const nextTags = Array.from(new Set([...(contact?.tags ?? []), tag]));
      const { error } = await sbAny(ctx.supabase).from("contacts").update({ tags: nextTags }).eq("id", contactId);
      if (error) throw new Error(error.message);
      return { tags: nextTags };
    }
    case "action.marketing.add_tag": {
      const contactId = String(input.contact_id ?? "").trim();
      const tag = String(input.tag ?? "").trim();
      if (!contactId) throw new Error("Choose a contact for this step.");
      if (!tag) throw new Error("Tag is required for this step.");
      if (ctx.dryRun) return { simulated: true, input };
      const { data: contact, error: readErr } = await sbAny(ctx.supabase)
        .from("contacts")
        .select("id, tags")
        .eq("id", contactId)
        .eq("workspace_id", ctx.workspaceId)
        .maybeSingle();
      if (readErr) throw new Error(readErr.message);
      if (!contact) throw new Error("Contact not found in this workspace.");
      const nextTags = Array.from(new Set([...(contact.tags ?? []), tag]));
      const { error } = await sbAny(ctx.supabase)
        .from("contacts")
        .update({ tags: nextTags })
        .eq("id", contactId)
        .eq("workspace_id", ctx.workspaceId);
      if (error) throw new Error(error.message);
      return { contact_id: contactId, tags: nextTags };
    }
    case "action.marketing.start_campaign": {
      const campaignId = String(input.campaign_id ?? "").trim();
      if (!campaignId) throw new Error("Choose a campaign for this step.");
      if (String(input.contact_id ?? "").trim()) {
        throw new Error("Starting a campaign for a single contact is not supported. Remove the contact to start the campaign.");
      }
      if (ctx.dryRun) return { simulated: true, input };
      // Resuming a paused campaign sends real messages, so the author must opt in per node.
      if (input.confirm_send !== true) {
        throw new Error("Tick 'I understand this sends real messages' on this step before it can start a campaign.");
      }
      return startCampaignForWorkflow({ supabase: ctx.supabase, workspaceId: ctx.workspaceId }, campaignId);
    }
    case "action.marketing.stop_campaign": {
      const campaignId = String(input.campaign_id ?? "").trim();
      if (!campaignId) throw new Error("Choose a campaign for this step.");
      if (ctx.dryRun) return { simulated: true, input };
      const contactId = String(input.contact_id ?? "").trim() || null;
      const result = await stopCampaignForWorkflow({ supabase: ctx.supabase, workspaceId: ctx.workspaceId }, campaignId, contactId);
      return { ...result, reason: input.reason ?? null };
    }
    case "action.whatsapp.assign_conversation": {
      if (ctx.dryRun) return { simulated: true, input };
      const conversationId = resolveConversationId(input, vars);
      const assigneeId = String(input.assignee_id ?? "").trim();
      const teamId = String(input.team_id ?? "").trim();
      if (!conversationId) throw new Error("Choose a conversation for this step.");
      if (!assigneeId && !teamId) throw new Error("Choose an assignee or a team for this step.");
      // The assignee must be an active member of this workspace, so a user id
      // from another tenant can never be written onto a conversation.
      if (assigneeId) {
        const { data: member } = await sbAny(ctx.supabase)
          .from("workspace_members")
          .select("user_id")
          .eq("workspace_id", ctx.workspaceId)
          .eq("user_id", assigneeId)
          .eq("status", "active")
          .maybeSingle();
        if (!member) throw new Error("The chosen assignee is not an active member of this workspace.");
      }
      // Scope by workspace so a conversation id from another tenant matches nothing.
      const { data, error } = await sbAny(ctx.supabase)
        .from("conversations")
        .update({
          assigned_to: assigneeId || null,
          assigned_team_id: teamId || null,
          assigned_at: new Date().toISOString(),
        })
        .eq("id", conversationId)
        .eq("workspace_id", ctx.workspaceId)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Conversation not found in this workspace.");
      return { conversation_id: conversationId, assigned_to: assigneeId || null, assigned_team_id: teamId || null };
    }
    case "action.instagram.send_message": {
      const body = String(input.body ?? "").trim();
      if (!body) throw new Error("Message body is required for this step.");
      const contactId = String(input.contact_id ?? "").trim();
      const conversationId = resolveConversationId(input, vars);
      if (!contactId && !conversationId) throw new Error("Choose a contact or a conversation for this step.");
      if (ctx.dryRun) return { simulated: true, input };

      const db = sbAny(ctx.supabase);
      // When the run has a conversation, load it to find the Instagram account the
      // thread belongs to and the contact it is with. Scoped to the workspace.
      let accountId = "";
      let recipientContactId = contactId;
      if (conversationId) {
        const { data: conv, error: convErr } = await db
          .from("conversations")
          .select("id, contact_id, metadata")
          .eq("id", conversationId)
          .eq("workspace_id", ctx.workspaceId)
          .maybeSingle();
        if (convErr) throw new Error(convErr.message);
        if (!conv) throw new Error("Conversation not found in this workspace.");
        const meta = (conv.metadata ?? {}) as Record<string, unknown>;
        accountId = String(meta.account_id ?? "");
        if (!recipientContactId) recipientContactId = String(conv.contact_id ?? "");
      }
      if (!recipientContactId) throw new Error("Could not resolve the contact for this step.");

      // Recipient: the contact's Instagram-scoped id (IGSID).
      const { data: ident, error: identErr } = await db
        .from("channel_identities")
        .select("external_id")
        .eq("contact_id", recipientContactId)
        .eq("channel", "instagram")
        .maybeSingle();
      if (identErr) throw new Error(identErr.message);
      const recipientId = String((ident as { external_id?: string } | null)?.external_id ?? "").trim();
      if (!recipientId) throw new Error("This contact has no Instagram account linked.");

      // Sending account: the thread's account, else the workspace's connected account.
      // The access token is encrypted, so this lookup runs on the admin client, still workspace-scoped.
      const { supabaseAdmin: igAdmin } = await import("@/lib/demo/admin-write-guard.server");
      const accountSelect = "id, page_id, ig_user_id, access_token_ciphertext, status, workspace_id";
      const accountQuery = accountId
        ? sbAny(igAdmin).from("instagram_accounts").select(accountSelect).eq("id", accountId).eq("workspace_id", ctx.workspaceId)
        : sbAny(igAdmin).from("instagram_accounts").select(accountSelect).eq("workspace_id", ctx.workspaceId).eq("status", "connected").order("connected_at", { ascending: true }).limit(1);
      const { data: acc, error: accErr } = await accountQuery.maybeSingle();
      if (accErr) throw new Error(accErr.message);
      const account = acc as {
        page_id?: string | null; ig_user_id?: string | null; access_token_ciphertext?: string | null; status?: string | null;
      } | null;
      if (!account) throw new Error("No Instagram account is connected to this workspace.");
      if (account.status && account.status !== "connected") throw new Error(`Instagram account is ${account.status}.`);
      if (!account.access_token_ciphertext || !(account.page_id || account.ig_user_id)) {
        throw new Error("Instagram access token is missing. Reconnect the account.");
      }

      const { sendInstagramMessage } = await import("@/lib/instagram/send.server");
      const res = await sendInstagramMessage({
        senderId: (account.page_id || account.ig_user_id) as string,
        accessTokenCipher: account.access_token_ciphertext,
        recipientId,
        text: body,
      });
      return { message_id: res.messageId, status: "sent" };
    }
    case "action.whatsapp.add_label": {
      if (ctx.dryRun) return { simulated: true, input };
      const conversationId = resolveConversationId(input, vars);
      const name = String(input.label ?? "").trim();
      const color = String(input.color ?? "").trim() || "#3B82F6";
      if (!conversationId) throw new Error("Choose a conversation for this step.");
      if (!name) throw new Error("Label name required.");
      const db = sbAny(ctx.supabase);
      const { data: conv, error: convErr } = await db
        .from("conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("workspace_id", ctx.workspaceId)
        .maybeSingle();
      if (convErr) throw new Error(convErr.message);
      if (!conv) throw new Error("Conversation not found in this workspace.");
      // Reuse an existing workspace label with the same name (case-insensitive), else create it.
      const { data: existing, error: findErr } = await db
        .from("conversation_labels")
        .select("id")
        .eq("workspace_id", ctx.workspaceId)
        .ilike("name", name)
        .maybeSingle();
      if (findErr) throw new Error(findErr.message);
      let labelId = (existing as { id?: string } | null)?.id;
      if (!labelId) {
        const { data: created, error: createErr } = await db
          .from("conversation_labels")
          .insert({ workspace_id: ctx.workspaceId, name, color })
          .select("id")
          .single();
        if (createErr) throw new Error(createErr.message);
        labelId = (created as { id: string }).id;
      }
      const { error: assignErr } = await db
        .from("conversation_label_assignments")
        .upsert(
          { workspace_id: ctx.workspaceId, conversation_id: conversationId, label_id: labelId },
          { onConflict: "conversation_id,label_id" },
        );
      if (assignErr) throw new Error(assignErr.message);
      return { conversation_id: conversationId, label_id: labelId, label: name };
    }
    case "action.http.request": {
      if (ctx.dryRun) return { skipped: true };
      const url = String(input.url ?? "");
      if (!url) throw new Error("url required");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const res = await fetch(url, {
          method: String(input.method ?? "GET"),
          headers: (input.headers as Record<string, string>) ?? undefined,
          body: input.body ? JSON.stringify(input.body) : undefined,
          signal: controller.signal,
        });
        const bodyText = await res.text();
        let parsed: unknown = bodyText;
        try { parsed = JSON.parse(bodyText); } catch { /* keep text */ }
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${bodyText.slice(0, 200)}`);
        return { status: res.status, body: parsed };
      } finally {
        clearTimeout(timeout);
      }
    }

    case "action.webhook.send": {
      // POST a JSON payload, optionally HMAC-signed (sha256 over `${ts}.${body}`).
      if (ctx.dryRun) return { simulated: true, input };
      const url = String(input.url ?? "");
      if (!url) throw new Error("url required");
      assertSafeWebhookUrl(url);

      const body = JSON.stringify(input.payload ?? null);
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "user-agent": "wacrm-workflow-webhook/1",
      };
      const extra = parseJsonObject(input.headers);
      for (const [k, v] of Object.entries(extra)) {
        if (v !== undefined && v !== null) headers[k.toLowerCase()] = String(v);
      }
      const secret = String(input.secret ?? "");
      if (secret) {
        const ts = Math.floor(Date.now() / 1000).toString();
        headers["x-webhook-timestamp"] = ts;
        headers["x-webhook-signature"] = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        // redirect: "error" so a public URL cannot bounce the request to an internal host.
        const res = await fetch(url, { method: "POST", headers, body, signal: controller.signal, redirect: "error" });
        const text = await res.text();
        if (!res.ok) throw new Error(`Webhook HTTP ${res.status}: ${text.slice(0, 200)}`);
        return { status: res.status, delivered: true };
      } finally {
        clearTimeout(timeout);
      }
    }

    case "action.telegram.send_message": {
      const text = String(input.body ?? "").trim();
      if (!text) throw new Error("Message body is required for this Telegram step.");
      if (ctx.dryRun) return { simulated: true, input };
      // Manual or scheduled runs have no conversation, so fall back to the chosen
      // contact's most recent Telegram conversation.
      const db = sbAny(ctx.supabase);
      let conversationId: string | null = resolveConversationId(input, vars);
      const contactId = String(input.contact_id ?? "").trim();
      if (!conversationId && contactId) {
        const { data: found } = await db
          .from("conversations")
          .select("id")
          .eq("workspace_id", ctx.workspaceId)
          .eq("contact_id", contactId)
          .eq("channel", "telegram")
          .is("deleted_at", null)
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        conversationId = (found as { id?: string } | null)?.id ?? null;
        if (!conversationId) throw new Error("This contact has no Telegram conversation yet.");
      }
      if (!conversationId) throw new Error("Choose a contact for this Telegram step.");

      // Scope every lookup by workspace so a foreign conversation id matches nothing.
      const { data: conv, error: convErr } = await db
        .from("conversations")
        .select("id, channel, external_conversation_id, metadata")
        .eq("id", conversationId)
        .eq("workspace_id", ctx.workspaceId)
        .maybeSingle();
      if (convErr) throw new Error(convErr.message);
      if (!conv) throw new Error("Conversation not found in this workspace.");
      const convRow = conv as {
        channel?: string | null;
        external_conversation_id?: string | null;
        metadata?: Record<string, unknown> | null;
      };
      // The account lives in conversation metadata; there is no account_id column.
      const convAccountId = String(convRow.metadata?.account_id ?? "").trim() || null;
      if (convRow.channel && convRow.channel !== "telegram") {
        throw new Error("The conversation for this step is not a Telegram thread.");
      }
      // Chat id: stored in conversation metadata by the inbound webhook, else
      // parsed from external_conversation_id ("tg:<bot_id>:<chat_id>").
      const extChat = String(convRow.external_conversation_id ?? "").split(":").pop() ?? "";
      const chatId = String(convRow.metadata?.chat_id ?? extChat ?? "").trim();
      if (!chatId) throw new Error("Could not determine the Telegram chat for this conversation.");

      // The bot token is encrypted and not readable through the user client, so the
      // account lookup runs on the server admin client. It stays scoped to the workspace.
      const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
      let accountQuery = sbAny(supabaseAdmin)
        .from("telegram_accounts")
        .select("id, bot_token_ciphertext, status, status_reason")
        .eq("workspace_id", ctx.workspaceId);
      if (convAccountId) accountQuery = accountQuery.eq("id", convAccountId);
      const { data: acc, error: accErr } = await accountQuery
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (accErr) throw new Error(accErr.message);
      const account = acc as {
        bot_token_ciphertext?: string | null;
        status?: string | null;
        status_reason?: string | null;
      } | null;
      if (!account) throw new Error("No Telegram bot is connected to this workspace.");
      if (!account.bot_token_ciphertext) throw new Error("Telegram bot token is missing.");
      if (account.status && account.status !== "connected") {
        throw new Error(`Telegram bot is ${account.status}${account.status_reason ? ` — ${account.status_reason}` : ""}.`);
      }

      const { sendTelegramMessage } = await import("@/lib/telegram/send.server");
      const res = await sendTelegramMessage({
        botTokenCipher: account.bot_token_ciphertext,
        chatId,
        text,
      });
      return { message_id: res.messageId, status: "sent", chat_id: res.chatId };
    }

    case "action.whatsapp.send_message":
    case "action.whatsapp.send_template": {
      // Workflows send approved templates only. A template works at any time,
      // while a free-form session message needs an open 24-hour window.
      if (ctx.dryRun) return { simulated: true, input };
      const templateId = String(input.template_id ?? "");
      const contactId = String(input.contact_id ?? "");
      if (!templateId) throw new Error("Choose an approved WhatsApp template for this step.");
      if (!contactId) throw new Error("Choose a contact for this step.");

      const { data: contact, error: contactErr } = await ctx.supabase
        .from("contacts")
        .select("id, phone, whatsapp")
        .eq("id", contactId)
        .eq("workspace_id", ctx.workspaceId)
        .maybeSingle();
      if (contactErr) throw new Error(contactErr.message);
      if (!contact) throw new Error("The contact for this step no longer exists in this workspace.");
      const phone = String((contact as { whatsapp?: string | null }).whatsapp || (contact as { phone?: string | null }).phone || "");

      const { deliverCampaignTemplate } = await import("@/lib/marketing/delivery.server");
      const delivery = await deliverCampaignTemplate(ctx.supabase as never, {
        id: `wf_${node.id}`,
        workspace_id: ctx.workspaceId,
        template_id: templateId,
        phone_number: phone,
        media_url: null,
        template_variables: (input.variables as Record<string, unknown>) ?? {},
      });
      return { template_id: templateId, delivered: true, result: delivery };
    }

    case "action.contact.create": {
      if (ctx.dryRun) return { skipped: true, node: node.type };
      const name = String(input.name ?? "").trim();
      if (!name) throw new Error("Name is required to create a contact.");
      const phone = String(input.phone ?? "").trim() || null;
      const extra = (input.fields && typeof input.fields === "object" ? input.fields : {}) as Record<string, unknown>;
      const { data, error } = await sbAny(ctx.supabase)
        .from("contacts")
        .insert({
          workspace_id: ctx.workspaceId,
          name,
          phone,
          email: String(input.email ?? "").trim() || null,
          custom_fields: { ...(input.company ? { company: String(input.company) } : {}), ...extra },
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { contact_id: (data as { id: string }).id };
    }

    case "action.contact.update": {
      if (ctx.dryRun) return { skipped: true, node: node.type };
      const contactId = String(input.contact_id ?? "");
      if (!contactId) throw new Error("Choose a contact to update.");
      const changes = (input.fields && typeof input.fields === "object" ? input.fields : {}) as Record<string, unknown>;
      if (Object.keys(changes).length === 0) throw new Error("No fields to update.");
      // Known columns are written directly; anything else is merged into custom_fields.
      const COLUMNS = new Set(["name", "first_name", "last_name", "phone", "whatsapp", "email", "lifecycle_stage", "status"]);
      const direct: Record<string, unknown> = {};
      const extra: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(changes)) (COLUMNS.has(k) ? direct : extra)[k] = v;
      const { data: current, error: readErr } = await ctx.supabase
        .from("contacts")
        .select("custom_fields")
        .eq("id", contactId)
        .eq("workspace_id", ctx.workspaceId)
        .maybeSingle();
      if (readErr) throw new Error(readErr.message);
      if (!current) throw new Error("The contact to update no longer exists in this workspace.");
      const merged = { ...((current as { custom_fields?: Record<string, unknown> }).custom_fields ?? {}), ...extra };
      const { error } = await sbAny(ctx.supabase)
        .from("contacts")
        .update({ ...direct, custom_fields: merged, updated_at: new Date().toISOString() })
        .eq("id", contactId)
        .eq("workspace_id", ctx.workspaceId);
      if (error) throw new Error(error.message);
      return { contact_id: contactId, updated: Object.keys(changes) };
    }

    case "action.task.create": {
      if (ctx.dryRun) return { skipped: true, node: node.type };
      const title = String(input.title ?? "").trim();
      if (!title) throw new Error("Title is required to create a task.");
      const PRIORITIES = ["low", "normal", "high", "urgent"];
      const priority = PRIORITIES.includes(String(input.priority)) ? String(input.priority) : "normal";
      const dueRaw = String(input.due_at ?? "").trim();
      const due = dueRaw ? new Date(dueRaw) : null;
      if (due && Number.isNaN(due.getTime())) throw new Error(`"${dueRaw}" is not a valid date. Use an ISO datetime.`);
      const relatedTo = input.related_to && typeof input.related_to === "object" ? input.related_to : {};
      const { data, error } = await sbAny(ctx.supabase)
        .from("tasks")
        .insert({
          workspace_id: ctx.workspaceId,
          title,
          priority,
          due_at: due ? due.toISOString() : null,
          custom_fields: { ...(input.assignee_id ? { assignee_id: String(input.assignee_id) } : {}), related_to: relatedTo },
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { task_id: (data as { id: string }).id };
    }

    case "action.note.create": {
      // The notes table is polymorphic: one row points at a single entity via
      // entity_type + entity_id. Priority: deal, then contact (configured or
      // the workflow's trigger contact). Conversations are not a note entity yet.
      const body = String(input.body ?? "").trim();
      if (!body) throw new Error("Note body is required to create a note.");
      const dealId = String(input.deal_id ?? "").trim();
      const contactId = String(input.contact_id ?? "").trim()
        || String((vars.trigger as { contact_id?: unknown } | undefined)?.contact_id ?? "").trim();
      const conversationId = String(input.conversation_id ?? "").trim();
      let entityType: "deal" | "contact";
      let entityId: string;
      if (dealId) { entityType = "deal"; entityId = dealId; }
      else if (contactId) { entityType = "contact"; entityId = contactId; }
      else if (conversationId) throw new Error("Notes can be attached to a contact or deal. Choose a contact or deal for this step.");
      else throw new Error("Choose a contact or deal for this note, or run the workflow from a contact.");
      if (ctx.dryRun) return { simulated: true, input };
      const pinned = input.pinned === true || input.pinned === "true";
      const { data, error } = await sbAny(ctx.supabase)
        .from("notes")
        .insert({
          workspace_id: ctx.workspaceId,
          entity_type: entityType,
          entity_id: entityId,
          body,
          is_pinned: pinned,
          pinned_at: pinned ? new Date().toISOString() : null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { note_id: (data as { id: string }).id, entity_type: entityType, entity_id: entityId };
    }

    case "action.deal.create": {
      if (ctx.dryRun) return { skipped: true, node: node.type };
      const title = String(input.name ?? input.title ?? "").trim();
      if (!title) throw new Error("Name is required to create a deal.");
      const pipelineId = String(input.pipeline_id ?? "").trim();
      if (!pipelineId) throw new Error("Choose a pipeline to create a deal.");
      const stageId = String(input.stage_id ?? "").trim();
      if (!stageId) throw new Error("Choose a stage to create a deal.");
      const amount = input.value === undefined || input.value === null || input.value === "" ? 0 : Number(input.value);
      if (!Number.isFinite(amount)) throw new Error("Deal value must be a number.");
      const { data, error } = await sbAny(ctx.supabase)
        .from("deals")
        .insert({
          workspace_id: ctx.workspaceId,
          title,
          pipeline_id: pipelineId,
          stage_id: stageId,
          amount,
          contact_id: String(input.contact_id ?? "").trim() || null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { deal_id: (data as { id: string }).id };
    }

    case "action.deal.update": {
      if (ctx.dryRun) return { skipped: true, node: node.type };
      const dealId = String(input.deal_id ?? "");
      if (!dealId) throw new Error("Choose a deal to update.");
      const changes: Record<string, unknown> = {};
      if (input.stage_id !== undefined && input.stage_id !== null && String(input.stage_id).trim() !== "") {
        changes.stage_id = String(input.stage_id).trim();
      }
      if (input.value !== undefined && input.value !== null && input.value !== "") {
        const amount = Number(input.value);
        if (!Number.isFinite(amount)) throw new Error("Deal value must be a number.");
        changes.amount = amount;
      }
      const extraFields = (input.fields && typeof input.fields === "object" ? input.fields : {}) as Record<string, unknown>;
      // Known deal columns are written directly; anything else is merged into custom_fields.
      const DEAL_COLUMNS = new Set([
        "title", "description", "amount", "currency", "pipeline_id", "stage_id", "contact_id", "company_id",
        "owner_id", "status", "priority", "probability", "source", "tags", "loss_reason",
        "expected_close_date", "actual_close_date",
      ]);
      const extra: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(extraFields)) {
        if (DEAL_COLUMNS.has(k)) changes[k] = v;
        else extra[k] = v;
      }
      if (Object.keys(changes).length === 0 && Object.keys(extra).length === 0) throw new Error("No fields to update.");
      const { data: current, error: readErr } = await ctx.supabase
        .from("deals")
        .select("custom_fields")
        .eq("id", dealId)
        .eq("workspace_id", ctx.workspaceId)
        .maybeSingle();
      if (readErr) throw new Error(readErr.message);
      if (!current) throw new Error("The deal to update no longer exists in this workspace.");
      const merged = { ...((current as { custom_fields?: Record<string, unknown> }).custom_fields ?? {}), ...extra };
      const { error } = await sbAny(ctx.supabase)
        .from("deals")
        .update({ ...changes, custom_fields: merged, updated_at: new Date().toISOString() })
        .eq("id", dealId)
        .eq("workspace_id", ctx.workspaceId);
      if (error) throw new Error(error.message);
      return { deal_id: dealId, updated: [...Object.keys(changes), ...Object.keys(extra)] };
    }

    case "action.messenger.send_message": {
      // Validate locally first so both dry runs and real runs reject bad config.
      const body = String(input.body ?? "").trim();
      if (!body) throw new Error("Message body is required for this Messenger step.");
      const conversationId = resolveConversationId(input, vars);
      const contactId = String(input.contact_id ?? "").trim();
      if (!conversationId && !contactId) throw new Error("Choose a contact for this Messenger step.");
      if (ctx.dryRun) return { simulated: true, input };

      const db = sbAny(ctx.supabase);
      const convSelect = "id, contact_id, workspace_id, channel, external_conversation_id, metadata, channel_account_id";
      let convQuery = db.from("conversations").select(convSelect).eq("workspace_id", ctx.workspaceId);
      convQuery = conversationId
        ? convQuery.eq("id", conversationId)
        : convQuery.eq("contact_id", contactId).eq("channel", "messenger").order("last_message_at", { ascending: false }).limit(1);
      const { data: conv, error: convErr } = await convQuery.maybeSingle();
      if (convErr) throw new Error(convErr.message);
      if (!conv) throw new Error("No Messenger conversation was found for this step.");
      const convRow = conv as {
        id: string; contact_id: string | null; channel: string; external_conversation_id: string | null;
        metadata: Record<string, unknown> | null; channel_account_id: string | null;
      };
      if (convRow.channel !== "messenger") throw new Error("Conversation is not a Messenger thread.");

      const meta = (convRow.metadata ?? {}) as Record<string, unknown>;
      const accountId = String(meta.account_id ?? convRow.channel_account_id ?? "");
      if (!accountId) throw new Error("This Messenger conversation has no connected Facebook Page.");
      // The page token is encrypted and not readable through the user client, so the
      // lookup runs on the admin client, still scoped to this workspace and account.
      const { supabaseAdmin: adminDb } = await import("@/lib/demo/admin-write-guard.server");
      const { data: acc, error: accErr } = await sbAny(adminDb)
        .from("messenger_accounts")
        .select("id, page_id, access_token_ciphertext, status, status_reason")
        .eq("id", accountId)
        .eq("workspace_id", ctx.workspaceId)
        .maybeSingle();
      if (accErr) throw new Error(accErr.message);
      const account = acc as {
        id: string; page_id: string | null; access_token_ciphertext: string | null;
        status: string | null; status_reason: string | null;
      } | null;
      if (!account) throw new Error("Facebook Page for this conversation was not found in this workspace.");
      if (!account.page_id || !account.access_token_ciphertext) throw new Error("Facebook Page access token is missing.");
      if (account.status && account.status !== "connected") {
        throw new Error(`Facebook Page is ${account.status}${account.status_reason ? ` — ${account.status_reason}` : ""}.`);
      }

      const { data: lastIn } = await db
        .from("messages")
        .select("from_address")
        .eq("conversation_id", convRow.id)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { resolveMessengerRecipient } = await import("@/lib/messenger/psid");
      const target = resolveMessengerRecipient(
        { id: convRow.id, channel: convRow.channel, contact_id: convRow.contact_id,
          external_conversation_id: convRow.external_conversation_id, metadata: convRow.metadata },
        account.page_id,
        (lastIn as { from_address?: string | null } | null)?.from_address ?? null,
      );
      if (!target.ok) throw new Error(target.reason);

      const { sendMessengerMessage } = await import("@/lib/messenger/send.server");
      const sent = await sendMessengerMessage({
        pageId: account.page_id,
        accessTokenCipher: account.access_token_ciphertext,
        recipientPsid: target.psid,
        text: body,
      });
      return { message_id: sent.messageId, status: "sent", recipient_id: sent.recipientId, conversation_id: convRow.id };
    }

    case "action.livechat.open_widget":
    case "action.livechat.send_message":
    case "action.livechat.start_ai_chat":
    case "action.livechat.assign_agent":
    case "action.livechat.create_lead":
    case "action.livechat.create_task":
    case "action.livechat.trigger_workflow": {
      if (ctx.dryRun) return { skipped: true, node: node.type };
      const { runLivechatAction } = await import("@/lib/livechat/automation-actions.server");
      return runLivechatAction(node.type, input, {
        supabase: ctx.supabase,
        workspaceId: ctx.workspaceId,
        trigger: (vars.trigger ?? {}) as Record<string, unknown>,
      });
    }

    case "action.booking.notify": {
      if (ctx.dryRun) return { skipped: true, node: node.type };
      const apptId = String((input as { appointment_id?: string }).appointment_id ?? "");
      const kind = String((input as { kind?: string }).kind ?? "reminder") as
        | "confirmation" | "reschedule" | "cancellation" | "reminder" | "follow_up" | "review_request";
      if (!apptId) throw new Error("appointment_id required");
      const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
      const { sendAppointmentNotification } = await import("@/lib/booking/notifications-engine.server");
      return sendAppointmentNotification(supabaseAdmin, apptId, kind);
    }
    case "action.booking.schedule_reminders": {
      if (ctx.dryRun) return { skipped: true, node: node.type };
      const apptId = String((input as { appointment_id?: string }).appointment_id ?? "");
      if (!apptId) throw new Error("appointment_id required");
      const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
      const { scheduleAppointmentReminders } = await import("@/lib/booking/notifications-engine.server");
      return scheduleAppointmentReminders(supabaseAdmin, apptId);
    }

    case "action.email.send": {
      // Sends through the workspace's connected Resend account. The helper writes no
      // DB rows, so this step does not either. Recipient: configured `to`, else the
      // run's contact email. The registry's "HTML body" field is sent as plain text
      // (tags stripped), because the helper only supports text bodies.
      const trigger = (vars.trigger ?? {}) as { contact?: { email?: unknown } | null; contact_email?: unknown };
      const to = String(input.to ?? "").trim() || String(trigger.contact?.email ?? trigger.contact_email ?? "").trim();
      const subject = String(input.subject ?? "").trim();
      const text = String(input.html ?? "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!to) throw new Error("Choose a recipient for this email, or run the workflow from a contact with an email address.");
      if (!isValidEmailAddress(to)) throw new Error(`"${to}" is not a valid email address.`);
      if (!subject) throw new Error("Subject is required to send an email.");
      if (!text) throw new Error("The email body is empty.");
      if (ctx.dryRun) return { simulated: true, input: { ...input, to, subject, html: input.html } };

      const { data: accRaw, error: accErr } = await sbAny(ctx.supabase)
        .from("email_accounts")
        .select("from_email, from_name, reply_to, api_key_ciphertext")
        .eq("workspace_id", ctx.workspaceId)
        .eq("provider", "resend")
        .eq("status", "connected")
        .maybeSingle();
      if (accErr) throw new Error(accErr.message);
      const acc = accRaw as {
        from_email?: string | null;
        from_name?: string | null;
        reply_to?: string | null;
        api_key_ciphertext?: string | null;
      } | null;
      if (!acc || !acc.api_key_ciphertext || !acc.from_email) {
        throw new Error("No connected Resend email account in this workspace. Connect one before sending email.");
      }
      const { sendResendEmail } = await import("@/lib/email/send.server");
      const sent = await sendResendEmail({
        apiKeyCipher: acc.api_key_ciphertext,
        fromEmail: acc.from_email,
        fromName: acc.from_name ?? null,
        to,
        subject,
        text,
        replyTo: acc.reply_to ?? null,
      });
      return { sent: true, to, message_id: sent.messageId };
    }

    case "action.sms.send": {
      const body = String(input.body ?? "").trim();
      if (!body) throw new Error("Write a message body for this SMS step.");
      if (body.length > 1600) throw new Error("SMS body is longer than 1600 characters.");

      // Recipient: an explicit `to` number wins; otherwise the contact's phone.
      let rawTo = String(input.to ?? "").trim();
      if (!rawTo) {
        const contactId = String(input.contact_id ?? "").trim();
        if (!contactId) throw new Error("Choose a contact or enter a phone number for this SMS step.");
        const { data: contact, error: contactErr } = await ctx.supabase
          .from("contacts")
          .select("id, phone")
          .eq("id", contactId)
          .eq("workspace_id", ctx.workspaceId)
          .maybeSingle();
        if (contactErr) throw new Error(contactErr.message);
        if (!contact) throw new Error("The contact for this step no longer exists in this workspace.");
        rawTo = String((contact as { phone?: string | null }).phone ?? "").trim();
        if (!rawTo) throw new Error("This contact has no phone number, so the SMS cannot be sent.");
      }
      const to = toE164(rawTo);
      if (!to) {
        throw new Error(`"${rawTo}" is not a valid phone number. Use international format, for example +15551234567.`);
      }

      if (ctx.dryRun) return { simulated: true, input: { to, body } };

      // Sender: the workspace's connected Twilio line. Read with the admin client
      // because the auth token ciphertext is not readable by signed-in users.
      const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
      const { data: accounts, error: accErr } = await sbAny(supabaseAdmin)
        .from("sms_accounts")
        .select("id, phone_number, account_sid, auth_token_ciphertext")
        .eq("workspace_id", ctx.workspaceId)
        .eq("provider", "twilio")
        .not("status", "in", "(disconnected,suspended)")
        .order("connected_at", { ascending: true })
        .limit(1);
      if (accErr) throw new Error(accErr.message);
      const account = ((accounts ?? []) as Array<{
        phone_number: string;
        account_sid: string | null;
        auth_token_ciphertext: string | null;
      }>)[0];
      if (!account || !account.account_sid || !account.auth_token_ciphertext) {
        throw new Error("No connected Twilio SMS account with credentials is set up for this workspace.");
      }

      const { sendTwilioSms } = await import("@/lib/sms/send.server");
      const { messageId } = await sendTwilioSms({
        accountSid: account.account_sid,
        authTokenCipher: account.auth_token_ciphertext,
        from: account.phone_number,
        to,
        body,
      });
      return { message_id: messageId, status: "sent" };
    }

    case "action.booking.create": {
      const eventTypeId = String(input.event_type_id ?? "").trim();
      const customerName = String(input.customer_name ?? "").trim();
      const customerEmail = String(input.customer_email ?? "").trim();
      const customerPhone = String(input.customer_phone ?? "").trim();
      const startAt = String(input.start_at ?? "").trim();
      if (!eventTypeId) throw new Error("Choose a meeting type for this step.");
      if (!customerName) throw new Error("Customer name is required to book an appointment.");
      if (!startAt) throw new Error("Choose a start time for this appointment.");
      if (Number.isNaN(new Date(startAt).getTime())) {
        throw new Error(`"${startAt}" is not a valid start time. Use ISO format, for example 2026-10-12T15:00:00Z.`);
      }
      if (customerEmail && !isValidEmailAddress(customerEmail)) {
        throw new Error(`"${customerEmail}" is not a valid email address.`);
      }
      if (ctx.dryRun) return { simulated: true, input };
      const { createWorkflowAppointment } = await import("@/lib/booking/workflow-actions.server");
      const appointment = await createWorkflowAppointment(ctx.supabase as never, ctx.workspaceId, {
        eventTypeId,
        customerName,
        customerEmail,
        customerPhone,
        startAt: new Date(startAt).toISOString(),
      });
      return { appointment };
    }
    case "action.booking.cancel": {
      const appointmentId = String(input.appointment_id ?? "").trim();
      const reason = String(input.reason ?? "").trim();
      if (!appointmentId) throw new Error("Choose an appointment to cancel.");
      if (ctx.dryRun) return { simulated: true, input };
      const { cancelWorkflowAppointment } = await import("@/lib/booking/workflow-actions.server");
      return cancelWorkflowAppointment(ctx.supabase as never, ctx.workspaceId, appointmentId, reason);
    }
    case "action.booking.send_link": {
      const eventTypeId = String(input.event_type_id ?? "").trim();
      const channel = String(input.channel ?? "").trim();
      const to = String(input.to ?? "").trim();
      if (!eventTypeId) throw new Error("Choose a meeting type for this step.");
      if (!["whatsapp", "email", "sms"].includes(channel)) {
        throw new Error("Choose a channel for this step: WhatsApp, email or SMS.");
      }
      if (!to) throw new Error("Enter a recipient for the booking link.");
      if (channel === "email") {
        if (!isValidEmailAddress(to)) throw new Error(`"${to}" is not a valid email address.`);
      } else {
        const e164 = toE164(to);
        if (!e164) throw new Error(`"${to}" is not a valid phone number. Use international format, for example +15551234567.`);
      }
      if (ctx.dryRun) return { simulated: true, input };
      const { queueWorkflowBookingLink } = await import("@/lib/booking/workflow-actions.server");
      return queueWorkflowBookingLink(ctx.supabase as never, ctx.workspaceId, {
        eventTypeId,
        channel: channel as "whatsapp" | "email" | "sms",
        to: channel === "email" ? to : (toE164(to) as string),
      });
    }

    default:
      // No implementation exists for this node yet. Failing loudly is better than
      // reporting success for a step that did nothing. This applies to dry runs too,
      // so the Test button surfaces the gap before a real run.
      throw new Error(`"${node.type}" is not supported yet. Remove this step or replace it with a supported one.`);
  }

}

