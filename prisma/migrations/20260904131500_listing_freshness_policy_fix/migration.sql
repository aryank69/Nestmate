-- Trust and safety split the original Post SELECT policy by role. Replace all
-- legacy variants so availability and existing block rules compose correctly.
DROP POLICY IF EXISTS "Anyone can read active community posts" ON public."Post";
DROP POLICY IF EXISTS "Visitors can read active community posts" ON public."Post";
DROP POLICY IF EXISTS "Users can read unblocked active community posts" ON public."Post";

CREATE POLICY "Visitors can read available community posts"
ON public."Post"
FOR SELECT
TO anon
USING (
  "status" = 'ACTIVE'::public."PostStatus"
  AND "publishedAt" IS NOT NULL
  AND "availabilityStatus" IN (
    'AVAILABLE'::public."ListingAvailabilityStatus",
    'RESERVED'::public."ListingAvailabilityStatus"
  )
);

CREATE POLICY "Users can read available unblocked or owned community posts"
ON public."Post"
FOR SELECT
TO authenticated
USING (
  "status" = 'ACTIVE'::public."PostStatus"
  AND "publishedAt" IS NOT NULL
  AND (
    (
      "availabilityStatus" IN (
        'AVAILABLE'::public."ListingAvailabilityStatus",
        'RESERVED'::public."ListingAvailabilityStatus"
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public."UserBlock" AS user_block
        WHERE user_block."blockerId" = (SELECT nestmate_private.current_nestmate_user_id())
          AND user_block."blockedId" = "Post"."authorId"
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public."User" AS app_user
      WHERE app_user."id" = "Post"."authorId"
        AND app_user."authUserId" = (SELECT auth.uid())
    )
  )
);
