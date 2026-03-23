-- Fix requester flow: accept used to UPDATE then DELETE in one transaction, so clients never saw
-- status = 'accepted' (poll only saw row disappear). Keep the row as 'accepted' until superseded
-- or cleaned up. Restore ignore/cancel as UPDATEs (not DELETE) so outcomes stay observable.

CREATE OR REPLACE FUNCTION public.accept_judge_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.judge_requests
  SET status = 'accepted', updated_at = now()
  WHERE id = p_request_id
    AND judge_user_id = auth.uid()
    AND status = 'pending';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'Request not found or not pending';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.ignore_judge_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.judge_requests
  SET status = 'ignored', updated_at = now()
  WHERE id = p_request_id
    AND judge_user_id = auth.uid()
    AND status = 'pending';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'Request not found or not pending';
  END IF;
END;
$$;

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
  -- No exception if 0 rows (already deleted by cleanup or resolved).
END;
$$;

-- Remove stale resolved rows before upsert so a new pending request does not duplicate (requester, judge).
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

  DELETE FROM public.judge_requests
  WHERE requester_user_id = v_from
    AND judge_user_id = p_judge_user_id
    AND status IN ('accepted', 'ignored', 'cancelled');

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
