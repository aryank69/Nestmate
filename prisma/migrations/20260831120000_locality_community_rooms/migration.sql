-- Community membership is private to the signed-in user. Members may join
-- active locality communities, and only members may publish there.
REVOKE ALL PRIVILEGES ON TABLE public."CommunityMember" FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public."CommunityMember" TO authenticated;
GRANT USAGE ON TYPE public."CommunityRole" TO authenticated;

ALTER TABLE public."CommunityMember" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own community memberships"
ON public."CommunityMember";
CREATE POLICY "Users can read their own community memberships"
ON public."CommunityMember"
FOR SELECT
TO authenticated
USING (
  "userId" IN (
    SELECT app_user."id"
    FROM public."User" AS app_user
    WHERE app_user."authUserId" = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can join active locality communities"
ON public."CommunityMember";
CREATE POLICY "Users can join active locality communities"
ON public."CommunityMember"
FOR INSERT
TO authenticated
WITH CHECK (
  "role" = 'MEMBER'::public."CommunityRole"
  AND "userId" IN (
    SELECT app_user."id"
    FROM public."User" AS app_user
    WHERE app_user."authUserId" = (SELECT auth.uid())
  )
  AND "communityId" IN (
    SELECT locality_community."id"
    FROM public."Community" AS locality_community
    WHERE locality_community."isActive" = TRUE
  )
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
  AND "communityId" IN (
    SELECT membership."communityId"
    FROM public."CommunityMember" AS membership
    INNER JOIN public."User" AS member_user
      ON member_user."id" = membership."userId"
    INNER JOIN public."Community" AS locality_community
      ON locality_community."id" = membership."communityId"
    WHERE member_user."authUserId" = (SELECT auth.uid())
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
  AND "communityId" IN (
    SELECT membership."communityId"
    FROM public."CommunityMember" AS membership
    INNER JOIN public."User" AS member_user
      ON member_user."id" = membership."userId"
    INNER JOIN public."Community" AS locality_community
      ON locality_community."id" = membership."communityId"
    WHERE member_user."authUserId" = (SELECT auth.uid())
      AND locality_community."isActive" = TRUE
  )
);
