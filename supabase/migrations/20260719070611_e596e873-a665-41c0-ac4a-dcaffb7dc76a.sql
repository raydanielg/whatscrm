ALTER TABLE public.ticket_crm_links DROP CONSTRAINT IF EXISTS ticket_crm_links_entity_type_check;
ALTER TABLE public.ticket_crm_links ADD CONSTRAINT ticket_crm_links_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'contact','company','deal','order','invoice','quote',
    'appointment','product','subscription','conversation',
    'kb_article','workflow','asset'
  ]));
CREATE INDEX IF NOT EXISTS ticket_crm_links_entity_idx ON public.ticket_crm_links (entity_type, entity_id);