-- Stripe Connect: friends can receive failed stakes. Charities can reuse stake_recipient later.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stake_payouts_ready BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.stripe_connect_account_id IS 'Stripe Connect Express account id (acct_...)';
COMMENT ON COLUMN public.profiles.stake_payouts_ready IS 'True when Connect onboarding complete and payouts are enabled';

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS stake_recipient_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.goals.stake_recipient_user_id IS 'Friend who receives the stake if the goal fails (Stripe Connect)';

CREATE INDEX IF NOT EXISTS goals_stake_recipient_user_id_idx ON public.goals (stake_recipient_user_id)
  WHERE stake_recipient_user_id IS NOT NULL;
