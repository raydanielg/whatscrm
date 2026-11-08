
-- LOGIN HISTORY
CREATE TABLE public.login_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (event IN ('success','failed','logout','locked','password_reset','mfa_challenge','mfa_success','mfa_failed')),
  ip_address inet,
  user_agent text,
  device text,
  location text,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_history_user_created ON public.login_history(user_id, created_at DESC);
CREATE INDEX idx_login_history_event ON public.login_history(event);
GRANT SELECT, INSERT ON public.login_history TO authenticated;
GRANT ALL ON public.login_history TO service_role;
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own login history read" ON public.login_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own login history insert" ON public.login_history
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- PERSONAL ACCESS TOKENS
CREATE TABLE public.personal_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  prefix text NOT NULL,
  hashed_token text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  last_used_at timestamptz,
  last_used_ip inet,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pat_user ON public.personal_access_tokens(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_access_tokens TO authenticated;
GRANT ALL ON public.personal_access_tokens TO service_role;
ALTER TABLE public.personal_access_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pat" ON public.personal_access_tokens
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER pat_updated BEFORE UPDATE ON public.personal_access_tokens
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- USER 2FA
CREATE TABLE public.user_2fa (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  method text NOT NULL DEFAULT 'totp' CHECK (method IN ('totp','sms','email')),
  secret text,
  recovery_codes text[] NOT NULL DEFAULT '{}',
  verified_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_2fa TO authenticated;
GRANT ALL ON public.user_2fa TO service_role;
ALTER TABLE public.user_2fa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own 2fa" ON public.user_2fa
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER user_2fa_updated BEFORE UPDATE ON public.user_2fa
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ACCOUNT LOCKOUTS
CREATE TABLE public.account_lockouts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  failed_attempts integer NOT NULL DEFAULT 0,
  last_failed_at timestamptz,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_lockouts TO authenticated;
GRANT ALL ON public.account_lockouts TO service_role;
ALTER TABLE public.account_lockouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lockout" ON public.account_lockouts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER lockout_updated BEFORE UPDATE ON public.account_lockouts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- PASSWORD POLICY (per org)
CREATE TABLE public.password_policy (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  min_length integer NOT NULL DEFAULT 12,
  require_uppercase boolean NOT NULL DEFAULT true,
  require_lowercase boolean NOT NULL DEFAULT true,
  require_number boolean NOT NULL DEFAULT true,
  require_symbol boolean NOT NULL DEFAULT true,
  disallow_common boolean NOT NULL DEFAULT true,
  rotation_days integer NOT NULL DEFAULT 90,
  history_count integer NOT NULL DEFAULT 5,
  max_failed_attempts integer NOT NULL DEFAULT 5,
  lockout_minutes integer NOT NULL DEFAULT 15,
  session_idle_minutes integer NOT NULL DEFAULT 30,
  session_absolute_hours integer NOT NULL DEFAULT 168,
  require_2fa boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_policy TO authenticated;
GRANT ALL ON public.password_policy TO service_role;
ALTER TABLE public.password_policy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "policy read by members" ON public.password_policy
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "policy write by admins" ON public.password_policy
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role]))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role]));
CREATE TRIGGER pwpolicy_updated BEFORE UPDATE ON public.password_policy
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- FUNCTIONS
CREATE OR REPLACE FUNCTION public.record_login_attempt(
  _user_id uuid, _event text, _ip inet DEFAULT NULL, _user_agent text DEFAULT NULL,
  _device text DEFAULT NULL, _failure_reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.login_history(user_id, event, ip_address, user_agent, device, failure_reason)
  VALUES (_user_id, _event, _ip, _user_agent, _device, _failure_reason)
  RETURNING id INTO _id;

  IF _event = 'failed' THEN
    INSERT INTO public.account_lockouts(user_id, failed_attempts, last_failed_at)
    VALUES (_user_id, 1, now())
    ON CONFLICT (user_id) DO UPDATE
      SET failed_attempts = public.account_lockouts.failed_attempts + 1,
          last_failed_at = now();
  ELSIF _event = 'success' THEN
    UPDATE public.account_lockouts SET failed_attempts = 0, locked_until = NULL WHERE user_id = _user_id;
  END IF;
  RETURN _id;
END; $$;
GRANT EXECUTE ON FUNCTION public.record_login_attempt(uuid, text, inet, text, text, text) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.regenerate_recovery_codes()
RETURNS text[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _codes text[] := ARRAY[]::text[];
  _hashes text[] := ARRAY[]::text[];
  _code text;
  i int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  FOR i IN 1..10 LOOP
    _code := lower(encode(extensions.gen_random_bytes(5), 'hex'));
    _codes := array_append(_codes, _code);
    _hashes := array_append(_hashes, encode(extensions.digest(_code, 'sha256'), 'hex'));
  END LOOP;
  INSERT INTO public.user_2fa(user_id, recovery_codes)
  VALUES (auth.uid(), _hashes)
  ON CONFLICT (user_id) DO UPDATE SET recovery_codes = _hashes, updated_at = now();
  RETURN _codes;
END; $$;
GRANT EXECUTE ON FUNCTION public.regenerate_recovery_codes() TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_all_other_sessions(_current_session uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.sessions
    SET revoked_at = now()
    WHERE user_id = auth.uid() AND revoked_at IS NULL
      AND (_current_session IS NULL OR id <> _current_session);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END; $$;
GRANT EXECUTE ON FUNCTION public.revoke_all_other_sessions(uuid) TO authenticated;

-- Ensure pgcrypto for digest()
CREATE EXTENSION IF NOT EXISTS pgcrypto;
