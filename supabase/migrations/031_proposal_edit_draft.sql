-- Explicit WITH CHECK: authors may edit own drafts but must keep status draft.

DROP POLICY IF EXISTS "proposals_update_own_draft" ON public.proposals;
CREATE POLICY "proposals_update_own_draft" ON public.proposals FOR UPDATE
  USING (proposed_by = auth.uid() AND status = 'draft')
  WITH CHECK (proposed_by = auth.uid() AND status = 'draft');
