-- ─── BIKE_PARKING ────────────────────────────────────────────────────────────
CREATE TABLE public.bike_parking (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location     GEOMETRY(Point, 4326) NOT NULL,
  capacity     INT,
  covered      BOOLEAN,
  access       TEXT,
  parking_type TEXT,   -- OSM bicycle_parking tag: rack, stands, wall_loops, etc.
  name         TEXT,
  osm_id       BIGINT,
  is_actual    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bike_parking_location ON public.bike_parking USING GIST (location);
-- Non-unique index; uniqueness is enforced in the import function via EXISTS check.
CREATE INDEX idx_bike_parking_osm_id ON public.bike_parking (osm_id)
  WHERE osm_id IS NOT NULL;

ALTER TABLE public.bike_parking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bike_parking_select_all" ON public.bike_parking FOR SELECT USING (true);
CREATE POLICY "bike_parking_all_admin"  ON public.bike_parking FOR ALL
  USING (public.get_my_role() = 'admin');
CREATE POLICY "bike_parking_insert_service" ON public.bike_parking FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');


-- ─── import_bike_lanes_batch (replace 009 version, adds osm_id dedup) ────────
CREATE OR REPLACE FUNCTION public.import_bike_lanes_batch(rows JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  rec        JSONB;
  cnt        INT := 0;
  skipped    INT := 0;
  osm_id_val BIGINT;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(rows)
  LOOP
    BEGIN
      osm_id_val := NULLIF(rec->>'osm_id', '')::BIGINT;

      -- Dedup: skip if a row with the same OSM id already exists
      IF osm_id_val IS NOT NULL AND
         EXISTS (SELECT 1 FROM public.bike_lanes WHERE osm_id = osm_id_val)
      THEN
        skipped := skipped + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.bike_lanes (geom, name, lane_type, surface, osm_id, is_actual)
      VALUES (
        ST_GeomFromEWKT(rec->>'geom'),
        NULLIF(rec->>'name', ''),
        NULLIF(rec->>'lane_type', ''),
        NULLIF(rec->>'surface', ''),
        osm_id_val,
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


-- ─── import_bike_parking_batch (new, with osm_id dedup) ──────────────────────
CREATE OR REPLACE FUNCTION public.import_bike_parking_batch(rows JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  rec        JSONB;
  cnt        INT := 0;
  skipped    INT := 0;
  osm_id_val BIGINT;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(rows)
  LOOP
    BEGIN
      osm_id_val := NULLIF(rec->>'osm_id', '')::BIGINT;

      -- Dedup: skip if a row with the same OSM id already exists
      IF osm_id_val IS NOT NULL AND
         EXISTS (SELECT 1 FROM public.bike_parking WHERE osm_id = osm_id_val)
      THEN
        skipped := skipped + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.bike_parking (
        location, capacity, covered, access, parking_type, name, osm_id, is_actual
      ) VALUES (
        ST_GeomFromEWKT(rec->>'location'),
        NULLIF(rec->>'capacity', '')::INT,
        -- OSM uses "yes"/"no" strings for boolean fields
        CASE rec->>'covered'
          WHEN 'yes' THEN TRUE
          WHEN 'no'  THEN FALSE
          ELSE NULL
        END,
        NULLIF(rec->>'access', ''),
        NULLIF(rec->>'parking_type', ''),
        NULLIF(rec->>'name', ''),
        osm_id_val,
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
