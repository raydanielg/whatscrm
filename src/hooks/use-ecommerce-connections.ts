import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace, resolveWorkspaceId } from "@/hooks/use-workspace";
import { sbAny } from "@/lib/supabase/untyped";

export type EcommercePlatform = "shopify" | "woocommerce" | "wordpress" | "custom";
export type EcommerceStatus = "connected" | "disconnected" | "error" | "syncing";

export type EcommerceConnection = {
  id: string;
  workspace_id: string;
  platform: EcommercePlatform;
  name: string;
  store_url: string;
  credentials: Record<string, string>;
  sync_settings: Record<string, boolean>;
  status: EcommerceStatus;
  last_error: string | null;
  last_sync_at: string | null;
  products_synced: number;
  orders_synced: number;
  customers_synced: number;
  created_at: string;
  updated_at: string;
};

export type EcommerceSyncLog = {
  id: string;
  connection_id: string;
  resource: string;
  direction: string;
  status: string;
  items_processed: number;
  items_failed: number;
  message: string | null;
  started_at: string;
  finished_at: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (t: string) => sbAny(supabase).from(t as any) as any;

export type ConnectionInput = {
  id?: string;
  platform: EcommercePlatform;
  name: string;
  store_url: string;
  credentials: Record<string, string>;
  sync_settings?: Record<string, boolean>;
};

export function useEcommerceConnections() {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  return useQuery<EcommerceConnection[]>({
    queryKey: ["ecommerce-connections", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await db("ecommerce_connections")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EcommerceConnection[];
    },
  });
}

export function useEcommerceSyncLogs(connectionId?: string) {
  return useQuery<EcommerceSyncLog[]>({
    queryKey: ["ecommerce-sync-logs", connectionId],
    enabled: !!connectionId,
    queryFn: async () => {
      const { data, error } = await db("ecommerce_sync_logs")
        .select("*")
        .eq("connection_id", connectionId)
        .order("started_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data ?? []) as EcommerceSyncLog[];
    },
  });
}

function normalizeUrl(url: string) {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function validateConnection(input: ConnectionInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) errors.name = "Store name is required";
  if (!normalizeUrl(input.store_url)) errors.store_url = "Store URL is required";
  else if (!/^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(normalizeUrl(input.store_url)))
    errors.store_url = "Enter a valid URL, e.g. https://mystore.com";

  if (input.platform === "shopify" && !input.credentials.access_token?.trim())
    errors.access_token = "Admin API access token is required";
  if (input.platform === "woocommerce") {
    if (!input.credentials.consumer_key?.trim()) errors.consumer_key = "Consumer key is required";
    if (!input.credentials.consumer_secret?.trim()) errors.consumer_secret = "Consumer secret is required";
  }
  if (input.platform === "wordpress") {
    if (!input.credentials.username?.trim()) errors.username = "WordPress username is required";
    if (!input.credentials.app_password?.trim()) errors.app_password = "Application password is required";
  }
  return errors;
}

export function useSaveEcommerceConnection() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: ConnectionInput) => {
      const workspaceId = await resolveWorkspaceId(active?.id);
      if (!workspaceId)
        throw new Error("No workspace is available for your account yet. Create a workspace in Settings first.");
      const errors = validateConnection(input);
      const first = Object.values(errors)[0];
      if (first) throw new Error(first);
      const payload = {
        workspace_id: workspaceId,
        platform: input.platform,
        name: input.name.trim(),
        store_url: normalizeUrl(input.store_url),
        credentials: input.credentials,
        sync_settings: input.sync_settings ?? { products: true, orders: true, customers: false },
      };
      if (input.id) {
        const { data, error } = await db("ecommerce_connections")
          .update(payload).eq("id", input.id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await db("ecommerce_connections")
        .insert({ ...payload, status: "disconnected" }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ecommerce-connections"] }),
  });
}

export function useDeleteEcommerceConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db("ecommerce_connections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ecommerce-connections"] }),
  });
}
