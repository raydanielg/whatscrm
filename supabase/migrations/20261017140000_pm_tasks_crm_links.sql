-- Links a Project Management task back to the CRM contact/conversation it
-- was created from (inbox "Assign to task"), so the Customer Profile
-- sidebar's "Open tasks" can show Project Management tasks alongside CRM
-- tasks. Nullable — most pm_tasks have no CRM origin. Mirrors the
-- (workspace_id, id) composite-FK pattern already used by
-- pm_client_update_rules for the same reason (workspace-scoped join without
-- a second RLS check).
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_workspace_id_id_unique UNIQUE (workspace_id, id);

ALTER TABLE public.pm_tasks
  ADD COLUMN contact_id uuid,
  ADD COLUMN conversation_id uuid,
  ADD CONSTRAINT pm_tasks_contact_fk FOREIGN KEY (workspace_id, contact_id)
    REFERENCES public.contacts(workspace_id, id) ON DELETE SET NULL (contact_id),
  ADD CONSTRAINT pm_tasks_conversation_fk FOREIGN KEY (workspace_id, conversation_id)
    REFERENCES public.conversations(workspace_id, id) ON DELETE SET NULL (conversation_id);

CREATE INDEX pm_tasks_contact_idx ON public.pm_tasks(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX pm_tasks_conversation_idx ON public.pm_tasks(conversation_id) WHERE conversation_id IS NOT NULL;
