-- Allow the backend (service_role JWT) to insert rows for bulk import.
-- PostgREST is supposed to bypass RLS automatically for service_role, but
-- the Python SDK v2 sometimes doesn't forward the JWT role claim correctly,
-- so we add explicit policies as a safety net.

-- accidents: service_role INSERT
CREATE POLICY "accidents_insert_service"
  ON public.accidents FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- bike_lanes: the existing all_admin policy has USING only, which PostgreSQL
-- also applies as WITH CHECK, but only when get_my_role() = 'admin'.
-- Add a dedicated INSERT policy for the service_role case.
CREATE POLICY "bike_lanes_insert_service"
  ON public.bike_lanes FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
