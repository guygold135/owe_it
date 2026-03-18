-- Enable realtime (postgres_changes) for goals table
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.goals;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL;
    WHEN undefined_object THEN
      NULL;
  END;
END $$;

