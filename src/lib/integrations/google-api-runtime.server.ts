/**
 * Google Calendar / Drive / Contacts runtime.
 *
 * These three marketplace providers have no OAuth flow of their own. They call
 * the same Google APIs that `google-workspace` is already authorized for, so
 * they execute against that connection's refresh token instead of advertising
 * capabilities nothing can run.
 */
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";
import type { ActionContext, ActionResult } from "./runtime.server";

const CONNECT_FIRST =
  "Connect Google Workspace under Integrations first — Google Calendar, Drive, and Contacts run on that connection.";

async function loadWorkspaceConnection(ctx: ActionContext): Promise<string> {
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
  if (membership.error || !membership.data) throw new Error("Access to this workspace is required");
  const { data: row, error } = await db
    .from("installed_integrations")
    .select("connection_key_cipher")
    .eq("workspace_id", ctx.workspaceId)
    .eq("user_id", ctx.userId)
    .eq("provider_id", "google-workspace")
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row?.connection_key_cipher) throw new Error(CONNECT_FIRST);
  return row.connection_key_cipher as string;
}

function vendorError(status: number, body: string): string {
  let reason = "";
  try {
    reason = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? "";
  } catch {
    reason = body.slice(0, 300);
  }
  return `Google request failed (${status})${reason ? `: ${reason}` : ""}`;
}

function finish(response: Response, body: string, started: number): ActionResult {
  return {
    ok: response.ok,
    status: response.status,
    data: response.ok ? body : null,
    error: response.ok ? undefined : vendorError(response.status, body),
    latencyMs: Date.now() - started,
  };
}

async function calendar(
  ctx: ActionContext,
  cipher: string,
  started: number,
): Promise<ActionResult> {
  const { googleWorkspaceFetch } = await import("./google-oauth.server");
  const fallbackCalendar = String(ctx.config.default_calendar ?? "primary") || "primary";

  if (ctx.capabilityId === "list_events") {
    const input = z
      .object({
        calendarId: z.string().min(1).max(500).default(fallbackCalendar),
        maxResults: z.number().int().min(1).max(250).default(25),
        timeMin: z.string().datetime({ offset: true }).optional(),
      })
      .parse(ctx.input);
    const params = new URLSearchParams({
      maxResults: String(input.maxResults),
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: input.timeMin ?? new Date().toISOString(),
    });
    const path = `/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events?${params}`;
    const response = await googleWorkspaceFetch(cipher, path);
    return finish(response, await response.text(), started);
  }

  if (ctx.capabilityId === "create_event") {
    const input = z
      .object({
        summary: z.string().trim().min(1).max(500),
        start: z.string().datetime({ offset: true }),
        end: z.string().datetime({ offset: true }),
        calendarId: z.string().min(1).max(500).default(fallbackCalendar),
        description: z.string().max(8000).optional(),
      })
      .parse(ctx.input);
    if (Date.parse(input.end) <= Date.parse(input.start))
      throw new Error("Event end must be after its start");
    const path = `/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events`;
    const response = await googleWorkspaceFetch(cipher, path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.start },
        end: { dateTime: input.end },
      }),
    });
    return finish(response, await response.text(), started);
  }

  throw new Error(`Unsupported Google Calendar action: ${ctx.capabilityId}`);
}

