CREATE OR REPLACE FUNCTION public.remove_friend(p_friend_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_friend_user_id IS NULL THEN
    RAISE EXCEPTION 'Friend not found';
  END IF;

  DELETE FROM public.friendships
  WHERE (user_id = v_user_id AND friend_user_id = p_friend_user_id)
     OR (user_id = p_friend_user_id AND friend_user_id = v_user_id);

  UPDATE public.friend_requests
  SET status = 'ignored',
      updated_at = now()
  WHERE status = 'pending'
    AND (
      (from_user_id = v_user_id AND to_user_id = p_friend_user_id)
      OR
      (from_user_id = p_friend_user_id AND to_user_id = v_user_id)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_friend(UUID) TO authenticated;
