-- Atomic document editing. RLS remains enforced as the caller; no privileged
-- SECURITY DEFINER bypass and no client-controlled status or payment totals.
CREATE OR REPLACE FUNCTION public.save_sales_document(
  _kind text, _workspace_id uuid, _document_id uuid, _header jsonb, _lines jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  _id uuid := COALESCE(_document_id, gen_random_uuid());
  _line jsonb;
  _position integer := 0;
  _reference uuid;
  _field text;
  _relation text;
  _allowed boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Workspace access denied' USING ERRCODE = '42501';
  END IF;
  IF _kind NOT IN ('invoice','quote') OR jsonb_typeof(_lines) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid document input';
  END IF;
  -- Every foreign reference must belong to this document's workspace.
  FOREACH _field IN ARRAY ARRAY['contact_id','company_id','deal_id','quote_id'] LOOP
    _reference := NULLIF(_header->>_field, '')::uuid;
    IF _reference IS NOT NULL THEN
      _relation := CASE _field WHEN 'contact_id' THEN 'contacts' WHEN 'company_id' THEN 'companies'
        WHEN 'deal_id' THEN 'deals' ELSE 'quotes' END;
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id=$1 AND workspace_id=$2)', _relation)
        INTO _allowed USING _reference, _workspace_id;
      IF NOT _allowed THEN RAISE EXCEPTION 'Related record is outside the workspace' USING ERRCODE='42501'; END IF;
    END IF;
  END LOOP;
  IF _kind = 'quote' THEN
    IF _document_id IS NOT NULL THEN
      PERFORM 1 FROM public.quotes WHERE id=_id AND workspace_id=_workspace_id AND deleted_at IS NULL FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Quote not found' USING ERRCODE='42501'; END IF;
      UPDATE public.quotes SET title=_header->>'title', currency=_header->>'currency',
        contact_id=(_header->>'contact_id')::uuid, company_id=(_header->>'company_id')::uuid,
        deal_id=(_header->>'deal_id')::uuid, valid_until=(_header->>'valid_until')::date,
        notes=_header->>'notes', terms=_header->>'terms'
      WHERE id=_id AND workspace_id=_workspace_id;
    ELSE
      INSERT INTO public.quotes(id,workspace_id,quote_number,title,currency,contact_id,company_id,deal_id,valid_until,notes,terms)
      VALUES (_id,_workspace_id,_header->>'quote_number',_header->>'title',_header->>'currency',
        (_header->>'contact_id')::uuid,(_header->>'company_id')::uuid,(_header->>'deal_id')::uuid,
        (_header->>'valid_until')::date,_header->>'notes',_header->>'terms');
    END IF;
    DELETE FROM public.quote_line_items WHERE quote_id=_id AND workspace_id=_workspace_id;
  ELSE
    IF _document_id IS NOT NULL THEN
      PERFORM 1 FROM public.invoices WHERE id=_id AND workspace_id=_workspace_id AND deleted_at IS NULL FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found' USING ERRCODE='42501'; END IF;
      UPDATE public.invoices SET currency=_header->>'currency',
        contact_id=(_header->>'contact_id')::uuid, company_id=(_header->>'company_id')::uuid,
        deal_id=(_header->>'deal_id')::uuid, quote_id=(_header->>'quote_id')::uuid,
        issue_date=(_header->>'issue_date')::date, due_date=(_header->>'due_date')::date,
        notes=_header->>'notes', terms=_header->>'terms', external_ref=_header->>'external_ref',
        custom_fields=custom_fields || COALESCE(_header->'custom_fields','{}'::jsonb)
      WHERE id=_id AND workspace_id=_workspace_id;
    ELSE
      INSERT INTO public.invoices(id,workspace_id,invoice_number,currency,contact_id,company_id,deal_id,quote_id,issue_date,due_date,notes,terms,external_ref,custom_fields)
      VALUES (_id,_workspace_id,_header->>'invoice_number',_header->>'currency',
        (_header->>'contact_id')::uuid,(_header->>'company_id')::uuid,(_header->>'deal_id')::uuid,(_header->>'quote_id')::uuid,
        (_header->>'issue_date')::date,(_header->>'due_date')::date,_header->>'notes',_header->>'terms',_header->>'external_ref',
        COALESCE(_header->'custom_fields','{}'::jsonb));
    END IF;
    DELETE FROM public.invoice_line_items WHERE invoice_id=_id AND workspace_id=_workspace_id;
  END IF;
  -- No exception is swallowed: header changes, deletions, triggers and inserts
  -- roll back together if any line is invalid or any RLS check fails.
  FOR _line IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    _reference := NULLIF(_line->>'product_id','')::uuid;
    IF _reference IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.products WHERE id=_reference AND workspace_id=_workspace_id) THEN
      RAISE EXCEPTION 'Product is outside the workspace' USING ERRCODE='42501';
    END IF;
    IF _kind='quote' THEN
      INSERT INTO public.quote_line_items(workspace_id,quote_id,product_id,name,description,quantity,unit_price,discount_pct,tax_rate,sort_order)
      VALUES (_workspace_id,_id,_reference,_line->>'name',_line->>'description',(_line->>'quantity')::numeric,
        (_line->>'unit_price')::numeric,(_line->>'discount_pct')::numeric,(_line->>'tax_rate')::numeric,_position);
    ELSE
      INSERT INTO public.invoice_line_items(workspace_id,invoice_id,product_id,name,description,quantity,unit_price,discount_pct,tax_rate,sort_order)
      VALUES (_workspace_id,_id,_reference,_line->>'name',_line->>'description',(_line->>'quantity')::numeric,
        (_line->>'unit_price')::numeric,(_line->>'discount_pct')::numeric,(_line->>'tax_rate')::numeric,_position);
    END IF;
    _position := _position+1;
  END LOOP;
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_sales_document(text,uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_sales_document(text,uuid,uuid,jsonb,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_drip_sequence(
  _workspace_id uuid, _sequence_id uuid, _header jsonb, _steps jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE _step jsonb; _position integer:=1; _status text; _template uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_workspace_member(_workspace_id,auth.uid()) THEN
    RAISE EXCEPTION 'Workspace access denied' USING ERRCODE='42501';
  END IF;
  SELECT status INTO _status FROM public.drip_sequences
    WHERE id=_sequence_id AND workspace_id=_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sequence not found' USING ERRCODE='42501'; END IF;
  IF _status='active' THEN RAISE EXCEPTION 'Pause the sequence before editing'; END IF;
  IF NULLIF(btrim(_header->>'name'),'') IS NULL OR jsonb_typeof(_steps) IS DISTINCT FROM 'array' OR jsonb_array_length(_steps)=0 THEN
    RAISE EXCEPTION 'Sequence name and at least one step are required';
  END IF;
  UPDATE public.drip_sequences SET name=btrim(_header->>'name'),description=_header->>'description',trigger_type=_header->>'trigger_type'
    WHERE id=_sequence_id AND workspace_id=_workspace_id;
  DELETE FROM public.drip_steps WHERE sequence_id=_sequence_id;
  FOR _step IN SELECT value FROM jsonb_array_elements(_steps) LOOP
    IF COALESCE((_step->>'delay_seconds')::numeric,-1)<0 THEN RAISE EXCEPTION 'Invalid step delay'; END IF;
    _template:=NULLIF(_step->>'template_id','')::uuid;
    IF _template IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.wa_templates WHERE id=_template AND workspace_id=_workspace_id) THEN
      RAISE EXCEPTION 'Template is outside the workspace' USING ERRCODE='42501';
    END IF;
    INSERT INTO public.drip_steps(sequence_id,step_order,step_type,name,delay_seconds,template_id,message_body,media_url,variables)
    VALUES(_sequence_id,_position,'message',_step->>'name',(_step->>'delay_seconds')::integer,_template,
      _step->>'message_body',_step->>'media_url',COALESCE(_step->'variables','{}'::jsonb));
    _position:=_position+1;
  END LOOP;
  RETURN _sequence_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_drip_sequence(uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_drip_sequence(uuid,uuid,jsonb,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.activate_drip_sequence(_sequence_id uuid,_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE _result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_workspace_member(_workspace_id,auth.uid()) THEN
    RAISE EXCEPTION 'Workspace access denied' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.drip_sequences WHERE id=_sequence_id AND workspace_id=_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sequence not found' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.drip_steps WHERE sequence_id=_sequence_id) THEN RAISE EXCEPTION 'Add a message step first'; END IF;
  IF EXISTS(SELECT 1 FROM public.drip_steps s
    LEFT JOIN public.wa_templates t ON t.id=s.template_id AND t.workspace_id=_workspace_id
    LEFT JOIN public.channel_accounts a ON a.id=t.channel_account_id AND a.workspace_id=_workspace_id
    WHERE s.sequence_id=_sequence_id AND (t.id IS NULL OR upper(t.status::text)<>'APPROVED' OR a.status IS DISTINCT FROM 'connected')) THEN
    RAISE EXCEPTION 'Every step needs an approved template with a connected WhatsApp sender';
  END IF;
  UPDATE public.drip_sequences SET status='active' WHERE id=_sequence_id AND workspace_id=_workspace_id
    RETURNING to_jsonb(drip_sequences.*) INTO _result;
  RETURN _result;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_drip_sequence(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.activate_drip_sequence(uuid,uuid) TO authenticated;

-- Cron stages a message and advances its enrollment in one transaction. The
-- campaign foreign key points to a real campaign, never to a drip sequence.
CREATE OR REPLACE FUNCTION public.enqueue_due_drip_step(_enrollment_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE _enrollment public.drip_enrollments; _sequence public.drip_sequences;
  _step public.drip_steps; _next_delay integer; _campaign_id uuid; _phone text;
BEGIN
  SELECT * INTO _enrollment FROM public.drip_enrollments
    WHERE id=_enrollment_id AND status='active' AND next_run_at<=now() FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO _sequence FROM public.drip_sequences WHERE id=_enrollment.sequence_id FOR UPDATE;
  IF _sequence.status IS DISTINCT FROM 'active' THEN RETURN false; END IF;
  SELECT * INTO _step FROM public.drip_steps WHERE sequence_id=_sequence.id
    ORDER BY step_order OFFSET _enrollment.current_step LIMIT 1;
  IF NOT FOUND THEN
    UPDATE public.drip_enrollments SET status='completed',completed_at=now(),next_run_at=NULL WHERE id=_enrollment.id;
    UPDATE public.drip_sequences SET completed_count=completed_count+1 WHERE id=_sequence.id;
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.wa_templates t JOIN public.channel_accounts a ON a.id=t.channel_account_id
      WHERE t.id=_step.template_id AND t.workspace_id=_sequence.workspace_id AND a.workspace_id=_sequence.workspace_id
      AND upper(t.status::text)='APPROVED' AND a.status='connected') THEN
    RAISE EXCEPTION 'Drip step needs an approved template and connected sender';
  END IF;
  SELECT regexp_replace(COALESCE(NULLIF(whatsapp,''),phone),'[+[:space:]().-]','','g') INTO _phone
    FROM public.contacts WHERE id=_enrollment.contact_id AND workspace_id=_sequence.workspace_id AND deleted_at IS NULL AND NOT do_not_contact;
  IF _phone IS NULL OR _phone !~ '^[1-9][0-9]{6,14}$' OR EXISTS (SELECT 1 FROM public.consent_records
      WHERE contact_id=_enrollment.contact_id AND workspace_id=_sequence.workspace_id AND status IN ('opted_out','unsubscribed')) THEN
    UPDATE public.drip_enrollments SET status='exited',exit_reason='Recipient unavailable or opted out',next_run_at=NULL WHERE id=_enrollment.id;
    RETURN false;
  END IF;
  INSERT INTO public.campaigns(workspace_id,name,status,type,channel,template_id,message_body,media_url,template_variables,respect_opt_out)
  VALUES(_sequence.workspace_id,_sequence.name || ' · ' || COALESCE(_step.name,'Step ' || _step.step_order),'running','broadcast','whatsapp',
    _step.template_id,COALESCE(_step.message_body,''),_step.media_url,_step.variables,true) RETURNING id INTO _campaign_id;
  INSERT INTO public.campaign_dispatch_queue(workspace_id,campaign_id,contact_id,phone_number,message_body,media_url,template_id,template_variables,priority,run_at,status)
  VALUES(_sequence.workspace_id,_campaign_id,_enrollment.contact_id,_phone,_step.message_body,_step.media_url,_step.template_id,_step.variables,3,now(),'pending');
  SELECT delay_seconds INTO _next_delay FROM public.drip_steps WHERE sequence_id=_sequence.id
    ORDER BY step_order OFFSET (_enrollment.current_step+1) LIMIT 1;
  UPDATE public.drip_enrollments SET current_step=current_step+1,last_run_at=now(),
    next_run_at=CASE WHEN _next_delay IS NULL THEN NULL ELSE now()+(_next_delay*interval '1 second') END,
    status=CASE WHEN _next_delay IS NULL THEN 'completed' ELSE 'active' END,
    completed_at=CASE WHEN _next_delay IS NULL THEN now() ELSE NULL END
    WHERE id=_enrollment.id;
  IF _next_delay IS NULL THEN UPDATE public.drip_sequences SET completed_count=completed_count+1 WHERE id=_sequence.id; END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_due_drip_step(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_due_drip_step(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.enroll_drip_contact(_workspace_id uuid,_sequence_id uuid,_contact_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE _delay integer; _id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_workspace_member(_workspace_id,auth.uid()) THEN
    RAISE EXCEPTION 'Workspace access denied' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.drip_sequences WHERE id=_sequence_id AND workspace_id=_workspace_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Activate the sequence before enrolling contacts'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.contacts WHERE id=_contact_id AND workspace_id=_workspace_id AND deleted_at IS NULL AND NOT do_not_contact) THEN
    RAISE EXCEPTION 'Contact is unavailable in this workspace' USING ERRCODE='42501';
  END IF;
  SELECT delay_seconds INTO _delay FROM public.drip_steps WHERE sequence_id=_sequence_id ORDER BY step_order LIMIT 1;
  IF _delay IS NULL THEN RAISE EXCEPTION 'Sequence has no steps'; END IF;
  INSERT INTO public.drip_enrollments(sequence_id,contact_id,current_step,status,next_run_at)
    VALUES(_sequence_id,_contact_id,0,'active',now()+(_delay*interval '1 second')) RETURNING id INTO _id;
  UPDATE public.drip_sequences SET enrolled_count=enrolled_count+1 WHERE id=_sequence_id;
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.enroll_drip_contact(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.enroll_drip_contact(uuid,uuid,uuid) TO authenticated;

-- Existing welcome preset finally receives enrollments from future contacts.
CREATE OR REPLACE FUNCTION public.tg_enroll_new_contact_drips()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE _sequence record; _delay integer; _inserted integer;
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.do_not_contact THEN RETURN NEW; END IF;
  FOR _sequence IN SELECT id FROM public.drip_sequences
      WHERE workspace_id=NEW.workspace_id AND status='active' AND trigger_type='contact_created' LOOP
    SELECT delay_seconds INTO _delay FROM public.drip_steps WHERE sequence_id=_sequence.id ORDER BY step_order LIMIT 1;
    IF _delay IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.drip_enrollments(sequence_id,contact_id,current_step,status,next_run_at)
      VALUES(_sequence.id,NEW.id,0,'active',now()+(_delay*interval '1 second')) ON CONFLICT(sequence_id,contact_id) DO NOTHING;
    GET DIAGNOSTICS _inserted=ROW_COUNT;
    IF _inserted>0 THEN UPDATE public.drip_sequences SET enrolled_count=enrolled_count+1 WHERE id=_sequence.id; END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_enroll_new_contact_drips() FROM PUBLIC,anon;
DROP TRIGGER IF EXISTS contacts_enroll_welcome_drips ON public.contacts;
CREATE TRIGGER contacts_enroll_welcome_drips AFTER INSERT ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.tg_enroll_new_contact_drips();

-- Keep the authoritative payment trigger correct when the last successful
-- payment is removed. Preserve drafts for pending/failed payments, and serialize
-- balance calculations so concurrent payments cannot overwrite a newer total.
CREATE OR REPLACE FUNCTION public.tg_payment_sync_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _iid uuid; _paid numeric(18,4); _invoice public.invoices; _status public.invoice_status;
BEGIN
  -- Payment RLS authorizes the payment row's workspace, not its foreign-key
  -- target. This definer must enforce tenant integrity before touching invoices.
  IF TG_OP<>'DELETE' AND NEW.invoice_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.invoices WHERE id=NEW.invoice_id AND workspace_id=NEW.workspace_id
  ) THEN RAISE EXCEPTION 'Invoice does not belong to the payment workspace' USING ERRCODE='42501'; END IF;
  IF TG_OP<>'INSERT' AND OLD.invoice_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.invoices WHERE id=OLD.invoice_id AND workspace_id<>OLD.workspace_id
  ) THEN RAISE EXCEPTION 'Invoice does not belong to the payment workspace' USING ERRCODE='42501'; END IF;
  FOR _iid IN SELECT DISTINCT id FROM unnest(ARRAY[
    CASE WHEN TG_OP<>'INSERT' THEN OLD.invoice_id ELSE NULL END,
    CASE WHEN TG_OP<>'DELETE' THEN NEW.invoice_id ELSE NULL END
  ]) AS target(id) WHERE id IS NOT NULL ORDER BY id LOOP
    SELECT * INTO _invoice FROM public.invoices WHERE id=_iid FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT COALESCE(SUM(amount),0) INTO _paid FROM public.payments
      WHERE invoice_id=_iid AND workspace_id=_invoice.workspace_id AND status='succeeded';
    _status:=CASE
      WHEN _invoice.status IN ('void','refunded') THEN _invoice.status
      WHEN _paid>=_invoice.total AND _invoice.total>0 THEN 'paid'::public.invoice_status
      WHEN _invoice.due_date IS NOT NULL AND _invoice.due_date<current_date AND _paid<_invoice.total
        AND (_paid>0 OR _invoice.status<>'draft') THEN 'overdue'::public.invoice_status
      WHEN _paid>0 AND _paid<_invoice.total THEN 'partial'::public.invoice_status
      WHEN _paid<=0 AND _invoice.status IN ('paid','partial','overdue') THEN 'sent'::public.invoice_status
      ELSE _invoice.status
    END;
    UPDATE public.invoices SET amount_paid=_paid,amount_due=GREATEST(_invoice.total-_paid,0),status=_status,
      paid_at=CASE WHEN _status='paid' THEN COALESCE(paid_at,now()) ELSE NULL END,updated_at=now()
      WHERE id=_iid;
  END LOOP;
  RETURN COALESCE(NEW,OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.tg_payment_sync_invoice() FROM PUBLIC,anon,authenticated;

-- REST writes also need tenant-safe relations, outside the document RPC.
CREATE OR REPLACE FUNCTION public.tg_sales_line_workspace_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE _allowed boolean; _parent_id uuid;
BEGIN
  _parent_id := (to_jsonb(NEW)->>(TG_ARGV[0]||'_id'))::uuid;
  IF TG_ARGV[0]='invoice' THEN
    SELECT EXISTS(SELECT 1 FROM public.invoices WHERE id=_parent_id AND workspace_id=NEW.workspace_id) INTO _allowed;
  ELSIF TG_ARGV[0]='quote' THEN
    SELECT EXISTS(SELECT 1 FROM public.quotes WHERE id=_parent_id AND workspace_id=NEW.workspace_id) INTO _allowed;
  ELSE RAISE EXCEPTION 'Unsupported sales line parent'; END IF;
  IF NOT _allowed THEN RAISE EXCEPTION 'Document does not belong to the line workspace' USING ERRCODE='42501'; END IF;
  IF NEW.product_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM public.products WHERE id=NEW.product_id AND workspace_id=NEW.workspace_id) THEN
    RAISE EXCEPTION 'Product does not belong to the line workspace' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_sales_line_workspace_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS ili_workspace_guard ON public.invoice_line_items;
CREATE TRIGGER ili_workspace_guard BEFORE INSERT OR UPDATE ON public.invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_sales_line_workspace_guard('invoice');
DROP TRIGGER IF EXISTS qli_workspace_guard ON public.quote_line_items;
CREATE TRIGGER qli_workspace_guard BEFORE INSERT OR UPDATE ON public.quote_line_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_sales_line_workspace_guard('quote');

-- Moving a line must remove its amount from the old parent as well as add it
-- to the new one. Ordered parent locks serialize concurrent recalculations.
CREATE OR REPLACE FUNCTION public.tg_aggregate_parent_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE _kind text:=TG_ARGV[0]; _pid uuid; _workspace uuid;
  _sub numeric(18,4); _disc numeric(18,4); _tax numeric(18,4); _tot numeric(18,4);
BEGIN
  FOR _pid IN SELECT DISTINCT id FROM unnest(ARRAY[
      CASE WHEN TG_OP<>'INSERT' THEN (to_jsonb(OLD)->>(_kind||'_id'))::uuid ELSE NULL END,
      CASE WHEN TG_OP<>'DELETE' THEN (to_jsonb(NEW)->>(_kind||'_id'))::uuid ELSE NULL END
    ]) AS target(id) WHERE id IS NOT NULL ORDER BY id LOOP
    IF _kind='quote' THEN
      SELECT workspace_id INTO _workspace FROM public.quotes WHERE id=_pid FOR UPDATE;
      IF NOT FOUND THEN CONTINUE; END IF;
      SELECT COALESCE(SUM(subtotal),0),COALESCE(SUM(subtotal*discount_pct/100.0),0),
        COALESCE(SUM((subtotal-subtotal*discount_pct/100.0)*tax_rate/100.0),0),COALESCE(SUM(total),0)
        INTO _sub,_disc,_tax,_tot FROM public.quote_line_items WHERE quote_id=_pid AND workspace_id=_workspace;
      UPDATE public.quotes SET subtotal=_sub,discount_total=_disc,tax_total=_tax,total=_tot,updated_at=now() WHERE id=_pid;
    ELSIF _kind='invoice' THEN
      SELECT workspace_id INTO _workspace FROM public.invoices WHERE id=_pid FOR UPDATE;
      IF NOT FOUND THEN CONTINUE; END IF;
      SELECT COALESCE(SUM(subtotal),0),COALESCE(SUM(subtotal*discount_pct/100.0),0),
        COALESCE(SUM((subtotal-subtotal*discount_pct/100.0)*tax_rate/100.0),0),COALESCE(SUM(total),0)
        INTO _sub,_disc,_tax,_tot FROM public.invoice_line_items WHERE invoice_id=_pid AND workspace_id=_workspace;
      UPDATE public.invoices SET subtotal=_sub,discount_total=_disc,tax_total=_tax,total=_tot,
        amount_due=GREATEST(_tot-amount_paid,0),updated_at=now() WHERE id=_pid;
    ELSIF _kind='deal' THEN
      SELECT workspace_id INTO _workspace FROM public.deals WHERE id=_pid FOR UPDATE;
      IF NOT FOUND THEN CONTINUE; END IF;
      SELECT COALESCE(SUM(total),0) INTO _tot FROM public.deal_line_items WHERE deal_id=_pid AND workspace_id=_workspace;
      UPDATE public.deals SET amount=_tot,updated_at=now() WHERE id=_pid;
    END IF;
  END LOOP;
  RETURN COALESCE(NEW,OLD);
END;
$$;
