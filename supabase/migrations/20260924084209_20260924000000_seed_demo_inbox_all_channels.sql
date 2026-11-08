-- Demo seed: connected accounts + realistic conversations across every channel.
-- Target: E2E-WS-A (admin@demo.com's primary demo workspace).
-- Idempotent: each INSERT is guarded by a NOT EXISTS check on a fixed id.

-- Demo accounts are optional; fresh projects do not have this workspace.
DO $demo_seed$
BEGIN
  IF EXISTS (SELECT 1 FROM public.workspaces WHERE id = 'dae855ca-24bd-40a5-838c-ead5c6779d3c') THEN

-- 1. Connected channel accounts -------------------------------------------
INSERT INTO public.channel_accounts (id, workspace_id, provider, display_name, phone_number, phone_number_id, waba_id, status, is_default, last_verified_at, created_at, updated_at)
SELECT '52c27f4d-582f-4a7f-9939-ce9f06a20e93', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'whatsapp_cloud', 'WACRM Support', '+1 555 0142', 'demo_pnid_0142', 'demo_waba_001', 'connected', true, now() - interval '2 days', now() - interval '30 days', now()
WHERE NOT EXISTS (SELECT 1 FROM public.channel_accounts WHERE id = '52c27f4d-582f-4a7f-9939-ce9f06a20e93');
INSERT INTO public.instagram_accounts (id, workspace_id, ig_user_id, username, name, status, connected_at, last_verified_at, created_at, updated_at)
SELECT '53c04607-d7ee-4e5a-8eb3-2dcf8de42b0e', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'demo_ig_user_001', 'wacrm.hq', 'WACRM', 'connected', now() - interval '25 days', now() - interval '1 day', now() - interval '25 days', now()
WHERE NOT EXISTS (SELECT 1 FROM public.instagram_accounts WHERE id = '53c04607-d7ee-4e5a-8eb3-2dcf8de42b0e');
INSERT INTO public.messenger_accounts (id, workspace_id, page_id, page_name, access_token_ciphertext, status, connected_at, last_verified_at, created_at, updated_at)
SELECT '7d71d981-4cc2-4778-958e-766cad026e5d', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'demo_page_001', 'WACRM', 'demo-not-a-real-token', 'connected', now() - interval '25 days', now() - interval '1 day', now() - interval '25 days', now()
WHERE NOT EXISTS (SELECT 1 FROM public.messenger_accounts WHERE id = '7d71d981-4cc2-4778-958e-766cad026e5d');
INSERT INTO public.telegram_accounts (id, workspace_id, bot_id, bot_username, bot_name, bot_token_ciphertext, webhook_secret, status, connected_at, last_verified_at, created_at, updated_at)
SELECT '169e2f3f-a4c6-47db-8d05-6fe37bf1bf62', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'demo_bot_001', 'wacrm_support_bot', 'WACRM Support', 'demo-not-a-real-token', 'demo-secret', 'connected', now() - interval '20 days', now() - interval '1 day', now() - interval '20 days', now()
WHERE NOT EXISTS (SELECT 1 FROM public.telegram_accounts WHERE id = '169e2f3f-a4c6-47db-8d05-6fe37bf1bf62');
INSERT INTO public.email_accounts (id, workspace_id, provider, display_name, from_email, from_name, status, connected_at, last_verified_at, created_at, updated_at)
SELECT '0f1637b7-f140-43f0-9261-99e99874e2dc', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'lovable', 'Support Inbox', 'support@wacrm.wrapcoders.com', 'WACRM Support', 'connected', now() - interval '25 days', now() - interval '1 day', now() - interval '25 days', now()
WHERE NOT EXISTS (SELECT 1 FROM public.email_accounts WHERE id = '0f1637b7-f140-43f0-9261-99e99874e2dc');
INSERT INTO public.sms_accounts (id, workspace_id, provider, display_name, phone_number, status, connected_at, last_verified_at, created_at, updated_at)
SELECT 'abc00556-a814-443c-a731-9aeefc6e5ba2', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'twilio', 'WACRM SMS', '+1 555 0199', 'connected', now() - interval '25 days', now() - interval '1 day', now() - interval '25 days', now()
WHERE NOT EXISTS (SELECT 1 FROM public.sms_accounts WHERE id = 'abc00556-a814-443c-a731-9aeefc6e5ba2');

-- 2. Contacts ---------------------------------------------------------------
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT 'dbfae3c1-6e08-4aab-acbb-492b46cee842', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'Maria Gonzalez', 'Maria Gonzalez', '+1 555 3301', NULL, 'customer', 'active', 'whatsapp', now() - interval '300 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = 'dbfae3c1-6e08-4aab-acbb-492b46cee842');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT '731c444d-c301-4d5a-b90f-e16c38591305', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'David Okafor', 'David Okafor', '+1 555 3302', NULL, 'customer', 'active', 'whatsapp', now() - interval '120 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '731c444d-c301-4d5a-b90f-e16c38591305');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT '882769f9-202f-466a-9cbc-7e4285945bda', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'Priya Nair', 'Priya Nair', '+1 555 3303', NULL, 'customer', 'active', 'whatsapp', now() - interval '360 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '882769f9-202f-466a-9cbc-7e4285945bda');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT 'd63d3416-8012-4c2d-a862-c7746722bcf5', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '@luna.creates', '@luna.creates', NULL, NULL, 'customer', 'active', 'instagram', now() - interval '150 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = 'd63d3416-8012-4c2d-a862-c7746722bcf5');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT '6935625f-9d07-4b24-8f0b-cdeff7d376bc', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '@marcus.builds', '@marcus.builds', NULL, NULL, 'customer', 'active', 'instagram', now() - interval '1510 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '6935625f-9d07-4b24-8f0b-cdeff7d376bc');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT 'b4f46f35-aef7-4849-9f1b-79bcbc834036', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'Aisha Bello', 'Aisha Bello', NULL, NULL, 'customer', 'active', 'messenger', now() - interval '105 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = 'b4f46f35-aef7-4849-9f1b-79bcbc834036');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT '5e5a175d-a9bd-4743-bca4-b79cad6cac2a', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'Tom Richter', 'Tom Richter', NULL, NULL, 'customer', 'active', 'messenger', now() - interval '460 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '5e5a175d-a9bd-4743-bca4-b79cad6cac2a');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT '3db994d4-67bb-47be-a2b5-1c2d0fa4494d', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'Yuki Tanaka', 'Yuki Tanaka', NULL, NULL, 'customer', 'active', 'telegram', now() - interval '710 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '3db994d4-67bb-47be-a2b5-1c2d0fa4494d');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT '00da3164-da01-4276-9663-9328f0cb8285', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'Carlos Mendes', 'Carlos Mendes', NULL, NULL, 'customer', 'active', 'telegram', now() - interval '80 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '00da3164-da01-4276-9663-9328f0cb8285');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT 'dc31ebe1-7b83-45a1-ad9f-901fd55541ad', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'Rachel Kim', 'Rachel Kim', NULL, 'rachel.kim@northgate-co.example', 'customer', 'active', 'email', now() - interval '240 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = 'dc31ebe1-7b83-45a1-ad9f-901fd55541ad');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT '28c7f03c-04ab-4f78-af8c-03ffdd18a978', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'Ben Fischer', 'Ben Fischer', NULL, 'ben@fischerstudio.example', 'customer', 'active', 'email', now() - interval '2360 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '28c7f03c-04ab-4f78-af8c-03ffdd18a978');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT 'b2dd5f19-7031-4a1e-9c79-59d7bf8852fb', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'Jenna Park', 'Jenna Park', '+1 555 3310', NULL, 'customer', 'active', 'sms', now() - interval '130 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = 'b2dd5f19-7031-4a1e-9c79-59d7bf8852fb');
INSERT INTO public.contacts (id, workspace_id, name, display_name, phone, email, lifecycle_stage, status, source, created_at, updated_at)
SELECT '0393240f-269d-4342-94b2-d123b890a215', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'Omar Siddiqui', 'Omar Siddiqui', '+1 555 3311', NULL, 'customer', 'active', 'sms', now() - interval '85 minutes', now()
WHERE NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = '0393240f-269d-4342-94b2-d123b890a215');

