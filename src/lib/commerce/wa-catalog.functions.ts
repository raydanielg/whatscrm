import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import {
  metaFetch,
  retailerIdFor,
  mapProductToMeta,
  resolveWaCatalogCredentials,
  bumpCatalogAnalytics,
  awaitBatchResult,
  lookupCatalogItems,
  fetchAllCatalogItems,
  parseMetaPrice,
  missingCatalogFields,
  waChatLink,
} from "@/lib/commerce/wa-catalog.server";
import { sbAny } from "@/lib/supabase/untyped";
import { resolveWorkspaceCurrency } from "@/lib/currency/resolve.server";

const ws = z.object({ workspaceId: z.string().uuid() });

// ============ CONFIG ============
export const getCatalogConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => ws.parse(d))
  .handler(async ({ data, context }) => {
    // Only workspace owners and admins can read the catalog config to prevent token exposure.
    const { data: cfg, error } = await context.supabase
      .from("wa_catalog_config")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();

    if (error) throw error;
    if (!cfg) return null;

    return cfg;
  });

/**
 * The workspace's WhatsApp Cloud numbers, so Settings can offer a picker
 * instead of a free-text Phone Number ID. A mistyped id silently pointed the
 * catalog at another account's token.
 */
export const listCatalogPhoneNumbers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => ws.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await sbAny(context.supabase)
      .from("channel_accounts")
      .select(
        "id, display_name, phone_number, phone_number_id, waba_id, business_id, status, is_default",
      )
      .eq("workspace_id", data.workspaceId)
      .eq("provider", "whatsapp_cloud")
      .not("phone_number_id", "is", null)
      .order("is_default", { ascending: false });
    if (error) throw error;
    return (rows ?? []) as Array<{
      id: string;
      display_name: string | null;
      phone_number: string | null;
      phone_number_id: string;
      waba_id: string | null;
      business_id: string | null;
      status: string | null;
      is_default: boolean | null;
    }>;
  });

export const saveCatalogConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      workspaceId: string;
      catalog_id?: string;
      business_id?: string;
      phone_number_id?: string;
      currency?: string;
      auto_sync?: boolean;
      sync_images?: boolean;
      sync_inventory?: boolean;
      sync_prices?: boolean;
      default_category?: string;
    }) =>
      z
        .object({
          workspaceId: z.string().uuid(),
          catalog_id: z.string().max(64).optional(),
          business_id: z.string().max(64).optional(),
          phone_number_id: z.string().max(64).optional(),
          currency: z.string().length(3).optional(),
          auto_sync: z.boolean().optional(),
          sync_images: z.boolean().optional(),
          sync_inventory: z.boolean().optional(),
          sync_prices: z.boolean().optional(),
          default_category: z.string().max(120).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const row = {
      workspace_id: data.workspaceId,
      catalog_id: data.catalog_id ?? null,
      business_id: data.business_id ?? null,
      phone_number_id: data.phone_number_id ?? null,
      currency: data.currency ?? (await resolveWorkspaceCurrency(data.workspaceId)),
      auto_sync: data.auto_sync ?? false,
      sync_images: data.sync_images ?? true,
      sync_inventory: data.sync_inventory ?? true,
      sync_prices: data.sync_prices ?? true,
      default_category: data.default_category ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error } = await context.supabase
      .from("wa_catalog_config")
      .upsert(row, { onConflict: "workspace_id" })
      .select()
      .single();
    if (error) throw error;

    const { recordServerAuditEvent } = await import("@/lib/security/audit.server");
    void recordServerAuditEvent({
      eventType: "secrets.rotate",
      severity: "warning",
      workspaceId: data.workspaceId,
      actorId: context.userId,
      resourceType: "wa_catalog_config",
      data: {
        has_catalog_id: !!data.catalog_id,
        has_business_id: !!data.business_id,
        has_phone_number_id: !!data.phone_number_id,
      },
    });

    return saved;
  });

// ============ SYNC ENGINE ============
type SyncKind = "full" | "products" | "categories" | "inventory" | "prices" | "images";

