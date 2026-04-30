-- Lock internal operational tables so they are not unrestricted in Supabase.
-- These tables are used by server-side jobs/webhooks, not by client apps.

DO $$
BEGIN
  -- 1) Goal deadline reminder dedupe ledger
  IF EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'goal_deadline_reminder_sent'
  ) THEN
    ALTER TABLE public.goal_deadline_reminder_sent ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.goal_deadline_reminder_sent FROM anon, authenticated;
    GRANT ALL ON TABLE public.goal_deadline_reminder_sent TO service_role;
  END IF;

  -- 2) Settlement run audit table
  IF EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'goal_settlement_runs'
  ) THEN
    ALTER TABLE public.goal_settlement_runs ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.goal_settlement_runs FROM anon, authenticated;
    GRANT ALL ON TABLE public.goal_settlement_runs TO service_role;
  END IF;

  -- 3) Stripe webhook idempotency/audit table
  IF EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'stripe_webhook_events'
  ) THEN
    ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.stripe_webhook_events FROM anon, authenticated;
    GRANT ALL ON TABLE public.stripe_webhook_events TO service_role;
  END IF;

  -- 4) Optional legacy "friends" table if present in remote
  IF EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'friends'
  ) THEN
    ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.friends FROM anon, authenticated;
    GRANT ALL ON TABLE public.friends TO service_role;
  END IF;
END $$;
