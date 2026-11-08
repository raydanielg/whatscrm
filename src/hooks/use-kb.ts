import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listKbCategories, upsertKbCategory, deleteKbCategory,
  listKbArticles, getKbArticle, upsertKbArticle, deleteKbArticle,
  listKbArticleVersions, reindexKbArticle, reindexKbWorkspace,
  searchKb, generateKbAnswer, trackKbEvent, kbAnalyticsOverview,
  importKbFromStorage, suggestKbForConversation,
  type KbArticle, type KbCategory, type KbSearchHit, type KbStatus,
  type KbSourceType,
} from "@/lib/kb/kb.functions";

export type { KbArticle, KbCategory, KbSearchHit, KbStatus };

export interface UpsertCategoryInput {
  id?: string;
  workspaceId: string;
  parentId?: string | null;
  name: string;
  slug?: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
}

export interface UpsertArticleInput {
  id?: string;
  workspaceId: string;
  categoryId?: string | null;
  slug?: string;
  title: string;
  summary?: string | null;
  contentMd: string;
  status?: KbStatus;
  tags?: string[];
  keywords?: string[];
  isFaq?: boolean;
  faqQuestion?: string | null;
  isTraining?: boolean;
  language?: string;
  sourceType?: KbSourceType;
  sourceFilename?: string | null;
  sourcePath?: string | null;
  versionNote?: string;
}

export interface ImportKbInput {
  workspaceId: string;
  storagePath: string;
  filename: string;
  title?: string;
  categoryId?: string | null;
  extractedText: string;
  sourceType: "pdf" | "docx" | "markdown" | "txt" | "csv";
}

