/** React Query hooks for WhatsApp template management. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { splitFriendlyMessage, isRetryableMessage } from "@/lib/messaging/meta-error-messages";
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  syncTemplates,
  previewTemplate,
  getTemplateAnalytics,
  uploadTemplateHeaderSample,
} from "@/lib/messaging/templates.functions";

export function useTemplates(workspaceId: string | undefined, channelAccountId?: string) {
  const list = useServerFn(listTemplates);
  return useQuery({
    queryKey: ["wa_templates", workspaceId, channelAccountId ?? "all"],
    enabled: Boolean(workspaceId),
    queryFn: () => list({ data: { workspaceId: workspaceId!, channelAccountId } }),
  });
}

export function useTemplate(id: string | undefined) {
  const get = useServerFn(getTemplate);
  return useQuery({
    queryKey: ["wa_template", id],
    enabled: Boolean(id),
    queryFn: () => get({ data: { id: id! } }),
  });
}

type CreateInput = {
  workspaceId: string; channelAccountId: string; name: string; language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  components: Array<Record<string, unknown>>; submit?: boolean;
};

/**
 * Server errors carry an actionable hint on a second line
 * (see `meta-error-messages.ts`); render it as the toast description.
 */
function toastServerError(e: unknown) {
  const raw = e instanceof Error ? e.message : String(e);
  const { title, description } = splitFriendlyMessage(raw || "Something went wrong");
  toast.error(title, description ? { description, duration: 10_000 } : undefined);
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  const fn = useServerFn(createTemplate);
  return useMutation({
    mutationFn: (input: CreateInput) => fn({ data: input }),
    onSuccess: (_r, vars) => {
      toast.success(vars.submit ? "Template submitted for approval" : "Draft saved");
      qc.invalidateQueries({ queryKey: ["wa_templates"] });
    },
    onError: (e: Error) => toastServerError(e),
  });
}

type UpdateInput = {
  id: string;
  name?: string;
  language?: string;
  category?: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  components?: Array<Record<string, unknown>>;
  resubmit?: boolean;
};

export function useUpdateTemplate() {
  const qc = useQueryClient();
  const fn = useServerFn(updateTemplate);
  return useMutation({
    mutationFn: (input: UpdateInput) => fn({ data: input }),
    onSuccess: () => {
      toast.success("Template updated");
      qc.invalidateQueries({ queryKey: ["wa_templates"] });
    },
    onError: (e: Error) => toastServerError(e),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  const fn = useServerFn(deleteTemplate);
  return useMutation({
    mutationFn: (id: string) => fn({ data: { id } }),
    onSuccess: () => {
      toast.success("Template deleted");
      qc.invalidateQueries({ queryKey: ["wa_templates"] });
    },
    onError: (e: Error) => toastServerError(e),
  });
}

export function useSyncTemplates() {
  const qc = useQueryClient();
  const fn = useServerFn(syncTemplates);
  return useMutation({
    mutationFn: (input: { workspaceId: string; channelAccountId: string }) => fn({ data: input }),
    onSuccess: (r) => {
      toast.success(`Synced ${r.synced} templates`);
      qc.invalidateQueries({ queryKey: ["wa_templates"] });
    },
    onError: (e: Error) => toastServerError(e),
  });
}

export function usePreviewTemplate() {
  const fn = useServerFn(previewTemplate);
  return useMutation({
    mutationFn: (input: { id: string; variables?: Record<string, string> }) => fn({ data: input }),
  });
}

export function useTemplateAnalytics(id: string | undefined) {
  const fn = useServerFn(getTemplateAnalytics);
  return useQuery({
    queryKey: ["wa_template_analytics", id],
    enabled: Boolean(id),
    queryFn: () => fn({ data: { id: id! } }),
  });
}

export type HeaderUploadPhase = "encoding" | "uploading" | "retrying" | "done";

export type HeaderUploadProgress = {
  phase: HeaderUploadPhase;
  percent: number;
  /** 1-based attempt number for the Meta upload request. */
  attempt: number;
  maxAttempts: number;
  /** Set on `retrying`: why the previous attempt failed. */
  reason?: string;
};

export class UploadCanceledError extends Error {
  constructor() {
    super("Upload canceled");
    this.name = "UploadCanceledError";
  }
}

/** Max automatic attempts for the Meta upload request (1 initial + 2 retries). */
export const HEADER_UPLOAD_MAX_ATTEMPTS = 3;

/** Network-level failures never reach Meta, so they are always worth retrying. */
function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}`.toLowerCase() : "";
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("typeerror")
  );
}

/** Upload a sample header media file to Meta and get back a header_handle. */
export function useUploadHeaderSample() {
  const fn = useServerFn(uploadTemplateHeaderSample);
  return useMutation({
    mutationFn: async (input: {
      workspaceId: string;
      channelAccountId: string;
      file: File;
      durationSeconds?: number;
      signal?: AbortSignal;
      onProgress?: (state: HeaderUploadProgress) => void;
    }) => {
      const { signal, onProgress } = input;
      const maxAttempts = HEADER_UPLOAD_MAX_ATTEMPTS;
      const abortIfNeeded = () => {
        if (signal?.aborted) throw new UploadCanceledError();
      };

      abortIfNeeded();
      onProgress?.({ phase: "encoding", percent: 0, attempt: 1, maxAttempts });

      const buf = new Uint8Array(await input.file.arrayBuffer());
      let bin = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < buf.length; i += CHUNK) {
        abortIfNeeded();
        bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
        // Encoding is the first third of the visible progress bar.
        const ratio = buf.length ? Math.min(1, (i + CHUNK) / buf.length) : 1;
        onProgress?.({ phase: "encoding", percent: Math.round(ratio * 30), attempt: 1, maxAttempts });
        // Yield so the progress bar can paint on large files.
        if (i % (CHUNK * 16) === 0) await new Promise((r) => setTimeout(r, 0));
      }

      const base64 = btoa(bin);

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        abortIfNeeded();
        onProgress?.({ phase: "uploading", percent: 30, attempt, maxAttempts });

        try {
          const res = await fn({
            data: {
              workspaceId: input.workspaceId,
              channelAccountId: input.channelAccountId,
              fileName: input.file.name,
              mimeType: input.file.type || "application/octet-stream",
              base64,
              ...(input.durationSeconds ? { durationSeconds: input.durationSeconds } : {}),
            },
            ...(signal ? { signal } : {}),
          });
          onProgress?.({ phase: "done", percent: 100, attempt, maxAttempts });
          return res;
        } catch (err) {
          if (signal?.aborted) throw new UploadCanceledError();
          const message = err instanceof Error ? err.message : String(err);
          const transient = isRetryableMessage(message) || isNetworkError(err);
          if (!transient || attempt === maxAttempts) throw err;

          onProgress?.({
            phase: "retrying",
            percent: 30,
            attempt: attempt + 1,
            maxAttempts,
            reason: splitFriendlyMessage(message).title,
          });
          // Exponential backoff: 1s, then 3s.
          const delay = attempt === 1 ? 1000 : 3000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          abortIfNeeded();
        }
      }

      throw new Error("Upload failed");
    },


    onError: (e: Error) => {
      if (e instanceof UploadCanceledError || e.name === "AbortError") return;
      toastServerError(e);
    },
  });
}

