-- Store user accident reports in the main accidents table (used by ML training).

ALTER TABLE public.accidents
  ADD COLUMN IF NOT EXISTS report_type TEXT
    CHECK (report_type IS NULL OR report_type IN (
      'collision', 'fall', 'near_miss', 'dooring', 'hit_and_run', 'other'
    )),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT
    CHECK (status IS NULL OR status IN ('open', 'acknowledged', 'resolved'));

-- Migrate rows from accident_reports if that table was created by 032
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'accident_reports'
  ) THEN
    INSERT INTO public.accidents (
      location, severity, accident_date, report_type, description, photo_url,
      reported_by, status, source, is_actual, created_at
    )
    SELECT
      location, severity, accident_date, report_type, description, photo_url,
      reported_by, status, 'crowdsourced', TRUE, created_at
    FROM public.accident_reports;

    DROP TABLE public.accident_reports CASCADE;
  END IF;
END $$;

-- Crowd-sourced reports for the list/map review UI
CREATE OR REPLACE FUNCTION public.get_accident_reports_geojson()
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'type', 'Feature',
          'geometry', ST_AsGeoJSON(location)::jsonb,
          'properties', jsonb_build_object(
            'id',            id,
            'report_type',   report_type,
            'severity',      severity,
            'accident_date', accident_date,
            'description',   description,
            'status',        COALESCE(status, 'open'),
            'created_at',    created_at,
            'photo_url',     photo_url,
            'source',        source
          )
        ) ORDER BY created_at DESC
      ),
      '[]'::jsonb
    )
  )
  FROM public.accidents
  WHERE source = 'crowdsourced';
$$;

-- Historical/open-data accidents for the main map layer (exclude crowd reports)
CREATE OR REPLACE FUNCTION public.get_accidents_geojson()
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(location)::JSONB,
        'properties', jsonb_build_object(
          'id',            id,
          'severity',      severity,
          'accident_date', accident_date,
          'road_type',     road_type,
          'light_cond',    light_cond,
          'weather',       weather,
          'source',        source,
          'is_actual',     is_actual
        )
      )
    ), '[]'::JSONB)
  )
  FROM public.accidents
  WHERE is_actual = TRUE
    AND COALESCE(source, 'historical') != 'crowdsourced';
$$;

-- RLS: allow reporters and officials to update crowd-sourced rows
DROP POLICY IF EXISTS "accidents_update_crowd_own" ON public.accidents;
CREATE POLICY "accidents_update_crowd_own" ON public.accidents FOR UPDATE
  TO authenticated
  USING (source = 'crowdsourced' AND reported_by = auth.uid());

DROP POLICY IF EXISTS "accidents_update_official" ON public.accidents;
CREATE POLICY "accidents_update_official" ON public.accidents FOR UPDATE
  USING (public.has_permission('accidents.review'));

-- Tighten crowd insert: reporter must match auth user
DROP POLICY IF EXISTS "accidents_insert_crowd" ON public.accidents;
CREATE POLICY "accidents_insert_crowd" ON public.accidents FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND source = 'crowdsourced'
    AND reported_by = auth.uid()
  );

-- Permissions (idempotent if 032 already ran)
INSERT INTO public.permissions (id, description) VALUES
  ('accidents.report', 'Report accidents on the map'),
  ('accidents.review', 'Update accident report status')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('user', 'accidents.report'),
  ('city_official', 'accidents.report'),
  ('city_official', 'accidents.review'),
  ('admin', 'accidents.report'),
  ('admin', 'accidents.review')
ON CONFLICT DO NOTHING;
