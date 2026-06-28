-- ─── BIKE_RENTAL ──────────────────────────────────────────────────────────────
CREATE TABLE public.bike_rental (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location      GEOMETRY(Point, 4326) NOT NULL,
  capacity      INT,
  name          TEXT,
  network       TEXT,
  operator      TEXT,
  opening_hours TEXT,
  website       TEXT,
  phone         TEXT,
  rental_type   TEXT,   -- OSM bicycle_rental tag: docking_station, dropoff_point, etc.
  access        TEXT,
  osm_id        BIGINT,
  is_actual     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bike_rental_location ON public.bike_rental USING GIST (location);
CREATE INDEX idx_bike_rental_osm_id ON public.bike_rental (osm_id)
  WHERE osm_id IS NOT NULL;

ALTER TABLE public.bike_rental ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bike_rental_select_all" ON public.bike_rental FOR SELECT USING (true);
CREATE POLICY "bike_rental_all_admin"  ON public.bike_rental FOR ALL
  USING (public.get_my_role() = 'admin');
CREATE POLICY "bike_rental_insert_service" ON public.bike_rental FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');


-- ─── import_bike_rental_batch ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.import_bike_rental_batch(rows JSONB)
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
         EXISTS (SELECT 1 FROM public.bike_rental WHERE osm_id = osm_id_val)
      THEN
        skipped := skipped + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.bike_rental (
        location, capacity, name, network, operator,
        opening_hours, website, phone, rental_type, access, osm_id, is_actual
      ) VALUES (
        ST_GeomFromEWKT(rec->>'location'),
        NULLIF(rec->>'capacity', '')::INT,
        NULLIF(rec->>'name', ''),
        NULLIF(rec->>'network', ''),
        NULLIF(rec->>'operator', ''),
        NULLIF(rec->>'opening_hours', ''),
        NULLIF(rec->>'website', ''),
        NULLIF(rec->>'phone', ''),
        NULLIF(rec->>'rental_type', ''),
        NULLIF(rec->>'access', ''),
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
