-- Delete judge request rows once resolved.
-- Keep a brief status transition first so realtime DELETE old row carries final status.

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
    AND judge_user_id = auth.uid()
    AND status = 'accepted';
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

  DELETE FROM public.judge_requests
  WHERE id = p_request_id
    AND judge_user_id = auth.uid()
    AND status = 'ignored';
END;
$$;
