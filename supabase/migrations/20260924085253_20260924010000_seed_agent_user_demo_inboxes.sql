-- Demo seed: connected accounts + realistic conversations across every channel.
-- Targets: agent@demo.com's and user@demo.com's primary workspaces.
-- Idempotent: each INSERT is guarded by a NOT EXISTS check on a fixed id.

-- Each demo workspace is optional on a fresh project.
DO $demo_seed$
BEGIN
  IF EXISTS (SELECT 1 FROM public.workspaces WHERE id = '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48') THEN

-- Agent's Workspace (Wellness Hub) (workspace 8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48) -----------------------------------------------
INSERT INTO public.channel_accounts (id, workspace_id, provider, display_name, phone_number, phone_number_id, waba_id, status, is_default, last_verified_at, created_at, updated_at)
SELECT '5574437d-67fc-4387-af55-f3bba989f21c', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'whatsapp_cloud', 'Wellness Hub Support', '+1 555 0287', 'demo_pnid_5574437d', 'demo_waba_5574437d', 'connected', true, now() - interval '2 days', now() - interval '28 days', now()
WHERE NOT EXISTS (SELECT 1 FROM public.channel_accounts WHERE id = '5574437d-67fc-4387-af55-f3bba989f21c');
INSERT INTO public.instagram_accounts (id, workspace_id, ig_user_id, username, name, status, connected_at, last_verified_at, created_at, updated_at)
SELECT '29d5d714-556e-42b5-8f2c-95ec776dfa8e', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'demo_ig_29d5d714', 'wellnesshub', 'Wellness Hub', 'connected', now() - interval '22 days', now() - interval '1 day', now() - interval '22 days', now()
WHERE NOT EXISTS (SELECT 1 FROM public.instagram_accounts WHERE id = '29d5d714-556e-42b5-8f2c-95ec776dfa8e');
INSERT INTO public.messenger_accounts (id, workspace_id, page_id, page_name, access_token_ciphertext, status, connected_at, last_verified_at, created_at, updated_at)
SELECT '623ab382-3fdf-44be-8b7e-2b6507cadb15', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'demo_page_623ab382', 'Wellness Hub', 'demo-not-a-real-token', 'connected', now() - interval '22 days', now() - interval '1 day', now() - interval '22 days', now()
WHERE NOT EXISTS (SELECT 1 FROM public.messenger_accounts WHERE id = '623ab382-3fdf-44be-8b7e-2b6507cadb15');
INSERT INTO public.telegram_accounts (id, workspace_id, bot_id, bot_username, bot_name, bot_token_ciphertext, webhook_secret, status, connected_at, last_verified_at, created_at, updated_at)
SELECT '0e71abb7-bd6c-4b3a-8ef3-fcdf0a6541ac', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'demo_bot_0e71abb7', 'wellness_hub_bot', 'Wellness Hub', 'demo-not-a-real-token', 'demo-secret', 'connected', now() - interval '18 days', now() - interval '1 day', now() - interval '18 days', now()
WHERE NOT EXISTS (SELECT 1 FROM public.telegram_accounts WHERE id = '0e71abb7-bd6c-4b3a-8ef3-fcdf0a6541ac');
INSERT INTO public.email_accounts (id, workspace_id, provider, display_name, from_email, from_name, status, connected_at, last_verified_at, created_at, updated_at)
SELECT 'ca55d434-472c-4617-960a-a2cad6d6b259', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'lovable', 'Support Inbox', 'hello@wellnesshub.example', 'Wellness Hub', 'connected', now() - interval '22 days', now() - interval '1 day', now() - interval '22 days', now()
WHERE NOT EXISTS (SELECT 1 FROM public.email_accounts WHERE id = 'ca55d434-472c-4617-960a-a2cad6d6b259');
INSERT INTO public.sms_accounts (id, workspace_id, provider, display_name, phone_number, status, connected_at, last_verified_at, created_at, updated_at)
SELECT '1c0a76bc-817d-4d17-9b71-7661d19e1cfe', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'twilio', 'Wellness Hub SMS', '+1 555 0298', 'connected', now() - interval '22 days', now() - interval '1 day', now() - interval '22 days', now()
WHERE NOT EXISTS (SELECT 1 FROM public.sms_accounts WHERE id = '1c0a76bc-817d-4d17-9b71-7661d19e1cfe');

-- Contacts
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT 'c82ae990-29bc-481b-9e4d-f3d0f9a2ae65', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'Sophie Larsen', 'Sophie Larsen', '+1 555 4201', NULL, 'customer', 'active', 'whatsapp', now() - interval '110 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = 'c82ae990-29bc-481b-9e4d-f3d0f9a2ae65');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT '8e1de520-d976-47e9-8934-849b3fca8298', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'Marcus Webb', 'Marcus Webb', '+1 555 4202', NULL, 'customer', 'active', 'whatsapp', now() - interval '200 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '8e1de520-d976-47e9-8934-849b3fca8298');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT 'f72f132b-792c-4a9e-81e5-5575839c3dbf', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '@wellwithwren', '@wellwithwren', NULL, NULL, 'customer', 'active', 'instagram', now() - interval '120 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = 'f72f132b-792c-4a9e-81e5-5575839c3dbf');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT '64de08b6-7d59-4190-b923-cdb56f0c19e5', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '@jordanmoves', '@jordanmoves', NULL, NULL, 'customer', 'active', 'instagram', now() - interval '1080 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '64de08b6-7d59-4190-b923-cdb56f0c19e5');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT '0c7d5334-44ed-413c-ab32-8d7527787729', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'Elena Ruiz', 'Elena Ruiz', NULL, NULL, 'customer', 'active', 'messenger', now() - interval '320 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '0c7d5334-44ed-413c-ab32-8d7527787729');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT 'db358b92-e295-4db6-8005-2139c1f7fdf9', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'Priya Chandra', 'Priya Chandra', NULL, NULL, 'customer', 'active', 'messenger', now() - interval '90 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = 'db358b92-e295-4db6-8005-2139c1f7fdf9');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT '453b035f-0644-431b-8f23-a1fd0f61bd80', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'Noah Bergström', 'Noah Bergström', NULL, NULL, 'customer', 'active', 'telegram', now() - interval '600 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '453b035f-0644-431b-8f23-a1fd0f61bd80');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT '4542f21f-914d-4366-8a6e-c15e802717cc', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'Ingrid Solberg', 'Ingrid Solberg', NULL, NULL, 'customer', 'active', 'telegram', now() - interval '85 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '4542f21f-914d-4366-8a6e-c15e802717cc');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT '054c5545-1fdb-49aa-a7f7-c17cc57a1667', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'Grace Halloran', 'Grace Halloran', NULL, 'grace.halloran@meridiancorp.example', 'customer', 'active', 'email', now() - interval '320 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '054c5545-1fdb-49aa-a7f7-c17cc57a1667');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT '2bd2ea5c-5e91-48c0-a587-fa05b0a078dd', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'Owen Patel', 'Owen Patel', NULL, 'owen.patel@fieldnote.example', 'customer', 'active', 'email', now() - interval '2040 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '2bd2ea5c-5e91-48c0-a587-fa05b0a078dd');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT 'f3e9265d-b24e-47a0-9118-01f2c0d58956', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'Talia Fenwick', 'Talia Fenwick', '+1 555 4210', NULL, 'customer', 'active', 'sms', now() - interval '115 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = 'f3e9265d-b24e-47a0-9118-01f2c0d58956');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT 'cafea587-9360-41ec-8ef2-3a2dc4f15ff6', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'Derek Osei', 'Derek Osei', '+1 555 4211', NULL, 'customer', 'active', 'sms', now() - interval '75 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = 'cafea587-9360-41ec-8ef2-3a2dc4f15ff6');

