import { createFileRoute } from "@tanstack/react-router";
import { withGateway, jsonOk, jsonError, parseJson, preflight } from "@/lib/api/gateway.server";
import { z } from "zod";

const UpdateContactSchema = z.object({
  first_name: z.string().min(1).max(120).optional(),
  last_name: z.string().min(1).max(120).optional(),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(40).optional(),
  whatsapp_number: z.string().max(40).optional(),
  company: z.string().max(200).optional(),
  job_title: z.string().max(200).optional(),
  tags: z.array(z.string().max(60)).max(50).optional(),
});

const SELECT = "id, first_name, last_name, email, phone, whatsapp_number, company, job_title, tags, created_at, updated_at";

export const Route = createFileRoute("/api/public/v1/contacts/$id")({
  server: {
    handlers: {
      OPTIONS: () => preflight(),
      GET: withGateway({ requiredScopes: ["contacts:read"] }, async (ctx, req) => {
        const id = new URL(req.url).pathname.split("/").pop()!;
        const { data, error } = await ctx.supabase
          .from("contacts")
          .select(SELECT)
          .eq("organization_id", ctx.organizationId)
          .eq("id", id)
          .maybeSingle();
        if (error) return jsonError("internal_error", error.message, {}, ctx.requestId);
        if (!data) return jsonError("not_found", "Contact not found", {}, ctx.requestId);
        return jsonOk(data, { requestId: ctx.requestId });
      }),
      PATCH: withGateway({ requiredScopes: ["contacts:write"] }, async (ctx, req) => {
        const id = new URL(req.url).pathname.split("/").pop()!;
        const body = await parseJson<unknown>(req);
        const parsed = UpdateContactSchema.safeParse(body);
        if (!parsed.success) return jsonError("validation_error", "Invalid payload", { issues: parsed.error.issues }, ctx.requestId);
        const { data, error } = await ctx.supabase
          .from("contacts")
          .update(parsed.data)
          .eq("organization_id", ctx.organizationId)
          .eq("id", id)
          .select(SELECT)
          .maybeSingle();
        if (error) return jsonError("internal_error", error.message, {}, ctx.requestId);
        if (!data) return jsonError("not_found", "Contact not found", {}, ctx.requestId);
        return jsonOk(data, { requestId: ctx.requestId });
      }),
      DELETE: withGateway({ requiredScopes: ["contacts:write"] }, async (ctx, req) => {
        const id = new URL(req.url).pathname.split("/").pop()!;
        const { error, count } = await ctx.supabase
          .from("contacts")
          .delete({ count: "exact" })
          .eq("organization_id", ctx.organizationId)
          .eq("id", id);
        if (error) return jsonError("internal_error", error.message, {}, ctx.requestId);
        if (!count) return jsonError("not_found", "Contact not found", {}, ctx.requestId);
        return jsonOk({ id, deleted: true }, { requestId: ctx.requestId });
      }),
    },
  },
});
