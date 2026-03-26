-- Minimal Rapyd tracking columns + webhook inbox

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS rapyd_checkout_id TEXT,
  ADD COLUMN IF NOT EXISTS rapyd_payment_id TEXT;

CREATE TABLE IF NOT EXISTS public.rapyd_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload TEXT NOT NULL
);

ALTER TABLE public.rapyd_webhook_events ENABLE ROW LEVEL SECURITY;

-- Keep it private (service-role only) by not adding SELECT policies.
