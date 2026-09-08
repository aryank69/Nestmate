CREATE TYPE public."InterestTargetType" AS ENUM ('LISTING', 'FLATMATE');
CREATE TYPE public."InterestStage" AS ENUM (
  'INTERESTED',
  'CONTACTED',
  'VISIT_PLANNED',
  'SHORTLISTED',
  'FINALIZED',
  'NOT_INTERESTED'
);

CREATE TABLE public."InterestActivity" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" TEXT NOT NULL,
  "targetType" public."InterestTargetType" NOT NULL,
  "postId" TEXT,
  "targetUserId" TEXT,
  "stage" public."InterestStage" NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InterestActivity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InterestActivity_target_check" CHECK (
    (
      "targetType" = 'LISTING'::public."InterestTargetType"
      AND "postId" IS NOT NULL
      AND "targetUserId" IS NULL
    ) OR (
      "targetType" = 'FLATMATE'::public."InterestTargetType"
      AND "postId" IS NULL
      AND "targetUserId" IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX "InterestActivity_userId_postId_key"
ON public."InterestActivity"("userId", "postId");
CREATE UNIQUE INDEX "InterestActivity_userId_targetUserId_key"
ON public."InterestActivity"("userId", "targetUserId");
CREATE INDEX "InterestActivity_userId_targetType_stage_updatedAt_idx"
ON public."InterestActivity"("userId", "targetType", "stage", "updatedAt" DESC);
CREATE INDEX "InterestActivity_postId_idx"
ON public."InterestActivity"("postId");
CREATE INDEX "InterestActivity_targetUserId_idx"
ON public."InterestActivity"("targetUserId");

ALTER TABLE public."InterestActivity"
ADD CONSTRAINT "InterestActivity_userId_fkey"
FOREIGN KEY ("userId") REFERENCES public."User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."InterestActivity"
ADD CONSTRAINT "InterestActivity_postId_fkey"
FOREIGN KEY ("postId") REFERENCES public."Post"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."InterestActivity"
ADD CONSTRAINT "InterestActivity_targetUserId_fkey"
FOREIGN KEY ("targetUserId") REFERENCES public."User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION nestmate_private.can_track_interest_target(
  target_type public."InterestTargetType",
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
  IF current_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF target_type = 'LISTING'::public."InterestTargetType"
    AND target_post_id IS NOT NULL
    AND target_user_id IS NULL THEN
    SELECT tracked_post."authorId" INTO target_owner_id
    FROM public."Post" AS tracked_post
    WHERE tracked_post."id" = target_post_id
      AND tracked_post."type" IN (
        'ROOM_AVAILABLE'::public."PostType",
        'PG_AVAILABLE'::public."PostType"
      )
      AND tracked_post."status" = 'ACTIVE'::public."PostStatus"
      AND tracked_post."moderationStatus" = 'VISIBLE'::public."ContentModerationStatus"
      AND tracked_post."availabilityStatus" IN (
        'AVAILABLE'::public."ListingAvailabilityStatus",
        'RESERVED'::public."ListingAvailabilityStatus"
      )
      AND tracked_post."publishedAt" IS NOT NULL
      AND tracked_post."authorId" <> current_user_id;
  ELSIF target_type = 'FLATMATE'::public."InterestTargetType"
    AND target_post_id IS NULL
    AND target_user_id IS NOT NULL THEN
    SELECT tracked_user."id" INTO target_owner_id
    FROM public."User" AS tracked_user
    WHERE tracked_user."id" = target_user_id
      AND tracked_user."id" <> current_user_id
      AND EXISTS (
        SELECT 1
        FROM public."UserPreferences" AS tracked_preferences
        WHERE tracked_preferences."userId" = tracked_user."id"
      );
  ELSE
    RETURN FALSE;
  END IF;

  IF target_owner_id IS NULL
    OR NOT nestmate_private.is_user_content_visible(target_owner_id) THEN
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

REVOKE ALL ON FUNCTION nestmate_private.can_track_interest_target(
  public."InterestTargetType", TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.can_track_interest_target(
  public."InterestTargetType", TEXT, TEXT
) TO authenticated;

ALTER TABLE public."InterestActivity" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."InterestActivity"
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."InterestActivity"
TO authenticated;

CREATE POLICY "Users can read their own visible activity"
ON public."InterestActivity"
FOR SELECT
TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_track_interest_target(
    "targetType", "postId", "targetUserId"
  ))
);

CREATE POLICY "Users can create their own visible activity"
ON public."InterestActivity"
FOR INSERT
TO authenticated
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_track_interest_target(
    "targetType", "postId", "targetUserId"
  ))
);

CREATE POLICY "Users can update their own visible activity"
ON public."InterestActivity"
FOR UPDATE
TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_track_interest_target(
    "targetType", "postId", "targetUserId"
  ))
)
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_track_interest_target(
    "targetType", "postId", "targetUserId"
  ))
);

CREATE POLICY "Users can delete their own activity"
ON public."InterestActivity"
FOR DELETE
TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
);
