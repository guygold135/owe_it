-- Tutorial goals are deletable in the UI; persist flag on the row so every device for the same account sees the same state (localStorage was device-only).
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS created_during_app_tutorial BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.goals.created_during_app_tutorial IS 'True if the goal was created during the in-app tutorial; shown on all sessions for this user.';