export function useKbCategories(workspaceId: string | undefined) {
  const fn = useServerFn(listKbCategories);
  return useQuery({
    queryKey: ["kb", "categories", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}

export function useUpsertKbCategory() {
  const qc = useQueryClient();
  const fn = useServerFn(upsertKbCategory);
  return useMutation({
    mutationFn: (input: UpsertCategoryInput) => fn({ data: input }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["kb", "categories", row.workspace_id] });
      toast.success("Category saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteKbCategory(workspaceId: string | undefined) {
  const qc = useQueryClient();
  const fn = useServerFn(deleteKbCategory);
  return useMutation({
    mutationFn: (id: string) => fn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kb", "categories", workspaceId] });
      toast.success("Category deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useKbArticles(workspaceId: string | undefined, filters?: {
  status?: KbStatus;
  categoryId?: string | null;
  search?: string;
  isFaq?: boolean;
}) {
  const fn = useServerFn(listKbArticles);
  return useQuery({
    queryKey: ["kb", "articles", workspaceId, filters],
    queryFn: () =>
      fn({
        data: {
          workspaceId: workspaceId!,
          status: filters?.status,
          categoryId: filters?.categoryId,
          search: filters?.search,
          isFaq: filters?.isFaq,
          limit: 200,
        },
      }),
    enabled: !!workspaceId,
    staleTime: 15_000,
  });
}

export function useKbArticle(id: string | undefined) {
  const fn = useServerFn(getKbArticle);
  return useQuery({
    queryKey: ["kb", "article", id],
    queryFn: () => fn({ data: { id: id! } }),
    enabled: !!id,
  });
}

export function useUpsertKbArticle() {
  const qc = useQueryClient();
  const fn = useServerFn(upsertKbArticle);
  const reindex = useServerFn(reindexKbArticle);
  return useMutation({
    mutationFn: async (input: UpsertArticleInput): Promise<KbArticle> => {
      const row = await fn({ data: input });
      if (row.needs_reindex) {
        reindex({ data: { articleId: row.id } }).catch(() => { /* non-fatal */ });
      }
      return row;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["kb", "articles", row.workspace_id] });
      qc.invalidateQueries({ queryKey: ["kb", "article", row.id] });
      toast.success(`Article ${row.status === "published" ? "published" : "saved"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteKbArticle(workspaceId: string | undefined) {
  const qc = useQueryClient();
  const fn = useServerFn(deleteKbArticle);
  return useMutation({
    mutationFn: (id: string) => fn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kb", "articles", workspaceId] });
      toast.success("Article deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useKbArticleVersions(articleId: string | undefined) {
  const fn = useServerFn(listKbArticleVersions);
  return useQuery({
    queryKey: ["kb", "versions", articleId],
    queryFn: () => fn({ data: { articleId: articleId! } }),
    enabled: !!articleId,
  });
}

export function useReindexKbArticle() {
  const qc = useQueryClient();
  const fn = useServerFn(reindexKbArticle);
  return useMutation({
    mutationFn: (articleId: string) => fn({ data: { articleId } }),
    onSuccess: (_, articleId) => {
      qc.invalidateQueries({ queryKey: ["kb", "article", articleId] });
      toast.success("Article reindexed");
    },
    onError: (e: Error) => toast.error(`Reindex failed: ${e.message}`),
  });
}

export function useReindexKbWorkspace() {
  const qc = useQueryClient();
  const fn = useServerFn(reindexKbWorkspace);
  return useMutation({
    mutationFn: (input: { workspaceId: string; force?: boolean }) =>
      fn({ data: { workspaceId: input.workspaceId, force: input.force ?? false, limit: 20 } }),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ["kb", "articles", vars.workspaceId] });
      toast.success(`Reindexed ${res.articles} article${res.articles === 1 ? "" : "s"} (${res.chunks} chunks)`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useSearchKb() {
  const fn = useServerFn(searchKb);
  return useMutation({
    mutationFn: (input: { workspaceId: string; query: string; onlyPublished?: boolean }) =>
      fn({
        data: {
          workspaceId: input.workspaceId,
          query: input.query,
          matchCount: 8,
          minSimilarity: 0.15,
          onlyPublished: input.onlyPublished ?? true,
        },
      }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useGenerateKbAnswer() {
  const fn = useServerFn(generateKbAnswer);
  return useMutation({
    mutationFn: (input: { workspaceId: string; question: string; conversationId?: string }) =>
      fn({ data: input }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useTrackKbEvent() {
  const fn = useServerFn(trackKbEvent);
  return useMutation({
    mutationFn: (input: {
      articleId: string;
      workspaceId: string;
      eventType: "view" | "helpful" | "unhelpful" | "suggested" | "search_hit";
      conversationId?: string;
      metadata?: Record<string, unknown>;
    }) => fn({ data: input }),
  });
}

export function useKbAnalytics(workspaceId: string | undefined) {
  const fn = useServerFn(kbAnalyticsOverview);
  return useQuery({
    queryKey: ["kb", "analytics", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}

export function useImportKbFromStorage() {
  const qc = useQueryClient();
  const fn = useServerFn(importKbFromStorage);
  const reindex = useServerFn(reindexKbArticle);
  return useMutation({
    mutationFn: async (input: ImportKbInput): Promise<KbArticle> => {
      const row = await fn({ data: input });
      reindex({ data: { articleId: row.id } }).catch(() => { /* non-fatal */ });
      return row;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["kb", "articles", row.workspace_id] });
      toast.success(`Imported "${row.title}"`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useSuggestKbForConversation() {
  const fn = useServerFn(suggestKbForConversation);
  return useMutation({
    mutationFn: (conversationId: string) => fn({ data: { conversationId, matchCount: 5 } }),
  });
}

// ==================== Collections & URL ingest & Timeseries ====================

import {
  listKbCollections, upsertKbCollection, deleteKbCollection,
  setKbCollectionArticles, listKbCollectionArticles,
  ingestKbFromUrl, kbAnalyticsTimeseries,
  type KbCollection,
} from "@/lib/kb/kb.functions";

export type { KbCollection };

export function useKbCollections(workspaceId: string | undefined) {
  const fn = useServerFn(listKbCollections);
  return useQuery({
    queryKey: ["kb", "collections", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    staleTime: 15_000,
  });
}

export function useUpsertKbCollection() {
  const qc = useQueryClient();
  const fn = useServerFn(upsertKbCollection);
  return useMutation({
    mutationFn: (input: { id?: string; workspaceId: string; name: string; description?: string | null; color?: string | null; icon?: string | null; isPublic?: boolean; }) =>
      fn({ data: input }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["kb", "collections", row.workspace_id] });
      toast.success("Collection saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteKbCollection() {
  const qc = useQueryClient();
  const fn = useServerFn(deleteKbCollection);
  return useMutation({
    mutationFn: (id: string) => fn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kb", "collections"] });
      toast.success("Collection deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useSetKbCollectionArticles() {
  const fn = useServerFn(setKbCollectionArticles);
  return useMutation({
    mutationFn: (input: { collectionId: string; workspaceId: string; articleIds: string[] }) =>
      fn({ data: input }),
    onSuccess: () => toast.success("Collection updated"),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useKbCollectionArticles(collectionId: string | undefined) {
  const fn = useServerFn(listKbCollectionArticles);
  return useQuery({
    queryKey: ["kb", "collection-articles", collectionId],
    queryFn: () => fn({ data: { collectionId: collectionId! } }),
    enabled: !!collectionId,
  });
}

export function useIngestKbFromUrl() {
  const qc = useQueryClient();
  const fn = useServerFn(ingestKbFromUrl);
  const reindex = useServerFn(reindexKbArticle);
  return useMutation({
    mutationFn: async (input: { workspaceId: string; url: string; categoryId?: string | null; autoPublish?: boolean }) => {
      const row = await fn({ data: input });
      reindex({ data: { articleId: row.id } }).catch(() => { /* non-fatal */ });
      return row;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["kb", "articles", row.workspace_id] });
      toast.success(`Ingested "${row.title}"`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useKbAnalyticsTimeseries(workspaceId: string | undefined, days = 30) {
  const fn = useServerFn(kbAnalyticsTimeseries);
  return useQuery({
    queryKey: ["kb", "analytics", "timeseries", workspaceId, days],
    queryFn: () => fn({ data: { workspaceId: workspaceId!, days } }),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}
