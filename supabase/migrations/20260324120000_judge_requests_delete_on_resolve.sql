-- Resolve judge requests by deleting the row (no long-lived status rows).
-- Accept: UPDATE to accepted (so requester's realtime sees the outcome), then DELETE in the same transaction.
-- Ignore / cancel: DELETE pending row only.

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

  DELETE FROM public.judge_requests
  WHERE id = p_request_id
    AND judge_user_id = auth.uid();
END;
$$;

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

  DELETE FROM public.judge_requests
  WHERE id = p_request_id
    AND judge_user_id = auth.uid()
    AND status = 'pending';
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

  DELETE FROM public.judge_requests
  WHERE id = p_request_id
    AND requester_user_id = auth.uid()
    AND status = 'pending';
END;
$$;
