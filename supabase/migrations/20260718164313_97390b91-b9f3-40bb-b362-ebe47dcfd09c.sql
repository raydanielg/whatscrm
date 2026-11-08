-- Auto-invite rules: emails from approved domains auto-join a workspace with a preset role
CREATE TABLE public.workspace_auto_invite_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain text NOT NULL,
  role workspace_role NOT NULL DEFAULT 'agent',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, domain)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_auto_invite_rules TO authenticated;
GRANT ALL ON public.workspace_auto_invite_rules TO service_role;

ALTER TABLE public.workspace_auto_invite_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view auto-invite rules"
ON public.workspace_auto_invite_rules FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Admins can manage auto-invite rules"
ON public.workspace_auto_invite_rules FOR ALL TO authenticated
USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]))
WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));

-- Normalize domain: strip leading '@', lowercase, trim; stamp updated_at
CREATE OR REPLACE FUNCTION public.tg_auto_invite_rule_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.domain := lower(trim(regexp_replace(coalesce(NEW.domain,''), '^@', '')));
  IF NEW.domain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' THEN
    RAISE EXCEPTION 'Invalid domain: %', NEW.domain;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER auto_invite_rule_normalize
BEFORE INSERT OR UPDATE ON public.workspace_auto_invite_rules
FOR EACH ROW EXECUTE FUNCTION public.tg_auto_invite_rule_normalize();

-- Security-definer RPC: applies matching rules for the CURRENT authenticated user.
-- Guards against privilege escalation by requiring a verified email
-- (auth.jwt().email_verified) before granting membership.
CREATE OR REPLACE FUNCTION public.apply_my_auto_invite_rules()
RETURNS TABLE(workspace_id uuid, role workspace_role)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text := lower(coalesce(auth.jwt()->>'email',''));
  _verified boolean := coalesce((auth.jwt()->>'email_verified')::boolean, false);
  _domain text;
  _rule record;
BEGIN
  IF _uid IS NULL OR NOT _verified OR _email = '' THEN RETURN; END IF;
  _domain := split_part(_email, '@', 2);
  IF _domain = '' THEN RETURN; END IF;

  FOR _rule IN
    SELECT r.workspace_id, r.role
      FROM public.workspace_auto_invite_rules r
     WHERE r.is_active AND r.domain = _domain
  LOOP
    INSERT INTO public.workspace_members (workspace_id, user_id, role, status)
    VALUES (_rule.workspace_id, _uid, _rule.role, 'active')
    ON CONFLICT (workspace_id, user_id) DO NOTHING;

    IF FOUND THEN
      INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
      VALUES (_rule.workspace_id, _uid, 'auto_invite_applied', 'workspace_member', _uid::text,
        jsonb_build_object('domain', _domain, 'role', _rule.role));
      workspace_id := _rule.workspace_id;
      role := _rule.role;
      RETURN NEXT;
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.apply_my_auto_invite_rules() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_my_auto_invite_rules() TO authenticated;

CREATE INDEX idx_auto_invite_rules_domain ON public.workspace_auto_invite_rules(domain) WHERE is_active;