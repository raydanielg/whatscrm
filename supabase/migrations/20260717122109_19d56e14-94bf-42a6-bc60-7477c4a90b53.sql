create extension if not exists pg_trgm;

create index if not exists idx_conversations_subject_trgm
  on public.conversations using gin (subject gin_trgm_ops);

create index if not exists idx_conversations_last_msg_preview_trgm
  on public.conversations using gin (last_message_preview gin_trgm_ops);

create index if not exists idx_conversations_ws_inbox_archived_status
  on public.conversations (workspace_id, inbox_id, is_archived, status);

create index if not exists idx_conversations_ws_inbox_archived_assignee
  on public.conversations (workspace_id, inbox_id, is_archived, assigned_to);

create index if not exists idx_conversations_ws_unread
  on public.conversations (workspace_id, is_archived)
  where unread_count > 0;
