-- Drop orphaned pending judge requests when the requester reloads the app (CreateGoalSheet no longer runs cancel on close).

CREATE OR REPLACE FUNCTION public.cancel_pending_judge_requests_before_cutoff(p_cutoff timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.judge_requests
  WHERE requester_user_id = auth.uid()
    AND status = 'pending'
    AND created_at < p_cutoff;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_pending_judge_requests_before_cutoff(timestamptz) TO authenticated;
