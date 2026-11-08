GRANT SELECT (
  id, workspace_id, created_by, status, worker_session_id, phone_number, display_name,
  device_platform, error_message, last_seen_at, connected_at, revoked_at, created_at,
  updated_at, expires_at, qr_expires_at, metadata, disconnected_at
) ON public.whatsapp_qr_sessions TO authenticated;

GRANT INSERT (
  id, workspace_id, created_by, status, worker_session_id, phone_number, display_name,
  device_platform, error_message, last_seen_at, connected_at, revoked_at, created_at,
  updated_at, expires_at, qr_expires_at, metadata, disconnected_at
) ON public.whatsapp_qr_sessions TO authenticated;

GRANT UPDATE (
  status, worker_session_id, phone_number, display_name, device_platform, error_message,
  last_seen_at, connected_at, revoked_at, updated_at, expires_at, qr_expires_at,
  metadata, disconnected_at
) ON public.whatsapp_qr_sessions TO authenticated;

GRANT DELETE ON public.whatsapp_qr_sessions TO authenticated;

GRANT ALL ON public.whatsapp_qr_sessions TO service_role;