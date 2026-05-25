-- Track when deadline reminder emails were sent (in-app rows may be created earlier via RPC).
ALTER TABLE public.goal_deadline_reminder_sent
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS goal_deadline_reminder_sent_email_pending_idx
  ON public.goal_deadline_reminder_sent (goal_id)
  WHERE email_sent_at IS NULL;
