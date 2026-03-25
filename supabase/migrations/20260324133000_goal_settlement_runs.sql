-- Audit table for settlement worker observability.
-- Keeps per-run counters and per-goal outcomes in details JSON.

CREATE TABLE IF NOT EXISTS public.goal_settlement_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  status text NOT NULL,
  trigger text NOT NULL DEFAULT 'cron',
  batch_size integer NOT NULL DEFAULT 100,
  expired_count integer NOT NULL DEFAULT 0,
  processed_count integer NOT NULL DEFAULT 0,
  captured_count integer NOT NULL DEFAULT 0,
  already_captured_count integer NOT NULL DEFAULT 0,
  cancelled_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS goal_settlement_runs_created_at_idx
  ON public.goal_settlement_runs (created_at DESC);
