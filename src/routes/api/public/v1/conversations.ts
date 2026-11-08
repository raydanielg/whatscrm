import { createFileRoute } from "@tanstack/react-router";
import { withGateway, jsonOk, jsonError, preflight } from "@/lib/api/gateway.server";

export const Route = createFileRoute("/api/public/v1/conversations")({
  server: {
    handlers: {
      OPTIONS: () => preflight(),
      GET: withGateway({ requiredScopes: ["conversations:read"] }, async (ctx, req) => {
        const url = new URL(req.url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
        const offset = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);
        const status = url.searchParams.get("status");

        let q = ctx.supabase
          .from("conversations")
          .select("id, contact_id, channel, status, priority, last_message_at, created_at", { count: "exact" })
          .eq("organization_id", ctx.organizationId)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .range(offset, offset + limit - 1);
        if (status) q = q.eq("status", status);

        const { data, error, count } = await q;
        if (error) return jsonError("internal_error", error.message, {}, ctx.requestId);
        return jsonOk(data ?? [], { requestId: ctx.requestId, meta: { total: count ?? 0, limit, offset } });
      }),
    },
  },
});