-- Conversations + messages
INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT 'cf3c4a82-08c1-47df-97a3-96e255d16ce4', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'c82ae990-29bc-481b-9e4d-f3d0f9a2ae65', '1f405517-1f33-49b5-b67d-70e6ed94d9f5', 'open', 'high', 'whatsapp', '5574437d-67fc-4387-af55-f3bba989f21c', '{}'::jsonb, 1, now() - interval '6 minutes', 'Great, thank you! One more thing — can I bring a friend as a guest?', 'contact', now() - interval '55 minutes', now() - interval '6 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = 'cf3c4a82-08c1-47df-97a3-96e255d16ce4');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '84aee29b-c901-48eb-9a02-c5c7e2494f69', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'cf3c4a82-08c1-47df-97a3-96e255d16ce4', 'inbound', 'Hi, I booked the 6pm yoga class but the app shows it as cancelled?', 'delivered', 'text', NULL, now() - interval '50 minutes', now() - interval '50 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '84aee29b-c901-48eb-9a02-c5c7e2494f69');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '523814ed-0761-4aee-847f-40796f764b13', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'cf3c4a82-08c1-47df-97a3-96e255d16ce4', 'outbound', 'Let me check that right now, Sophie.', 'delivered', 'text', '1f405517-1f33-49b5-b67d-70e6ed94d9f5', now() - interval '40 minutes', now() - interval '40 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '523814ed-0761-4aee-847f-40796f764b13');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'dc0a61fa-a6b2-4b88-83f4-07066ecdfeed', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'cf3c4a82-08c1-47df-97a3-96e255d16ce4', 'outbound', 'You''re all set — that was a display glitch, your spot is confirmed for 6pm.', 'delivered', 'text', '1f405517-1f33-49b5-b67d-70e6ed94d9f5', now() - interval '20 minutes', now() - interval '20 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'dc0a61fa-a6b2-4b88-83f4-07066ecdfeed');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '9bd0fcd4-d7f6-452a-864a-732ecd8f20cb', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'cf3c4a82-08c1-47df-97a3-96e255d16ce4', 'inbound', 'Great, thank you! One more thing — can I bring a friend as a guest?', 'delivered', 'text', NULL, now() - interval '6 minutes', now() - interval '6 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '9bd0fcd4-d7f6-452a-864a-732ecd8f20cb');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '0d50f96b-1293-4062-aba3-28b72b504712', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '8e1de520-d976-47e9-8934-849b3fca8298', '1f405517-1f33-49b5-b67d-70e6ed94d9f5', 'resolved', 'normal', 'whatsapp', '5574437d-67fc-4387-af55-f3bba989f21c', '{}'::jsonb, 0, now() - interval '90 minutes', 'Sounds good, see you soon 👍', 'agent', now() - interval '145 minutes', now() - interval '90 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '0d50f96b-1293-4062-aba3-28b72b504712');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '90ef6289-1477-4d0e-9680-7f0c2a32d1ba', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '0d50f96b-1293-4062-aba3-28b72b504712', 'inbound', 'Do you offer a 10-class pack or only monthly memberships?', 'delivered', 'text', NULL, now() - interval '140 minutes', now() - interval '140 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '90ef6289-1477-4d0e-9680-7f0c2a32d1ba');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '5ae0029c-d7de-4a0c-9d8f-22a1afae8752', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '0d50f96b-1293-4062-aba3-28b72b504712', 'outbound', 'We have both! A 10-class pack is $180, no expiry for 6 months.', 'delivered', 'text', '1f405517-1f33-49b5-b67d-70e6ed94d9f5', now() - interval '120 minutes', now() - interval '120 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '5ae0029c-d7de-4a0c-9d8f-22a1afae8752');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '383b2b41-f55b-4078-a5fc-ccf9d694e0a2', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '0d50f96b-1293-4062-aba3-28b72b504712', 'inbound', 'Perfect, I''ll grab that at the front desk today.', 'delivered', 'text', NULL, now() - interval '100 minutes', now() - interval '100 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '383b2b41-f55b-4078-a5fc-ccf9d694e0a2');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'efcd8ab9-5a25-41ae-9b82-e9134fda40c9', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '0d50f96b-1293-4062-aba3-28b72b504712', 'outbound', 'Sounds good, see you soon 👍', 'delivered', 'text', '1f405517-1f33-49b5-b67d-70e6ed94d9f5', now() - interval '90 minutes', now() - interval '90 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'efcd8ab9-5a25-41ae-9b82-e9134fda40c9');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT 'be702d6a-bb6d-4f1b-a511-699131182f5b', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'f72f132b-792c-4a9e-81e5-5575839c3dbf', '1f405517-1f33-49b5-b67d-70e6ed94d9f5', 'open', 'normal', 'instagram', NULL, jsonb_build_object('account_id', '29d5d714-556e-42b5-8f2c-95ec776dfa8e'), 1, now() - interval '12 minutes', 'Perfect, signing up for Thursday 🙌', 'contact', now() - interval '65 minutes', now() - interval '12 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = 'be702d6a-bb6d-4f1b-a511-699131182f5b');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '1ad33d2c-f14c-4ec1-8950-c5d0045c637b', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'be702d6a-bb6d-4f1b-a511-699131182f5b', 'inbound', 'Loved the reformer pilates story you posted! Is that class beginner friendly?', 'delivered', 'text', NULL, now() - interval '60 minutes', now() - interval '60 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '1ad33d2c-f14c-4ec1-8950-c5d0045c637b');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '8058e179-8584-454d-8eee-97d40a05a00d', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'be702d6a-bb6d-4f1b-a511-699131182f5b', 'outbound', 'Thank you! Yes, we run a beginner track every Tuesday and Thursday at 9am.', 'delivered', 'text', '1f405517-1f33-49b5-b67d-70e6ed94d9f5', now() - interval '45 minutes', now() - interval '45 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '8058e179-8584-454d-8eee-97d40a05a00d');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '3a3354dc-843e-424b-87f1-1b1b5b053546', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'be702d6a-bb6d-4f1b-a511-699131182f5b', 'inbound', 'Perfect, signing up for Thursday 🙌', 'delivered', 'text', NULL, now() - interval '12 minutes', now() - interval '12 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '3a3354dc-843e-424b-87f1-1b1b5b053546');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '27142639-3724-4cd7-94ec-31795fdc4e61', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '64de08b6-7d59-4190-b923-cdb56f0c19e5', '1f405517-1f33-49b5-b67d-70e6ed94d9f5', 'resolved', 'low', 'instagram', NULL, jsonb_build_object('account_id', '29d5d714-556e-42b5-8f2c-95ec776dfa8e'), 0, now() - interval '980 minutes', 'Amazing, I''ll grab one next visit!', 'contact', now() - interval '1025 minutes', now() - interval '980 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '27142639-3724-4cd7-94ec-31795fdc4e61');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'e852fa4d-a48e-404d-b6c9-e93484445e89', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '27142639-3724-4cd7-94ec-31795fdc4e61', 'inbound', 'Do you sell the branded yoga mats separately?', 'delivered', 'text', NULL, now() - interval '1020 minutes', now() - interval '1020 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'e852fa4d-a48e-404d-b6c9-e93484445e89');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'c97e90c8-60f8-4bfc-ad1e-e7aa2fe1f2c3', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '27142639-3724-4cd7-94ec-31795fdc4e61', 'outbound', 'We do — they''re $38 at the studio or on our online store.', 'delivered', 'text', '1f405517-1f33-49b5-b67d-70e6ed94d9f5', now() - interval '1000 minutes', now() - interval '1000 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'c97e90c8-60f8-4bfc-ad1e-e7aa2fe1f2c3');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '55c1d0ff-523f-4d0f-8a2f-fdf5fef7dddd', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '27142639-3724-4cd7-94ec-31795fdc4e61', 'inbound', 'Amazing, I''ll grab one next visit!', 'delivered', 'text', NULL, now() - interval '980 minutes', now() - interval '980 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '55c1d0ff-523f-4d0f-8a2f-fdf5fef7dddd');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT 'e62265e9-9f3c-4405-8f95-dfad586a53c5', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '0c7d5334-44ed-413c-ab32-8d7527787729', NULL, 'pending', 'normal', 'messenger', NULL, jsonb_build_object('account_id', '623ab382-3fdf-44be-8b7e-2b6507cadb15'), 1, now() - interval '210 minutes', 'Yes please, starting next Monday.', 'contact', now() - interval '265 minutes', now() - interval '210 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = 'e62265e9-9f3c-4405-8f95-dfad586a53c5');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '74973af9-d7c9-4f23-b1c6-074f8b80e6b0', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'e62265e9-9f3c-4405-8f95-dfad586a53c5', 'inbound', 'Can I freeze my membership for 2 months while I travel?', 'delivered', 'text', NULL, now() - interval '260 minutes', now() - interval '260 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '74973af9-d7c9-4f23-b1c6-074f8b80e6b0');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '4e486818-036c-4b4d-b67a-583cfdbdb6ec', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'e62265e9-9f3c-4405-8f95-dfad586a53c5', 'outbound', 'Yes, freezes are free for up to 3 months. Want me to set that up now?', 'delivered', 'text', '1f405517-1f33-49b5-b67d-70e6ed94d9f5', now() - interval '240 minutes', now() - interval '240 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '4e486818-036c-4b4d-b67a-583cfdbdb6ec');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'e1a58171-a7d5-4b32-a20d-aa882396a842', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'e62265e9-9f3c-4405-8f95-dfad586a53c5', 'inbound', 'Yes please, starting next Monday.', 'delivered', 'text', NULL, now() - interval '210 minutes', now() - interval '210 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'e1a58171-a7d5-4b32-a20d-aa882396a842');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT 'a8655426-4d97-468b-9fbd-08c822377e07', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'db358b92-e295-4db6-8005-2139c1f7fdf9', '1f405517-1f33-49b5-b67d-70e6ed94d9f5', 'open', 'high', 'messenger', NULL, jsonb_build_object('account_id', '623ab382-3fdf-44be-8b7e-2b6507cadb15'), 2, now() - interval '4 minutes', 'Any update? It''s been a few minutes 🙏', 'contact', now() - interval '35 minutes', now() - interval '4 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = 'a8655426-4d97-468b-9fbd-08c822377e07');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '7ef6bf3a-497a-4604-8377-64cf799f97a1', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'a8655426-4d97-468b-9fbd-08c822377e07', 'inbound', 'I was charged twice for my April membership, can you check?', 'delivered', 'text', NULL, now() - interval '30 minutes', now() - interval '30 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '7ef6bf3a-497a-4604-8377-64cf799f97a1');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'a14e3181-e2a3-4523-9c3c-4601e1296ff4', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'a8655426-4d97-468b-9fbd-08c822377e07', 'outbound', 'So sorry Priya, looking into that now.', 'delivered', 'text', '1f405517-1f33-49b5-b67d-70e6ed94d9f5', now() - interval '22 minutes', now() - interval '22 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'a14e3181-e2a3-4523-9c3c-4601e1296ff4');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '27a68d62-69c7-4fca-b80b-8c293bc9a2b9', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'a8655426-4d97-468b-9fbd-08c822377e07', 'inbound', 'Any update? It''s been a few minutes 🙏', 'delivered', 'text', NULL, now() - interval '4 minutes', now() - interval '4 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '27a68d62-69c7-4fca-b80b-8c293bc9a2b9');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '2aa34532-c1f2-42a1-9c13-63bba49202be', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '453b035f-0644-431b-8f23-a1fd0f61bd80', '1f405517-1f33-49b5-b67d-70e6ed94d9f5', 'resolved', 'normal', 'telegram', NULL, jsonb_build_object('account_id', '0e71abb7-bd6c-4b3a-8ef3-fcdf0a6541ac'), 0, now() - interval '500 minutes', 'The sauna is open until 9pm daily, last entry 8:30pm.', 'agent', now() - interval '545 minutes', now() - interval '500 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '2aa34532-c1f2-42a1-9c13-63bba49202be');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '0452cd06-cf00-483d-a1f3-4b75307508d7', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '2aa34532-c1f2-42a1-9c13-63bba49202be', 'inbound', '/start', 'delivered', 'text', NULL, now() - interval '540 minutes', now() - interval '540 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '0452cd06-cf00-483d-a1f3-4b75307508d7');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '6780218f-a36a-4891-bc11-ea14b62b4a78', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '2aa34532-c1f2-42a1-9c13-63bba49202be', 'outbound', 'Welcome to Wellness Hub! Ask me anything about classes, memberships or bookings.', 'delivered', 'text', '1f405517-1f33-49b5-b67d-70e6ed94d9f5', now() - interval '539 minutes', now() - interval '539 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '6780218f-a36a-4891-bc11-ea14b62b4a78');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'a4594e56-4caf-4048-9d0d-2904770629fe', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '2aa34532-c1f2-42a1-9c13-63bba49202be', 'inbound', 'What time does the sauna close?', 'delivered', 'text', NULL, now() - interval '520 minutes', now() - interval '520 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'a4594e56-4caf-4048-9d0d-2904770629fe');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '812d4f8d-6125-4ab9-997b-8f486695a55c', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '2aa34532-c1f2-42a1-9c13-63bba49202be', 'outbound', 'The sauna is open until 9pm daily, last entry 8:30pm.', 'delivered', 'text', '1f405517-1f33-49b5-b67d-70e6ed94d9f5', now() - interval '500 minutes', now() - interval '500 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '812d4f8d-6125-4ab9-997b-8f486695a55c');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '72e4becc-ffe5-491b-9c66-9f2df7aa8c5c', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '4542f21f-914d-4366-8a6e-c15e802717cc', NULL, 'open', 'normal', 'telegram', NULL, jsonb_build_object('account_id', '0e71abb7-bd6c-4b3a-8ef3-fcdf0a6541ac'), 1, now() - interval '9 minutes', 'Following up — would love to book one if so!', 'contact', now() - interval '30 minutes', now() - interval '9 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '72e4becc-ffe5-491b-9c66-9f2df7aa8c5c');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'c6cfd2ba-8563-498f-92d3-f8028a001b59', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '72e4becc-ffe5-491b-9c66-9f2df7aa8c5c', 'inbound', 'Is there a nutrition consult add-on with the premium plan?', 'delivered', 'text', NULL, now() - interval '25 minutes', now() - interval '25 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'c6cfd2ba-8563-498f-92d3-f8028a001b59');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '140eaf18-95b0-485e-b87a-b8e61390e628', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '72e4becc-ffe5-491b-9c66-9f2df7aa8c5c', 'inbound', 'Following up — would love to book one if so!', 'delivered', 'text', NULL, now() - interval '9 minutes', now() - interval '9 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '140eaf18-95b0-485e-b87a-b8e61390e628');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT 'e11f1b9e-7394-4e8e-b40a-e0a821a3831d', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '054c5545-1fdb-49aa-a7f7-c17cc57a1667', '1f405517-1f33-49b5-b67d-70e6ed94d9f5', 'open', 'normal', 'email', NULL, jsonb_build_object('account_id', 'ca55d434-472c-4617-960a-a2cad6d6b259'), 1, now() - interval '150 minutes', 'Got it, this looks great. Can we schedule a call next week to finalize?', 'contact', now() - interval '265 minutes', now() - interval '150 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = 'e11f1b9e-7394-4e8e-b40a-e0a821a3831d');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'e2b40416-b460-4dfb-a76a-e43cd9c6748a', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'e11f1b9e-7394-4e8e-b40a-e0a821a3831d', 'inbound', 'We''d like to set up a corporate wellness package for our 40-person office. What packages exist?', 'delivered', 'text', NULL, now() - interval '260 minutes', now() - interval '260 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'e2b40416-b460-4dfb-a76a-e43cd9c6748a');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '1cac5098-7e08-4fa5-a4bc-25e7da96ede1', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'e11f1b9e-7394-4e8e-b40a-e0a821a3831d', 'outbound', 'Hi Grace — our corporate plans start at $99/employee/month with onsite sessions available. Sending the deck now.', 'delivered', 'text', '1f405517-1f33-49b5-b67d-70e6ed94d9f5', now() - interval '220 minutes', now() - interval '220 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '1cac5098-7e08-4fa5-a4bc-25e7da96ede1');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '01d80b06-d9e9-42f6-9708-829467a2ca9b', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'e11f1b9e-7394-4e8e-b40a-e0a821a3831d', 'inbound', 'Got it, this looks great. Can we schedule a call next week to finalize?', 'delivered', 'text', NULL, now() - interval '150 minutes', now() - interval '150 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '01d80b06-d9e9-42f6-9708-829467a2ca9b');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '99d74293-23f7-4b79-96c4-8bb322e06f91', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '2bd2ea5c-5e91-48c0-a587-fa05b0a078dd', NULL, 'pending', 'normal', 'email', NULL, jsonb_build_object('account_id', 'ca55d434-472c-4617-960a-a2cad6d6b259'), 0, now() - interval '1900 minutes', 'Appreciate the quick turnaround, thank you.', 'contact', now() - interval '1985 minutes', now() - interval '1900 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '99d74293-23f7-4b79-96c4-8bb322e06f91');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '6ba8df4c-2dd5-45df-abcc-225a71a5034e', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '99d74293-23f7-4b79-96c4-8bb322e06f91', 'inbound', 'I''d like to cancel my membership effective end of month, please confirm the process.', 'delivered', 'text', NULL, now() - interval '1980 minutes', now() - interval '1980 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '6ba8df4c-2dd5-45df-abcc-225a71a5034e');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '945676a3-4fad-4a45-a422-77ad9345eb0e', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '99d74293-23f7-4b79-96c4-8bb322e06f91', 'outbound', 'Hi Owen, sorry to see you go — I''ve flagged your account for cancellation effective the 30th, no further charges.', 'delivered', 'text', '1f405517-1f33-49b5-b67d-70e6ed94d9f5', now() - interval '1940 minutes', now() - interval '1940 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '945676a3-4fad-4a45-a422-77ad9345eb0e');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'da5997c3-6c01-426f-bbea-b117d9738351', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '99d74293-23f7-4b79-96c4-8bb322e06f91', 'inbound', 'Appreciate the quick turnaround, thank you.', 'delivered', 'text', NULL, now() - interval '1900 minutes', now() - interval '1900 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'da5997c3-6c01-426f-bbea-b117d9738351');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT 'ba7885e1-ee6d-4e0e-83cb-4132065f83dd', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'f3e9265d-b24e-47a0-9118-01f2c0d58956', '1f405517-1f33-49b5-b67d-70e6ed94d9f5', 'resolved', 'low', 'sms', NULL, jsonb_build_object('account_id', '1c0a76bc-817d-4d17-9b71-7661d19e1cfe'), 0, now() - interval '35 minutes', 'Confirmed, see you at 3! 💆', 'agent', now() - interval '60 minutes', now() - interval '35 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = 'ba7885e1-ee6d-4e0e-83cb-4132065f83dd');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '71f0a31c-8458-4c07-8b03-600e43fdbd16', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'ba7885e1-ee6d-4e0e-83cb-4132065f83dd', 'outbound', 'Reminder: your massage therapy session is today at 3pm. Reply C to confirm.', 'delivered', 'text', '1f405517-1f33-49b5-b67d-70e6ed94d9f5', now() - interval '55 minutes', now() - interval '55 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '71f0a31c-8458-4c07-8b03-600e43fdbd16');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'e6db96d8-97a8-4c05-aaf3-dbe60169824b', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'ba7885e1-ee6d-4e0e-83cb-4132065f83dd', 'inbound', 'C', 'delivered', 'text', NULL, now() - interval '45 minutes', now() - interval '45 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'e6db96d8-97a8-4c05-aaf3-dbe60169824b');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'a634ecff-99b0-436a-9228-1f59d544e239', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'ba7885e1-ee6d-4e0e-83cb-4132065f83dd', 'outbound', 'Confirmed, see you at 3! 💆', 'delivered', 'text', '1f405517-1f33-49b5-b67d-70e6ed94d9f5', now() - interval '35 minutes', now() - interval '35 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'a634ecff-99b0-436a-9228-1f59d544e239');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '4ad1cfd3-e54d-4059-ac71-567ff3689d4c', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', 'cafea587-9360-41ec-8ef2-3a2dc4f15ff6', NULL, 'open', 'normal', 'sms', NULL, jsonb_build_object('account_id', '1c0a76bc-817d-4d17-9b71-7661d19e1cfe'), 1, now() - interval '11 minutes', 'Yes! Reduced hours 8am-2pm on Labor Day.', 'agent', now() - interval '20 minutes', now() - interval '11 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '4ad1cfd3-e54d-4059-ac71-567ff3689d4c');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '935bdf84-033f-41f1-acfc-3e8acac50248', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '4ad1cfd3-e54d-4059-ac71-567ff3689d4c', 'inbound', 'Is the studio open on Labor Day?', 'delivered', 'text', NULL, now() - interval '15 minutes', now() - interval '15 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '935bdf84-033f-41f1-acfc-3e8acac50248');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'c7ef7d87-4cb0-4edc-be40-3cead6543d6f', '8d55bbee-e30f-4ce3-b9f7-972ad4b6ac48', '4ad1cfd3-e54d-4059-ac71-567ff3689d4c', 'outbound', 'Yes! Reduced hours 8am-2pm on Labor Day.', 'delivered', 'text', '1f405517-1f33-49b5-b67d-70e6ed94d9f5', now() - interval '11 minutes', now() - interval '11 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'c7ef7d87-4cb0-4edc-be40-3cead6543d6f');

  END IF;
  IF EXISTS (SELECT 1 FROM public.workspaces WHERE id = '64e7d2ac-236d-4a1a-9260-433d25ae3654') THEN