export const runCatalogSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; kind: SyncKind; productIds?: string[] }) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        kind: z.enum(["full", "products", "categories", "inventory", "prices", "images"]),
        productIds: z.array(z.string().uuid()).max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { workspaceId, kind, productIds } = data;
    const { data: cfg } = await context.supabase
      .from("wa_catalog_config")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    const { data: log } = await context.supabase
      .from("wa_catalog_sync_log")
      .insert({ workspace_id: workspaceId, kind, status: "running", triggered_by: context.userId })
      .select()
      .single();

    const finish = async (patch: Record<string, unknown>) => {
      if (!log?.id) return;
      await sbAny(context.supabase)
        .from("wa_catalog_sync_log")
        .update({ ...patch, finished_at: new Date().toISOString() })
        .eq("id", log.id);
    };

    try {
      let q = context.supabase
        .from("products")
        .select(
          "id, name, description, sku, retailer_id, price, sale_price, currency, category, image_url, images, gallery, stock_quantity, wa_visibility, brand_id, category_id",
        )
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .limit(500);
      if (productIds && productIds.length) q = q.in("id", productIds);
      const { data: prods, error: pErr } = await q;
      if (pErr) throw pErr;
      const products = prods ?? [];

      const { token, tokenSource, problem } = await resolveWaCatalogCredentials(workspaceId, cfg);
      const canPush = !!(token && cfg?.catalog_id);

      // Nothing can reach Meta. Report why instead of a local "success" that
      // looked like a working catalog while no product was ever published.
      if (!canPush) {
        const reason = !cfg?.catalog_id
          ? "No Catalog ID is set. Add it in Settings."
          : (problem ?? "No WhatsApp access token is configured.");
        await sbAny(context.supabase)
          .from("wa_catalog_config")
          .update({ last_sync_status: "not_configured", last_sync_error: reason })
          .eq("workspace_id", workspaceId);
        await finish({
          status: "not_configured",
          total_items: products.length,
          succeeded: 0,
          failed: 0,
          error: reason,
          details: { canPush: false, kind, tokenSource: null },
        });
        return {
          ok: false,
          total: products.length,
          succeeded: 0,
          failed: 0,
          canPush: false,
          reason,
          error: reason,
        };
      }
      // Published to Meta against every product, so it must not default to USD.
      const catalogFallbackCurrency = await resolveWorkspaceCurrency(workspaceId);

      let succeeded = 0;
      let failed = 0;
      let batchHandles = 0;
      const metaResponses: string[] = [];
      const lookupErrors: string[] = [];
      const errors: string[] = [];

      const markProduct = (id: string, patch: Record<string, unknown>) =>
        sbAny(context.supabase).from("products").update(patch).eq("id", id);

      // Build Meta batch requests (up to 100 items per call)
      if (products.length && kind !== "categories") {
        // Meta needs brand and category as names; the product row only holds ids.
        const lookupNames = async (table: string, ids: unknown[]) => {
          const uniq = Array.from(new Set(ids.filter(Boolean))) as string[];
          if (!uniq.length) return new Map<string, string>();
          const { data: rows } = await sbAny(context.supabase)
            .from(table)
            .select("id, name")
            .in("id", uniq);
          return new Map(((rows ?? []) as any[]).map((r) => [r.id as string, r.name as string]));
        };
        const brandNames = await lookupNames(
          "commerce_brands",
          products.map((p: any) => p.brand_id),
        );
        const categoryNames = await lookupNames(
          "product_categories",
          products.map((p: any) => p.category_id),
        );

        const { data: sender } = await sbAny(context.supabase)
          .from("channel_accounts")
          .select("phone_number")
          .eq("workspace_id", workspaceId)
          .eq("phone_number_id", cfg?.phone_number_id ?? "")
          .maybeSingle();

        const prepared = products.map((p: any) => {
          const enriched = {
            ...p,
            brand_name: brandNames.get(p.brand_id) ?? null,
            category_name: categoryNames.get(p.category_id) ?? null,
          };
          const item = mapProductToMeta(
            enriched,
            cfg,
            catalogFallbackCurrency,
            waChatLink((sender as any)?.phone_number, p.name),
          );
          return { p, item, missing: missingCatalogFields(item) };
        });

        // Items missing a required field never reach Meta; say exactly what to add
        // instead of letting them vanish inside Meta's async batch processing.
        for (const { p, missing } of prepared.filter((x) => x.missing.length)) {
          failed += 1;
          const msg = `Missing for WhatsApp catalog: ${missing.join(", ")}.`;
          errors.push(`${p.name}: ${msg}`);
          await markProduct(p.id, { wa_catalog_status: "error", wa_catalog_error: msg });
        }
        const sendable = prepared.filter((x) => !x.missing.length);

        for (let i = 0; i < sendable.length; i += 100) {
          const chunk = sendable.slice(i, i + 100);
          const batch = chunk.map((x) => x.p);
          const requests = chunk.map(({ item: { retailer_id, ...data } }) => ({
            method: "UPDATE",
            // Meta rejects the whole item when retailer_id is repeated inside `data`.
            retailer_id,
            data,
          }));
          try {
            const res = await metaFetch(`/${cfg!.catalog_id}/batch`, token!, {
              method: "POST",
              body: JSON.stringify({ requests }),
            });
            // Kept in the sync log so an unexpected Meta answer can be diagnosed.
            metaResponses.push(JSON.stringify(res).slice(0, 1500));
            const handles = ((res?.handles ?? []) as string[]).filter(Boolean);
            batchHandles += handles.length;
            // Meta rejects malformed items up front in `validation_status`
            // instead of queueing them, so those never get a handle.
            const rejected = new Map<string, string>();
            for (const v of (res?.validation_status ?? []) as any[]) {
              const msgs = ((v?.errors ?? []) as any[])
                .map((e) => e?.message)
                .filter(Boolean)
                .join("; ");
              if (v?.retailer_id && msgs) rejected.set(String(v.retailer_id), msgs);
            }
            const result = await awaitBatchResult(cfg!.catalog_id!, token!, handles, requests);
            errors.push(...result.general);
            // Batch status still open: check the catalog itself for the items.
            const inCatalog = result.done
              ? null
              : await lookupCatalogItems(
                  cfg!.catalog_id!,
                  token!,
                  requests.map((r) => r.retailer_id),
                ).catch((e: any) => {
                  lookupErrors.push(String(e?.message ?? e).slice(0, 300));
                  return null;
                });
            const now = new Date().toISOString();
            for (const p of batch) {
              const rid = retailerIdFor(p as any);
              const listed = inCatalog?.get(rid);
              const itemError =
                rejected.get(rid) ??
                result.errors.get(rid) ??
                listed?.rejection ??
                // No handle and not in the catalog: Meta never took the item.
                (!handles.length && !listed
                  ? "Meta did not accept this item (no batch handle returned)."
                  : null);
              if (itemError) {
                failed += 1;
                errors.push(`${(p as any).name}: ${itemError}`);
                await markProduct((p as any).id, {
                  wa_catalog_status: "error",
                  wa_catalog_error: itemError.slice(0, 400),
                });
              } else if (!result.done && !listed) {
                // Still queued at Meta: neither confirmed nor rejected yet.
                failed += 1;
                errors.push(
                  `${(p as any).name}: Meta is still processing — run sync again to confirm.`,
                );
                await markProduct((p as any).id, {
                  wa_catalog_status: "staged",
                  wa_catalog_error: "Meta is still processing this item.",
                });
              } else {
                succeeded += 1;
                await markProduct((p as any).id, {
                  wa_catalog_status: "synced",
                  wa_catalog_synced_at: now,
                  wa_catalog_error: null,
                });
              }
              // Also set retailer_id where missing
              await sbAny(context.supabase)
                .from("products")
                .update({ retailer_id: rid })
                .eq("id", (p as any).id)
                .is("retailer_id", null);
            }
          } catch (e: any) {
            failed += batch.length;
            errors.push(e?.message ?? String(e));
            await sbAny(context.supabase)
              .from("products")
              .update({
                wa_catalog_status: "error",
                wa_catalog_error: (e?.message ?? "sync failed").slice(0, 400),
              })
              .in(
                "id",
                batch.map((b) => b.id),
              );
          }
        }
      }

      // "partial" only when some items made it; nothing published is an error.
      const status = !failed ? "ok" : succeeded ? "partial" : "error";
      const errorText = errors.slice(0, 3).join(" | ") || null;

      await sbAny(context.supabase)
        .from("wa_catalog_config")
        .update({
          last_full_sync_at: kind === "full" ? new Date().toISOString() : cfg?.last_full_sync_at,
          last_sync_status: status,
          last_sync_error: errorText,
        })
        .eq("workspace_id", workspaceId);

      await finish({
        status: status === "ok" ? "success" : status,
        total_items: products.length,
        succeeded,
        failed,
        error: errorText,
        // Secret NAME only, so a wrong-account token is visible in the log.
        details: { canPush, kind, tokenSource, batchHandles, metaResponses, lookupErrors },
      });
      return {
        ok: !failed,
        total: products.length,
        succeeded,
        failed,
        canPush,
        reason: null,
        error: errorText,
      };
    } catch (e: any) {
      await finish({ status: "error", error: (e?.message ?? String(e)).slice(0, 500) });
      throw e;
    }
  });

