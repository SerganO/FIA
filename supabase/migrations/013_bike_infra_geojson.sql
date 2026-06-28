-- GeoJSON read functions for bike_parking and bike_rental layers.

CREATE OR REPLACE FUNCTION public.get_bike_parking_geojson()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(location)::JSONB,
        'properties', jsonb_build_object(
          'id',           id,
          'capacity',     capacity,
          'covered',      covered,
          'parking_type', parking_type,
          'name',         name
        )
      )
    ), '[]'::JSONB)
  )
  FROM public.bike_parking
  WHERE is_actual = TRUE;
$$;


CREATE OR REPLACE FUNCTION public.get_bike_rental_geojson()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(location)::JSONB,
        'properties', jsonb_build_object(
          'id',          id,
          'name',        name,
          'network',     network,
          'operator',    operator,
          'capacity',    capacity,
          'rental_type', rental_type
        )
      )
    ), '[]'::JSONB)
  )
  FROM public.bike_rental
  WHERE is_actual = TRUE;
$$;
