-- Link each application user to exactly one Supabase Auth identity.
ALTER TABLE "User" ADD COLUMN "authUserId" UUID NOT NULL;

CREATE UNIQUE INDEX "User_authUserId_key" ON "User"("authUserId");

ALTER TABLE "User"
ADD CONSTRAINT "User_authUserId_fkey"
FOREIGN KEY ("authUserId") REFERENCES auth.users("id")
ON DELETE CASCADE ON UPDATE NO ACTION;

-- Provision the application profile and preference shell as part of signup.
-- The app also performs an idempotent first-login check for pre-existing Auth users.
CREATE OR REPLACE FUNCTION public.handle_nestmate_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  app_user_id TEXT;
BEGIN
  INSERT INTO public."User" (
    "id",
    "authUserId",
    "name",
    "email",
    "createdAt",
    "updatedAt"
  )
  VALUES (
    NEW.id::TEXT,
    NEW.id,
    COALESCE(
      NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), ''),
      'NestMate member'
    ),
    NEW.email,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("authUserId") DO UPDATE
  SET
    "email" = EXCLUDED."email",
    "updatedAt" = CURRENT_TIMESTAMP
  RETURNING "id" INTO app_user_id;

  INSERT INTO public."UserPreferences" (
    "id",
    "userId",
    "createdAt",
    "updatedAt"
  )
  VALUES (
    NEW.id::TEXT,
    app_user_id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("userId") DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_nestmate_auth_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_nestmate_auth_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_nestmate_auth_user() FROM authenticated;

DROP TRIGGER IF EXISTS on_nestmate_auth_user_created ON auth.users;

CREATE TRIGGER on_nestmate_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_nestmate_auth_user();

-- Remove broad default privileges, then grant only the profile operations used by the app.
REVOKE ALL PRIVILEGES ON TABLE public."User" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."UserPreferences" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."UserPreferredLocality" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."Locality" FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public."User" TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public."UserPreferences" TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public."UserPreferredLocality" TO authenticated;
GRANT SELECT ON TABLE public."Locality" TO authenticated;

ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserPreferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserPreferredLocality" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Locality" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own profile" ON public."User";
CREATE POLICY "Users can read their own profile"
ON public."User"
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = "authUserId");

DROP POLICY IF EXISTS "Users can create their own profile" ON public."User";
CREATE POLICY "Users can create their own profile"
ON public."User"
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = "authUserId");

DROP POLICY IF EXISTS "Users can update their own profile" ON public."User";
CREATE POLICY "Users can update their own profile"
ON public."User"
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = "authUserId")
WITH CHECK ((SELECT auth.uid()) = "authUserId");

DROP POLICY IF EXISTS "Users can read their own preferences" ON public."UserPreferences";
CREATE POLICY "Users can read their own preferences"
ON public."UserPreferences"
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public."User" AS app_user
    WHERE app_user."id" = "UserPreferences"."userId"
      AND app_user."authUserId" = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can create their own preferences" ON public."UserPreferences";
CREATE POLICY "Users can create their own preferences"
ON public."UserPreferences"
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public."User" AS app_user
    WHERE app_user."id" = "UserPreferences"."userId"
      AND app_user."authUserId" = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can update their own preferences" ON public."UserPreferences";
CREATE POLICY "Users can update their own preferences"
ON public."UserPreferences"
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public."User" AS app_user
    WHERE app_user."id" = "UserPreferences"."userId"
      AND app_user."authUserId" = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public."User" AS app_user
    WHERE app_user."id" = "UserPreferences"."userId"
      AND app_user."authUserId" = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can read their own preferred localities" ON public."UserPreferredLocality";
CREATE POLICY "Users can read their own preferred localities"
ON public."UserPreferredLocality"
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public."UserPreferences" AS preferences
    JOIN public."User" AS app_user
      ON app_user."id" = preferences."userId"
    WHERE preferences."id" = "UserPreferredLocality"."preferencesId"
      AND app_user."authUserId" = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can add their own preferred localities" ON public."UserPreferredLocality";
CREATE POLICY "Users can add their own preferred localities"
ON public."UserPreferredLocality"
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public."UserPreferences" AS preferences
    JOIN public."User" AS app_user
      ON app_user."id" = preferences."userId"
    WHERE preferences."id" = "UserPreferredLocality"."preferencesId"
      AND app_user."authUserId" = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can remove their own preferred localities" ON public."UserPreferredLocality";
CREATE POLICY "Users can remove their own preferred localities"
ON public."UserPreferredLocality"
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public."UserPreferences" AS preferences
    JOIN public."User" AS app_user
      ON app_user."id" = preferences."userId"
    WHERE preferences."id" = "UserPreferredLocality"."preferencesId"
      AND app_user."authUserId" = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Authenticated users can read localities" ON public."Locality";
CREATE POLICY "Authenticated users can read localities"
ON public."Locality"
FOR SELECT
TO authenticated
USING (TRUE);

-- Replace a user's locality choices atomically while still enforcing table RLS.
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
  ON CONFLICT ("preferencesId", "localityId") DO UPDATE
  SET "priority" = EXCLUDED."priority";
END;
$$;

REVOKE ALL ON FUNCTION public.replace_my_preferred_localities(TEXT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_my_preferred_localities(TEXT, TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.replace_my_preferred_localities(TEXT, TEXT[]) TO authenticated;
