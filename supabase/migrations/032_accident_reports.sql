-- User-submitted accident reports (mirrors hazard_reports workflow)

CREATE TABLE public.accident_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location      GEOMETRY(Point, 4326) NOT NULL,
  report_type   TEXT NOT NULL
                  CHECK (report_type IN (
                    'collision', 'fall', 'near_miss', 'dooring', 'hit_and_run', 'other'
                  )),
  severity      SMALLINT NOT NULL DEFAULT 2 CHECK (severity BETWEEN 1 AND 3),
  accident_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description   TEXT,
  photo_url     TEXT,
  reported_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'acknowledged', 'resolved')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accident_report_location ON public.accident_reports USING GIST (location);

ALTER TABLE public.accident_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accident_reports_select_all" ON public.accident_reports FOR SELECT USING (true);

CREATE POLICY "accident_reports_insert_auth" ON public.accident_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reported_by);

CREATE POLICY "accident_reports_update_own" ON public.accident_reports FOR UPDATE
  TO authenticated
  USING (auth.uid() = reported_by);

CREATE POLICY "accident_reports_delete_own" ON public.accident_reports FOR DELETE
  TO authenticated
  USING (auth.uid() = reported_by);

CREATE POLICY "accident_reports_update_official" ON public.accident_reports FOR UPDATE
  USING (public.has_permission('accidents.review'));

-- Storage bucket for accident report photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('accident_reports', 'accident_reports', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public Access to accident report images"
ON storage.objects FOR SELECT
USING (bucket_id = 'accident_reports');

CREATE POLICY "Allow authenticated users to upload accident report images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'accident_reports');

-- GeoJSON RPC
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
            'status',        status,
            'created_at',    created_at,
            'photo_url',     photo_url
          )
        ) ORDER BY created_at DESC
      ),
      '[]'::jsonb
    )
  )
  FROM public.accident_reports;
$$;

-- Permissions
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
