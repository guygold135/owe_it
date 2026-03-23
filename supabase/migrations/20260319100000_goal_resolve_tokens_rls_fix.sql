-- Fix RLS for goal_resolve_tokens: ensure judge can insert token for goals they judge.
-- Use a SECURITY DEFINER function so the check doesn't depend on goals table RLS.

CREATE OR REPLACE FUNCTION public.is_judge_for_goal(p_goal_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.goals g
    WHERE g.id = p_goal_id
      AND g.judge_user_id = auth.uid()
  );
$$;

-- Replace the INSERT policy to use the function (avoids RLS on goals in the check)
DROP POLICY IF EXISTS "judge_can_create_resolve_token_for_assigned_goal" ON public.goal_resolve_tokens;
DROP POLICY IF EXISTS "judge_insert_own_resolve_token" ON public.goal_resolve_tokens;

CREATE POLICY "judge_can_create_resolve_token_for_assigned_goal"
  ON public.goal_resolve_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (
    judge_user_id = auth.uid()
    AND public.is_judge_for_goal(goal_id) = true
  );

COMMENT ON FUNCTION public.is_judge_for_goal(uuid) IS 'Returns true if the current user is the judge for the given goal. Used by goal_resolve_tokens RLS.';
