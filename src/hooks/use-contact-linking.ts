import { invalidateContactCaches } from "@/lib/crm/contact-identity";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  searchWorkspaceContacts,
  relinkConversationContact,
  createContactAndLink,
  createWorkspaceContact,
  bulkRelinkConversationContacts,
  type ContactSearchResult,
} from "@/lib/inbox/contact-linking.functions";


export type { ContactSearchResult };

export function useContactSearch(
  workspaceId: string | undefined,
  q: string,
  enabled = true,
) {
  const fn = useServerFn(searchWorkspaceContacts);
  return useQuery({
    queryKey: ["inbox-contact-search", workspaceId, q],
    queryFn: () => fn({ data: { workspaceId: workspaceId!, q, limit: 20 } }),
    enabled: !!workspaceId && enabled,
    staleTime: 15_000,
  });
}

export function useRelinkConversationContact(workspaceId: string | undefined) {
  const fn = useServerFn(relinkConversationContact);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { conversationId: string; contactId: string }) =>
      fn({ data: { workspaceId: workspaceId!, ...v } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations", workspaceId] });
      invalidateContactCaches(qc);
    },
  });
}

export function useCreateContactAndLink(workspaceId: string | undefined) {
  const fn = useServerFn(createContactAndLink);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      conversationId: string;
      first_name?: string | null;
      last_name?: string | null;
      display_name?: string | null;
      phone?: string | null;
      email?: string | null;
    }) => fn({ data: { workspaceId: workspaceId!, ...v } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations", workspaceId] });
      invalidateContactCaches(qc);
    },
  });
}

export function useCreateWorkspaceContact(workspaceId: string | undefined) {
  const fn = useServerFn(createWorkspaceContact);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      first_name?: string | null;
      last_name?: string | null;
      display_name?: string | null;
      phone?: string | null;
      email?: string | null;
    }) => fn({ data: { workspaceId: workspaceId!, ...v } }),
    onSuccess: () => {
      invalidateContactCaches(qc);
    },
  });
}

export function useBulkRelinkConversations(workspaceId: string | undefined) {
  const fn = useServerFn(bulkRelinkConversationContacts);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { conversationIds: string[]; contactId: string }) =>
      fn({ data: { workspaceId: workspaceId!, ...v } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations", workspaceId] });
      invalidateContactCaches(qc);
    },
  });
}
