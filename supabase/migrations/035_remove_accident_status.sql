-- Remove status workflow from crowd-sourced accident reports.

ALTER TABLE public.accidents DROP CONSTRAINT IF EXISTS accidents_status_check;
ALTER TABLE public.accidents DROP COLUMN IF EXISTS status;

DROP POLICY IF EXISTS "accidents_update_official" ON public.accidents;

DELETE FROM public.role_permissions WHERE permission_id = 'accidents.review';
DELETE FROM public.permissions WHERE id = 'accidents.review';

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
            'accident_date', to_jsonb(accident_date),
            'description',   description,
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
