-- Change accident_date from DATE to TIMESTAMPTZ (date + time).

ALTER TABLE public.accidents
  ALTER COLUMN accident_date TYPE TIMESTAMPTZ
  USING CASE
    WHEN accident_date IS NULL THEN NULL
    ELSE accident_date::TIMESTAMPTZ
  END;

-- import_accidents_batch: accept ISO date or datetime strings
CREATE OR REPLACE FUNCTION public.import_accidents_batch(rows JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  rec          JSONB;
  cnt          INT := 0;
  skipped      INT := 0;
  acc_ts       TIMESTAMPTZ;
  acc_location GEOMETRY(Point, 4326);
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(rows)
  LOOP
    BEGIN
      acc_ts       := NULLIF(rec->>'accident_date', '')::TIMESTAMPTZ;
      acc_location := ST_GeomFromEWKT(rec->>'location');

      IF acc_ts IS NOT NULL AND
         EXISTS (
           SELECT 1 FROM public.accidents
           WHERE accident_date = acc_ts
             AND ST_Equals(location, acc_location)
         )
      THEN
        skipped := skipped + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.accidents (
        location, severity, accident_date, road_type, vehicles, source, is_actual
      ) VALUES (
        acc_location,
        (rec->>'severity')::SMALLINT,
        acc_ts,
        NULLIF(rec->>'road_type', ''),
        COALESCE(NULLIF(rec->>'vehicles', '')::SMALLINT, 1),
        COALESCE(NULLIF(rec->>'source', ''), 'import'),
        COALESCE((rec->>'is_actual')::BOOLEAN, TRUE)
      );
      cnt := cnt + 1;
    EXCEPTION WHEN OTHERS THEN
      skipped := skipped + 1;
    END;
  END LOOP;
  RETURN jsonb_build_object('inserted', cnt, 'skipped', skipped);
END;
$$;

-- Emit accident_date as ISO-8601 text in GeoJSON payloads
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
          'is_actual',     is_actual
        )
      )
    ), '[]'::JSONB)
  )
  FROM public.accidents
  WHERE is_actual = TRUE
    AND COALESCE(source, 'historical') != 'crowdsourced';
$$;