const META_AVAILABILITY: Record<string, string> = {
  "in stock": "in_stock",
  "available for order": "in_stock",
  "out of stock": "out_of_stock",
  preorder: "preorder",
  discontinued: "discontinued",
};

/**
 * Pull items that exist only in Meta (added in Commerce Manager) into the
 * workspace's products. Items already linked to a local product are left
 * alone: WACRM is the source of truth for those and the next push would
 * overwrite whatever an import changed.
 */
export const importFromMetaCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => ws.parse(d))
  .handler(async ({ data, context }) => {
    const { workspaceId } = data;
    const { data: cfg } = await context.supabase
      .from("wa_catalog_config")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    const { token, problem } = await resolveWaCatalogCredentials(workspaceId, cfg);
    if (!cfg?.catalog_id || !token) {
      const reason = !cfg?.catalog_id
        ? "No Catalog ID is set. Add it in Settings."
        : (problem ?? "No WhatsApp access token is configured.");
      return { ok: false, total: 0, imported: 0, linked: 0, failed: 0, error: reason };
    }

    const { data: log } = await context.supabase
      .from("wa_catalog_sync_log")
      .insert({
        workspace_id: workspaceId,
        kind: "import",
        status: "running",
        triggered_by: context.userId,
      })
      .select()
      .single();
    const finish = async (patch: Record<string, unknown>) => {
      if (!log?.id) return;
      await sbAny(context.supabase)
        .from("wa_catalog_sync_log")
        .update({ ...patch, finished_at: new Date().toISOString() })
        .eq("id", log.id);
    };

    try {
      const items = (await fetchAllCatalogItems(cfg.catalog_id, token)).filter(
        (i) => i?.retailer_id,
      );

      const { data: localRows, error: lErr } = await sbAny(context.supabase)
        .from("products")
        .select("id, sku, retailer_id")
        // Deleted products count too, so an import never brings them back.
        .eq("workspace_id", workspaceId)
        .limit(5000);
      if (lErr) throw lErr;
      const local = new Map<string, { id: string; retailer_id: string | null }>();
      for (const p of (localRows ?? []) as any[]) local.set(retailerIdFor(p), p);

      const { data: brandRows } = await sbAny(context.supabase)
        .from("commerce_brands")
        .select("id, name")
        .eq("workspace_id", workspaceId);
      const brands = new Map<string, string>(
        ((brandRows ?? []) as any[]).map((b) => [String(b.name).trim().toLowerCase(), b.id]),
      );
      const brandIdFor = async (name: unknown) => {
        const label = typeof name === "string" ? name.trim() : "";
        if (!label) return null;
        const key = label.toLowerCase();
        if (brands.has(key)) return brands.get(key)!;
        const { data: created } = await sbAny(context.supabase)
          .from("commerce_brands")
          .insert({ workspace_id: workspaceId, name: label })
          .select("id")
          .single();
        if (created?.id) brands.set(key, created.id);
        return (created?.id as string | undefined) ?? null;
      };

      const fallbackCurrency = cfg.currency || (await resolveWorkspaceCurrency(workspaceId));
      const now = new Date().toISOString();
      let imported = 0;
      let linked = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const item of items) {
        const rid = String(item.retailer_id);
        const match = local.get(rid);
        if (match) {
          // Same item on both sides; record the link if it was only implied.
          if (!match.retailer_id) {
            await sbAny(context.supabase)
              .from("products")
              .update({ retailer_id: rid })
              .eq("id", match.id);
          }
          linked += 1;
          continue;
        }

        const price = parseMetaPrice(item.price) ?? 0;
        const sale = parseMetaPrice(item.sale_price);
        const stock = Number.isFinite(Number(item.inventory)) ? Number(item.inventory) : null;
        const { error } = await sbAny(context.supabase)
          .from("products")
          .insert({
            workspace_id: workspaceId,
            name: item.name || rid,
            description: item.description ?? null,
            category: item.category ?? null,
            price,
            sale_price: sale != null && sale > 0 && sale < price ? sale : null,
            currency: item.currency || fallbackCurrency,
            image_url: item.image_url ?? null,
            images: Array.isArray(item.additional_image_urls) ? item.additional_image_urls : [],
            stock_quantity: stock,
            track_inventory: stock != null,
            availability: META_AVAILABILITY[String(item.availability ?? "")] ?? "in_stock",
            brand_id: await brandIdFor(item.brand),
            sku: rid,
            retailer_id: rid,
            wa_catalog_status: "synced",
            wa_catalog_synced_at: now,
            metadata: { source: "meta_catalog", meta_product_id: item.id, meta_url: item.url },
            created_by: context.userId,
          });
        if (error) {
          failed += 1;
          errors.push(`${item.name || rid}: ${error.message}`);
        } else {
          imported += 1;
        }
      }

      const errorText = errors.slice(0, 3).join(" | ") || null;
      await finish({
        status: failed ? (imported ? "partial" : "error") : "success",
        total_items: items.length,
        succeeded: imported + linked,
        failed,
        error: errorText,
        details: { kind: "import", imported, linked },
      });
      return { ok: !failed, total: items.length, imported, linked, failed, error: errorText };
    } catch (e: any) {
      await finish({ status: "error", error: (e?.message ?? String(e)).slice(0, 500) });
      throw e;
    }
  });

