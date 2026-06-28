-- RPC: return hazard reports as a GeoJSON FeatureCollection
CREATE OR REPLACE FUNCTION public.get_hazard_reports_geojson()
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
            'id',          id,
            'report_type', report_type,
            'description', description,
            'status',      status,
            'created_at',  created_at
          )
        ) ORDER BY created_at DESC
      ),
      '[]'::jsonb
    )
  )
  FROM public.hazard_reports;
$$;