-- 3. Conversations + messages -------------------------------------------------
INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '0cf08166-d977-4aca-addb-c86130116fa0', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'dbfae3c1-6e08-4aab-acbb-492b46cee842', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', 'resolved', 'normal', 'whatsapp', '52c27f4d-582f-4a7f-9939-ce9f06a20e93', '{}'::jsonb, 0, now() - interval '40 minutes', 'You''re welcome! Let us know if you need anything else.', 'agent', now() - interval '245 minutes', now() - interval '40 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '0cf08166-d977-4aca-addb-c86130116fa0');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '7046d8ed-e812-4ccf-982b-a10844fe1961', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '0cf08166-d977-4aca-addb-c86130116fa0', 'inbound', 'Hi! Do you know when my order #4821 will ship?', 'delivered', 'text', NULL, now() - interval '240 minutes', now() - interval '240 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '7046d8ed-e812-4ccf-982b-a10844fe1961');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'd4d3fb21-801a-4d42-8f05-7633b082e6cf', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '0cf08166-d977-4aca-addb-c86130116fa0', 'outbound', 'Hi Maria, let me check that for you right away.', 'delivered', 'text', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', now() - interval '220 minutes', now() - interval '220 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'd4d3fb21-801a-4d42-8f05-7633b082e6cf');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '233e5f00-0376-4113-9071-b5d5c471e23c', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '0cf08166-d977-4aca-addb-c86130116fa0', 'outbound', 'Your order shipped this morning — tracking number is 1Z9F8X2. Expect delivery in 2-3 business days.', 'delivered', 'text', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', now() - interval '210 minutes', now() - interval '210 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '233e5f00-0376-4113-9071-b5d5c471e23c');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '1cb0164c-9e77-40e0-a529-6f8589cf4c6f', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '0cf08166-d977-4aca-addb-c86130116fa0', 'inbound', 'Perfect, thank you so much! 🙏', 'delivered', 'text', NULL, now() - interval '195 minutes', now() - interval '195 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '1cb0164c-9e77-40e0-a529-6f8589cf4c6f');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'fd903a69-70c7-4f58-ba0e-199ce8ae9fb7', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '0cf08166-d977-4aca-addb-c86130116fa0', 'outbound', 'You''re welcome! Let us know if you need anything else.', 'delivered', 'text', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', now() - interval '40 minutes', now() - interval '40 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'fd903a69-70c7-4f58-ba0e-199ce8ae9fb7');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '2570f4a0-d48e-46cb-9ffd-e2bf89b57f5b', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '731c444d-c301-4d5a-b90f-e16c38591305', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', 'open', 'high', 'whatsapp', '52c27f4d-582f-4a7f-9939-ce9f06a20e93', '{}'::jsonb, 2, now() - interval '8 minutes', 'Any update? This is affecting my subscription access.', 'contact', now() - interval '65 minutes', now() - interval '8 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '2570f4a0-d48e-46cb-9ffd-e2bf89b57f5b');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '595dce82-4c21-43ad-8939-439fa025ea62', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '2570f4a0-d48e-46cb-9ffd-e2bf89b57f5b', 'inbound', 'My last two payments went through but I still see ''past due'' on my account.', 'delivered', 'text', NULL, now() - interval '60 minutes', now() - interval '60 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '595dce82-4c21-43ad-8939-439fa025ea62');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '89a6fdf1-b9fe-486a-b360-2eb4c5ddbe5c', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '2570f4a0-d48e-46cb-9ffd-e2bf89b57f5b', 'outbound', 'Sorry about that David — can you send the payment reference IDs?', 'delivered', 'text', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', now() - interval '50 minutes', now() - interval '50 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '89a6fdf1-b9fe-486a-b360-2eb4c5ddbe5c');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'ed5cc11f-2744-4947-85c8-b5389f45221a', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '2570f4a0-d48e-46cb-9ffd-e2bf89b57f5b', 'inbound', 'REF-88213 and REF-88214', 'delivered', 'text', NULL, now() - interval '30 minutes', now() - interval '30 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'ed5cc11f-2744-4947-85c8-b5389f45221a');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'f068d08b-ab22-43ec-9651-aa7384267f08', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '2570f4a0-d48e-46cb-9ffd-e2bf89b57f5b', 'inbound', 'Any update? This is affecting my subscription access.', 'delivered', 'text', NULL, now() - interval '8 minutes', now() - interval '8 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'f068d08b-ab22-43ec-9651-aa7384267f08');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT 'fca2e4db-1850-4b21-9abe-3b7fe21c2b54', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '882769f9-202f-466a-9cbc-7e4285945bda', NULL, 'pending', 'normal', 'whatsapp', '52c27f4d-582f-4a7f-9939-ce9f06a20e93', '{}'::jsonb, 1, now() - interval '130 minutes', 'Great — can you send a formal quote I can share with finance?', 'contact', now() - interval '305 minutes', now() - interval '130 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = 'fca2e4db-1850-4b21-9abe-3b7fe21c2b54');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '4303e65b-95c5-41a1-a3e8-8f9a5f025852', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'fca2e4db-1850-4b21-9abe-3b7fe21c2b54', 'inbound', 'Hello, I''m interested in the annual plan for a 25-person team. What''s the per-seat pricing?', 'delivered', 'text', NULL, now() - interval '300 minutes', now() - interval '300 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '4303e65b-95c5-41a1-a3e8-8f9a5f025852');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'e12808a5-218a-40f2-bf4f-73b444f2aa31', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'fca2e4db-1850-4b21-9abe-3b7fe21c2b54', 'outbound', 'Hi Priya! For 25 seats on annual billing it works out to $19/seat/month, billed yearly.', 'delivered', 'text', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', now() - interval '280 minutes', now() - interval '280 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'e12808a5-218a-40f2-bf4f-73b444f2aa31');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '0857c4b2-14bd-43a6-b4dc-00b2b1fc06e4', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'fca2e4db-1850-4b21-9abe-3b7fe21c2b54', 'inbound', 'Great — can you send a formal quote I can share with finance?', 'delivered', 'text', NULL, now() - interval '130 minutes', now() - interval '130 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '0857c4b2-14bd-43a6-b4dc-00b2b1fc06e4');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '057430fa-991d-4e84-a508-b944c4692ba4', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'd63d3416-8012-4c2d-a862-c7746722bcf5', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', 'open', 'normal', 'instagram', NULL, jsonb_build_object('account_id', '53c04607-d7ee-4e5a-8eb3-2dcf8de42b0e'), 1, now() - interval '22 minutes', 'Amazing, is there a free trial?', 'contact', now() - interval '95 minutes', now() - interval '22 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '057430fa-991d-4e84-a508-b944c4692ba4');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '2a6bf791-90d4-41f2-b526-ce324778ed7a', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '057430fa-991d-4e84-a508-b944c4692ba4', 'inbound', 'Saw your reel on the workflow builder 👀 does it support conditional branches?', 'delivered', 'text', NULL, now() - interval '90 minutes', now() - interval '90 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '2a6bf791-90d4-41f2-b526-ce324778ed7a');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '84d7de28-26bd-4fdd-9016-b446000bd9f0', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '057430fa-991d-4e84-a508-b944c4692ba4', 'outbound', 'It does! You can branch on any field, tag or event, and nest branches too.', 'delivered', 'text', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', now() - interval '75 minutes', now() - interval '75 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '84d7de28-26bd-4fdd-9016-b446000bd9f0');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'a63d79dd-cfc6-4c8f-bf43-a4aeb0b9c7aa', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '057430fa-991d-4e84-a508-b944c4692ba4', 'inbound', 'Amazing, is there a free trial?', 'delivered', 'text', NULL, now() - interval '22 minutes', now() - interval '22 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'a63d79dd-cfc6-4c8f-bf43-a4aeb0b9c7aa');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '7f4c4913-9258-4c16-882c-1051fb9694b6', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '6935625f-9d07-4b24-8f0b-cdeff7d376bc', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', 'resolved', 'low', 'instagram', NULL, jsonb_build_object('account_id', '53c04607-d7ee-4e5a-8eb3-2dcf8de42b0e'), 0, now() - interval '1400 minutes', 'Found it, thank you!', 'contact', now() - interval '1455 minutes', now() - interval '1400 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '7f4c4913-9258-4c16-882c-1051fb9694b6');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'b282e221-7677-4d06-8367-6ffd26a81f60', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '7f4c4913-9258-4c16-882c-1051fb9694b6', 'inbound', 'When''s the WhatsApp catalog feature dropping for everyone?', 'delivered', 'text', NULL, now() - interval '1450 minutes', now() - interval '1450 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'b282e221-7677-4d06-8367-6ffd26a81f60');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '315f9b47-634c-4df3-9a72-872f51ae4db3', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '7f4c4913-9258-4c16-882c-1051fb9694b6', 'outbound', 'It''s already live! Check Commerce → WhatsApp Catalog in the sidebar.', 'delivered', 'text', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', now() - interval '1430 minutes', now() - interval '1430 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '315f9b47-634c-4df3-9a72-872f51ae4db3');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'e2906d99-c6e1-43c0-bd2c-40534db92d2c', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '7f4c4913-9258-4c16-882c-1051fb9694b6', 'inbound', 'Found it, thank you!', 'delivered', 'text', NULL, now() - interval '1400 minutes', now() - interval '1400 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'e2906d99-c6e1-43c0-bd2c-40534db92d2c');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '1d76f8f2-2c4e-4dd2-9ae9-a6adbaa389fe', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'b4f46f35-aef7-4849-9f1b-79bcbc834036', NULL, 'open', 'normal', 'messenger', NULL, jsonb_build_object('account_id', '7d71d981-4cc2-4778-958e-766cad026e5d'), 1, now() - interval '15 minutes', '4pm ET works great.', 'contact', now() - interval '50 minutes', now() - interval '15 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '1d76f8f2-2c4e-4dd2-9ae9-a6adbaa389fe');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'aa441388-d2e8-480b-9dab-cf8dfbc3dabc', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '1d76f8f2-2c4e-4dd2-9ae9-a6adbaa389fe', 'inbound', 'Hi, can I book a demo call for Thursday afternoon?', 'delivered', 'text', NULL, now() - interval '45 minutes', now() - interval '45 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'aa441388-d2e8-480b-9dab-cf8dfbc3dabc');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'bb158c20-cff3-4576-b8fb-d817a7307175', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '1d76f8f2-2c4e-4dd2-9ae9-a6adbaa389fe', 'outbound', 'Sure! I have 2pm or 4pm ET open Thursday — which works better?', 'delivered', 'text', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', now() - interval '35 minutes', now() - interval '35 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'bb158c20-cff3-4576-b8fb-d817a7307175');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '4fa10149-b31c-4946-a19d-fd59014b7338', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '1d76f8f2-2c4e-4dd2-9ae9-a6adbaa389fe', 'inbound', '4pm ET works great.', 'delivered', 'text', NULL, now() - interval '15 minutes', now() - interval '15 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '4fa10149-b31c-4946-a19d-fd59014b7338');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '73d6bd9b-2ef5-4ebd-86fc-5f66c161f45b', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '5e5a175d-a9bd-4743-bca4-b79cad6cac2a', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', 'pending', 'high', 'messenger', NULL, jsonb_build_object('account_id', '7d71d981-4cc2-4778-958e-766cad026e5d'), 0, now() - interval '320 minutes', 'Update: the carrier confirmed it''s out for delivery today, arriving by 6pm.', 'agent', now() - interval '405 minutes', now() - interval '320 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '73d6bd9b-2ef5-4ebd-86fc-5f66c161f45b');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '656790f3-5390-4ccb-9fb3-8352dd0cba00', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '73d6bd9b-2ef5-4ebd-86fc-5f66c161f45b', 'inbound', 'My package was supposed to arrive Tuesday, it''s now Friday and still nothing.', 'delivered', 'text', NULL, now() - interval '400 minutes', now() - interval '400 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '656790f3-5390-4ccb-9fb3-8352dd0cba00');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '360a7269-c1eb-4abd-a41d-1110411234fb', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '73d6bd9b-2ef5-4ebd-86fc-5f66c161f45b', 'outbound', 'I''m really sorry Tom. Let me escalate this with the carrier right now.', 'delivered', 'text', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', now() - interval '380 minutes', now() - interval '380 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '360a7269-c1eb-4abd-a41d-1110411234fb');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '9a964342-0eb4-4c44-9e13-f50dd9c89f0a', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '73d6bd9b-2ef5-4ebd-86fc-5f66c161f45b', 'outbound', 'Update: the carrier confirmed it''s out for delivery today, arriving by 6pm.', 'delivered', 'text', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', now() - interval '320 minutes', now() - interval '320 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '9a964342-0eb4-4c44-9e13-f50dd9c89f0a');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '662706f8-8052-4262-81a1-7fc6b07d1f24', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '3db994d4-67bb-47be-a2b5-1c2d0fa4494d', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', 'resolved', 'normal', 'telegram', NULL, jsonb_build_object('account_id', '169e2f3f-a4c6-47db-8d05-6fe37bf1bf62'), 0, now() - interval '600 minutes', 'Got it, working now — thanks!', 'contact', now() - interval '655 minutes', now() - interval '600 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '662706f8-8052-4262-81a1-7fc6b07d1f24');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '326eac4e-91ac-49f0-82fe-4df9a81e03d0', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '662706f8-8052-4262-81a1-7fc6b07d1f24', 'inbound', '/start', 'delivered', 'text', NULL, now() - interval '650 minutes', now() - interval '650 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '326eac4e-91ac-49f0-82fe-4df9a81e03d0');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '065c289e-6607-46ed-8c90-5c69afa5677c', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '662706f8-8052-4262-81a1-7fc6b07d1f24', 'outbound', 'Welcome! I''m the WACRM support bot. Type a question or ''agent'' to talk to a human.', 'delivered', 'text', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', now() - interval '649 minutes', now() - interval '649 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '065c289e-6607-46ed-8c90-5c69afa5677c');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '31958023-40c2-485e-a020-74a37c80a9f2', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '662706f8-8052-4262-81a1-7fc6b07d1f24', 'inbound', 'agent — I need help connecting my second WhatsApp number', 'delivered', 'text', NULL, now() - interval '630 minutes', now() - interval '630 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '31958023-40c2-485e-a020-74a37c80a9f2');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '3ab703ea-c585-42ea-bf93-6e691b186b61', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '662706f8-8052-4262-81a1-7fc6b07d1f24', 'outbound', 'Connecting you now. Hi Yuki, you can add a second number under Settings → Channels → Add WhatsApp Account.', 'delivered', 'text', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', now() - interval '610 minutes', now() - interval '610 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '3ab703ea-c585-42ea-bf93-6e691b186b61');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '022c90b3-85dc-4ac8-b2b7-27fa94c8c1e4', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '662706f8-8052-4262-81a1-7fc6b07d1f24', 'inbound', 'Got it, working now — thanks!', 'delivered', 'text', NULL, now() - interval '600 minutes', now() - interval '600 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '022c90b3-85dc-4ac8-b2b7-27fa94c8c1e4');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '7110c306-e493-40af-81b3-61094bfe38f4', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '00da3164-da01-4276-9663-9328f0cb8285', NULL, 'open', 'normal', 'telegram', NULL, jsonb_build_object('account_id', '169e2f3f-a4c6-47db-8d05-6fe37bf1bf62'), 3, now() - interval '5 minutes', 'Following up on this when you get a chance 🙂', 'contact', now() - interval '25 minutes', now() - interval '5 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '7110c306-e493-40af-81b3-61094bfe38f4');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'e15a23c5-f0da-4cdf-b8d4-7d931c7f2683', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '7110c306-e493-40af-81b3-61094bfe38f4', 'inbound', 'Does the public REST API support bulk contact import?', 'delivered', 'text', NULL, now() - interval '20 minutes', now() - interval '20 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'e15a23c5-f0da-4cdf-b8d4-7d931c7f2683');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'f6b44eb9-49e2-4d87-a2d2-69ad3d76414c', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '7110c306-e493-40af-81b3-61094bfe38f4', 'inbound', 'Also — what''s the rate limit?', 'delivered', 'text', NULL, now() - interval '12 minutes', now() - interval '12 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'f6b44eb9-49e2-4d87-a2d2-69ad3d76414c');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '75097232-5102-4948-ad27-4f12f772bd96', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '7110c306-e493-40af-81b3-61094bfe38f4', 'inbound', 'Following up on this when you get a chance 🙂', 'delivered', 'text', NULL, now() - interval '5 minutes', now() - interval '5 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '75097232-5102-4948-ad27-4f12f772bd96');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT 'cbdbb2dd-b759-48e0-922c-3fa0632ea883', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'dc31ebe1-7b83-45a1-ad9f-901fd55541ad', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', 'open', 'normal', 'email', NULL, jsonb_build_object('account_id', '0f1637b7-f140-43f0-9261-99e99874e2dc'), 1, now() - interval '95 minutes', 'This is perfect, thank you! One more — can future invoices CC accounting@northgate-co.example?', 'contact', now() - interval '185 minutes', now() - interval '95 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = 'cbdbb2dd-b759-48e0-922c-3fa0632ea883');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'ec0bf84e-ad6f-44d9-a5ea-0a0785633cc1', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'cbdbb2dd-b759-48e0-922c-3fa0632ea883', 'inbound', 'Hi, could you send an itemized invoice for March? Our finance team needs it for reconciliation.', 'delivered', 'text', NULL, now() - interval '180 minutes', now() - interval '180 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'ec0bf84e-ad6f-44d9-a5ea-0a0785633cc1');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '1e99c7ec-8c16-42e3-b0c8-77bc45364cd5', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'cbdbb2dd-b759-48e0-922c-3fa0632ea883', 'outbound', 'Hi Rachel, attaching the itemized March invoice now — let me know if you need anything reformatted.', 'delivered', 'text', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', now() - interval '150 minutes', now() - interval '150 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '1e99c7ec-8c16-42e3-b0c8-77bc45364cd5');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '4a0f82c6-ddf8-46d1-b3f5-e77e76c7e807', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'cbdbb2dd-b759-48e0-922c-3fa0632ea883', 'inbound', 'This is perfect, thank you! One more — can future invoices CC accounting@northgate-co.example?', 'delivered', 'text', NULL, now() - interval '95 minutes', now() - interval '95 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '4a0f82c6-ddf8-46d1-b3f5-e77e76c7e807');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '2e1dbafc-1695-45e9-a908-a60afecd5037', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '28c7f03c-04ab-4f78-af8c-03ffdd18a978', NULL, 'pending', 'normal', 'email', NULL, jsonb_build_object('account_id', '0f1637b7-f140-43f0-9261-99e99874e2dc'), 0, now() - interval '2200 minutes', 'Sounds great, looking forward to it.', 'contact', now() - interval '2305 minutes', now() - interval '2200 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '2e1dbafc-1695-45e9-a908-a60afecd5037');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '194933c4-2985-43a1-8f5b-8ed1f10eeb49', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '2e1dbafc-1695-45e9-a908-a60afecd5037', 'inbound', 'We run a small agency and want to resell WACRM to our clients — is there a partner program?', 'delivered', 'text', NULL, now() - interval '2300 minutes', now() - interval '2300 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '194933c4-2985-43a1-8f5b-8ed1f10eeb49');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '8cda8ed8-315e-4520-a16c-59b107034898', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '2e1dbafc-1695-45e9-a908-a60afecd5037', 'outbound', 'Hi Ben, yes — our partner program includes revenue share and white-label options. I''ll send the deck.', 'delivered', 'text', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', now() - interval '2250 minutes', now() - interval '2250 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '8cda8ed8-315e-4520-a16c-59b107034898');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '0f7dfe26-74af-4360-a4a9-06631107a78f', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '2e1dbafc-1695-45e9-a908-a60afecd5037', 'inbound', 'Sounds great, looking forward to it.', 'delivered', 'text', NULL, now() - interval '2200 minutes', now() - interval '2200 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '0f7dfe26-74af-4360-a4a9-06631107a78f');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '829511d9-f02c-4f89-88ec-0d99e80eabd3', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', 'b2dd5f19-7031-4a1e-9c79-59d7bf8852fb', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', 'resolved', 'low', 'sms', NULL, jsonb_build_object('account_id', 'abc00556-a814-443c-a731-9aeefc6e5ba2'), 0, now() - interval '50 minutes', 'Confirmed! See you then.', 'agent', now() - interval '75 minutes', now() - interval '50 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '829511d9-f02c-4f89-88ec-0d99e80eabd3');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '09b02211-540d-414a-ba03-8f1dcbd1b466', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '829511d9-f02c-4f89-88ec-0d99e80eabd3', 'outbound', 'Reminder: your appointment with WACRM Support is tomorrow at 10:00 AM. Reply C to confirm.', 'delivered', 'text', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', now() - interval '70 minutes', now() - interval '70 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '09b02211-540d-414a-ba03-8f1dcbd1b466');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'd2ead7ed-2bba-4d55-8159-4f9406e75a05', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '829511d9-f02c-4f89-88ec-0d99e80eabd3', 'inbound', 'C', 'delivered', 'text', NULL, now() - interval '60 minutes', now() - interval '60 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'd2ead7ed-2bba-4d55-8159-4f9406e75a05');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '72a6c479-dd24-47dc-92bb-5e9d0f98607f', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '829511d9-f02c-4f89-88ec-0d99e80eabd3', 'outbound', 'Confirmed! See you then.', 'delivered', 'text', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', now() - interval '50 minutes', now() - interval '50 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '72a6c479-dd24-47dc-92bb-5e9d0f98607f');

