-- Stripe webhook event ledger for idempotency and auditability.
-- Prevents duplicate processing when Stripe retries the same event.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  livemode boolean NOT NULL DEFAULT false,
  api_version text,
  status text NOT NULL DEFAULT 'processing',
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_created_at_idx
  ON public.stripe_webhook_events (created_at DESC);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_status_idx
  ON public.stripe_webhook_events (status);
