-- ─── RBAC Security: block role self-escalation, admin role RPC, submit-for-review ───

-- Trigger: only admins may change any profile's role
CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF public.get_my_role() <> 'admin' THEN
      RAISE EXCEPTION 'forbidden: cannot change role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_self_escalation();

-- Narrow own-profile updates: username and avatar_url only (not role)
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admin-only role assignment RPC
CREATE OR REPLACE FUNCTION public.set_user_role(target_id UUID, new_role TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF public.get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF auth.uid() = target_id AND new_role <> 'admin' THEN
    RAISE EXCEPTION 'forbidden: cannot demote yourself';
  END IF;
  IF new_role NOT IN ('guest', 'user', 'city_official', 'admin') THEN
    RAISE EXCEPTION 'invalid role';
  END IF;
  UPDATE public.profiles SET role = new_role WHERE id = target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_role(UUID, TEXT) TO authenticated;

-- User may submit own draft for review (status change only)
CREATE POLICY "proposals_submit_own" ON public.proposals FOR UPDATE
  USING (proposed_by = auth.uid() AND status = 'draft')
  WITH CHECK (status = 'under_review');
