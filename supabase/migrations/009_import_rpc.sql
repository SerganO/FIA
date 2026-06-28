-- SECURITY DEFINER functions for bulk data import.
-- These run as the DB owner and bypass RLS, so they work with any API key.

CREATE OR REPLACE FUNCTION public.import_accidents_batch(rows JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  rec     JSONB;
  cnt     INT := 0;
  skipped INT := 0;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(rows)
  LOOP
    BEGIN
      INSERT INTO public.accidents (
        location, severity, accident_date, road_type, vehicles, source, is_actual
      ) VALUES (
        ST_GeomFromEWKT(rec->>'location'),
        (rec->>'severity')::SMALLINT,
        NULLIF(rec->>'accident_date', '')::DATE,
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


CREATE OR REPLACE FUNCTION public.import_bike_lanes_batch(rows JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  rec     JSONB;
  cnt     INT := 0;
  skipped INT := 0;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(rows)
  LOOP
    BEGIN
      INSERT INTO public.bike_lanes (
        geom, name, lane_type, surface, osm_id, is_actual
      ) VALUES (
        ST_GeomFromEWKT(rec->>'geom'),
        NULLIF(rec->>'name', ''),
        NULLIF(rec->>'lane_type', ''),
        NULLIF(rec->>'surface', ''),
        NULLIF(rec->>'osm_id', '')::BIGINT,
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
