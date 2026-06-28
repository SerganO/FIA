-- ── 014_danger_crossings.sql ──────────────────────────────────────────────────
-- Table, RLS, indexes, and RPCs for danger crossings (OSM crossings/signals).

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.danger_crossings (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  location      GEOMETRY(Point, 4326) NOT NULL,
  osm_id        BIGINT,
  highway       TEXT,          -- 'crossing' | 'traffic_signals'
  crossing_type TEXT,          -- 'uncontrolled' | 'signalised' | 'marked' | NULL
  has_signals   BOOLEAN     NOT NULL DEFAULT FALSE,
  has_markings  BOOLEAN     NOT NULL DEFAULT FALSE,
  is_actual     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_danger_crossings_location
  ON public.danger_crossings USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_danger_crossings_osm_id
  ON public.danger_crossings (osm_id)
  WHERE osm_id IS NOT NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.danger_crossings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "danger_crossings_public_select"
  ON public.danger_crossings FOR SELECT USING (true);

CREATE POLICY "danger_crossings_admin_all"
  ON public.danger_crossings FOR ALL
  TO authenticated
  USING  ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "danger_crossings_service_insert"
  ON public.danger_crossings FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ── Batch import RPC (osm_id dedup) ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.import_danger_crossings_batch(rows JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  rec        JSONB;
  cnt        INT := 0;
  skipped    INT := 0;
  osm_id_val BIGINT;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(rows) LOOP
    BEGIN
      osm_id_val := NULLIF(rec->>'osm_id', '')::BIGINT;

      IF osm_id_val IS NOT NULL AND
         EXISTS (SELECT 1 FROM public.danger_crossings WHERE osm_id = osm_id_val)
      THEN
        skipped := skipped + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.danger_crossings (
        location, osm_id, highway, crossing_type, has_signals, has_markings, is_actual
      ) VALUES (
        ST_GeomFromEWKT(rec->>'location'),
        osm_id_val,
        NULLIF(rec->>'highway', ''),
        NULLIF(rec->>'crossing_type', ''),
        COALESCE((rec->>'has_signals')::BOOLEAN, FALSE),
        COALESCE((rec->>'has_markings')::BOOLEAN, FALSE),
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

-- ── ML feature extraction RPC ─────────────────────────────────────────────────
-- Called by feature_engineering.py with the proposed LineString as p_geom (JSONB).
-- Uses <-> for GIST-accelerated nearest-neighbour, geography for metre distances.

CREATE OR REPLACE FUNCTION public.get_danger_crossing_features(p_geom JSONB)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT jsonb_build_object(
    'crossings_within_100m',
      (SELECT COUNT(*)
       FROM public.danger_crossings dc
       WHERE dc.is_actual = TRUE
         AND ST_DWithin(
               dc.location::geography,
               ST_GeomFromGeoJSON(p_geom::text)::geography,
               100
             )),
    'uncontrolled_crossings_within_100m',
      (SELECT COUNT(*)
       FROM public.danger_crossings dc
       WHERE dc.is_actual = TRUE
         AND dc.has_signals = FALSE
         AND ST_DWithin(
               dc.location::geography,
               ST_GeomFromGeoJSON(p_geom::text)::geography,
               100
             )),
    'nearest_crossing_m',
      (SELECT COALESCE(
         ST_Distance(
           dc.location::geography,
           ST_GeomFromGeoJSON(p_geom::text)::geography
         ),
         9999
       )
       FROM public.danger_crossings dc
       WHERE dc.is_actual = TRUE
       ORDER BY dc.location <-> ST_GeomFromGeoJSON(p_geom::text)
       LIMIT 1)
  )
$$;
