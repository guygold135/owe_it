-- Allow judges to read goals they are judging

DO $$
BEGIN
  -- Create policy only if it doesn't already exist
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'goals'
      AND policyname = 'Judges can read assigned goals'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Judges can read assigned goals"
      ON public.goals
      FOR SELECT
      TO authenticated
      USING (judge_user_id = auth.uid());
    $p$;
  END IF;
END $$;

