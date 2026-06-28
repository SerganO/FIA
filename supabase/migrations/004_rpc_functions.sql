-- RPC functions used by the FastAPI backend and React frontend.
-- All are SECURITY DEFINER so they bypass RLS for the service role.

-- ─── get_accidents_latlon ────────────────────────────────────────────────────
-- Returns real (is_actual=TRUE) accidents as lat/lng floats for the KDTree.
-- Pass p_actual_only=FALSE to include synthetic training data too.
CREATE OR REPLACE FUNCTION public.get_accidents_latlon(p_actual_only BOOLEAN DEFAULT TRUE)
RETURNS TABLE(
  id       TEXT,
  lat      FLOAT8,
  lng      FLOAT8,
  severity SMALLINT
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    id::TEXT,
    ST_Y(location::GEOMETRY)::FLOAT8 AS lat,
    ST_X(location::GEOMETRY)::FLOAT8 AS lng,
    severity
  FROM public.accidents
  WHERE NOT p_actual_only OR is_actual = TRUE;
$$;


-- ─── get_bike_lane_features ──────────────────────────────────────────────────
-- Returns proximity metrics for a proposed LineString vs existing bike lanes.
-- p_geom: GeoJSON LineString as JSONB, e.g. {"type":"LineString","coordinates":[[lng,lat],...]}
CREATE OR REPLACE FUNCTION public.get_bike_lane_features(p_geom JSONB)
RETURNS TABLE(
  nearest_m          FLOAT8,
  overlap_pct        FLOAT8,
  density_500m       FLOAT8,
  intersections_count INT4
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  WITH proposed AS (
    SELECT ST_GeomFromGeoJSON(p_geom::TEXT)::GEOGRAPHY AS geog
  )
  SELECT
    COALESCE(MIN(ST_Distance(bl.geom::GEOGRAPHY, p.geog)), 9999.0)          AS nearest_m,
    0.0::FLOAT8                                                              AS overlap_pct,
    COALESCE(
      SUM(ST_Length(bl.geom::GEOGRAPHY))
        FILTER (WHERE ST_DWithin(bl.geom::GEOGRAPHY, p.geog, 500)),
      0.0
    )::FLOAT8                                                                AS density_500m,
    COUNT(DISTINCT bl.id)
      FILTER (WHERE ST_DWithin(bl.geom::GEOGRAPHY, p.geog, 30))::INT4       AS intersections_count
  FROM public.bike_lanes bl, proposed p;
$$;


-- ─── get_accidents_geojson ───────────────────────────────────────────────────
-- Returns accidents as a GeoJSON FeatureCollection for the React map.
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
          'accident_date', accident_date,
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
  WHERE is_actual = TRUE;
$$;


-- ─── get_bike_lanes_geojson ──────────────────────────────────────────────────
-- Returns bike lanes as a GeoJSON FeatureCollection for the React map.
CREATE OR REPLACE FUNCTION public.get_bike_lanes_geojson()
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(geom)::JSONB,
        'properties', jsonb_build_object(
          'id',        id,
          'lane_type', lane_type,
          'surface',   surface,
          'width_m',   width_m,
          'name',      name
        )
      )
    ), '[]'::JSONB)
  )
  FROM public.bike_lanes;
$$;


-- ─── get_proposals_geojson ───────────────────────────────────────────────────
-- Returns proposals as GeoJSON for the React map.
CREATE OR REPLACE FUNCTION public.get_proposals_geojson()
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(geom)::JSONB,
        'properties', jsonb_build_object(
          'id',           id,
          'title',        title,
          'status',       status,
          'safety_score', safety_score,
          'ml_version',   ml_version,
          'upvotes',      upvotes,
          'downvotes',    downvotes,
          'length_m',     length_m,
          'proposed_by',  proposed_by,
          'created_at',   created_at
        )
      )
    ), '[]'::JSONB)
  )
  FROM public.proposals;
$$;