async function drive(ctx: ActionContext, cipher: string, started: number): Promise<ActionResult> {
  const { googleWorkspaceFetch } = await import("./google-oauth.server");
  const rootFolder = String(ctx.config.root_folder ?? "").trim();

  if (ctx.capabilityId === "list_files") {
    const input = z
      .object({
        pageSize: z.number().int().min(1).max(100).default(25),
        pageToken: z.string().max(2048).optional(),
        folderId: z.string().max(200).optional(),
      })
      .parse(ctx.input);
    const folder = input.folderId ?? rootFolder;
    const clauses = ["trashed = false"];
    if (folder) clauses.push(`'${folder.replace(/'/g, "\\'")}' in parents`);
    const params = new URLSearchParams({
      pageSize: String(input.pageSize),
      fields: "nextPageToken,files(id,name,mimeType,webViewLink,size)",
      q: clauses.join(" and "),
    });
    if (input.pageToken) params.set("pageToken", input.pageToken);
    const response = await googleWorkspaceFetch(cipher, `/drive/v3/files?${params}`);
    return finish(response, await response.text(), started);
  }

  if (ctx.capabilityId === "upload_file") {
    const input = z
      .object({
        name: z.string().trim().min(1).max(255),
        content: z.string().min(1).max(40_000_000),
        mimeType: z.string().max(200).default("application/octet-stream"),
        folderId: z.string().max(200).optional(),
      })
      .parse(ctx.input);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.content.replace(/\s+/g, "")))
      throw new Error("File content must be base64 encoded");
    const folder = input.folderId ?? rootFolder;
    const boundary = `wacrm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const metadata: Record<string, unknown> = { name: input.name };
    if (folder) metadata.parents = [folder];
    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      `Content-Type: ${input.mimeType}`,
      "Content-Transfer-Encoding: base64",
      "",
      input.content.replace(/\s+/g, ""),
      `--${boundary}--`,
      "",
    ].join("\r\n");
    const response = await googleWorkspaceFetch(
      cipher,
      "/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink",
      {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      },
    );
    return finish(response, await response.text(), started);
  }

  throw new Error(`Unsupported Google Drive action: ${ctx.capabilityId}`);
}

const PERSON_FIELDS = "names,emailAddresses,phoneNumbers,organizations";

async function contacts(
  ctx: ActionContext,
  cipher: string,
  started: number,
): Promise<ActionResult> {
  const { googleWorkspaceFetch: googlePeopleFetch } = await import("./google-oauth.server");

  if (ctx.capabilityId === "list_contacts") {
    const input = z
      .object({
        pageSize: z.number().int().min(1).max(200).default(25),
        pageToken: z.string().max(2048).optional(),
      })
      .parse(ctx.input);
    const params = new URLSearchParams({
      personFields: PERSON_FIELDS,
      pageSize: String(input.pageSize),
    });
    if (input.pageToken) params.set("pageToken", input.pageToken);
    const response = await googlePeopleFetch(cipher, `/v1/people/me/connections?${params}`);
    return finish(response, await response.text(), started);
  }

  if (ctx.capabilityId === "upsert_contact") {
    const input = z
      .object({
        givenName: z.string().trim().max(200).optional(),
        familyName: z.string().trim().max(200).optional(),
        email: z.string().email().optional(),
        phone: z.string().max(60).optional(),
        resourceName: z
          .string()
          .regex(/^people\/[A-Za-z0-9_-]+$/, "resourceName must look like people/c123")
          .optional(),
      })
      .parse(ctx.input);
    if (!input.givenName && !input.familyName && !input.email)
      throw new Error("Provide at least a name or an email address");

    const person: Record<string, unknown> = {};
    const updateFields: string[] = [];
    if (input.givenName || input.familyName) {
      person.names = [{ givenName: input.givenName, familyName: input.familyName }];
      updateFields.push("names");
    }
    if (input.email) {
      person.emailAddresses = [{ value: input.email }];
      updateFields.push("emailAddresses");
    }
    if (input.phone) {
      person.phoneNumbers = [{ value: input.phone }];
      updateFields.push("phoneNumbers");
    }

    if (!input.resourceName) {
      const response = await googlePeopleFetch(
        cipher,
        `/v1/people:createContact?personFields=${PERSON_FIELDS}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(person),
        },
      );
      return finish(response, await response.text(), started);
    }

    // People API rejects an update without the current etag, so read it first.
    const existing = await googlePeopleFetch(
      cipher,
      `/v1/${input.resourceName}?personFields=${PERSON_FIELDS}`,
    );
    const existingBody = await existing.text();
    if (!existing.ok) return finish(existing, existingBody, started);
    const etag = (JSON.parse(existingBody) as { etag?: string }).etag;
    if (!etag) throw new Error("Google did not return an etag for this contact");
    const response = await googlePeopleFetch(
      cipher,
      `/v1/${input.resourceName}:updateContact?updatePersonFields=${updateFields.join(",")}&personFields=${PERSON_FIELDS}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...person, etag }),
      },
    );
    return finish(response, await response.text(), started);
  }

  throw new Error(`Unsupported Google Contacts action: ${ctx.capabilityId}`);
}

export async function runGoogleApiAction(ctx: ActionContext): Promise<ActionResult> {
  const started = Date.now();
  try {
    const cipher = await loadWorkspaceConnection(ctx);
    if (ctx.providerId === "google-calendar") return calendar(ctx, cipher, started);
    if (ctx.providerId === "google-drive") return drive(ctx, cipher, started);
    if (ctx.providerId === "google-contacts") return contacts(ctx, cipher, started);
    throw new Error(`Unsupported Google provider: ${ctx.providerId}`);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Google action failed",
      latencyMs: Date.now() - started,
    };
  }
}
