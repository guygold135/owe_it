-- Judge deadline reminders: include goal owner's display name in notification body.
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
  owner_display_name text;
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

  SELECT NULLIF(trim(p.display_name), '')
  INTO owner_display_name
  FROM public.profiles p
  WHERE p.id = g.user_id;

  owner_display_name := COALESCE(owner_display_name, 'Someone');

  ms_left := (EXTRACT(EPOCH FROM (g.deadline - now())) * 1000)::bigint;

  IF ms_left <= 0 THEN
    RETURN;
  END IF;

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
        'Deadline in less than 24 hours',
        format('Your goal "%s" is due in less than 24 hours.', g.title),
        p_goal_id
      );

      IF g.judge_user_id IS NOT NULL AND g.judge_user_id IS DISTINCT FROM g.user_id THEN
        INSERT INTO public.in_app_notifications (user_id, kind, title, body, goal_id)
        VALUES (
          g.judge_user_id,
          'deadline_24h',
          'Goal due in less than 24 hours',
          format(
            '%s''s goal "%s" is due in less than 24 hours.',
            owner_display_name,
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
        'Urgent — less than 6 hours left',
        format('Your goal "%s" is due in less than 6 hours.', g.title),
        p_goal_id
      );

      IF g.judge_user_id IS NOT NULL AND g.judge_user_id IS DISTINCT FROM g.user_id THEN
        INSERT INTO public.in_app_notifications (user_id, kind, title, body, goal_id)
        VALUES (
          g.judge_user_id,
          'deadline_6h',
          'Urgent — judging soon',
          format(
            '%s''s goal "%s" is due in less than 6 hours. Be ready to judge.',
            owner_display_name,
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
