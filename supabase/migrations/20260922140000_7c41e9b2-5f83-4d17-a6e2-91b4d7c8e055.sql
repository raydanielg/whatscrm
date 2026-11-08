-- Fix: organizations and workspaces could never be deleted, which also made
-- "delete user" fail in Super Admin.
--
-- tg_organizations_audit() / tg_workspaces_audit() run AFTER DELETE and insert
-- an audit row carrying organization_id = OLD.id (resp. workspace_id = OLD.id).
-- By then the parent row is gone, so audit_logs_organization_id_fkey /
-- audit_logs_workspace_id_fkey reject the insert with 23503 and the whole
-- delete aborts:
--
--   insert or update on table "audit_logs" violates foreign key constraint
--   "audit_logs_organization_id_fkey"
--
-- prepare_platform_user_deletion() deletes any organization left without a
-- successor owner, so it hit this on every user whose org had no second
-- member — surfacing in the UI as "Failed to delete user".
--
-- Note the FK is ON DELETE CASCADE, so even if the row could be written it
-- would be cascaded away with the organization. An audit record of a deletion
-- has to outlive the thing it describes, so on DELETE we write NULL for the
-- foreign key and keep the identifier in resource_id (already present) plus
-- the full row snapshot in changes.

CREATE OR REPLACE FUNCTION public.tg_organizations_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _changes jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF to_jsonb(OLD) - 'updated_at' = to_jsonb(NEW) - 'updated_at' THEN
      RETURN NEW;
    END IF;
    _changes := jsonb_build_object(
      'before', to_jsonb(OLD) - 'updated_at',
      'after',  to_jsonb(NEW) - 'updated_at'
    );
    INSERT INTO public.audit_logs (organization_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (NEW.id, auth.uid(), 'update', 'organization', NEW.id::text, _changes);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- organization_id stays NULL: the row it would reference no longer exists.
    INSERT INTO public.audit_logs (organization_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (NULL, auth.uid(), 'delete', 'organization', OLD.id::text,
            jsonb_build_object('deleted', to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Second defect in the same path: prepare_platform_user_deletion() orders the
-- workspace successor search by `wm.joined_at`, but public.workspace_members
-- has no such column — it has created_at. (organization_members is the table
-- with joined_at, which is presumably where the name came from.) So even once
-- the audit triggers stopped aborting the delete, this raised
-- `column wm.joined_at does not exist` and "delete user" still failed for any
-- user who owned a workspace with other members.
CREATE OR REPLACE FUNCTION public.prepare_platform_user_deletion(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_successor uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  FOR r IN SELECT id FROM public.organizations WHERE owner_id = _user_id LOOP
    SELECT om.user_id INTO v_successor
    FROM public.organization_members om
    WHERE om.organization_id = r.id AND om.user_id <> _user_id
    ORDER BY CASE om.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, om.joined_at
    LIMIT 1;

    IF v_successor IS NULL THEN
      DELETE FROM public.organizations WHERE id = r.id;
    ELSE
      UPDATE public.organizations SET owner_id = v_successor WHERE id = r.id;
      UPDATE public.organization_members
      SET role = 'owner'
      WHERE organization_id = r.id AND user_id = v_successor;
    END IF;
  END LOOP;

  FOR r IN SELECT id FROM public.workspaces WHERE owner_id = _user_id LOOP
    SELECT wm.user_id INTO v_successor
    FROM public.workspace_members wm
    WHERE wm.workspace_id = r.id AND wm.user_id <> _user_id AND wm.status = 'active'
    ORDER BY CASE wm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END,
             wm.created_at   -- was wm.joined_at, which does not exist on this table
    LIMIT 1;

    IF v_successor IS NULL THEN
      DELETE FROM public.workspaces WHERE id = r.id;
    ELSE
      UPDATE public.workspaces SET owner_id = v_successor WHERE id = r.id;
      UPDATE public.workspace_members
      SET role = 'owner'
      WHERE workspace_id = r.id AND user_id = v_successor;
    END IF;
  END LOOP;
END;
$$;

-- The same pattern affects every audit trigger that stamps a parent id on
-- DELETE. When a workspace or organization is removed, its members,
-- invitations and CRM rows cascade-delete, and each of those triggers tried to
-- reference the parent that had just gone — so the cascade aborted and
-- effectively nothing could be deleted.
--
-- These three keep the real id for an ordinary single-row delete (where the
-- parent is still there and the context is useful) and resolve to NULL only
-- when the parent has already gone, via a lookup that yields NULL on no match.

CREATE OR REPLACE FUNCTION public.tg_crm_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _resource text := TG_ARGV[0];
  _ws uuid; _org uuid; _action audit_action; _changes jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _ws := (to_jsonb(NEW)->>'workspace_id')::uuid;
    _org := (to_jsonb(NEW)->>'organization_id')::uuid;
    _action := 'create'::audit_action;
    _changes := jsonb_build_object('after', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    IF to_jsonb(OLD) - 'updated_at' = to_jsonb(NEW) - 'updated_at' THEN RETURN NEW; END IF;
    _ws := (to_jsonb(NEW)->>'workspace_id')::uuid;
    _org := (to_jsonb(NEW)->>'organization_id')::uuid;
    _action := 'update'::audit_action;
    _changes := jsonb_build_object('before', to_jsonb(OLD) - 'updated_at', 'after', to_jsonb(NEW) - 'updated_at');
  ELSIF TG_OP = 'DELETE' THEN
    _ws := (SELECT w.id FROM public.workspaces w WHERE w.id = (to_jsonb(OLD)->>'workspace_id')::uuid);
    _org := (SELECT o.id FROM public.organizations o WHERE o.id = (to_jsonb(OLD)->>'organization_id')::uuid);
    _action := 'delete'::audit_action;
    _changes := jsonb_build_object('deleted', to_jsonb(OLD));
  END IF;
  INSERT INTO public.audit_logs (organization_id, workspace_id, actor_id, action, resource_type, resource_id, changes)
  VALUES (_org, _ws, auth.uid(), _action, _resource, COALESCE((to_jsonb(COALESCE(NEW, OLD))->>'id'), ''), _changes);
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.tg_workspace_members_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (
      NEW.workspace_id, _actor, 'create'::public.audit_action, 'workspace_member', NEW.user_id::text,
      jsonb_build_object('event','member_added','user_id', NEW.user_id, 'role', NEW.role, 'status', NEW.status)
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
      VALUES (
        NEW.workspace_id, _actor, 'update'::public.audit_action, 'workspace_member', NEW.user_id::text,
        jsonb_build_object('event','role_changed','user_id', NEW.user_id, 'from', OLD.role, 'to', NEW.role)
      );
    END IF;
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
      VALUES (
        NEW.workspace_id, _actor, 'update'::public.audit_action, 'workspace_member', NEW.user_id::text,
        jsonb_build_object(
          'event', CASE WHEN NEW.status = 'suspended' THEN 'member_suspended' ELSE 'member_reactivated' END,
          'user_id', NEW.user_id, 'from', OLD.status, 'to', NEW.status
        )
      );
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (
      (SELECT w.id FROM public.workspaces w WHERE w.id = OLD.workspace_id),
      _actor, 'delete'::public.audit_action, 'workspace_member', OLD.user_id::text,
      jsonb_build_object('event','member_removed','user_id', OLD.user_id, 'role', OLD.role)
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_workspace_invitations_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _action text;
  _changes jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (
      NEW.workspace_id,
      COALESCE(_actor, NEW.invited_by),
      'invitation_sent',
      'workspace_invitation',
      NEW.id::text,
      jsonb_build_object(
        'email', NEW.email, 'role', NEW.role, 'invited_by', NEW.invited_by,
        'expires_at', NEW.expires_at, 'status', NEW.status, 'at', now()
      )
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      _action := CASE NEW.status::text
        WHEN 'accepted' THEN 'invitation_accepted'
        WHEN 'revoked'  THEN 'invitation_revoked'
        WHEN 'expired'  THEN 'invitation_expired'
        WHEN 'pending'  THEN 'invitation_resent'
        ELSE 'invitation_' || NEW.status::text
      END;
      _changes := jsonb_build_object(
        'email', NEW.email, 'role', NEW.role, 'from_status', OLD.status, 'to_status', NEW.status,
        'invited_by', NEW.invited_by, 'accepted_by', NEW.accepted_by,
        'accepted_at', NEW.accepted_at, 'expires_at', NEW.expires_at, 'at', now()
      );
      INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
      VALUES (
        NEW.workspace_id,
        COALESCE(_actor, NEW.accepted_by, NEW.invited_by),
        _action, 'workspace_invitation', NEW.id::text, _changes
      );
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (
      (SELECT w.id FROM public.workspaces w WHERE w.id = OLD.workspace_id),
      _actor, 'invitation_deleted', 'workspace_invitation', OLD.id::text,
      jsonb_build_object('email', OLD.email, 'role', OLD.role, 'status', OLD.status, 'at', now())
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.tg_workspaces_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _changes jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF to_jsonb(OLD) - 'updated_at' = to_jsonb(NEW) - 'updated_at' THEN
      RETURN NEW;
    END IF;
    _changes := jsonb_build_object(
      'before', to_jsonb(OLD) - 'updated_at',
      'after',  to_jsonb(NEW) - 'updated_at'
    );
    INSERT INTO public.audit_logs (organization_id, workspace_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (NEW.organization_id, NEW.id, auth.uid(), 'update', 'workspace', NEW.id::text, _changes);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Same reasoning: the workspace (and possibly its organization) is gone.
    INSERT INTO public.audit_logs (organization_id, workspace_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (NULL, NULL, auth.uid(), 'delete', 'workspace', OLD.id::text,
            jsonb_build_object('deleted', to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
