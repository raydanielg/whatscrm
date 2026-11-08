/**
 * Bulk operations endpoint.
 *
 * POST /api/public/v1/bulk
 *   { resource: "contacts" | "companies" | "deals", operation: "create" | "update" | "delete", records: [...] }
 *
 * Max 500 records per request. Returns per-record results.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withGateway, jsonOk, jsonError, parseJson, preflight } from "@/lib/api/gateway.server";
import { hasScope, type ApiScope } from "@/lib/api/scopes";
import { z } from "zod";
import { sanitizeRecord } from "@/lib/api/bulk-writable-columns";
import { findForeignReferences } from "@/lib/api/tenant-refs.server";
import { sbAny } from "@/lib/supabase/untyped";


const RESOURCE_CONFIG: Record<string, { table: string; read: ApiScope; write: ApiScope }> = {
  contacts: { table: "contacts", read: "contacts:read", write: "contacts:write" },
  companies: { table: "companies", read: "contacts:read", write: "contacts:write" },
  deals: { table: "deals", read: "deals:read", write: "deals:write" },
};
// Allow-list + sanitizer live in a dedicated module so security regression
// tests can import them without server-only route dependencies.


const BulkSchema = z.object({
  resource: z.enum(["contacts", "companies", "deals"]),
  operation: z.enum(["create", "update", "delete"]),
  records: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
});


export const Route = createFileRoute("/api/public/v1/bulk")({
  server: {
    handlers: {
      OPTIONS: () => preflight(),
      POST: withGateway(
        { requiredScopes: [], rateLimit: { limit: 30, windowSeconds: 60 } },
        async (ctx, req) => {
          const body = await parseJson<unknown>(req);
          const parsed = BulkSchema.safeParse(body);
          if (!parsed.success) {
            return jsonError("validation_error", "Invalid bulk payload", { issues: parsed.error.issues }, ctx.requestId);
          }
          const cfg = RESOURCE_CONFIG[parsed.data.resource];
          const requiredScope = parsed.data.operation === "create" || parsed.data.operation === "update" || parsed.data.operation === "delete"
            ? cfg.write
            : cfg.read;
          if (!hasScope(ctx.scopes, requiredScope)) {
            return jsonError("forbidden", `Missing scope: ${requiredScope}`, {}, ctx.requestId);
          }

          const results: Array<{ index: number; ok: boolean; id?: string; error?: string }> = [];
          const { records, operation } = parsed.data;

          if (operation === "create") {
            const rows: Record<string, unknown>[] = [];
            for (let i = 0; i < records.length; i++) {
              const { row, rejected } = sanitizeRecord(parsed.data.resource, records[i] as Record<string, unknown>, { allowId: false });
              if (rejected.length) {
                return jsonError(
                  "validation_error",
                  `Record ${i} contains fields that cannot be written: ${rejected.join(", ")}`,
                  { index: i, rejected },
                  ctx.requestId,
                );
              }
              // Referenced records (contact/company/pipeline/stage/owner) must
              // belong to the caller's own tenant.
              const foreign = await findForeignReferences(ctx.supabase, ctx.organizationId, row);
              if (foreign.length) {
                return jsonError(
                  "validation_error",
                  `Record ${i} references records outside this organization: ${foreign.join(", ")}`,
                  { index: i, fields: foreign },
                  ctx.requestId,
                );
              }
              rows.push({ ...row, organization_id: ctx.organizationId });

            }
            const { data, error } = await sbAny(ctx.supabase).from(cfg.table).insert(rows).select("id");
            if (error) return jsonError("internal_error", error.message, {}, ctx.requestId);
            (data ?? []).forEach((row: any, i: number) => results.push({ index: i, ok: true, id: row.id }));
          } else if (operation === "update") {
            for (let i = 0; i < records.length; i++) {
              const rec = records[i] as Record<string, unknown>;
              const id = rec.id as string | undefined;
              if (!id) { results.push({ index: i, ok: false, error: "missing id" }); continue; }
              const { row, rejected } = sanitizeRecord(parsed.data.resource, rec, { allowId: true });
              if (rejected.length) {
                results.push({ index: i, ok: false, id, error: `fields not writable: ${rejected.join(", ")}` });
                continue;
              }
              const foreignUpd = await findForeignReferences(ctx.supabase, ctx.organizationId, row);
              if (foreignUpd.length) {
                results.push({ index: i, ok: false, id, error: `references outside organization: ${foreignUpd.join(", ")}` });
                continue;
              }
              if (Object.keys(row).length === 0) {
                results.push({ index: i, ok: false, id, error: "no writable fields provided" });
                continue;
              }

              const { error } = await ctx.supabase
                .from(cfg.table)
                .update(row)
                .eq("organization_id", ctx.organizationId)
                .eq("id", id);
              results.push({ index: i, ok: !error, id, error: error?.message });
            }

          } else if (operation === "delete") {
            const ids = records.map((r) => (r as any).id).filter(Boolean) as string[];
            const { error } = await ctx.supabase
              .from(cfg.table)
              .delete()
              .eq("organization_id", ctx.organizationId)
              .in("id", ids);
            if (error) return jsonError("internal_error", error.message, {}, ctx.requestId);
            ids.forEach((id, i) => results.push({ index: i, ok: true, id }));
          }

          const succeeded = results.filter((r) => r.ok).length;
          return jsonOk(
            { results, summary: { total: records.length, succeeded, failed: records.length - succeeded } },
            { status: 207, requestId: ctx.requestId },
          );
        },
      ),
    },
  },
});
