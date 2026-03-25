-- Disable DB-level auto-expire cron to avoid split logic.
-- The Edge Function settle-expired-goal-payments is now the single
-- source of truth for expiring and settling overdue goals.

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
