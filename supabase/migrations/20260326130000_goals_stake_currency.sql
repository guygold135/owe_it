-- Persist currency per goal so historical goals stay unchanged
ALTER TABLE public.goals
ADD COLUMN IF NOT EXISTS stake_currency TEXT NOT NULL DEFAULT 'usd';

