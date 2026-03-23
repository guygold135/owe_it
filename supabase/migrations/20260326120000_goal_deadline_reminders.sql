-- Dedupe: one 24h and one 6h reminder per goal (lifetime).
CREATE TABLE IF NOT EXISTS public.goal_deadline_reminder_sent (
  goal_id uuid NOT NULL REFERENCES public.goals (id) ON DELETE CASCADE,
  threshold text NOT NULL CHECK (threshold IN ('24h', '6h')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (goal_id, threshold)
);

CREATE INDEX IF NOT EXISTS goal_deadline_reminder_sent_goal_id_idx
  ON public.goal_deadline_reminder_sent (goal_id);

-- In-app rows; RLS: users read only their own; inserts only via RPC.
CREATE TABLE IF NOT EXISTS public.in_app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  goal_id uuid REFERENCES public.goals (id) ON DELETE SET NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS in_app_notifications_user_created_idx
  ON public.in_app_notifications (user_id, created_at DESC);

ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'in_app_notifications'
      AND policyname = 'Users read own in_app_notifications'
  ) THEN
    CREATE POLICY "Users read own in_app_notifications"
      ON public.in_app_notifications FOR SELECT TO authenticated
      USING (auth.uid () = user_id);
  END IF;
END $$;

-- RPC: caller must be goal creator or judge; creates rows for both parties (deduped per threshold).
CREATE OR REPLACE FUNCTION public.try_goal_deadline_reminders (p_goal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g RECORD;
  ms_left bigint;
  uid uuid := auth.uid ();
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO g
  FROM public.goals
  WHERE id = p_goal_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF g.user_id IS DISTINCT FROM uid AND g.judge_user_id IS DISTINCT FROM uid THEN
    RETURN;
  END IF;

  ms_left := (EXTRACT(EPOCH FROM (g.deadline - now())) * 1000)::bigint;

  IF ms_left <= 0 THEN
    RETURN;
  END IF;

  -- Under 24h (includes under 6h; 6h is a separate notification).
  IF ms_left <= 24 * 60 * 60 * 1000 THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.goal_deadline_reminder_sent s
      WHERE s.goal_id = p_goal_id AND s.threshold = '24h'
    ) THEN
      INSERT INTO public.goal_deadline_reminder_sent (goal_id, threshold)
      VALUES (p_goal_id, '24h');

      INSERT INTO public.in_app_notifications (user_id, kind, title, body, goal_id)
      VALUES (
        g.user_id,
        'deadline_24h',
        'Deadline in under 24 hours',
        CASE
          WHEN g.judge_user_id IS NOT DISTINCT FROM g.user_id THEN format(
            'Your goal "%s" is due in less than 24 hours. (Self-judged)',
            g.title
          )
          ELSE format('Your goal "%s" is due in less than 24 hours.', g.title)
        END,
        p_goal_id
      );

      IF g.judge_user_id IS NOT NULL AND g.judge_user_id IS DISTINCT FROM g.user_id THEN
        INSERT INTO public.in_app_notifications (user_id, kind, title, body, goal_id)
        VALUES (
          g.judge_user_id,
          'deadline_24h',
          'Goal due in under 24 hours',
          format(
            '"%s" is due in less than 24 hours — you are the judge for this goal.',
            g.title
          ),
          p_goal_id
        );
      END IF;
    END IF;
  END IF;

  ms_left := (EXTRACT(EPOCH FROM (g.deadline - now())) * 1000)::bigint;

  IF ms_left <= 0 THEN
    RETURN;
  END IF;

  IF ms_left <= 6 * 60 * 60 * 1000 THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.goal_deadline_reminder_sent s
      WHERE s.goal_id = p_goal_id AND s.threshold = '6h'
    ) THEN
      INSERT INTO public.goal_deadline_reminder_sent (goal_id, threshold)
      VALUES (p_goal_id, '6h');

      INSERT INTO public.in_app_notifications (user_id, kind, title, body, goal_id)
      VALUES (
        g.user_id,
        'deadline_6h',
        'Urgent — under 6 hours',
        format('Urgent: your goal "%s" is due in less than 6 hours.', g.title),
        p_goal_id
      );

      IF g.judge_user_id IS NOT NULL AND g.judge_user_id IS DISTINCT FROM g.user_id THEN
        INSERT INTO public.in_app_notifications (user_id, kind, title, body, goal_id)
        VALUES (
          g.judge_user_id,
          'deadline_6h',
          'Urgent — judging soon',
          format(
            '"%s" is due in less than 6 hours — be ready to judge.',
            g.title
          ),
          p_goal_id
        );
      END IF;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.try_goal_deadline_reminders (uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_goal_deadline_reminders (uuid) TO authenticated;

-- Realtime: toast host listens for INSERTs
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.in_app_notifications;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL;
    WHEN undefined_object THEN
      NULL;
  END;
END $$;
