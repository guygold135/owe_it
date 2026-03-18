-- One-time tokens for resolving goals. Only the judge can create a token (RLS).
-- Edge function uses token id to authorize without JWT.
CREATE TABLE IF NOT EXISTS public.goal_resolve_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  outcome text NOT NULL CHECK (outcome IN ('completed', 'failed')),
  judge_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_goal_resolve_tokens_goal ON public.goal_resolve_tokens(goal_id);
CREATE INDEX idx_goal_resolve_tokens_used ON public.goal_resolve_tokens(used_at) WHERE used_at IS NULL;

ALTER TABLE public.goal_resolve_tokens ENABLE ROW LEVEL SECURITY;

-- Only the judge can insert a token for themselves (judge_user_id = auth.uid())
CREATE POLICY "judge_insert_own_resolve_token"
  ON public.goal_resolve_tokens FOR INSERT
  TO authenticated
  WITH CHECK (judge_user_id = auth.uid());

-- No SELECT/UPDATE for authenticated; edge function uses service role to read and mark used
COMMENT ON TABLE public.goal_resolve_tokens IS 'One-time tokens for resolve-goal edge function; RLS ensures only judge can create.';
