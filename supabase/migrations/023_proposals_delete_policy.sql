-- Allow proposal owners and admins to delete proposals.
CREATE POLICY "proposals_delete_own"
  ON public.proposals FOR DELETE
  USING (auth.uid() = proposed_by);

CREATE POLICY "proposals_delete_admin"
  ON public.proposals FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
