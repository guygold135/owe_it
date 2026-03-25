-- Retry metadata for deferred stake settlement attempts.

ALTER TABLE public.goals
ADD COLUMN IF NOT EXISTS payment_retry_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS next_payment_retry_at timestamptz,
ADD COLUMN IF NOT EXISTS last_payment_error text;

CREATE INDEX IF NOT EXISTS goals_next_payment_retry_idx
  ON public.goals (next_payment_retry_at)
  WHERE status = 'failed';
