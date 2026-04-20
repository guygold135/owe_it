-- Allow signed-in users to mark their own in-app notifications as read.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'in_app_notifications'
      AND policyname = 'Users update own in_app_notifications'
  ) THEN
    CREATE POLICY "Users update own in_app_notifications"
      ON public.in_app_notifications FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

