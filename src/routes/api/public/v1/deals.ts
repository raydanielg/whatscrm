import { createFileRoute } from "@tanstack/react-router";
import { withGateway, jsonOk, jsonError, parseJson, preflight } from "@/lib/api/gateway.server";
import { findForeignReferences } from "@/lib/api/tenant-refs.server";

import { z } from "zod";

const CreateDealSchema = z.object({
  title: z.string().min(1).max(200),
  amount: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  pipeline_id: z.string().uuid().optional(),
  stage_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  expected_close_date: z.string().datetime().optional(),
});

export const Route = createFileRoute("/api/public/v1/deals")({
  server: {
    handlers: {
      OPTIONS: () => preflight(),
      GET: withGateway({ requiredScopes: ["deals:read"] }, async (ctx, req) => {
        const url = new URL(req.url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
        const offset = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);
        const { data, error, count } = await ctx.supabase
          .from("deals")
          .select("id, title, amount, currency, pipeline_id, stage_id, contact_id, company_id, expected_close_date, created_at", { count: "exact" })
          .eq("organization_id", ctx.organizationId)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) return jsonError("internal_error", error.message, {}, ctx.requestId);
        return jsonOk(data ?? [], { requestId: ctx.requestId, meta: { total: count ?? 0, limit, offset } });
      }),
      POST: withGateway({ requiredScopes: ["deals:write"] }, async (ctx, req) => {
        const body = await parseJson<unknown>(req);
        const parsed = CreateDealSchema.safeParse(body);
        if (!parsed.success) {
          return jsonError("validation_error", "Invalid deal payload", { issues: parsed.error.issues }, ctx.requestId);
        }
        // Referenced records must live in the caller's own tenant.
        const foreign = await findForeignReferences(ctx.supabase, ctx.organizationId, parsed.data);
        if (foreign.length) {
          return jsonError(
            "validation_error",
            `Referenced records not found in this organization: ${foreign.join(", ")}`,
            { fields: foreign },
            ctx.requestId,
          );
        }
        const { data, error } = await ctx.supabase
          .from("deals")
          .insert({ ...parsed.data, organization_id: ctx.organizationId })
          .select("id, title, amount, currency, created_at")
          .single();
        if (error) return jsonError("internal_error", error.message, {}, ctx.requestId);
        return jsonOk(data, { status: 201, requestId: ctx.requestId });
      }),

    },
  },
});
