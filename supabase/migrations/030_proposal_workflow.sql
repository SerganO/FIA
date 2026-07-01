-- Proposal workflow: add `new` status, draft visibility, submit/delete rules.

ALTER TABLE public.proposals DROP CONSTRAINT IF EXISTS proposals_status_check;
ALTER TABLE public.proposals ADD CONSTRAINT proposals_status_check
  CHECK (status IN ('draft', 'new', 'under_review', 'approved', 'rejected'));

-- Drafts visible only to their author; all other statuses are public.
DROP POLICY IF EXISTS "proposals_select_all" ON public.proposals;
CREATE POLICY "proposals_select_visible" ON public.proposals FOR SELECT
  USING (status <> 'draft' OR proposed_by = auth.uid());

-- Authors may create as draft or submit directly as new.
DROP POLICY IF EXISTS "proposals_insert_auth" ON public.proposals;
CREATE POLICY "proposals_insert_auth" ON public.proposals FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND proposed_by = auth.uid()
    AND status IN ('draft', 'new')
  );

-- Authors may submit own draft → new.
DROP POLICY IF EXISTS "proposals_submit_own" ON public.proposals;
CREATE POLICY "proposals_submit_own" ON public.proposals FOR UPDATE
  USING (proposed_by = auth.uid() AND status = 'draft')
  WITH CHECK (status = 'new');

-- Authors may delete only draft or new proposals.
DROP POLICY IF EXISTS "proposals_delete_own" ON public.proposals;
CREATE POLICY "proposals_delete_own" ON public.proposals FOR DELETE
  USING (
    auth.uid() = proposed_by
    AND status IN ('draft', 'new')
  );

CREATE OR REPLACE FUNCTION public.get_proposals_geojson()
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(geom)::JSONB,
        'properties', jsonb_build_object(
          'id',            id,
          'title',         title,
          'description',   description,
          'status',        status,
          'source',        source,
          'safety_score',  safety_score,
          'ml_version',    ml_version,
          'upvotes',       upvotes,
          'downvotes',     downvotes,
          'comment_count', comment_count,
          'length_m',      length_m,
          'proposed_by',   proposed_by,
          'created_at',    created_at
        )
      )
    ), '[]'::JSONB)
  )
  FROM public.proposals
  WHERE status <> 'draft' OR proposed_by = auth.uid();
$$;
