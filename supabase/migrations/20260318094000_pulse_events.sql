-- Social Pulse events

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pulse_action') THEN
    CREATE TYPE public.pulse_action AS ENUM ('created', 'completed', 'failed', 'staked');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.pulse_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action public.pulse_action NOT NULL,
  goal_title TEXT NOT NULL,
  stake NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pulse_events_user_created_idx
  ON public.pulse_events (user_id, created_at DESC);

ALTER TABLE public.pulse_events ENABLE ROW LEVEL SECURITY;

-- Allow users to insert only their own events
CREATE POLICY "Users can insert own pulse events"
  ON public.pulse_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow users to read their own events and their friends' events
CREATE POLICY "Users can read own and friends pulse events"
  ON public.pulse_events FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR user_id IN (
      SELECT f.friend_user_id
      FROM public.friendships f
      WHERE f.user_id = auth.uid()
    )
  );

