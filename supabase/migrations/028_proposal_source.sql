-- Classify proposals as community vs official based on creator role at insert time.

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'community'
    CHECK (source IN ('community', 'official'));

CREATE INDEX IF NOT EXISTS idx_proposals_source ON public.proposals (source);

-- Backfill from current proposer roles.
UPDATE public.proposals p
SET source = CASE
  WHEN pr.role IN ('city_official', 'admin') THEN 'official'
  ELSE 'community'
END
FROM public.profiles pr
WHERE pr.id = p.proposed_by;

CREATE OR REPLACE FUNCTION public.proposals_set_source()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  creator_role TEXT;
BEGIN
  SELECT role INTO creator_role FROM public.profiles WHERE id = NEW.proposed_by;
  NEW.source := CASE
    WHEN creator_role IN ('city_official', 'admin') THEN 'official'
    ELSE 'community'
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proposals_source ON public.proposals;
CREATE TRIGGER trg_proposals_source
  BEFORE INSERT ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.proposals_set_source();

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
          'id',           id,
          'title',        title,
          'status',       status,
          'source',       source,
          'safety_score', safety_score,
          'ml_version',   ml_version,
          'upvotes',      upvotes,
          'downvotes',    downvotes,
          'length_m',     length_m,
          'proposed_by',  proposed_by,
          'created_at',   created_at
        )
      )
    ), '[]'::JSONB)
  )
  FROM public.proposals;
$$;
