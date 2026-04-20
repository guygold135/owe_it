-- Persist dashboard categories, goal order, and accents per user (syncs across devices).

CREATE TABLE public.user_dashboard_layout (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  organizer jsonb NOT NULL DEFAULT '{"categories":[],"goals":{}}'::jsonb,
  goal_order_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_dashboard_layout_updated_at ON public.user_dashboard_layout (updated_at DESC);

ALTER TABLE public.user_dashboard_layout ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own dashboard layout"
  ON public.user_dashboard_layout
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_user_dashboard_layout_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_dashboard_layout_set_updated_at
  BEFORE UPDATE ON public.user_dashboard_layout
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_user_dashboard_layout_updated_at();