export const listSyncLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => ws.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("wa_catalog_sync_log")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("started_at", { ascending: false })
      .limit(25);
    return rows ?? [];
  });

// ============ CATALOG PREVIEW & SEARCH ============
export const previewCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; search?: string; limit?: number }) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        search: z.string().max(120).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = sbAny(context.supabase)
      .from("products")
      .select(
        "id, name, sku, retailer_id, price, sale_price, currency, image_url, stock_quantity, wa_catalog_status, wa_catalog_error, wa_catalog_synced_at, wa_visibility, is_featured",
      )
      .eq("workspace_id", data.workspaceId)
      .eq("is_active", true)
      .order("is_featured", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(data.limit ?? 60);
    if (data.search) q = q.ilike("name", `%${sanitizeSearchTerm(data.search)}%`);
    const { data: rows } = await q;
    return rows ?? [];
  });

// ============ COLLECTIONS ============
export const listCollections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => ws.parse(d))
  .handler(async ({ data, context }) => {
    const { data: cols, error } = await context.supabase
      .from("wa_catalog_collections")
      .select("*, wa_catalog_collection_items(product_id)")
      .eq("workspace_id", data.workspaceId)
      .order("sort_order");
    if (error) throw error;
    return cols ?? [];
  });

export const upsertCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      workspaceId: string;
      id?: string;
      name: string;
      description?: string;
      cover_url?: string;
      is_featured?: boolean;
      sort_order?: number;
      productIds?: string[];
    }) =>
      z
        .object({
          workspaceId: z.string().uuid(),
          id: z.string().uuid().optional(),
          name: z.string().min(1).max(120),
          description: z.string().max(1000).optional(),
          cover_url: z.string().url().optional().or(z.literal("")),
          is_featured: z.boolean().optional(),
          sort_order: z.number().int().optional(),
          productIds: z.array(z.string().uuid()).max(200).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const row = {
      workspace_id: data.workspaceId,
      name: data.name,
      description: data.description ?? null,
      cover_url: data.cover_url || null,
      is_featured: data.is_featured ?? false,
      sort_order: data.sort_order ?? 0,
      updated_at: new Date().toISOString(),
    };
    let colId = data.id;
    if (colId) {
      const { error } = await sbAny(context.supabase)
        .from("wa_catalog_collections")
        .update(row)
        .eq("id", colId);
      if (error) throw error;
    } else {
      const { data: ins, error } = await sbAny(context.supabase)
        .from("wa_catalog_collections")
        .insert(row)
        .select("id")
        .single();
      if (error) throw error;
      colId = ins.id;
    }
    if (data.productIds) {
      await sbAny(context.supabase)
        .from("wa_catalog_collection_items")
        .delete()
        .eq("collection_id", colId);
      if (data.productIds.length) {
        await sbAny(context.supabase)
          .from("wa_catalog_collection_items")
          .insert(
            data.productIds.map((pid, i) => ({
              collection_id: colId!,
              product_id: pid,
              workspace_id: data.workspaceId,
              sort_order: i,
            })),
          );
      }
    }
    return { id: colId };
  });

