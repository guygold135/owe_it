-- Reject display names that are exactly 11 ASCII digits (reserved vs ids / codes).

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
  v_trimmed text := btrim(coalesce(p_display_name, ''));
BEGIN
  IF v_name = '' THEN
    RETURN false;
  END IF;
  IF v_trimmed ~ '^[0-9]{11}$' THEN
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
