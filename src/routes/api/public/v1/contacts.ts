import { createFileRoute } from "@tanstack/react-router";
import { withGateway, jsonOk, jsonError, parseJson, preflight } from "@/lib/api/gateway.server";
import { z } from "zod";
import { orIlike } from "@/lib/api/postgrest-filters";

const CreateContactSchema = z.object({
  first_name: z.string().min(1).max(120).optional(),
  last_name: z.string().min(1).max(120).optional(),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(40).optional(),
  whatsapp_number: z.string().max(40).optional(),
  company: z.string().max(200).optional(),
  job_title: z.string().max(200).optional(),
  tags: z.array(z.string().max(60)).max(50).optional(),
});

export const Route = createFileRoute("/api/public/v1/contacts")({
  server: {
    handlers: {
      OPTIONS: () => preflight(),
      GET: withGateway({ requiredScopes: ["contacts:read"] }, async (ctx, req) => {
        const url = new URL(req.url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
        const offset = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);
        const search = url.searchParams.get("search")?.trim();

        let query = ctx.supabase
          .from("contacts")
          .select("id, first_name, last_name, email, phone, whatsapp_number, company, job_title, tags, created_at, updated_at", { count: "exact" })
          .eq("organization_id", ctx.organizationId)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (search) {
          const filter = orIlike(["first_name", "last_name", "email", "phone"], search);
          if (filter) query = query.or(filter);
        }

        const { data, error, count } = await query;
        if (error) return jsonError("internal_error", error.message, {}, ctx.requestId);
        return jsonOk(data ?? [], { requestId: ctx.requestId, meta: { total: count ?? 0, limit, offset } });
      }),
      POST: withGateway({ requiredScopes: ["contacts:write"] }, async (ctx, req) => {
        const body = await parseJson<unknown>(req);
        const parsed = CreateContactSchema.safeParse(body);
        if (!parsed.success) {
          return jsonError("validation_error", "Invalid contact payload", { issues: parsed.error.issues }, ctx.requestId);
        }
        const { data, error } = await ctx.supabase
          .from("contacts")
          .insert({ ...parsed.data, organization_id: ctx.organizationId })
          .select("id, first_name, last_name, email, phone, whatsapp_number, company, tags, created_at")
          .single();
        if (error) return jsonError("internal_error", error.message, {}, ctx.requestId);
        return jsonOk(data, { status: 201, requestId: ctx.requestId });
      }),
    },
  },
});