export const deleteCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; workspaceId: string }) =>
    z.object({ id: z.string().uuid(), workspaceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase)
      .from("wa_catalog_collections")
      .delete()
      .eq("id", data.id)
      .eq("workspace_id", data.workspaceId);
    if (error) throw error;
    return { ok: true };
  });

// ============ SHARE / MULTI-PRODUCT MESSAGES ============
export const sendCatalogMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      workspaceId: string;
      to: string;
      bodyText: string;
      productIds: string[];
      collectionId?: string;
      header?: string;
      footer?: string;
    }) =>
      z
        .object({
          workspaceId: z.string().uuid(),
          to: z.string().min(6).max(32),
          bodyText: z.string().min(1).max(1024),
          productIds: z.array(z.string().uuid()).min(1).max(30),
          collectionId: z.string().uuid().optional(),
          header: z.string().max(60).optional(),
          footer: z.string().max(60).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: cfg } = await context.supabase
      .from("wa_catalog_config")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    const { data: prods } = await sbAny(context.supabase)
      .from("products")
      .select("id, sku, retailer_id")
      .in("id", data.productIds)
      .eq("workspace_id", data.workspaceId);
    const items = (prods ?? []).map((p) => ({
      product_retailer_id: p.retailer_id ?? p.sku ?? `wdf_${p.id.slice(0, 12)}`,
    }));

    const { token, phoneNumberId, problem } = await resolveWaCatalogCredentials(
      data.workspaceId,
      cfg,
    );
    if (!token || !phoneNumberId || !cfg?.catalog_id) {
      const reason = !cfg?.catalog_id
        ? "No Catalog ID is set. Add it in Settings."
        : !phoneNumberId
          ? "No WhatsApp number is selected. Choose one in Settings."
          : (problem ?? "WhatsApp Cloud API credentials not configured.");
      return { ok: false, staged: true, reason };
    }

    const useMulti = items.length > 1;
    const payload = useMulti
      ? {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: data.to,
          type: "interactive",
          interactive: {
            type: "product_list",
            header: { type: "text", text: (data.header || "Featured products").slice(0, 60) },
            body: { text: data.bodyText },
            footer: data.footer ? { text: data.footer } : undefined,
            action: {
              catalog_id: cfg.catalog_id,
              sections: [{ title: "Products", product_items: items.slice(0, 30) }],
            },
          },
        }
      : {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: data.to,
          type: "interactive",
          interactive: {
            type: "product",
            body: { text: data.bodyText },
            footer: data.footer ? { text: data.footer } : undefined,
            action: {
              catalog_id: cfg.catalog_id,
              product_retailer_id: items[0].product_retailer_id,
            },
          },
        };

    const res = await metaFetch(`/${phoneNumberId}/messages`, token, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    // Log share as an analytics signal (incremental, not overwriting).
    for (const pid of data.productIds) {
      await bumpCatalogAnalytics(context.supabase, {
        workspaceId: data.workspaceId,
        productId: pid,
        field: "shares",
      });
    }

    return { ok: true, messageId: res?.messages?.[0]?.id ?? null };
  });

