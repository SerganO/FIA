-- No-op: ALTER ROLE service_role BYPASSRLS requires a superuser and fails on
-- managed Supabase. Storage RLS is fixed in migration 020 instead.
SELECT 1;
