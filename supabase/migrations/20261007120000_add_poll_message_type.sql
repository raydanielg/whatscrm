-- Add 'poll' to the message_type enum so Telegram poll attachments
-- (sent from the Inbox composer) can be persisted as a real row instead of
-- being worked around client-side. Applied directly via Supabase MCP to
-- project qtlspjkuhfyyesgtkpcv on 2026-10-07; this file records it for
-- fresh environments and keeps the schema reproducible from migrations.
ALTER TYPE public.message_type ADD VALUE IF NOT EXISTS 'poll';
