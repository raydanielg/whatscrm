/**
 * Reusable post library: saved drafts that can be copied into the composer
 * and scheduled again on any channel.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { sbAny } from "@/lib/supabase/untyped";
import type { SocialContentType, SocialMediaKind } from "@/hooks/use-social-publishing";

export type LibraryItem = {
  id: string;
  workspace_id: string;
  name: string;
  caption: string;
  media_urls: string[];
  link_url: string | null;
  first_comment: string | null;
  content_type: SocialContentType;
  media_kind: SocialMediaKind;
  poll_options: string[];
  poll_duration: number;
  allow_multi_vote: boolean;
  tags: string[];
  use_count: number;
  created_at: string;
  updated_at: string;
};

export type LibraryInput = Partial<LibraryItem> & { name: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => sbAny(supabase).from("social_post_library" as any) as any;

export function usePostLibrary() {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  return useQuery({
    queryKey: ["social-post-library", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<LibraryItem[]> => {
      const { data, error } = await db()
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LibraryItem[];
    },
  });
}

export function useSaveLibraryItem() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: LibraryInput) => {
      if (!active?.id) throw new Error("No workspace selected");
      const { data: auth } = await supabase.auth.getUser();
      const row = {
        workspace_id: active.id,
        name: input.name,
        caption: input.caption ?? "",
        media_urls: input.media_urls ?? [],
        link_url: input.link_url || null,
        first_comment: input.first_comment || null,
        content_type: input.content_type ?? "post",
        media_kind: input.media_kind ?? "none",
        poll_options: input.poll_options ?? [],
        poll_duration: input.poll_duration ?? 24,
        allow_multi_vote: input.allow_multi_vote ?? false,
        tags: input.tags ?? [],
        created_by: auth.user?.id ?? null,
      };
      if (input.id) {
        const { error } = await db().update(row).eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await db().insert(row).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["social-post-library"] }),
  });
}

export function useDeleteLibraryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["social-post-library"] }),
  });
}

/** Bump use_count when an item is copied into the composer. */
export function useMarkLibraryUsed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: LibraryItem) => {
      const { error } = await db()
        .update({ use_count: (item.use_count ?? 0) + 1 })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["social-post-library"] }),
  });
}
