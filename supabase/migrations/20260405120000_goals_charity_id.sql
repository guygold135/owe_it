-- Which charity receives the post-fee portion of a failed stake (Stripe Connect destination).
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS charity_id text;

COMMENT ON COLUMN public.goals.charity_id IS
  'Slug from app/edge CHARITIES config; used with Stripe Connect on failed-stake capture.';
