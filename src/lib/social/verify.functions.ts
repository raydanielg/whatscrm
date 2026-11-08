/**
 * Channel connection verification.
 *
 * The setup screens call this after a token is saved: it pings the platform's
 * identity endpoint with the stored channel token, then records the result on
 * the channel row (status, username, avatar, last_verified metadata). Tokens
 * are only ever read server-side; nothing sensitive is returned to the client.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

type Platform = "facebook" | "instagram" | "linkedin" | "x" | "tiktok" | "youtube" | "threads";

interface Probe {
  ok: boolean;
  name?: string;
  username?: string;
  avatar?: string;
  error?: string;
}

async function getJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

function errMessage(json: Record<string, unknown>, status: number): string {
  const meta = json.error as { message?: string } | string | undefined;
  if (typeof meta === "string") return meta;
  if (meta?.message) return meta.message;
  const detail = (json as { error_description?: string; message?: string; title?: string }).error_description
    ?? (json as { message?: string }).message
    ?? (json as { title?: string }).title;
  return detail ?? `Request failed with status ${status}`;
}

async function probe(platform: Platform, externalId: string | null, token: string): Promise<Probe> {
  try {
    if (platform === "facebook") {
      if (!externalId) return { ok: false, error: "Page ID is required" };
      const r = await getJson(
        `https://graph.facebook.com/v21.0/${externalId}?fields=id,name,username,picture{url}&access_token=${encodeURIComponent(token)}`,
      );
      if (!r.ok) return { ok: false, error: errMessage(r.json, r.status) };
      const pic = (r.json.picture as { data?: { url?: string } } | undefined)?.data?.url;
      return { ok: true, name: r.json.name as string, username: r.json.username as string | undefined, avatar: pic };
    }
    if (platform === "instagram") {
      if (!externalId) return { ok: false, error: "Instagram user ID is required" };
      const r = await getJson(
        `https://graph.facebook.com/v21.0/${externalId}?fields=id,username,profile_picture_url&access_token=${encodeURIComponent(token)}`,
      );
      if (!r.ok) return { ok: false, error: errMessage(r.json, r.status) };
      return { ok: true, username: r.json.username as string, avatar: r.json.profile_picture_url as string | undefined };
    }
    if (platform === "threads") {
      const id = externalId || "me";
      const r = await getJson(
        `https://graph.threads.net/v1.0/${id}?fields=id,username,threads_profile_picture_url&access_token=${encodeURIComponent(token)}`,
      );
      if (!r.ok) return { ok: false, error: errMessage(r.json, r.status) };
      return { ok: true, username: r.json.username as string, avatar: r.json.threads_profile_picture_url as string | undefined };
    }
    if (platform === "x") {
      const r = await getJson("https://api.x.com/2/users/me?user.fields=profile_image_url", {
        Authorization: `Bearer ${token}`,
      });
      if (!r.ok) return { ok: false, error: errMessage(r.json, r.status) };
      const d = r.json.data as { name?: string; username?: string; profile_image_url?: string } | undefined;
      return { ok: true, name: d?.name, username: d?.username, avatar: d?.profile_image_url };
    }
    if (platform === "tiktok") {
      const r = await getJson(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
        { Authorization: `Bearer ${token}` },
      );
      if (!r.ok) return { ok: false, error: errMessage(r.json, r.status) };
      const u = (r.json.data as { user?: { display_name?: string; avatar_url?: string } } | undefined)?.user;
      return { ok: true, name: u?.display_name, avatar: u?.avatar_url };
    }
    if (platform === "youtube") {
      const r = await getJson(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { Authorization: `Bearer ${token}` },
      );
      if (!r.ok) return { ok: false, error: errMessage(r.json, r.status) };
      const item = (r.json.items as Array<{ snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string } } } }> | undefined)?.[0];
      if (!item) return { ok: false, error: "No YouTube channel is available for this token" };
      return {
        ok: true,
        name: item.snippet?.title,
        username: item.snippet?.customUrl?.replace(/^@/, ""),
        avatar: item.snippet?.thumbnails?.default?.url,
      };
    }
    // linkedin
    const r = await getJson("https://api.linkedin.com/v2/userinfo", { Authorization: `Bearer ${token}` });
    if (!r.ok) return { ok: false, error: errMessage(r.json, r.status) };
    return { ok: true, name: r.json.name as string | undefined, avatar: r.json.picture as string | undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Connection failed" };
  }
}

export const verifySocialChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ channelId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    // RLS check first: the caller must be able to see this channel.
    const { data: visible, error: visErr } = await context.supabase
      .from("social_channels")
      .select("id, platform, external_id")
      .eq("id", data.channelId)
      .maybeSingle();
    if (visErr) throw new Error(visErr.message);
    if (!visible) throw new Error("Channel not found");

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: row, error } = await supabaseAdmin
      .from("social_channels")
      .select("access_token")
      .eq("id", data.channelId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const cipher = (row as { access_token?: string | null } | null)?.access_token;
    if (!cipher) {
      await supabaseAdmin
        .from("social_channels")
        .update({ status: "error", metadata: { last_error: "No access token stored" } } as never)
        .eq("id", data.channelId);
      return { ok: false, error: "No access token stored for this channel yet." };
    }

    const { resolveToken } = await import("./providers/token.server");
    const result = await probe(
      visible.platform as Platform,
      (visible as { external_id: string | null }).external_id,
      resolveToken(cipher),
    );

    const patch: Record<string, unknown> = {
      status: result.ok ? "connected" : "error",
      metadata: {
        last_verified_at: new Date().toISOString(),
        ...(result.ok ? {} : { last_error: result.error }),
      },
    };
    if (result.ok) {
      if (result.username) patch.username = result.username;
      if (result.avatar) patch.avatar_url = result.avatar;
    }
    await sbAny(supabaseAdmin).from("social_channels").update(patch as never).eq("id", data.channelId);

    return { ok: result.ok, error: result.error, name: result.name, username: result.username };
  });
