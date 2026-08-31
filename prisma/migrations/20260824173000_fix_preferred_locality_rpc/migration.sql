-- The function deletes the caller's prior choices first, so conflicts only
-- represent duplicate locality IDs in the input and can be ignored. Avoiding
-- DO UPDATE keeps the authenticated table grant intentionally least-privilege.
CREATE OR REPLACE FUNCTION public.replace_my_preferred_localities(
  p_preferences_id TEXT,
  p_locality_ids TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public."UserPreferredLocality"
  WHERE "preferencesId" = p_preferences_id;

  INSERT INTO public."UserPreferredLocality" (
    "preferencesId",
    "localityId",
    "priority",
    "createdAt"
  )
  SELECT
    p_preferences_id,
    selected_locality.locality_id,
    (selected_locality.position - 1)::INTEGER,
    CURRENT_TIMESTAMP
  FROM UNNEST(p_locality_ids) WITH ORDINALITY
    AS selected_locality(locality_id, position)
  ON CONFLICT ("preferencesId", "localityId") DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_my_preferred_localities(TEXT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_my_preferred_localities(TEXT, TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.replace_my_preferred_localities(TEXT, TEXT[]) TO authenticated;