// ============ ANALYTICS ============
export const getCatalogAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; days?: number }) =>
    z
      .object({ workspaceId: z.string().uuid(), days: z.number().int().min(1).max(180).optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const days = data.days ?? 30;
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const { data: rows } = await context.supabase
      .from("wa_catalog_analytics_daily")
      .select("date, views, shares, clicks, add_to_cart, orders, revenue, product_id")
      .eq("workspace_id", data.workspaceId)
      .gte("date", since);
    const totals = (rows ?? []).reduce(
      (acc, r) => {
        acc.views += r.views;
        acc.shares += r.shares;
        acc.clicks += r.clicks;
        acc.add_to_cart += r.add_to_cart;
        acc.orders += r.orders;
        acc.revenue += Number(r.revenue) || 0;
        return acc;
      },
      { views: 0, shares: 0, clicks: 0, add_to_cart: 0, orders: 0, revenue: 0 },
    );

    // Top products
    const byProd = new Map<
      string,
      { product_id: string; shares: number; orders: number; revenue: number }
    >();
    for (const r of rows ?? []) {
      if (!r.product_id) continue;
      const cur = byProd.get(r.product_id) ?? {
        product_id: r.product_id,
        shares: 0,
        orders: 0,
        revenue: 0,
      };
      cur.shares += r.shares;
      cur.orders += r.orders;
      cur.revenue += Number(r.revenue) || 0;
      byProd.set(r.product_id, cur);
    }
    const top = [...byProd.values()].sort((a, b) => b.shares - a.shares).slice(0, 10);
    const ids = top.map((t) => t.product_id);
    const { data: prods } = ids.length
      ? await sbAny(context.supabase).from("products").select("id, name, image_url").in("id", ids)
      : { data: [] as any[] };
    const topProducts = top.map((t) => ({
      ...t,
      product: (prods ?? []).find((p: any) => p.id === t.product_id) ?? null,
    }));

    return { totals, series: rows ?? [], topProducts };
  });

