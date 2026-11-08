import { invalidateContactCaches } from "@/lib/crm/contact-identity";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  attachIdentity,
  detachIdentity,
  findDuplicates,
  getIdentityConfig,
  listChannelIdentities,
  listMerges,
  mergeContacts,
  relationshipGraph,
  setIdentityConfig,
  splitMerge,
} from "@/lib/identity/identity.functions";
import { useCurrentWorkspace } from "@/hooks/use-workspace";

export function useIdentityConfig() {
  const { data: ws } = useCurrentWorkspace();
  const fn = useServerFn(getIdentityConfig);
  return useQuery({
    queryKey: ["identity-config", ws?.id],
    enabled: !!ws?.id,
    queryFn: () => fn({ data: { workspaceId: ws!.id } }),
  });
}

export function useSetIdentityConfig() {
  const qc = useQueryClient();
  const { data: ws } = useCurrentWorkspace();
  const fn = useServerFn(setIdentityConfig);
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      fn({ data: { workspaceId: ws!.id, ...patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["identity-config"] }),
  });
}

export function useDuplicateContacts(windowDays = 90) {
  const { data: ws } = useCurrentWorkspace();
  const fn = useServerFn(findDuplicates);
  return useQuery({
    queryKey: ["identity-duplicates", ws?.id, windowDays],
    enabled: !!ws?.id,
    queryFn: () => fn({ data: { workspaceId: ws!.id, windowDays } }),
  });
}

export function useChannelIdentities(contactId?: string) {
  const { data: ws } = useCurrentWorkspace();
  const fn = useServerFn(listChannelIdentities);
  return useQuery({
    queryKey: ["channel-identities", ws?.id, contactId],
    enabled: !!ws?.id && !!contactId,
    queryFn: () => fn({ data: { workspaceId: ws!.id, contactId: contactId! } }),
  });
}

export function useAttachIdentity() {
  const qc = useQueryClient();
  const { data: ws } = useCurrentWorkspace();
  const fn = useServerFn(attachIdentity);
  return useMutation({
    mutationFn: (v: {
      contactId: string;
      channel: string;
      externalId: string;
      displayName?: string;
    }) => fn({ data: { workspaceId: ws!.id, ...v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channel-identities"] }),
  });
}

export function useDetachIdentity() {
  const qc = useQueryClient();
  const { data: ws } = useCurrentWorkspace();
  const fn = useServerFn(detachIdentity);
  return useMutation({
    mutationFn: (identityId: string) => fn({ data: { workspaceId: ws!.id, identityId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channel-identities"] }),
  });
}

export function useMergeIdentityContacts() {
  const qc = useQueryClient();
  const { data: ws } = useCurrentWorkspace();
  const fn = useServerFn(mergeContacts);
  return useMutation({
    mutationFn: (v: { primaryContactId: string; duplicateContactIds: string[]; reason?: string }) =>
      fn({ data: { workspaceId: ws!.id, ...v } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["identity-duplicates"] });
      qc.invalidateQueries({ queryKey: ["identity-merges"] });
      invalidateContactCaches(qc);
    },
  });
}

export function useSplitMerge() {
  const qc = useQueryClient();
  const { data: ws } = useCurrentWorkspace();
  const fn = useServerFn(splitMerge);
  return useMutation({
    mutationFn: (mergeId: string) => fn({ data: { workspaceId: ws!.id, mergeId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["identity-merges"] });
      invalidateContactCaches(qc);
    },
  });
}

export function useIdentityMerges() {
  const { data: ws } = useCurrentWorkspace();
  const fn = useServerFn(listMerges);
  return useQuery({
    queryKey: ["identity-merges", ws?.id],
    enabled: !!ws?.id,
    queryFn: () => fn({ data: { workspaceId: ws!.id } }),
  });
}

export function useRelationshipGraph(contactId?: string) {
  const { data: ws } = useCurrentWorkspace();
  const fn = useServerFn(relationshipGraph);
  return useQuery({
    queryKey: ["identity-graph", ws?.id, contactId],
    enabled: !!ws?.id && !!contactId,
    queryFn: () => fn({ data: { workspaceId: ws!.id, contactId: contactId! } }),
  });
}
