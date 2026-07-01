-- Include crowd-sourced accident reports in the main accidents GeoJSON feed.

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
          'accident_date', to_jsonb(accident_date),
          'road_type',     road_type,
          'light_cond',    light_cond,
          'weather',       weather,
          'source',        source,
          'is_actual',     is_actual,
          'report_type',   report_type,
          'description',   description,
          'photo_url',     photo_url,
          'created_at',    created_at
        )
      )
    ), '[]'::JSONB)
  )
  FROM public.accidents
  WHERE is_actual = TRUE;
$$;
