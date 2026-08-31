-- Expose only the locality reference data needed by the community UI.
REVOKE ALL PRIVILEGES ON TABLE public."City" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."Locality" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."Community" FROM anon, authenticated;

GRANT SELECT ON TABLE public."City" TO anon, authenticated;
GRANT SELECT ON TABLE public."Locality" TO anon, authenticated;
GRANT SELECT ON TABLE public."Community" TO anon, authenticated;

ALTER TABLE public."City" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Locality" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Community" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read cities" ON public."City";
CREATE POLICY "Anyone can read cities"
ON public."City"
FOR SELECT
TO anon, authenticated
USING (TRUE);

DROP POLICY IF EXISTS "Authenticated users can read localities" ON public."Locality";
DROP POLICY IF EXISTS "Anyone can read localities" ON public."Locality";
CREATE POLICY "Anyone can read localities"
ON public."Locality"
FOR SELECT
TO anon, authenticated
USING (TRUE);

DROP POLICY IF EXISTS "Anyone can read active communities" ON public."Community";
CREATE POLICY "Anyone can read active communities"
ON public."Community"
FOR SELECT
TO anon, authenticated
USING ("isActive" = TRUE);

-- Public visitors can read live posts. Only an authenticated post owner can
-- create, update, or delete their own post.
REVOKE ALL PRIVILEGES ON TABLE public."Post" FROM anon, authenticated;
GRANT SELECT ON TABLE public."Post" TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public."Post" TO authenticated;

GRANT USAGE ON TYPE public."PostType" TO authenticated;
GRANT USAGE ON TYPE public."PostStatus" TO authenticated;
GRANT USAGE ON TYPE public."GenderPreference" TO authenticated;
GRANT USAGE ON TYPE public."PropertyType" TO authenticated;
GRANT USAGE ON TYPE public."RoomType" TO authenticated;
GRANT USAGE ON TYPE public."FurnishingStatus" TO authenticated;

ALTER TABLE public."Post" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active community posts" ON public."Post";
CREATE POLICY "Anyone can read active community posts"
ON public."Post"
FOR SELECT
TO anon, authenticated
USING (
  "status" = 'ACTIVE'::public."PostStatus"
  AND "publishedAt" IS NOT NULL
);

DROP POLICY IF EXISTS "Users can create their own community posts" ON public."Post";
CREATE POLICY "Users can create their own community posts"
ON public."Post"
FOR INSERT
TO authenticated
WITH CHECK (
  "status" = 'ACTIVE'::public."PostStatus"
  AND "publishedAt" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public."User" AS app_user
    WHERE app_user."id" = "Post"."authorId"
      AND app_user."authUserId" = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1
    FROM public."Community" AS locality_community
    WHERE locality_community."id" = "Post"."communityId"
      AND locality_community."isActive" = TRUE
  )
);

DROP POLICY IF EXISTS "Users can update their own community posts" ON public."Post";
CREATE POLICY "Users can update their own community posts"
ON public."Post"
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public."User" AS app_user
    WHERE app_user."id" = "Post"."authorId"
      AND app_user."authUserId" = (SELECT auth.uid())
  )
)
WITH CHECK (
  "status" = 'ACTIVE'::public."PostStatus"
  AND "publishedAt" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public."User" AS app_user
    WHERE app_user."id" = "Post"."authorId"
      AND app_user."authUserId" = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1
    FROM public."Community" AS locality_community
    WHERE locality_community."id" = "Post"."communityId"
      AND locality_community."isActive" = TRUE
  )
);

DROP POLICY IF EXISTS "Users can delete their own community posts" ON public."Post";
CREATE POLICY "Users can delete their own community posts"
ON public."Post"
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public."User" AS app_user
    WHERE app_user."id" = "Post"."authorId"
      AND app_user."authUserId" = (SELECT auth.uid())
  )
);
