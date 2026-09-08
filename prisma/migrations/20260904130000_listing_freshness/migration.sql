CREATE TYPE public."ListingAvailabilityStatus"
AS ENUM ('AVAILABLE', 'RESERVED', 'CLOSED');

ALTER TABLE public."Post"
ADD COLUMN "availabilityStatus" public."ListingAvailabilityStatus"
  NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN "lastConfirmedAt" TIMESTAMPTZ(3);

UPDATE public."Post"
SET "lastConfirmedAt" = COALESCE("updatedAt", "publishedAt", "createdAt", CURRENT_TIMESTAMP)
WHERE "lastConfirmedAt" IS NULL;

ALTER TABLE public."Post"
ALTER COLUMN "lastConfirmedAt" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "lastConfirmedAt" SET NOT NULL;

CREATE INDEX "Post_communityId_status_availabilityStatus_lastConfirmedAt_idx"
ON public."Post"(
  "communityId",
  "status",
  "availabilityStatus",
  "lastConfirmedAt" DESC
);

REVOKE ALL ON TYPE public."ListingAvailabilityStatus" FROM PUBLIC;
GRANT USAGE ON TYPE public."ListingAvailabilityStatus" TO anon, authenticated;

-- Closed listings disappear from public discovery, while owners retain SELECT
-- access so they can reopen their own listing through an authenticated update.
DROP POLICY IF EXISTS "Anyone can read active community posts" ON public."Post";
CREATE POLICY "Anyone can read active community posts"
ON public."Post"
FOR SELECT
TO anon, authenticated
USING (
  "status" = 'ACTIVE'::public."PostStatus"
  AND "publishedAt" IS NOT NULL
  AND (
    "availabilityStatus" IN (
      'AVAILABLE'::public."ListingAvailabilityStatus",
      'RESERVED'::public."ListingAvailabilityStatus"
    )
    OR EXISTS (
      SELECT 1
      FROM public."User" AS app_user
      WHERE app_user."id" = "Post"."authorId"
        AND app_user."authUserId" = (SELECT auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "Users can create their own community posts" ON public."Post";
CREATE POLICY "Users can create their own community posts"
ON public."Post"
FOR INSERT
TO authenticated
WITH CHECK (
  "status" = 'ACTIVE'::public."PostStatus"
  AND "availabilityStatus" = 'AVAILABLE'::public."ListingAvailabilityStatus"
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

DROP POLICY IF EXISTS "Users can save posts for themselves" ON public."SavedPost";
CREATE POLICY "Users can save posts for themselves"
ON public."SavedPost"
FOR INSERT
TO authenticated
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND EXISTS (
    SELECT 1
    FROM public."Post" AS saved_post
    WHERE saved_post."id" = "SavedPost"."postId"
      AND saved_post."status" = 'ACTIVE'::public."PostStatus"
      AND saved_post."availabilityStatus" IN (
        'AVAILABLE'::public."ListingAvailabilityStatus",
        'RESERVED'::public."ListingAvailabilityStatus"
      )
      AND saved_post."publishedAt" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public."UserBlock" AS user_block
        WHERE user_block."blockerId" = (SELECT nestmate_private.current_nestmate_user_id())
          AND user_block."blockedId" = saved_post."authorId"
      )
  )
);

CREATE OR REPLACE FUNCTION nestmate_private.can_access_recent_view(
  target_post_id TEXT,
  target_user_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
  target_owner_id TEXT;
BEGIN
  IF current_user_id IS NULL
    OR num_nonnulls(target_post_id, target_user_id) <> 1 THEN
    RETURN FALSE;
  END IF;

  IF target_post_id IS NOT NULL THEN
    SELECT viewed_post."authorId" INTO target_owner_id
    FROM public."Post" AS viewed_post
    WHERE viewed_post."id" = target_post_id
      AND viewed_post."status" = 'ACTIVE'::public."PostStatus"
      AND viewed_post."availabilityStatus" IN (
        'AVAILABLE'::public."ListingAvailabilityStatus",
        'RESERVED'::public."ListingAvailabilityStatus"
      )
      AND viewed_post."publishedAt" IS NOT NULL;
  ELSE
    SELECT viewed_user."id" INTO target_owner_id
    FROM public."User" AS viewed_user
    WHERE viewed_user."id" = target_user_id
      AND viewed_user."id" <> current_user_id
      AND EXISTS (
        SELECT 1
        FROM public."UserPreferences" AS viewed_preferences
        WHERE viewed_preferences."userId" = viewed_user."id"
      );
  END IF;

  IF target_owner_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM public."UserBlock" AS user_block
    WHERE (
      user_block."blockerId" = current_user_id
      AND user_block."blockedId" = target_owner_id
    ) OR (
      user_block."blockerId" = target_owner_id
      AND user_block."blockedId" = current_user_id
    )
  );
END;
$$;