-- User's Workspace (Northbridge Goods) (workspace 64e7d2ac-236d-4a1a-9260-433d25ae3654) -----------------------------------------------
INSERT INTO public.channel_accounts (id, workspace_id, provider, display_name, phone_number, phone_number_id, waba_id, status, is_default, last_verified_at, created_at, updated_at)
SELECT 'f73ff0cb-b666-4ba3-9340-4e1a6c6cf533', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'whatsapp_cloud', 'Northbridge Goods Support', '+1 555 0356', 'demo_pnid_f73ff0cb', 'demo_waba_f73ff0cb', 'connected', true, now() - interval '2 days', now() - interval '28 days', now()
WHERE NOT EXISTS (SELECT 1 FROM public.channel_accounts WHERE id = 'f73ff0cb-b666-4ba3-9340-4e1a6c6cf533');
INSERT INTO public.instagram_accounts (id, workspace_id, ig_user_id, username, name, status, connected_at, last_verified_at, created_at, updated_at)
SELECT '332abf45-f0dd-400e-abc7-77cf3b82fe84', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'demo_ig_332abf45', 'northbridgegoods', 'Northbridge Goods', 'connected', now() - interval '22 days', now() - interval '1 day', now() - interval '22 days', now()
WHERE NOT EXISTS (SELECT 1 FROM public.instagram_accounts WHERE id = '332abf45-f0dd-400e-abc7-77cf3b82fe84');
INSERT INTO public.messenger_accounts (id, workspace_id, page_id, page_name, access_token_ciphertext, status, connected_at, last_verified_at, created_at, updated_at)
SELECT '1231635d-199d-4164-b92c-f6fb11f8839b', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'demo_page_1231635d', 'Northbridge Goods', 'demo-not-a-real-token', 'connected', now() - interval '22 days', now() - interval '1 day', now() - interval '22 days', now()
WHERE NOT EXISTS (SELECT 1 FROM public.messenger_accounts WHERE id = '1231635d-199d-4164-b92c-f6fb11f8839b');
INSERT INTO public.telegram_accounts (id, workspace_id, bot_id, bot_username, bot_name, bot_token_ciphertext, webhook_secret, status, connected_at, last_verified_at, created_at, updated_at)
SELECT 'f2451311-863c-41e7-8564-d32d3bc0c31e', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'demo_bot_f2451311', 'northbridge_goods_bot', 'Northbridge Goods', 'demo-not-a-real-token', 'demo-secret', 'connected', now() - interval '18 days', now() - interval '1 day', now() - interval '18 days', now()
WHERE NOT EXISTS (SELECT 1 FROM public.telegram_accounts WHERE id = 'f2451311-863c-41e7-8564-d32d3bc0c31e');
INSERT INTO public.email_accounts (id, workspace_id, provider, display_name, from_email, from_name, status, connected_at, last_verified_at, created_at, updated_at)
SELECT '87fcffa9-a0f3-4242-a930-fb247d0167f7', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'lovable', 'Support Inbox', 'support@northbridgegoods.example', 'Northbridge Goods', 'connected', now() - interval '22 days', now() - interval '1 day', now() - interval '22 days', now()
WHERE NOT EXISTS (SELECT 1 FROM public.email_accounts WHERE id = '87fcffa9-a0f3-4242-a930-fb247d0167f7');
INSERT INTO public.sms_accounts (id, workspace_id, provider, display_name, phone_number, status, connected_at, last_verified_at, created_at, updated_at)
SELECT '34f45787-648a-469d-b2c7-f98f18a48ff7', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'twilio', 'Northbridge Goods SMS', '+1 555 0367', 'connected', now() - interval '22 days', now() - interval '1 day', now() - interval '22 days', now()
WHERE NOT EXISTS (SELECT 1 FROM public.sms_accounts WHERE id = '34f45787-648a-469d-b2c7-f98f18a48ff7');

