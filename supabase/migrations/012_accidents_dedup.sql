-- Replace import_accidents_batch with deduplication on (accident_date, location).
-- Rows where accident_date is NULL cannot be reliably deduplicated and are always inserted.

CREATE OR REPLACE FUNCTION public.import_accidents_batch(rows JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  rec          JSONB;
  cnt          INT := 0;
  skipped      INT := 0;
  acc_date     DATE;
  acc_location GEOMETRY(Point, 4326);
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(rows)
  LOOP
    BEGIN
      acc_date     := NULLIF(rec->>'accident_date', '')::DATE;
      acc_location := ST_GeomFromEWKT(rec->>'location');

      -- Dedup: skip if same date + exact same coordinates already exist
      IF acc_date IS NOT NULL AND
         EXISTS (
           SELECT 1 FROM public.accidents
           WHERE accident_date = acc_date
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
        acc_date,
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