INSERT INTO public.conversations (id, workspace_id, contact_id, assigned_to, status, priority, channel, channel_account_id, metadata, unread_count, last_message_at, last_message_preview, last_message_from, created_at, updated_at)
SELECT '28e1c15e-b0b3-4251-9a12-a4ad9f77dde9', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '0393240f-269d-4342-94b2-d123b890a215', NULL, 'open', 'normal', 'sms', NULL, jsonb_build_object('account_id', 'abc00556-a814-443c-a731-9aeefc6e5ba2'), 1, now() - interval '18 minutes', 'Checking now — one moment.', 'agent', now() - interval '30 minutes', now() - interval '18 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '28e1c15e-b0b3-4251-9a12-a4ad9f77dde9');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT 'b31390f9-4b5e-45dd-838a-401921ced966', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '28e1c15e-b0b3-4251-9a12-a4ad9f77dde9', 'inbound', 'Is order #5190 still on track for today?', 'delivered', 'text', NULL, now() - interval '25 minutes', now() - interval '25 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'b31390f9-4b5e-45dd-838a-401921ced966');
INSERT INTO public.messages (id, workspace_id, conversation_id, direction, body, status, message_type, sent_by, created_at, updated_at)
SELECT '84a85883-6b45-49d0-9100-24b4c5ccc76e', 'dae855ca-24bd-40a5-838c-ead5c6779d3c', '28e1c15e-b0b3-4251-9a12-a4ad9f77dde9', 'outbound', 'Checking now — one moment.', 'delivered', 'text', 'd099fa44-2b9a-42e4-bc10-4d9632c8c035', now() - interval '18 minutes', now() - interval '18 minutes'
WHERE NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '84a85883-6b45-49d0-9100-24b4c5ccc76e');

  END IF;
END
$demo_seed$;
