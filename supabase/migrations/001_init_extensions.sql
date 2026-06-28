-- Enable PostGIS for geometry/geography types and spatial queries.
-- Enable pgcrypto for gen_random_uuid().
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
