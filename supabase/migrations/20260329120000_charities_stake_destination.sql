-- Charities receive failed stakes via Stripe Connect (same payout model as friends).

CREATE TABLE IF NOT EXISTS public.charities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  short_description TEXT,
  stripe_connect_account_id TEXT UNIQUE,
  stake_payouts_ready BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.charities IS 'Charity orgs that can receive failed stakes; add rows via SQL or admin tooling.';
COMMENT ON COLUMN public.charities.stripe_connect_account_id IS 'Stripe Connect Express account id for payouts';

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS stake_charity_id UUID REFERENCES public.charities (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.goals.stake_charity_id IS 'Charity that receives the stake if the goal fails (mutually exclusive with stake_recipient_user_id)';

ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_stake_friend_or_charity_only;

ALTER TABLE public.goals
  ADD CONSTRAINT goals_stake_friend_or_charity_only CHECK (
    stake_charity_id IS NULL OR stake_recipient_user_id IS NULL
  );

CREATE INDEX IF NOT EXISTS goals_stake_charity_id_idx ON public.goals (stake_charity_id)
  WHERE stake_charity_id IS NOT NULL;

ALTER TABLE public.charities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read active charities"
  ON public.charities FOR SELECT
  TO authenticated
  USING (active = true);

-- After creating a Stripe Connect account for an org, insert e.g.:
-- INSERT INTO public.charities (name, short_description, stripe_connect_account_id, stake_payouts_ready, active)
-- VALUES ('Example Org', 'Optional line shown in the app', 'acct_REPLACE_ME', true, true);
