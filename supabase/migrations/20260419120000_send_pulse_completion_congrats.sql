-- Let a friend send an in-app "congrats" from Pulse when they see you completed a goal.
CREATE OR REPLACE FUNCTION public.send_pulse_completion_congrats(
  p_recipient_user_id uuid,
  p_goal_title text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid ();
  v_sender text;
  v_title text;
  v_goal text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_recipient_user_id IS NULL OR p_recipient_user_id IS NOT DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Invalid recipient';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.user_id = v_uid
      AND f.friend_user_id = p_recipient_user_id
  ) THEN
    RAISE EXCEPTION 'You can only send this to a friend';
  END IF;

  SELECT coalesce(nullif(trim(display_name), ''), 'Your friend')
  INTO v_sender
  FROM public.profiles
  WHERE id = v_uid;

  v_goal := left(coalesce(nullif(trim(p_goal_title), ''), 'your goal'), 400);

  v_title := format('%s is celebrating you!', v_sender);

  INSERT INTO public.in_app_notifications (user_id, kind, title, body, goal_id)
  VALUES (
    p_recipient_user_id,
    'pulse_friend_congrats',
    v_title,
    format(
      '%s sends you congratulations for completing "%s" — that is huge! You showed up and delivered. So proud of you — keep that energy going!',
      v_sender,
      v_goal
    ),
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_pulse_completion_congrats (uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_pulse_completion_congrats (uuid, text) TO authenticated;
