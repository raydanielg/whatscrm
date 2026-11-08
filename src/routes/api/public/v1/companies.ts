import { createFileRoute } from "@tanstack/react-router";
import { withGateway, jsonOk, jsonError, parseJson, preflight } from "@/lib/api/gateway.server";
import { parseQuery, applyQuery, selectFields } from "@/lib/api/query";
import { z } from "zod";

const CreateCompanySchema = z.object({
  name: z.string().min(1).max(200),
  domain: z.string().max(200).optional(),
  industry: z.string().max(120).optional(),
  size: z.string().max(40).optional(),
  website: z.string().url().max(255).optional(),
  phone: z.string().max(40).optional(),
});

const DEFAULT_FIELDS = "id, name, domain, industry, size, website, phone, created_at, updated_at";

export const Route = createFileRoute("/api/public/v1/companies")({
  server: {
    handlers: {
      OPTIONS: () => preflight(),
      GET: withGateway({ requiredScopes: ["contacts:read"] }, async (ctx, req) => {
        const url = new URL(req.url);
        const parsed = parseQuery(url, {
          filterable: ["industry", "size", "domain"],
          sortable: ["created_at", "updated_at", "name"],
          searchable: ["name", "domain", "industry"],
          defaultSort: "-created_at",
        });
        const select = selectFields(DEFAULT_FIELDS, parsed.fields);
        let q = ctx.supabase
          .from("companies")
          .select(select, { count: "exact" })
          .eq("organization_id", ctx.organizationId);
        q = applyQuery(q, parsed, {
          filterable: ["industry", "size", "domain"],
          sortable: ["created_at", "updated_at", "name"],
          searchable: ["name", "domain", "industry"],
        });
        const { data, error, count } = await q;
        if (error) return jsonError("internal_error", error.message, {}, ctx.requestId);
        return jsonOk(data ?? [], { requestId: ctx.requestId, meta: { total: count ?? 0, limit: parsed.limit, offset: parsed.offset } });
      }),
      POST: withGateway({ requiredScopes: ["contacts:write"] }, async (ctx, req) => {
        const body = await parseJson<unknown>(req);
        const parsed = CreateCompanySchema.safeParse(body);
        if (!parsed.success) return jsonError("validation_error", "Invalid payload", { issues: parsed.error.issues }, ctx.requestId);
        const { data, error } = await ctx.supabase
          .from("companies")
          .insert({ ...parsed.data, organization_id: ctx.organizationId })
          .select(DEFAULT_FIELDS)
          .single();
        if (error) return jsonError("internal_error", error.message, {}, ctx.requestId);
        return jsonOk(data, { status: 201, requestId: ctx.requestId });
      }),
    },
  },
});
