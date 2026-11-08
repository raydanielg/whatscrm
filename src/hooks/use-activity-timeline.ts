import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { sbAny } from "@/lib/supabase/untyped";
import { BUCKETS, workspaceObjectPath } from "@/lib/storage/buckets";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

export type TimelineEntity =
  | "contact"
  | "company"
  | "lead"
  | "customer"
  | "deal"
  | "task";

export type NoteRow = {
  id: string;
  workspace_id: string;
  author_id: string | null;
  entity_type: string;
  entity_id: string;
  body: string;
  is_pinned: boolean;
  pinned_at: string | null;
  mentions: string[];
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
};

export type ActivityRow = {
  id: string;
  workspace_id: string | null;
  organization_id: string | null;
  actor_id: string | null;
  verb: string;
  object_type: string;
  object_id: string | null;
  target_type: string | null;
  target_id: string | null;
  summary: string | null;
  data: Record<string, unknown>;
  created_at: string;
};

export type AttachmentRow = {
  id: string;
  workspace_id: string;
  file_id: string;
  entity_type: string;
  entity_id: string;
  attached_by: string | null;
  created_at: string;
  file?: {
    id: string;
    name: string;
    mime_type: string | null;
    size_bytes: number;
    bucket: string;
    path: string;
  } | null;
};

export type TimelineItem =
  | { kind: "note"; at: string; data: NoteRow }
  | { kind: "activity"; at: string; data: ActivityRow }
  | { kind: "attachment"; at: string; data: AttachmentRow };

/* -------------------------------- Notes -------------------------------- */

export function useEntityNotes(entityType: TimelineEntity | undefined, entityId: string | undefined) {
  return useQuery({
    queryKey: ["notes", entityType, entityId],
    enabled: !!entityType && !!entityId,
    queryFn: async (): Promise<NoteRow[]> => {
      const { data, error } = await db
        .from("notes")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .is("deleted_at", null)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NoteRow[];
    },
  });
}

