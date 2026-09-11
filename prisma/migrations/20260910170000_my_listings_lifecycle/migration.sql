-- Paused listings use the existing ARCHIVED lifecycle state. They remain
-- visible to their owner for management, but are excluded from all public and
-- authenticated discovery paths that require ACTIVE posts.
DROP POLICY IF EXISTS "Users can read available unblocked or owned community posts"
ON public."Post";

CREATE POLICY "Users can read available unblocked or owned community posts"
ON public."Post"
FOR SELECT
TO authenticated
USING (
  "publishedAt" IS NOT NULL
  AND (
    (
      "status" = 'ACTIVE'::public."PostStatus"
      AND "availabilityStatus" IN (
        'AVAILABLE'::public."ListingAvailabilityStatus",
        'RESERVED'::public."ListingAvailabilityStatus"
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public."UserBlock" AS user_block
        WHERE user_block."blockerId" = (
          SELECT nestmate_private.current_nestmate_user_id()
        )
          AND user_block."blockedId" = "Post"."authorId"
      )
    )
    OR (
      "status" IN (
        'ACTIVE'::public."PostStatus",
        'ARCHIVED'::public."PostStatus"
      )
      AND EXISTS (
        SELECT 1
        FROM public."User" AS app_user
        WHERE app_user."id" = "Post"."authorId"
          AND app_user."authUserId" = (SELECT auth.uid())
      )
    )
  )
);

-- Retain the existing moderation, community, and anti-spam checks while
-- permitting an owner to move only between ACTIVE and ARCHIVED.
DROP POLICY IF EXISTS "Users can update their own community posts"
ON public."Post";

CREATE POLICY "Users can update their own community posts"
ON public."Post"
FOR UPDATE
TO authenticated
USING (
  "moderationStatus" = 'VISIBLE'::public."ContentModerationStatus"
  AND EXISTS (
    SELECT 1
    FROM public."User" AS app_user
    WHERE app_user."id" = "Post"."authorId"
      AND app_user."authUserId" = (SELECT auth.uid())
  )
  AND (SELECT nestmate_private.can_perform_safety_scoped_activity(
    "authorId", 'POST'::public."SafetyActivityScope"
  ))
)
WITH CHECK (
  "status" IN (
    'ACTIVE'::public."PostStatus",
    'ARCHIVED'::public."PostStatus"
  )
  AND "moderationStatus" = 'VISIBLE'::public."ContentModerationStatus"
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
  AND (SELECT nestmate_private.can_perform_safety_scoped_activity(
    "authorId", 'POST'::public."SafetyActivityScope"
  ))
);
