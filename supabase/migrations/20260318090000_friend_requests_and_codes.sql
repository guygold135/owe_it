-- Friend codes + friend requests + friendships

-- Required for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Add friend_code to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS friend_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_friend_code_unique
  ON public.profiles (friend_code)
  WHERE friend_code IS NOT NULL;

-- Generate an 11-digit numeric friend code
CREATE OR REPLACE FUNCTION public.generate_friend_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  code TEXT;
BEGIN
  LOOP
    code := lpad((floor(random() * 100000000000)::bigint)::text, 11, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.friend_code = code);
  END LOOP;
  RETURN code;
END;
$$;

-- Ensure profiles have a friend_code (on insert + backfill)
CREATE OR REPLACE FUNCTION public.ensure_profile_friend_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.friend_code IS NULL OR NEW.friend_code = '' THEN
    NEW.friend_code := public.generate_friend_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_friend_code ON public.profiles;
CREATE TRIGGER profiles_set_friend_code
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.ensure_profile_friend_code();

UPDATE public.profiles
SET friend_code = public.generate_friend_code()
WHERE friend_code IS NULL OR friend_code = '';

-- 2) Friend requests
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'friend_request_status') THEN
    CREATE TYPE public.friend_request_status AS ENUM ('pending', 'accepted', 'ignored');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.friend_request_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT friend_requests_not_self CHECK (from_user_id <> to_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_unique_pending_pair
  ON public.friend_requests (from_user_id, to_user_id)
  WHERE status = 'pending';

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own friend requests"
  ON public.friend_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "Users can send friend requests"
  ON public.friend_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Recipient can update request status"
  ON public.friend_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = to_user_id)
  WITH CHECK (auth.uid() = to_user_id);

-- 3) Friendships (simple directional edges)
CREATE TABLE IF NOT EXISTS public.friendships (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_user_id),
  CONSTRAINT friendships_not_self CHECK (user_id <> friend_user_id)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own friendships"
  ON public.friendships FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 4) RPCs to send/accept/ignore
CREATE OR REPLACE FUNCTION public.send_friend_request_by_code(p_to_friend_code TEXT)
RETURNS TABLE (request_id UUID, to_user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_to UUID;
  v_from UUID;
  v_req_id UUID;
BEGIN
  v_from := auth.uid();
  IF v_from IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.id INTO v_to
  FROM public.profiles p
  WHERE p.friend_code = p_to_friend_code;

  IF v_to IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_to = v_from THEN
    RAISE EXCEPTION 'Cannot add yourself';
  END IF;

  -- Already friends?
  IF EXISTS (SELECT 1 FROM public.friendships f WHERE f.user_id = v_from AND f.friend_user_id = v_to) THEN
    RAISE EXCEPTION 'Already friends';
  END IF;

  -- If there is an incoming pending request, auto-accept it
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

CREATE OR REPLACE FUNCTION public.accept_friend_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from UUID;
  v_to UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT fr.from_user_id, fr.to_user_id INTO v_from, v_to
  FROM public.friend_requests fr
  WHERE fr.id = p_request_id AND fr.status = 'pending';

  IF v_to IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_to <> auth.uid() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE public.friend_requests
  SET status = 'accepted', updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.friendships (user_id, friend_user_id)
  VALUES (v_to, v_from)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.friendships (user_id, friend_user_id)
  VALUES (v_from, v_to)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.ignore_friend_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.friend_requests
  SET status = 'ignored', updated_at = now()
  WHERE id = p_request_id AND to_user_id = auth.uid() AND status = 'pending';
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_friend_request_by_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_friend_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ignore_friend_request(UUID) TO authenticated;

