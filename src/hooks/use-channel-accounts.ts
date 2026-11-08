/**
 * React Query hooks for WhatsApp Business Account management.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listChannelAccounts,
  connectChannelAccount,
  updateChannelAccount,
  disconnectChannelAccount,
  deleteChannelAccount,
  testChannelAccount,
  fetchBusinessProfile,
  updateBusinessProfile,
  listWabaPhoneNumbers,
} from "@/lib/messaging/accounts.functions";
import {
  parseChannelAccountsResponse,
  type ChannelAccountsResult,
} from "@/lib/messaging/channel-account-schema";

export interface ChannelAccountRow {
  id: string;
  workspace_id: string;
  inbox_id: string | null;
  provider: string;
  display_name: string;
  phone_number: string | null;
  phone_number_id: string | null;
  waba_id: string | null;
  business_id: string | null;
  access_token_secret_name: string | null;
  app_secret_name: string | null;
  verify_token: string | null;
  status: "pending" | "connected" | "disconnected" | "error" | "suspended";
  status_reason: string | null;
  metadata: Record<string, unknown>;
  is_default: boolean;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConnectInput {
  workspaceId: string;
  inboxId?: string;
  displayName: string;
  phoneNumber?: string;
  phoneNumberId: string;
  wabaId: string;
  businessId?: string;
  accessTokenSecretName: string;
  appSecretName?: string;
  verifyToken: string;
  isDefault?: boolean;
}

export interface UpdateInput {
  id: string;
  displayName?: string;
  inboxId?: string | null;
  accessTokenSecretName?: string;
  appSecretName?: string | null;
  verifyToken?: string;
  isDefault?: boolean;
}

export interface ProfileInput {
  id: string;
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  websites?: string[];
  vertical?: string;
}

export function useChannelAccounts(workspaceId: string | undefined) {
  const fn = useServerFn(listChannelAccounts);
  return useQuery({
    queryKey: ["channel-accounts", workspaceId],
    // Zod-validated at the client boundary too: a malformed or foreign-shaped
    // payload (stale cache, partial deploy) degrades to an empty, iterable
    // result instead of throwing into the inbox error boundary.
    queryFn: async (): Promise<ChannelAccountsResult> =>
      parseChannelAccountsResponse(await fn({ data: { workspaceId: workspaceId! } })),
    enabled: !!workspaceId,
    staleTime: 15_000,
  });
}

export function useConnectChannelAccount(workspaceId: string | undefined) {
  const fn = useServerFn(connectChannelAccount);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConnectInput) => fn({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel-accounts", workspaceId] });
      toast.success("WhatsApp account connected. Verify to activate.");
    },
    onError: (e: Error) => toast.error(`Failed to connect: ${e.message}`),
  });
}

export function useUpdateChannelAccount(workspaceId: string | undefined) {
  const fn = useServerFn(updateChannelAccount);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateInput) => fn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channel-accounts", workspaceId] }),
    onError: (e: Error) => toast.error(`Failed to update: ${e.message}`),
  });
}

export function useDisconnectChannelAccount(workspaceId: string | undefined) {
  const fn = useServerFn(disconnectChannelAccount);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel-accounts", workspaceId] });
      toast.success("Disconnected");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteChannelAccount(workspaceId: string | undefined) {
  const fn = useServerFn(deleteChannelAccount);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel-accounts", workspaceId] });
      toast.success("Account removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useTestChannelAccount(workspaceId: string | undefined) {
  const fn = useServerFn(testChannelAccount);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fn({ data: { id } }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["channel-accounts", workspaceId] });
      if (result.ok) {
        toast.success("Connection healthy");
        return;
      }
      const diagnosis = "diagnosis" in result ? result.diagnosis : undefined;
      if (diagnosis) {
        toast.error(`Connection failed — ${diagnosis.fieldLabel}`, {
          description: `${diagnosis.fix}\n\nWhere to fix it: ${diagnosis.where}\nMeta said: ${diagnosis.raw}`,
          duration: 15000,
        });
      } else {
        toast.error(`Connection failed: ${result.error ?? "unknown"}`);
      }
    },
    onError: (e: Error) => toast.error(`Test failed: ${e.message}`),
  });
}

export function useFetchBusinessProfile() {
  const fn = useServerFn(fetchBusinessProfile);
  return useMutation({
    mutationFn: (id: string) => fn({ data: { id } }),
  });
}

export function useUpdateBusinessProfile(workspaceId: string | undefined) {
  const fn = useServerFn(updateBusinessProfile);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileInput) => fn({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel-accounts", workspaceId] });
      toast.success("Business profile updated");
    },
    onError: (e: Error) => toast.error(`Failed to update profile: ${e.message}`),
  });
}

export function useListWabaPhoneNumbers() {
  const fn = useServerFn(listWabaPhoneNumbers);
  return useMutation({
    mutationFn: (input: { wabaId: string; accessTokenSecretName: string }) => fn({ data: input }),
  });
}
