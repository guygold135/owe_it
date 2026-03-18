-- Goal judging + delayed stake settlement

ALTER TABLE public.goals
ADD COLUMN IF NOT EXISTS judge_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS payment_intent_id TEXT,
ADD COLUMN IF NOT EXISTS payment_status TEXT,
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS goals_judge_user_id_idx ON public.goals (judge_user_id);
CREATE INDEX IF NOT EXISTS goals_deadline_idx ON public.goals (deadline);

-- Backfill: self-judged goals (judge_name is null) => judge_user_id = user_id
UPDATE public.goals
SET judge_user_id = user_id
WHERE judge_user_id IS NULL AND judge_name IS NULL;

