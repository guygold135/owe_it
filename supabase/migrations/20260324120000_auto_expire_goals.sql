-- Auto-expire overdue goals in the database, even if the app is down.
-- This runs fully server-side on a schedule via pg_cron.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.auto_expire_overdue_goals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count integer := 0;
BEGIN
  WITH expired AS (
    UPDATE public.goals g
    SET
      status = 'failed',
      resolved_at = now(),
      resolved_by = COALESCE(g.resolved_by, g.user_id)
    WHERE g.status = 'active'
      AND g.deadline <= now()
    RETURNING g.id, g.user_id, g.title, g.stake, g.is_private
  ),
  pulse AS (
    INSERT INTO public.pulse_events (user_id, action, goal_title, stake)
    SELECT e.user_id, 'failed', e.title, e.stake
    FROM expired e
    WHERE COALESCE(e.is_private, false) = false
    RETURNING 1
  )
  SELECT COUNT(*) INTO expired_count FROM expired;

  RETURN expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_expire_overdue_goals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_expire_overdue_goals() TO service_role;

-- Idempotent schedule setup (every 5 minutes).
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'auto-expire-overdue-goals'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;
END
$$;

SELECT cron.schedule(
  'auto-expire-overdue-goals',
  '*/5 * * * *',
  $$SELECT public.auto_expire_overdue_goals();$$
);
