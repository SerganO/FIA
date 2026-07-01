-- Unify accident reporting into the accidents table only.

DROP FUNCTION IF EXISTS public.get_accident_reports_geojson();

-- Photo storage under a single accidents bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('accidents', 'accidents', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Access to accident report images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload accident report images" ON storage.objects;
DROP POLICY IF EXISTS "Public Access to accident images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload accident images" ON storage.objects;

CREATE POLICY "Public Access to accident images"
ON storage.objects FOR SELECT
USING (bucket_id = 'accidents');

CREATE POLICY "Allow authenticated users to upload accident images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'accidents');