-- Contacts
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT '5e054674-5786-42ba-b2d1-62f2bdf863d8', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'Hannah Voss', 'Hannah Voss', '+1 555 5501', NULL, 'customer', 'active', 'whatsapp', now() - interval '130 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '5e054674-5786-42ba-b2d1-62f2bdf863d8');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT '71a3b7e8-2ebf-46ad-a0d0-4ec896ca89bd', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'Felix Grant', 'Felix Grant', '+1 555 5502', NULL, 'customer', 'active', 'whatsapp', now() - interval '190 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '71a3b7e8-2ebf-46ad-a0d0-4ec896ca89bd');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT '100658df-8d13-45f3-871c-6950667a947b', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '@homebyharlow', '@homebyharlow', NULL, NULL, 'customer', 'active', 'instagram', now() - interval '130 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '100658df-8d13-45f3-871c-6950667a947b');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT 'af5c4971-b50c-49d4-8f00-fd6fc2b1434b', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '@declanbuilds', '@declanbuilds', NULL, NULL, 'customer', 'active', 'instagram', now() - interval '1360 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = 'af5c4971-b50c-49d4-8f00-fd6fc2b1434b');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT '78f44d57-0546-4b34-8f01-6c4f99976926', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'Ruth Adeyemi', 'Ruth Adeyemi', NULL, NULL, 'customer', 'active', 'messenger', now() - interval '460 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '78f44d57-0546-4b34-8f01-6c4f99976926');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT '27289db3-572b-44aa-9f3b-e87536917c0e', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'Callum Reyes', 'Callum Reyes', NULL, NULL, 'customer', 'active', 'messenger', now() - interval '100 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '27289db3-572b-44aa-9f3b-e87536917c0e');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT 'b3f1ee5c-673e-4636-8906-6bbb1df32b7b', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'Mika Andersson', 'Mika Andersson', NULL, NULL, 'customer', 'active', 'telegram', now() - interval '820 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = 'b3f1ee5c-673e-4636-8906-6bbb1df32b7b');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT '82c95ea0-377e-4a92-aa3a-9be6a2ff2d38', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'Antoine Girard', 'Antoine Girard', NULL, NULL, 'customer', 'active', 'telegram', now() - interval '80 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '82c95ea0-377e-4a92-aa3a-9be6a2ff2d38');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT 'db1fac5c-448e-4cd7-b5c8-681bc69169ef', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'Vivian Cho', 'Vivian Cho', NULL, 'vivian.cho@brightplace.example', 'customer', 'active', 'email', now() - interval '380 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = 'db1fac5c-448e-4cd7-b5c8-681bc69169ef');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT '2dae715c-6854-4f32-b795-dc886c56b83d', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'Marcus Bell', 'Marcus Bell', NULL, 'marcus.bell@fernhollow.example', 'customer', 'active', 'email', now() - interval '1710 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '2dae715c-6854-4f32-b795-dc886c56b83d');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT 'b9f6553a-3e96-476a-a3e5-0ed709fc42d1', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'Bianca Ferreira', 'Bianca Ferreira', '+1 555 5510', NULL, 'customer', 'active', 'sms', now() - interval '120 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = 'b9f6553a-3e96-476a-a3e5-0ed709fc42d1');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT '19513a0d-de08-41c5-94c4-e5cfaa08294d', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'Leo Kaczmarek', 'Leo Kaczmarek', '+1 555 5511', NULL, 'customer', 'active', 'sms', now() - interval '79 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '19513a0d-de08-41c5-94c4-e5cfaa08294d');

