CREATE OR REPLACE FUNCTION public.get_conversation_counts(_workspace_id uuid, _inbox_id uuid DEFAULT NULL::uuid, _user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH c AS (
    SELECT status, is_archived, assigned_to, unread_count
    FROM public.conversations
    WHERE workspace_id = _workspace_id
      AND deleted_at IS NULL
      AND is_demo = false
      AND (_inbox_id IS NULL OR inbox_id = _inbox_id)
  )
  SELECT jsonb_build_object(
    'all',        COUNT(*) FILTER (WHERE NOT is_archived),
    'unread',     COUNT(*) FILTER (WHERE NOT is_archived AND unread_count > 0),
    'mine',       COUNT(*) FILTER (WHERE NOT is_archived AND _user_id IS NOT NULL AND assigned_to = _user_id),
    'unassigned', COUNT(*) FILTER (WHERE NOT is_archived AND assigned_to IS NULL),
    'open',       COUNT(*) FILTER (WHERE NOT is_archived AND status = 'open'),
    'pending',    COUNT(*) FILTER (WHERE NOT is_archived AND status = 'pending'),
    'resolved',   COUNT(*) FILTER (WHERE NOT is_archived AND status = 'resolved'),
    'archived',   COUNT(*) FILTER (WHERE is_archived),
    'badges', jsonb_build_object(
      'all',        COUNT(*) FILTER (WHERE NOT is_archived AND unread_count > 0),
      'unread',     COUNT(*) FILTER (WHERE NOT is_archived AND unread_count > 0),
      'mine',       COUNT(*) FILTER (WHERE NOT is_archived AND _user_id IS NOT NULL AND assigned_to = _user_id AND unread_count > 0),
      'unassigned', COUNT(*) FILTER (WHERE NOT is_archived AND assigned_to IS NULL AND unread_count > 0),
      'open',       COUNT(*) FILTER (WHERE NOT is_archived AND status = 'open' AND unread_count > 0),
      'pending',    COUNT(*) FILTER (WHERE NOT is_archived AND status = 'pending' AND unread_count > 0),
      'resolved',   COUNT(*) FILTER (WHERE NOT is_archived AND status = 'resolved' AND unread_count > 0),
      'archived',   COUNT(*) FILTER (WHERE is_archived AND unread_count > 0)
    )
  )
  FROM c;
$function$;