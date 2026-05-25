-- Always in-app notify on judge accept; departed flag still gates email.

CREATE OR REPLACE FUNCTION public.accept_judge_request (p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.judge_requests%ROWTYPE;
  v_judge_name text;
  v_goal_title text;
  v_body text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.judge_requests
  SET status = 'accepted', updated_at = now()
  WHERE id = p_request_id
    AND judge_user_id = auth.uid()
    AND status = 'pending'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or not pending';
  END IF;

  SELECT NULLIF(trim(p.display_name), '')
  INTO v_judge_name
  FROM public.profiles p
  WHERE p.id = v_row.judge_user_id;

  v_judge_name := COALESCE(v_judge_name, 'Your judge');
  v_goal_title := COALESCE(NULLIF(trim(v_row.goal_payload ->> 'title'), ''), 'your goal');
  v_body := format(
    '%s accepted judging "%s". Continue setup to finish your goal.',
    v_judge_name,
    v_goal_title
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.in_app_notifications n
    WHERE n.user_id = v_row.requester_user_id
      AND n.kind = 'judge_request_accepted'
      AND n.judge_request_id = v_row.id
  ) THEN
    INSERT INTO public.in_app_notifications (
      user_id,
      kind,
      title,
      body,
      judge_request_id
    )
    VALUES (
      v_row.requester_user_id,
      'judge_request_accepted',
      format('%s accepted your judge request', v_judge_name),
      v_body,
      v_row.id
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_judge_request (uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_judge_request (uuid) TO authenticated;
