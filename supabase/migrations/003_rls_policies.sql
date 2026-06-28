ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accidents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bike_lanes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hazard_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_model_logs  ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's role (SECURITY DEFINER bypasses RLS on profiles).
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;


-- ─── PROFILES ────────────────────────────────────────────────────────────────
CREATE POLICY "profiles_select_all"  ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own"  ON public.profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles_update_admin" ON public.profiles FOR UPDATE USING (public.get_my_role() = 'admin');


-- ─── ACCIDENTS ───────────────────────────────────────────────────────────────
CREATE POLICY "accidents_select_all"      ON public.accidents FOR SELECT USING (true);
CREATE POLICY "accidents_insert_crowd"    ON public.accidents FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND source = 'crowdsourced');
CREATE POLICY "accidents_insert_admin"    ON public.accidents FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY "accidents_delete_admin"    ON public.accidents FOR DELETE
  USING (public.get_my_role() = 'admin');


-- ─── BIKE_LANES ──────────────────────────────────────────────────────────────
CREATE POLICY "bike_lanes_select_all"  ON public.bike_lanes FOR SELECT USING (true);
CREATE POLICY "bike_lanes_all_admin"   ON public.bike_lanes FOR ALL
  USING (public.get_my_role() = 'admin');


-- ─── PROPOSALS ───────────────────────────────────────────────────────────────
CREATE POLICY "proposals_select_all"       ON public.proposals FOR SELECT USING (true);
CREATE POLICY "proposals_insert_auth"      ON public.proposals FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND proposed_by = auth.uid());
CREATE POLICY "proposals_update_own_draft" ON public.proposals FOR UPDATE
  USING (proposed_by = auth.uid() AND status = 'draft');
CREATE POLICY "proposals_update_official"  ON public.proposals FOR UPDATE
  USING (public.get_my_role() IN ('city_official', 'admin'));


-- ─── VOTES ───────────────────────────────────────────────────────────────────
CREATE POLICY "votes_select_all"   ON public.votes FOR SELECT USING (true);
CREATE POLICY "votes_insert_auth"  ON public.votes FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());
CREATE POLICY "votes_update_own"   ON public.votes FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "votes_delete_own"   ON public.votes FOR DELETE USING (user_id = auth.uid());


-- ─── COMMENTS ────────────────────────────────────────────────────────────────
CREATE POLICY "comments_select_all"   ON public.comments FOR SELECT USING (true);
CREATE POLICY "comments_insert_auth"  ON public.comments FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND author_id = auth.uid());
CREATE POLICY "comments_delete_own"   ON public.comments FOR DELETE USING (author_id = auth.uid());
CREATE POLICY "comments_delete_admin" ON public.comments FOR DELETE USING (public.get_my_role() = 'admin');


-- ─── HAZARD_REPORTS ──────────────────────────────────────────────────────────
CREATE POLICY "hazards_select_all"      ON public.hazard_reports FOR SELECT USING (true);
CREATE POLICY "hazards_insert_auth"     ON public.hazard_reports FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "hazards_update_official" ON public.hazard_reports FOR UPDATE
  USING (public.get_my_role() IN ('city_official', 'admin'));


-- ─── ML_MODEL_LOGS ───────────────────────────────────────────────────────────
CREATE POLICY "ml_logs_select_official" ON public.ml_model_logs FOR SELECT
  USING (public.get_my_role() IN ('city_official', 'admin'));
CREATE POLICY "ml_logs_all_admin"       ON public.ml_model_logs FOR ALL
  USING (public.get_my_role() = 'admin');
