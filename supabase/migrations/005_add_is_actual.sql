-- Add is_actual flag to distinguish real historical data from synthetic ML training data.
-- TRUE = real/observed data, FALSE = synthetically generated for model training.

ALTER TABLE public.accidents
  ADD COLUMN is_actual BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.bike_lanes
  ADD COLUMN is_actual BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.hazard_reports
  ADD COLUMN is_actual BOOLEAN NOT NULL DEFAULT TRUE;

-- Back-fill the London placeholder rows inserted by seed_sample_data()
-- so they are clearly marked as synthetic (they are fictional, not real accidents).
UPDATE public.accidents      SET is_actual = FALSE WHERE source = 'historical' AND ST_X(location) < 0;
UPDATE public.bike_lanes     SET is_actual = FALSE WHERE name IN ('Embankment Cycleway','Kingsland Road CS1','Clapham Road CS7','Regent''s Canal Path','East London Route');