export function useEntityActivities(entityType: TimelineEntity | undefined, entityId: string | undefined) {
  return useQuery({
    queryKey: ["activities", entityType, entityId],
    enabled: !!entityType && !!entityId,
    queryFn: async (): Promise<ActivityRow[]> => {
      const { data, error } = await db
        .from("activities")
        .select("*")
        .or(
          `and(target_type.eq.${entityType},target_id.eq.${entityId}),and(object_type.eq.${entityType},object_id.eq.${entityId})`,
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ActivityRow[];
    },
  });
}

export function useEntityAttachments(entityType: TimelineEntity | undefined, entityId: string | undefined) {
  return useQuery({
    queryKey: ["attachments", entityType, entityId],
    enabled: !!entityType && !!entityId,
    queryFn: async (): Promise<AttachmentRow[]> => {
      const { data, error } = await db
        .from("attachments")
        .select("*, file:files(id,name,mime_type,size_bytes,bucket,path)")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AttachmentRow[];
    },
  });
}

export function useTimelineRealtime(entityType: TimelineEntity | undefined, entityId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!entityType || !entityId) return;
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ["notes", entityType, entityId] });
      qc.invalidateQueries({ queryKey: ["activities", entityType, entityId] });
      qc.invalidateQueries({ queryKey: ["attachments", entityType, entityId] });
    };
    const channel = supabase
      .channel(`timeline:${entityType}:${entityId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notes", filter: `entity_id=eq.${entityId}` },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activities" },
        (payload) => {
          const row = (payload.new || payload.old) as ActivityRow | undefined;
          if (!row) return;
          if (
            (row.target_type === entityType && row.target_id === entityId) ||
            (row.object_type === entityType && row.object_id === entityId)
          ) invalidate();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attachments", filter: `entity_id=eq.${entityId}` },
        invalidate,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [entityType, entityId, qc]);
}

export function useMergedTimeline(entityType: TimelineEntity | undefined, entityId: string | undefined) {
  const notes = useEntityNotes(entityType, entityId);
  const acts = useEntityActivities(entityType, entityId);
  const atts = useEntityAttachments(entityType, entityId);

  const items = useMemo<TimelineItem[]>(() => {
    const out: TimelineItem[] = [];
    for (const n of notes.data ?? []) out.push({ kind: "note", at: n.created_at, data: n });
    for (const a of acts.data ?? []) out.push({ kind: "activity", at: a.created_at, data: a });
    for (const a of atts.data ?? []) out.push({ kind: "attachment", at: a.created_at, data: a });
    out.sort((a, b) => (a.at < b.at ? 1 : -1));
    return out;
  }, [notes.data, acts.data, atts.data]);

  return {
    items,
    notes: notes.data ?? [],
    activities: acts.data ?? [],
    attachments: atts.data ?? [],
    isLoading: notes.isLoading || acts.isLoading || atts.isLoading,
  };
}

/* ------------------------------ Mutations ------------------------------ */

export function useCreateNote() {
  const qc = useQueryClient();
  const { data: ws } = useCurrentWorkspace();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      entity_type: TimelineEntity;
      entity_id: string;
      body: string;
      mentions?: string[];
      is_pinned?: boolean;
    }) => {
      if (!ws?.id || !user?.id) throw new Error("Not signed in");
      const { data, error } = await sbAny(db).from("notes").insert({
        workspace_id: ws.id,
        author_id: user.id,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        body: input.body,
        mentions: input.mentions ?? [],
        is_pinned: input.is_pinned ?? false,
        pinned_at: input.is_pinned ? new Date().toISOString() : null,
      }).select("*").single();
      if (error) throw error;
      return data as NoteRow;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["notes", n.entity_type, n.entity_id] });
      qc.invalidateQueries({ queryKey: ["activities", n.entity_type, n.entity_id] });
    },
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; body?: string; is_pinned?: boolean; mentions?: string[] }) => {
      const patch: Record<string, unknown> = {};
      if (input.body !== undefined) patch.body = input.body;
      if (input.is_pinned !== undefined) patch.is_pinned = input.is_pinned;
      if (input.mentions !== undefined) patch.mentions = input.mentions;
      const { data, error } = await sbAny(db).from("notes").update(patch).eq("id", input.id).select("*").single();
      if (error) throw error;
      return data as NoteRow;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["notes", n.entity_type, n.entity_id] });
      qc.invalidateQueries({ queryKey: ["activities", n.entity_type, n.entity_id] });
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; entity_type: TimelineEntity; entity_id: string }) => {
      const { error } = await sbAny(db).from("notes").update({ deleted_at: new Date().toISOString() }).eq("id", input.id);
      if (error) throw error;
      return input;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["notes", n.entity_type, n.entity_id] });
      qc.invalidateQueries({ queryKey: ["activities", n.entity_type, n.entity_id] });
    },
  });
}

export function useUploadAttachment() {
  const qc = useQueryClient();
  const { data: ws } = useCurrentWorkspace();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { entity_type: TimelineEntity | "note"; entity_id: string; file: File }) => {
      if (!ws?.id || !user?.id) throw new Error("Not signed in");
      const bucket = BUCKETS.ATTACHMENTS;
      // Workspace id first. The `attachments` policy authorises on
      // `(storage.foldername(name))[1]`, so the previous `<userId>/<wsId>/...`
      // ordering made is_workspace_member() test the user id as a workspace and
      // fail for everyone. The filename is sanitized because the key is itself
      // an RLS input.
      const path = workspaceObjectPath(
        ws.id,
        [user.id],
        `${crypto.randomUUID()}-${input.file.name}`,
      );
      const up = await supabase.storage.from(bucket).upload(path, input.file, {
        cacheControl: "3600",
        upsert: false,
        contentType: input.file.type,
      });
      if (up.error) throw up.error;
      const { data: fileRow, error: fErr } = await sbAny(db).from("files").insert({
        workspace_id: ws.id,
        uploader_id: user.id,
        bucket,
        path,
        name: input.file.name,
        mime_type: input.file.type || null,
        size_bytes: input.file.size,
      }).select("*").single();
      if (fErr) throw fErr;
      const { data: att, error: aErr } = await sbAny(db).from("attachments").insert({
        workspace_id: ws.id,
        file_id: fileRow.id,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        attached_by: user.id,
      }).select("*, file:files(id,name,mime_type,size_bytes,bucket,path)").single();
      if (aErr) throw aErr;
      return att as AttachmentRow;
    },
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["attachments", a.entity_type, a.entity_id] });
    },
  });
}

export async function getAttachmentUrl(bucket: string, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

/* ------------------------------- Helpers ------------------------------- */

export function formatVerb(verb: string, summary: string | null): string {
  if (summary && summary.trim().length > 0) return summary;
  return verb.replace(/[._]/g, " ");
}

export function verbCategory(verb: string):
  | "created" | "updated" | "assigned" | "status" | "note" | "message" | "call"
  | "email" | "meeting" | "task" | "tag" | "campaign" | "ai" | "automation" | "generic" {
  if (verb.endsWith(".created")) return "created";
  if (verb.startsWith("note.")) return "note";
  if (verb.endsWith(".assigned")) return "assigned";
  if (verb.endsWith(".status_changed") || verb.endsWith(".stage_changed")) return "status";
  if (verb.endsWith(".tags_changed")) return "tag";
  if (verb.startsWith("message.") || verb.startsWith("conversation.")) return "message";
  if (verb.startsWith("call.")) return "call";
  if (verb.startsWith("email.")) return "email";
  if (verb.startsWith("meeting.")) return "meeting";
  if (verb.startsWith("task.")) return "task";
  if (verb.startsWith("campaign.")) return "campaign";
  if (verb.startsWith("ai.")) return "ai";
  if (verb.startsWith("automation.")) return "automation";
  if (verb.endsWith(".updated")) return "updated";
  return "generic";
}
