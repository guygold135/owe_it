-- Judge requests (for friends to accept judging a goal)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'judge_request_status') THEN
    CREATE TYPE public.judge_request_status AS ENUM ('pending', 'accepted', 'ignored', 'cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.judge_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  judge_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.judge_request_status NOT NULL DEFAULT 'pending',
  goal_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT judge_requests_not_self CHECK (requester_user_id <> judge_user_id)
);

CREATE INDEX IF NOT EXISTS judge_requests_judge_status_created_idx
  ON public.judge_requests (judge_user_id, status, created_at DESC);

ALTER TABLE public.judge_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own judge requests"
  ON public.judge_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = requester_user_id OR auth.uid() = judge_user_id);

CREATE POLICY "Requester can create judge request"
  ON public.judge_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requester_user_id);

CREATE POLICY "Judge can update own judge requests"
  ON public.judge_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = judge_user_id)
  WITH CHECK (auth.uid() = judge_user_id);

-- RPC: create judge request (friend-only)
CREATE OR REPLACE FUNCTION public.create_judge_request(
  p_judge_user_id UUID,
  p_goal_payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from UUID;
  v_id UUID;
BEGIN
  v_from := auth.uid();
  IF v_from IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_judge_user_id = v_from THEN
    RAISE EXCEPTION 'Cannot request yourself';
  END IF;

  -- Only allow requests to friends
  IF NOT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.user_id = v_from AND f.friend_user_id = p_judge_user_id
  ) THEN
    RAISE EXCEPTION 'Not friends';
  END IF;

  INSERT INTO public.judge_requests (requester_user_id, judge_user_id, goal_payload, status)
  VALUES (v_from, p_judge_user_id, p_goal_payload, 'pending')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- RPC: accept judge request
CREATE OR REPLACE FUNCTION public.accept_judge_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.judge_requests
  SET status = 'accepted', updated_at = now()
  WHERE id = p_request_id
    AND judge_user_id = auth.uid()
    AND status = 'pending';
END;
$$;

-- RPC: ignore judge request
CREATE OR REPLACE FUNCTION public.ignore_judge_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.judge_requests
  SET status = 'ignored', updated_at = now()
  WHERE id = p_request_id
    AND judge_user_id = auth.uid()
    AND status = 'pending';
END;
$$;

-- RPC: cancel judge request (requester)
CREATE OR REPLACE FUNCTION public.cancel_judge_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.judge_requests
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_request_id
    AND requester_user_id = auth.uid()
    AND status = 'pending';
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_judge_request(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_judge_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ignore_judge_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_judge_request(UUID) TO authenticated;

-- Enable realtime (postgres_changes) for this table
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.judge_requests;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL;
    WHEN undefined_object THEN
      NULL;
  END;
END $$;

