CREATE FUNCTION nestmate_private.clear_my_recent_views()
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public."RecentView"
  WHERE "viewerId" = current_user_id;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.clear_my_recent_views()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.clear_my_recent_views()
TO authenticated;

CREATE FUNCTION public.clear_recent_views()
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT nestmate_private.clear_my_recent_views();
$$;

REVOKE ALL ON FUNCTION public.clear_recent_views()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_recent_views()
TO authenticated;
