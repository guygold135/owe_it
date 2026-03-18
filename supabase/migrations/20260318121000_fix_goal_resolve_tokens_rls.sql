-- Fix RLS/grants for goal_resolve_tokens.
-- Make judge_user_id default to auth.uid() so client doesn't have to pass it.
-- Also ensure tokens can only be created for goals where the caller is the judge.

ALTER TABLE public.goal_resolve_tokens
  ALTER COLUMN judge_user_id SET DEFAULT auth.uid();

GRANT INSERT ON TABLE public.goal_resolve_tokens TO authenticated;

DROP POLICY IF EXISTS "judge_insert_own_resolve_token" ON public.goal_resolve_tokens;

CREATE POLICY "judge_can_create_resolve_token_for_assigned_goal"
  ON public.goal_resolve_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (
    judge_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.goals g
      WHERE g.id = goal_id
        AND g.judge_user_id = auth.uid()
    )
  );

