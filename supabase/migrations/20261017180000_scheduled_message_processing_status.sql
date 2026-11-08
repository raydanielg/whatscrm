-- The dispatcher claims due rows as processing before creating an outbox job.
-- This must be committed before the claim function uses the new enum value.
ALTER TYPE public.scheduled_message_status ADD VALUE IF NOT EXISTS 'processing';
