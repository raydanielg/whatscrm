DO $$
DECLARE r record;
  client_fns text[] := ARRAY[
    'apply_sla_to_conversation','assign_conversation','auto_assign_conversation',
    'bulk_tag_conversations','bulk_update_conversations','claim_expired_media',
    'create_workspace_with_owner','enforce_rate_limit','export_jobs_claim_batch',
    'get_conversation_counts','get_db_health','get_public_payment_link','has_org_role',
    'has_role','has_workspace_role','heartbeat','increment','increment_install_count',
    'increment_webhook_failure','log_security_event','mark_media_accessed',
    'match_kb_chunks','next_document_number','outbox_claim_batch','record_login_attempt',
    'regenerate_recovery_codes','revoke_all_other_sessions','search_inbox',
    'transfer_organization_ownership','upsert_ai_usage_daily','webhook_events_claim_batch',
    'wf_queue_lease','workspace_media_stats','accept_workspace_invitation',
    'apply_my_auto_invite_rules','contact_list_active_member_count',
    'is_active_workspace_member','is_inbox_member','can_self_join_workspace',
    'can_manage_vcard_lifecycle','ensure_personal_organization'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND NOT (p.proname = ANY(client_fns))
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;