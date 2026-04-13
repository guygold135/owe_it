-- Track first-run app tutorial: NULL = show tutorial; set when finished or skipped.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS app_tutorial_done_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.app_tutorial_done_at IS 'When the user completed or skipped the in-app tutorial; NULL means show tutorial.';

-- Existing accounts (created before this column existed) skip the tour.
UPDATE public.profiles
SET app_tutorial_done_at = COALESCE(app_tutorial_done_at, now())
WHERE app_tutorial_done_at IS NULL
  AND created_at < now();