-- Conversations + messages
INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '2aa1da1a-715e-4ee6-8d16-38fd45ae5802', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '5e054674-5786-42ba-b2d1-62f2bdf863d8', '31fd4624-2a5e-43f3-9ad9-d02924f217d9', 'open', 'normal', 'whatsapp', 'f73ff0cb-b666-4ba3-9340-4e1a6c6cf533', '{}'::jsonb, 1, now() - interval '10 minutes', 'That''s exactly what I need — link please?', 'contact', now() - interval '75 minutes', now() - interval '10 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '2aa1da1a-715e-4ee6-8d16-38fd45ae5802');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'eb08c17a-f1f8-4f77-aef9-7542ec8cc527', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '2aa1da1a-715e-4ee6-8d16-38fd45ae5802', 'inbound', 'Hi, does the oak coffee table come in a smaller size for apartments?', 'delivered', 'text', NULL, now() - interval '70 minutes', now() - interval '70 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'eb08c17a-f1f8-4f77-aef9-7542ec8cc527');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '606182ea-8db6-4823-9d62-76cea4193e84', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '2aa1da1a-715e-4ee6-8d16-38fd45ae5802', 'outbound', 'Hi Hannah! Yes, we have a 90cm compact version — same finish, fits tighter spaces.', 'delivered', 'text', '31fd4624-2a5e-43f3-9ad9-d02924f217d9', now() - interval '55 minutes', now() - interval '55 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '606182ea-8db6-4823-9d62-76cea4193e84');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'b0c16e94-622e-4003-9640-d0dbec2cd2b0', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '2aa1da1a-715e-4ee6-8d16-38fd45ae5802', 'inbound', 'That''s exactly what I need — link please?', 'delivered', 'text', NULL, now() - interval '10 minutes', now() - interval '10 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'b0c16e94-622e-4003-9640-d0dbec2cd2b0');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '45a87b05-73fc-486e-928a-964c1b8d9df5', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '71a3b7e8-2ebf-46ad-a0d0-4ec896ca89bd', '31fd4624-2a5e-43f3-9ad9-d02924f217d9', 'resolved', 'high', 'whatsapp', 'f73ff0cb-b666-4ba3-9340-4e1a6c6cf533', '{}'::jsonb, 0, now() - interval '75 minutes', 'Found it, thanks for chasing that down!', 'contact', now() - interval '135 minutes', now() - interval '75 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '45a87b05-73fc-486e-928a-964c1b8d9df5');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '67633ffb-b336-4d51-9b9a-7751161e0541', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '45a87b05-73fc-486e-928a-964c1b8d9df5', 'inbound', 'My delivery says delivered but I never received it.', 'delivered', 'text', NULL, now() - interval '130 minutes', now() - interval '130 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '67633ffb-b336-4d51-9b9a-7751161e0541');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'bfc2602a-f26e-4511-baec-6fb7b50d0d55', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '45a87b05-73fc-486e-928a-964c1b8d9df5', 'outbound', 'I''m sorry Felix, let''s sort this out. Checking with the courier now.', 'delivered', 'text', '31fd4624-2a5e-43f3-9ad9-d02924f217d9', now() - interval '110 minutes', now() - interval '110 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'bfc2602a-f26e-4511-baec-6fb7b50d0d55');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '3f3ad8eb-4723-4c2f-b06d-8654d400c2e4', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '45a87b05-73fc-486e-928a-964c1b8d9df5', 'outbound', 'Found it — it was left with your building concierge per the delivery photo. Can you check there?', 'delivered', 'text', '31fd4624-2a5e-43f3-9ad9-d02924f217d9', now() - interval '90 minutes', now() - interval '90 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '3f3ad8eb-4723-4c2f-b06d-8654d400c2e4');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '3a32102a-cbf5-4f44-b32c-45cc3e219d62', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '45a87b05-73fc-486e-928a-964c1b8d9df5', 'inbound', 'Found it, thanks for chasing that down!', 'delivered', 'text', NULL, now() - interval '75 minutes', now() - interval '75 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '3a32102a-cbf5-4f44-b32c-45cc3e219d62');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT 'fbfc3202-ff8e-4087-8b41-54c125e1682b', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '100658df-8d13-45f3-871c-6950667a947b', NULL, 'open', 'normal', 'instagram', NULL, jsonb_build_object('account_id', '332abf45-f0dd-400e-abc7-77cf3b82fe84'), 1, now() - interval '18 minutes', 'Reserving one, thank you!', 'contact', now() - interval '75 minutes', now() - interval '18 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = 'fbfc3202-ff8e-4087-8b41-54c125e1682b');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '20bb7e0f-5198-44ff-a005-e29fe43b4724', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'fbfc3202-ff8e-4087-8b41-54c125e1682b', 'inbound', 'The ceramic vase set in your latest post — still in stock?', 'delivered', 'text', NULL, now() - interval '70 minutes', now() - interval '70 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '20bb7e0f-5198-44ff-a005-e29fe43b4724');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '992c24b4-64fa-4f2f-9c5e-3ae403880401', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'fbfc3202-ff8e-4087-8b41-54c125e1682b', 'outbound', 'Yes! 6 left in the sage green colorway.', 'delivered', 'text', '31fd4624-2a5e-43f3-9ad9-d02924f217d9', now() - interval '55 minutes', now() - interval '55 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '992c24b4-64fa-4f2f-9c5e-3ae403880401');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '111b03ff-0212-4256-b555-cfcbb2b2de08', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'fbfc3202-ff8e-4087-8b41-54c125e1682b', 'inbound', 'Reserving one, thank you!', 'delivered', 'text', NULL, now() - interval '18 minutes', now() - interval '18 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '111b03ff-0212-4256-b555-cfcbb2b2de08');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '3ca6a190-5382-4b51-a272-5c590f77c94d', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'af5c4971-b50c-49d4-8f00-fd6fc2b1434b', '31fd4624-2a5e-43f3-9ad9-d02924f217d9', 'resolved', 'low', 'instagram', NULL, jsonb_build_object('account_id', '332abf45-f0dd-400e-abc7-77cf3b82fe84'), 0, now() - interval '1250 minutes', 'Perfect, ordering today.', 'contact', now() - interval '1305 minutes', now() - interval '1250 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '3ca6a190-5382-4b51-a272-5c590f77c94d');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '4dffc416-32aa-4e56-a57b-3ba7a1ee4a04', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '3ca6a190-5382-4b51-a272-5c590f77c94d', 'inbound', 'Do you ship the shelving units flat-packed or assembled?', 'delivered', 'text', NULL, now() - interval '1300 minutes', now() - interval '1300 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '4dffc416-32aa-4e56-a57b-3ba7a1ee4a04');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '04b3db05-7cff-4f9e-9c22-70a3fef05ec0', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '3ca6a190-5382-4b51-a272-5c590f77c94d', 'outbound', 'Flat-packed with all hardware included — assembly takes about 20 minutes.', 'delivered', 'text', '31fd4624-2a5e-43f3-9ad9-d02924f217d9', now() - interval '1270 minutes', now() - interval '1270 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '04b3db05-7cff-4f9e-9c22-70a3fef05ec0');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '04078a32-908b-4230-8747-a33bf58b08eb', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '3ca6a190-5382-4b51-a272-5c590f77c94d', 'inbound', 'Perfect, ordering today.', 'delivered', 'text', NULL, now() - interval '1250 minutes', now() - interval '1250 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '04078a32-908b-4230-8747-a33bf58b08eb');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '8ce5d458-e839-4e87-95fe-b2caad3cdb00', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '78f44d57-0546-4b34-8f01-6c4f99976926', NULL, 'pending', 'normal', 'messenger', NULL, jsonb_build_object('account_id', '1231635d-199d-4164-b92c-f6fb11f8839b'), 1, now() - interval '340 minutes', 'Any update on this?', 'contact', now() - interval '405 minutes', now() - interval '340 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '8ce5d458-e839-4e87-95fe-b2caad3cdb00');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'a7a4bd8c-fbc1-4cbd-bd27-fc1aa7485c6c', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '8ce5d458-e839-4e87-95fe-b2caad3cdb00', 'inbound', 'Can I swap the walnut finish for oak on order #7734 before it ships?', 'delivered', 'text', NULL, now() - interval '400 minutes', now() - interval '400 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'a7a4bd8c-fbc1-4cbd-bd27-fc1aa7485c6c');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '252f7044-f68e-4117-b38a-b8b2212ff696', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '8ce5d458-e839-4e87-95fe-b2caad3cdb00', 'outbound', 'Let me check if it''s still in the pre-production queue.', 'delivered', 'text', '31fd4624-2a5e-43f3-9ad9-d02924f217d9', now() - interval '370 minutes', now() - interval '370 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '252f7044-f68e-4117-b38a-b8b2212ff696');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '7d3172b6-24fa-409f-9044-fd9bc04b433d', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '8ce5d458-e839-4e87-95fe-b2caad3cdb00', 'inbound', 'Any update on this?', 'delivered', 'text', NULL, now() - interval '340 minutes', now() - interval '340 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '7d3172b6-24fa-409f-9044-fd9bc04b433d');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '793fe0e7-248a-41ca-9922-02eea247c61b', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '27289db3-572b-44aa-9f3b-e87536917c0e', '31fd4624-2a5e-43f3-9ad9-d02924f217d9', 'open', 'normal', 'messenger', NULL, jsonb_build_object('account_id', '1231635d-199d-4164-b92c-f6fb11f8839b'), 0, now() - interval '28 minutes', 'Custom pieces are final sale, but standard catalog items have a 30-day window.', 'agent', now() - interval '45 minutes', now() - interval '28 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '793fe0e7-248a-41ca-9922-02eea247c61b');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'ccac4bc7-0255-4487-b29d-7194840ac561', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '793fe0e7-248a-41ca-9922-02eea247c61b', 'inbound', 'What''s your return window for custom orders?', 'delivered', 'text', NULL, now() - interval '40 minutes', now() - interval '40 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'ccac4bc7-0255-4487-b29d-7194840ac561');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'bb695838-f87e-473d-b7d5-5c0c08a51a87', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '793fe0e7-248a-41ca-9922-02eea247c61b', 'outbound', 'Custom pieces are final sale, but standard catalog items have a 30-day window.', 'delivered', 'text', '31fd4624-2a5e-43f3-9ad9-d02924f217d9', now() - interval '28 minutes', now() - interval '28 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'bb695838-f87e-473d-b7d5-5c0c08a51a87');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT 'ad0d78e8-d41d-47ac-ae01-8248ee6a3ca2', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'b3f1ee5c-673e-4636-8906-6bbb1df32b7b', '31fd4624-2a5e-43f3-9ad9-d02924f217d9', 'resolved', 'normal', 'telegram', NULL, jsonb_build_object('account_id', 'f2451311-863c-41e7-8564-d32d3bc0c31e'), 0, now() - interval '720 minutes', 'We do — 7-12 business days, flat rate $24.', 'agent', now() - interval '765 minutes', now() - interval '720 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = 'ad0d78e8-d41d-47ac-ae01-8248ee6a3ca2');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'c323fea4-f925-4e82-af48-81ada007e040', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'ad0d78e8-d41d-47ac-ae01-8248ee6a3ca2', 'inbound', '/start', 'delivered', 'text', NULL, now() - interval '760 minutes', now() - interval '760 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'c323fea4-f925-4e82-af48-81ada007e040');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'eafae6e6-575d-4048-a8fb-3463c90d5e4a', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'ad0d78e8-d41d-47ac-ae01-8248ee6a3ca2', 'outbound', 'Welcome to Northbridge Goods! Ask about orders, products or shipping.', 'delivered', 'text', '31fd4624-2a5e-43f3-9ad9-d02924f217d9', now() - interval '759 minutes', now() - interval '759 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'eafae6e6-575d-4048-a8fb-3463c90d5e4a');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '590f136b-d48e-4f81-a4e2-cd47140a0bdf', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'ad0d78e8-d41d-47ac-ae01-8248ee6a3ca2', 'inbound', 'Do you ship to Sweden?', 'delivered', 'text', NULL, now() - interval '740 minutes', now() - interval '740 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '590f136b-d48e-4f81-a4e2-cd47140a0bdf');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '47602814-a2e9-4180-9640-dc2e90cda3e0', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'ad0d78e8-d41d-47ac-ae01-8248ee6a3ca2', 'outbound', 'We do — 7-12 business days, flat rate $24.', 'delivered', 'text', '31fd4624-2a5e-43f3-9ad9-d02924f217d9', now() - interval '720 minutes', now() - interval '720 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '47602814-a2e9-4180-9640-dc2e90cda3e0');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '29a0c306-57fc-40ef-be39-fa7f1ab843f7', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '82c95ea0-377e-4a92-aa3a-9be6a2ff2d38', NULL, 'open', 'normal', 'telegram', NULL, jsonb_build_object('account_id', 'f2451311-863c-41e7-8564-d32d3bc0c31e'), 2, now() - interval '7 minutes', 'Still shows ''processing'' after 5 days', 'contact', now() - interval '25 minutes', now() - interval '7 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '29a0c306-57fc-40ef-be39-fa7f1ab843f7');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'fee249cb-59c2-402c-ae65-408f69e1463f', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '29a0c306-57fc-40ef-be39-fa7f1ab843f7', 'inbound', 'Order #7801 — any tracking update?', 'delivered', 'text', NULL, now() - interval '20 minutes', now() - interval '20 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'fee249cb-59c2-402c-ae65-408f69e1463f');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '19b0683e-959a-4d36-80d2-fba81bc516ba', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '29a0c306-57fc-40ef-be39-fa7f1ab843f7', 'inbound', 'Still shows ''processing'' after 5 days', 'delivered', 'text', NULL, now() - interval '7 minutes', now() - interval '7 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '19b0683e-959a-4d36-80d2-fba81bc516ba');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '998a7633-ab47-48aa-941f-a38ef9dfa0ca', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'db1fac5c-448e-4cd7-b5c8-681bc69169ef', '31fd4624-2a5e-43f3-9ad9-d02924f217d9', 'open', 'normal', 'email', NULL, jsonb_build_object('account_id', '87fcffa9-a0f3-4242-a930-fb247d0167f7'), 1, now() - interval '200 minutes', 'Wonderful, looking forward to it.', 'contact', now() - interval '325 minutes', now() - interval '200 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '998a7633-ab47-48aa-941f-a38ef9dfa0ca');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'f49be997-48a6-4e8a-b9dc-1cfb32195bc7', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '998a7633-ab47-48aa-941f-a38ef9dfa0ca', 'inbound', 'We''re furnishing a boutique hotel and interested in a bulk order — 40 nightstands, 40 lamps. Trade pricing available?', 'delivered', 'text', NULL, now() - interval '320 minutes', now() - interval '320 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'f49be997-48a6-4e8a-b9dc-1cfb32195bc7');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'baeb10c9-cb82-407c-b3d7-be10e6b37b17', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '998a7633-ab47-48aa-941f-a38ef9dfa0ca', 'outbound', 'Hi Vivian, yes — trade orders over 25 units get 18% off list. I''ll prepare a formal quote.', 'delivered', 'text', '31fd4624-2a5e-43f3-9ad9-d02924f217d9', now() - interval '260 minutes', now() - interval '260 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'baeb10c9-cb82-407c-b3d7-be10e6b37b17');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '8ba67bef-e33e-4e9e-baeb-974de775c43b', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '998a7633-ab47-48aa-941f-a38ef9dfa0ca', 'inbound', 'Wonderful, looking forward to it.', 'delivered', 'text', NULL, now() - interval '200 minutes', now() - interval '200 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '8ba67bef-e33e-4e9e-baeb-974de775c43b');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT 'f1a9988f-189f-4b22-90af-f5bd2121cb88', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '2dae715c-6854-4f32-b795-dc886c56b83d', NULL, 'pending', 'normal', 'email', NULL, jsonb_build_object('account_id', '87fcffa9-a0f3-4242-a930-fb247d0167f7'), 0, now() - interval '1600 minutes', 'That''s great service, thank you!', 'contact', now() - interval '1655 minutes', now() - interval '1600 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = 'f1a9988f-189f-4b22-90af-f5bd2121cb88');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '01a69839-37fd-415b-82af-059094ecdec8', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'f1a9988f-189f-4b22-90af-f5bd2121cb88', 'inbound', 'The dining chair I received has a small scratch on one leg — can I get a replacement?', 'delivered', 'text', NULL, now() - interval '1650 minutes', now() - interval '1650 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '01a69839-37fd-415b-82af-059094ecdec8');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'aa86e294-ea64-4846-a840-07c91f65beb9', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'f1a9988f-189f-4b22-90af-f5bd2121cb88', 'outbound', 'So sorry about that Marcus — sending a replacement leg free of charge, no need to return anything.', 'delivered', 'text', '31fd4624-2a5e-43f3-9ad9-d02924f217d9', now() - interval '1620 minutes', now() - interval '1620 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'aa86e294-ea64-4846-a840-07c91f65beb9');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '39b3aa3e-94f6-4131-8691-1f8992444db2', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'f1a9988f-189f-4b22-90af-f5bd2121cb88', 'inbound', 'That''s great service, thank you!', 'delivered', 'text', NULL, now() - interval '1600 minutes', now() - interval '1600 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '39b3aa3e-94f6-4131-8691-1f8992444db2');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT 'e413cc18-69a2-4d3d-bcf9-f44dd5c5c159', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'b9f6553a-3e96-476a-a3e5-0ed709fc42d1', '31fd4624-2a5e-43f3-9ad9-d02924f217d9', 'resolved', 'low', 'sms', NULL, jsonb_build_object('account_id', '34f45787-648a-469d-b2c7-f98f18a48ff7'), 0, now() - interval '42 minutes', 'You''re welcome — enjoy your new pieces!', 'agent', now() - interval '65 minutes', now() - interval '42 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = 'e413cc18-69a2-4d3d-bcf9-f44dd5c5c159');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '8468aa52-e4c4-42a2-a8c5-2dc3464022d4', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'e413cc18-69a2-4d3d-bcf9-f44dd5c5c159', 'outbound', 'Your order #7790 has shipped! Track it here: nb.example/track/7790', 'delivered', 'text', '31fd4624-2a5e-43f3-9ad9-d02924f217d9', now() - interval '60 minutes', now() - interval '60 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '8468aa52-e4c4-42a2-a8c5-2dc3464022d4');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '9a178d1f-836a-4257-bf78-1c9a09a46f64', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'e413cc18-69a2-4d3d-bcf9-f44dd5c5c159', 'inbound', 'Thank you!', 'delivered', 'text', NULL, now() - interval '50 minutes', now() - interval '50 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '9a178d1f-836a-4257-bf78-1c9a09a46f64');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '7e8390eb-84ab-4552-9512-d77765c5b4c6', '64e7d2ac-236d-4a1a-9260-433d25ae3654', 'e413cc18-69a2-4d3d-bcf9-f44dd5c5c159', 'outbound', 'You''re welcome — enjoy your new pieces!', 'delivered', 'text', '31fd4624-2a5e-43f3-9ad9-d02924f217d9', now() - interval '42 minutes', now() - interval '42 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '7e8390eb-84ab-4552-9512-d77765c5b4c6');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '2be20191-9235-4a6b-847f-a13b6b0e2e94', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '19513a0d-de08-41c5-94c4-e5cfaa08294d', NULL, 'open', 'normal', 'sms', NULL, jsonb_build_object('account_id', '34f45787-648a-469d-b2c7-f98f18a48ff7'), 1, now() - interval '14 minutes', 'Sure — reply with the new address and I''ll update it now.', 'agent', now() - interval '24 minutes', now() - interval '14 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '2be20191-9235-4a6b-847f-a13b6b0e2e94');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'cd6e54c4-683c-4543-af24-6f81ba4f967e', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '2be20191-9235-4a6b-847f-a13b6b0e2e94', 'inbound', 'Can I change my delivery address for order #7812?', 'delivered', 'text', NULL, now() - interval '19 minutes', now() - interval '19 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'cd6e54c4-683c-4543-af24-6f81ba4f967e');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '8267963e-d881-44f2-afe7-5dbce2f5cd31', '64e7d2ac-236d-4a1a-9260-433d25ae3654', '2be20191-9235-4a6b-847f-a13b6b0e2e94', 'outbound', 'Sure — reply with the new address and I''ll update it now.', 'delivered', 'text', '31fd4624-2a5e-43f3-9ad9-d02924f217d9', now() - interval '14 minutes', now() - interval '14 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '8267963e-d881-44f2-afe7-5dbce2f5cd31');

  END IF;
END
$demo_seed$;