// ============ RECOMMENDATIONS ============
export const getRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; contactId?: string; limit?: number }) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        contactId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const limit = data.limit ?? 6;
    // Simple heuristic: featured + best-selling from analytics.
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { data: agg } = await context.supabase
      .from("wa_catalog_analytics_daily")
      .select("product_id, orders, shares")
      .eq("workspace_id", data.workspaceId)
      .gte("date", since);
    const score = new Map<string, number>();
    for (const r of agg ?? []) {
      if (!r.product_id) continue;
      score.set(r.product_id, (score.get(r.product_id) ?? 0) + r.orders * 3 + r.shares);
    }
    const topIds = [...score.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);

    let picks: any[] = [];
    if (topIds.length) {
      const { data: rows } = await sbAny(context.supabase)
        .from("products")
        .select("id, name, image_url, price, sale_price, retailer_id, sku")
        .eq("workspace_id", data.workspaceId)
        .in("id", topIds);
      picks = rows ?? [];
    }
    if (picks.length < limit) {
      const need = limit - picks.length;
      const { data: featured } = await sbAny(context.supabase)
        .from("products")
        .select("id, name, image_url, price, sale_price, retailer_id, sku")
        .eq("workspace_id", data.workspaceId)
        .eq("is_active", true)
        .eq("is_featured", true)
        .limit(need);
      const have = new Set(picks.map((p) => p.id));
      for (const f of featured ?? []) if (!have.has(f.id)) picks.push(f);
    }
    return picks.slice(0, limit);
  });
