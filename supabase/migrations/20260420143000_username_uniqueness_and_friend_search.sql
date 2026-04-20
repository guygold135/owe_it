-- Username uniqueness + friend request by user id.

-- Normalize duplicate display names before enforcing uniqueness (case-insensitive).
WITH ranked AS (
  SELECT
    id,
    display_name,
    row_number() OVER (
      PARTITION BY lower(btrim(display_name))
      ORDER BY created_at, id
    ) AS rn
  FROM public.profiles
  WHERE btrim(display_name) <> ''
)
UPDATE public.profiles p
SET display_name = left(btrim(p.display_name) || '_' || substr(p.id::text, 1, 4), 64)
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_display_name_unique_ci
  ON public.profiles ((lower(btrim(display_name))))
  WHERE btrim(display_name) <> '';

CREATE OR REPLACE FUNCTION public.is_display_name_available(
  p_display_name text,
  p_exclude_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := lower(btrim(coalesce(p_display_name, '')));
BEGIN
  IF v_name = '' THEN
    RETURN false;
  END IF;
  RETURN NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE lower(btrim(p.display_name)) = v_name
      AND (p_exclude_user_id IS NULL OR p.id IS DISTINCT FROM p_exclude_user_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_display_name_available(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_display_name_available(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_friend_request_to_user(p_to_user_id uuid)
RETURNS TABLE (request_id uuid, to_user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_to uuid := p_to_user_id;
  v_from uuid := auth.uid();
  v_req_id uuid;
BEGIN
  IF v_from IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_to IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_to = v_from THEN
    RAISE EXCEPTION 'Cannot add yourself';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_to) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF EXISTS (SELECT 1 FROM public.friendships f WHERE f.user_id = v_from AND f.friend_user_id = v_to) THEN
    RAISE EXCEPTION 'Already friends';
  END IF;

  SELECT fr.id INTO v_req_id
  FROM public.friend_requests fr
  WHERE fr.from_user_id = v_to AND fr.to_user_id = v_from AND fr.status = 'pending'
  LIMIT 1;

  IF v_req_id IS NOT NULL THEN
    PERFORM public.accept_friend_request(v_req_id);
    RETURN QUERY SELECT v_req_id, v_to;
    RETURN;
  END IF;

  INSERT INTO public.friend_requests (from_user_id, to_user_id, status)
  VALUES (v_from, v_to, 'pending')
  RETURNING id INTO v_req_id;

  RETURN QUERY SELECT v_req_id, v_to;
END;
$$;

REVOKE ALL ON FUNCTION public.send_friend_request_to_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_friend_request_to_user(uuid) TO authenticated;

