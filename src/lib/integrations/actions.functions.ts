/**
 * Client-callable server functions for integration actions.
 * The UI calls `runAction` — it never touches the runtime directly.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const inputSchema = z.object({
  providerId: z.string().min(1),
  capabilityId: z.string().min(1),
  workspaceId: z.string().uuid().optional(),
  config: z.record(z.union([z.string(), z.boolean()]).optional()).default({}),
  input: z.record(z.unknown()).default({}),
});

export const runIntegrationActionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => inputSchema.parse(raw))
  .handler(async ({ data, context }) => {
    // Ensure providers registered before dispatch.
    await import("./index");
    const { runIntegrationAction } = await import("./runtime.server");
    return runIntegrationAction({
      userId: context.userId,
      workspaceId: data.workspaceId,
      providerId: data.providerId,
      capabilityId: data.capabilityId,
      config: data.config as Record<string, string | boolean | undefined>,
      input: data.input as Record<string, unknown>,
    });
  });

export const listProvidersFn = createServerFn({ method: "GET" })
  .handler(async () => {
    await import("./index");
    const { listProviders } = await import("./core");
    // Strip icon (non-serializable) before returning to client.
    return listProviders().map(({ icon: _icon, ...rest }) => rest);
  });
