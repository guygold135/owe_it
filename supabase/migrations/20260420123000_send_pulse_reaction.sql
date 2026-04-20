-- Unified pulse reaction sender for all pulse actions.
CREATE OR REPLACE FUNCTION public.send_pulse_reaction(
  p_recipient_user_id uuid,
  p_goal_title text,
  p_action text,
  p_variant text DEFAULT 'cheer'
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
  v_variant text;
  v_action text;
  v_body text;
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

  v_goal := left(coalesce(nullif(trim(p_goal_title), ''), 'goal'), 220);
  v_variant := lower(coalesce(nullif(trim(p_variant), ''), 'cheer'));
  v_action := lower(coalesce(nullif(trim(p_action), ''), 'completed'));

  IF v_action = 'created' THEN
    IF v_variant = 'support' THEN
      v_body := format('%s is cheering you on for your new goal "%s"!', v_sender, v_goal);
    ELSIF v_variant = 'momentum' THEN
      v_body := format('%s says: Stay locked in and finish "%s" strong!', v_sender, v_goal);
    ELSE
      v_body := format('%s says: Let''s go - start strong on "%s"!', v_sender, v_goal);
    END IF;
  ELSIF v_action = 'staked' THEN
    IF v_variant = 'support' THEN
      v_body := format('%s says: Big commitment on "%s" - you got this!', v_sender, v_goal);
    ELSIF v_variant = 'momentum' THEN
      v_body := format('%s says: Stay locked in and finish "%s" strong!', v_sender, v_goal);
    ELSE
      v_body := format('%s says: Respect for staking on "%s".', v_sender, v_goal);
    END IF;
  ELSIF v_action = 'failed' THEN
    IF v_variant = 'support' THEN
      v_body := format('%s says: You are not done - bounce back on your next goal.', v_sender);
    ELSIF v_variant = 'momentum' THEN
      v_body := format('%s says: Back your comeback - reset and keep moving.', v_sender);
    ELSE
      v_body := format('%s says: Tough day, but you can reset and come back stronger.', v_sender);
    END IF;
  ELSE
    IF v_variant = 'proud' THEN
      v_body := format('%s is proud of you for completing your "%s" goal.', v_sender, v_goal);
    ELSIF v_variant = 'hype' THEN
      v_body := format('%s sends big congrats for completing your "%s" goal! Keep going.', v_sender, v_goal);
    ELSE
      v_body := format('%s sends congrats for completing your "%s" goal!', v_sender, v_goal);
    END IF;
  END IF;

  v_title := format('%s sent you a message', v_sender);

  INSERT INTO public.in_app_notifications (user_id, kind, title, body, goal_id)
  VALUES (
    p_recipient_user_id,
    'pulse_friend_congrats',
    v_title,
    v_body,
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_pulse_reaction (uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_pulse_reaction (uuid, text, text, text) TO authenticated;

