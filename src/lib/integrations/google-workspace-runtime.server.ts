import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";
import type { ActionContext, ActionResult } from "./runtime.server";

export async function runGoogleWorkspaceAction(ctx: ActionContext): Promise<ActionResult> {
  const started = Date.now();
  try {
    if (!ctx.userId || !ctx.workspaceId)
      throw new Error("A signed-in user and selected workspace are required");
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const db = sbAny(supabaseAdmin);
    const membership = await db
      .from("workspace_members")
      .select("user_id")
      .eq("user_id", ctx.userId)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    if (membership.error || !membership.data)
      throw new Error("Access to this workspace is required");
    const { data: row, error } = await db
      .from("installed_integrations")
      .select("connection_key_cipher,account_email")
      .eq("workspace_id", ctx.workspaceId)
      .eq("user_id", ctx.userId)
      .eq("provider_id", "google-workspace")
      .eq("status", "active")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Connect your Google Workspace account first");
    let path: string;
    let init: RequestInit = { method: "GET" };
    if (ctx.capabilityId === "list_files") {
      const input = z
        .object({
          pageSize: z.number().int().min(1).max(100).default(25),
          pageToken: z.string().max(2048).optional(),
        })
        .parse(ctx.input);
      const params = new URLSearchParams({
        pageSize: String(input.pageSize),
        fields: "nextPageToken,files(id,name,mimeType,webViewLink)",
        q: "trashed = false",
      });
      if (input.pageToken) params.set("pageToken", input.pageToken);
      path = `/drive/v3/files?${params}`;
    } else if (ctx.capabilityId === "send_email") {
      const input = z
        .object({
          to: z.string().email(),
          subject: z
            .string()
            .max(500)
            .refine((s) => !/[\r\n]/.test(s), "Subject must be one line"),
          body: z.string().max(1000000),
        })
        .parse(ctx.input);
      const sender = z.string().email().parse(row.account_email);
      const message = [
        `From: ${sender}`,
        `To: ${input.to}`,
        `Subject: =?UTF-8?B?${Buffer.from(input.subject).toString("base64")}?=`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from(input.body).toString("base64"),
      ].join("\r\n");
      path = "/gmail/v1/users/me/messages/send";
      init = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: Buffer.from(message).toString("base64url") }),
      };
    } else if (ctx.capabilityId === "create_event") {
      const input = z
        .object({
          summary: z.string().trim().min(1).max(500),
          start: z.string().datetime({ offset: true }),
          end: z.string().datetime({ offset: true }),
          calendarId: z.string().min(1).max(500).default("primary"),
        })
        .parse(ctx.input);
      if (Date.parse(input.end) <= Date.parse(input.start))
        throw new Error("Event end must be after its start");
      path = `/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events`;
      init = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: input.summary,
          start: { dateTime: input.start },
          end: { dateTime: input.end },
        }),
      };
    } else throw new Error("Unsupported Google Workspace action");
    const { googleWorkspaceFetch } = await import("./google-oauth.server");
    const response = await googleWorkspaceFetch(row.connection_key_cipher, path, init);
    return {
      ok: response.ok,
      status: response.status,
      data: response.ok ? await response.text() : null,
      error: response.ok ? undefined : `Google Workspace request failed (${response.status})`,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Google Workspace action failed",
      latencyMs: Date.now() - started,
    };
  }
}
