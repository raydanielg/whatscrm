-- 1) Merge any pre-existing duplicate threads onto the oldest row.
DO $$
DECLARE
  keeper uuid;
  dup uuid;
  grp record;
BEGIN
  FOR grp IN
    SELECT workspace_id, channel, external_conversation_id
    FROM public.conversations
    WHERE external_conversation_id IS NOT NULL
    GROUP BY 1,2,3
    HAVING count(*) > 1
  LOOP
    SELECT id INTO keeper
    FROM public.conversations
    WHERE workspace_id = grp.workspace_id
      AND channel = grp.channel
      AND external_conversation_id = grp.external_conversation_id
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    FOR dup IN
      SELECT id FROM public.conversations
      WHERE workspace_id = grp.workspace_id
        AND channel = grp.channel
        AND external_conversation_id = grp.external_conversation_id
        AND id <> keeper
    LOOP
      UPDATE public.messages SET conversation_id = keeper WHERE conversation_id = dup;
      UPDATE public.conversations k
        SET unread_count = COALESCE(k.unread_count,0) + COALESCE(d.unread_count,0),
            last_message_at = GREATEST(COALESCE(k.last_message_at, d.last_message_at), COALESCE(d.last_message_at, k.last_message_at)),
            updated_at = now()
        FROM public.conversations d
        WHERE k.id = keeper AND d.id = dup;
      DELETE FROM public.conversations WHERE id = dup;
    END LOOP;
  END LOOP;
END $$;

-- 2) One Inbox thread per (workspace, channel, external thread id).
CREATE UNIQUE INDEX IF NOT EXISTS conversations_external_thread_key
  ON public.conversations (workspace_id, channel, external_conversation_id)
  WHERE external_conversation_id IS NOT NULL;