-- ─── seed_sample_data ────────────────────────────────────────────────────────
-- Small London-area dataset to populate the map without external imports.
-- Run once after tables are created: SELECT seed_sample_data();
CREATE OR REPLACE FUNCTION public.seed_sample_data()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Accidents (London, WGS84: POINT(lng lat))
  INSERT INTO public.accidents (location, severity, accident_date, road_type, light_cond, weather, vehicles, source)
  VALUES
    (ST_GeomFromText('POINT(-0.0877 51.5074)', 4326), 2, '2023-06-15', 'arterial',    'daylight', 'clear', 2, 'historical'),
    (ST_GeomFromText('POINT(-0.1002 51.4963)', 4326), 3, '2023-08-22', 'arterial',    'dark',     'rain',  1, 'historical'),
    (ST_GeomFromText('POINT(-0.0878 51.5262)', 4326), 2, '2023-03-10', 'arterial',    'daylight', 'clear', 3, 'historical'),
    (ST_GeomFromText('POINT(-0.1130 51.5074)', 4326), 1, '2023-11-05', 'residential', 'dusk',     'fog',   2, 'historical'),
    (ST_GeomFromText('POINT(-0.1233 51.5308)', 4326), 2, '2023-07-19', 'arterial',    'daylight', 'clear', 2, 'historical'),
    (ST_GeomFromText('POINT(-0.0747 51.5301)', 4326), 1, '2023-09-03', 'residential', 'daylight', 'clear', 1, 'historical'),
    (ST_GeomFromText('POINT(-0.1238 51.4855)', 4326), 3, '2022-12-01', 'highway',     'dark',     'rain',  2, 'historical'),
    (ST_GeomFromText('POINT(-0.1133 51.4810)', 4326), 2, '2023-04-18', 'arterial',    'daylight', 'clear', 2, 'historical'),
    (ST_GeomFromText('POINT(-0.0950 51.5150)', 4326), 1, '2023-10-25', 'residential', 'daylight', 'clear', 1, 'historical'),
    (ST_GeomFromText('POINT(-0.1050 51.5100)', 4326), 2, '2023-02-14', 'arterial',    'dark',     'clear', 2, 'historical'),
    (ST_GeomFromText('POINT(-0.0820 51.5200)', 4326), 1, '2023-05-07', 'residential', 'daylight', 'clear', 1, 'historical'),
    (ST_GeomFromText('POINT(-0.1300 51.5000)', 4326), 3, '2022-11-15', 'arterial',    'dark',     'rain',  3, 'historical'),
    (ST_GeomFromText('POINT(-0.0900 51.4900)', 4326), 2, '2023-08-01', 'arterial',    'daylight', 'clear', 2, 'historical'),
    (ST_GeomFromText('POINT(-0.1150 51.5250)', 4326), 1, '2023-06-20', 'residential', 'daylight', 'clear', 1, 'historical'),
    (ST_GeomFromText('POINT(-0.0780 51.5050)', 4326), 2, '2023-09-12', 'arterial',    'dusk',     'clear', 2, 'historical')
  ON CONFLICT DO NOTHING;

  -- Bike lanes (London, existing cycling infrastructure)
  INSERT INTO public.bike_lanes (geom, lane_type, surface, name)
  VALUES
    (ST_GeomFromText('LINESTRING(-0.1189 51.5066, -0.1100 51.5080, -0.0881 51.5110)', 4326),
      'protected', 'asphalt', 'Embankment Cycleway'),
    (ST_GeomFromText('LINESTRING(-0.0747 51.5301, -0.0750 51.5380, -0.0760 51.5471)', 4326),
      'painted',   'asphalt', 'Kingsland Road CS1'),
    (ST_GeomFromText('LINESTRING(-0.1224 51.4651, -0.1200 51.4730, -0.1170 51.4810)', 4326),
      'painted',   'asphalt', 'Clapham Road CS7'),
    (ST_GeomFromText('LINESTRING(-0.1400 51.5200, -0.1300 51.5190, -0.1189 51.5180)', 4326),
      'path',      'asphalt', 'Regent''s Canal Path'),
    (ST_GeomFromText('LINESTRING(-0.0800 51.5150, -0.0850 51.5100, -0.0877 51.5074)', 4326),
      'painted',   'asphalt', 'East London Route')
  ON CONFLICT DO NOTHING;

  RETURN 'Seeded: 15 accidents, 5 bike lanes';
END;
$$;
