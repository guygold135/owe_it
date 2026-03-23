-- One pending judge request per (requester, judge). New send updates the same row.
-- Clean existing duplicates before unique index.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY requester_user_id, judge_user_id
      ORDER BY created_at DESC
    ) AS rn
  FROM public.judge_requests
  WHERE status = 'pending'
)
UPDATE public.judge_requests r
SET status = 'cancelled', updated_at = now()
FROM ranked rnk
WHERE r.id = rnk.id AND rnk.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS judge_requests_one_pending_per_pair_idx
  ON public.judge_requests (requester_user_id, judge_user_id)
  WHERE status = 'pending';

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

  IF NOT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.user_id = v_from AND f.friend_user_id = p_judge_user_id
  ) THEN
    RAISE EXCEPTION 'Not friends';
  END IF;

  UPDATE public.judge_requests
  SET goal_payload = p_goal_payload, updated_at = now()
  WHERE requester_user_id = v_from
    AND judge_user_id = p_judge_user_id
    AND status = 'pending'
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    INSERT INTO public.judge_requests (requester_user_id, judge_user_id, goal_payload, status)
    VALUES (v_from, p_judge_user_id, p_goal_payload, 'pending')
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;
