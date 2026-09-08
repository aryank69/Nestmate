CREATE TABLE public."ListingRealityFeedback" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "visitId" UUID NOT NULL,
  "postId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "photosAccuracy" SMALLINT NOT NULL,
  "costAccuracy" SMALLINT NOT NULL,
  "amenitiesAccuracy" SMALLINT NOT NULL,
  "conditionAccuracy" SMALLINT NOT NULL,
  "locationAccuracy" SMALLINT NOT NULL,
  "descriptionAccuracy" SMALLINT NOT NULL,
  "privateNote" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ListingRealityFeedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ListingRealityFeedback_ratings_check" CHECK (
    "photosAccuracy" BETWEEN 1 AND 5
    AND "costAccuracy" BETWEEN 1 AND 5
    AND "amenitiesAccuracy" BETWEEN 1 AND 5
    AND "conditionAccuracy" BETWEEN 1 AND 5
    AND "locationAccuracy" BETWEEN 1 AND 5
    AND "descriptionAccuracy" BETWEEN 1 AND 5
  ),
  CONSTRAINT "ListingRealityFeedback_privateNote_check" CHECK (
    "privateNote" IS NULL
    OR char_length(btrim("privateNote")) BETWEEN 1 AND 1000
  ),
  CONSTRAINT "ListingRealityFeedback_visitId_fkey"
    FOREIGN KEY ("visitId") REFERENCES public."VisitRequest"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ListingRealityFeedback_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES public."Post"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ListingRealityFeedback_reviewerId_fkey"
    FOREIGN KEY ("reviewerId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ListingRealityFeedback_visitId_key"
ON public."ListingRealityFeedback"("visitId");
CREATE INDEX "ListingRealityFeedback_postId_createdAt_idx"
ON public."ListingRealityFeedback"("postId", "createdAt" DESC);
CREATE INDEX "ListingRealityFeedback_reviewerId_updatedAt_idx"
ON public."ListingRealityFeedback"("reviewerId", "updatedAt" DESC);

ALTER TABLE public."ListingRealityFeedback" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."ListingRealityFeedback"
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public."ListingRealityFeedback" TO authenticated;

CREATE FUNCTION nestmate_private.can_access_own_listing_reality_feedback(
  target_visit_id UUID,
  target_reviewer_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    target_reviewer_id = nestmate_private.current_nestmate_user_id()
    AND EXISTS (
      SELECT 1
      FROM public."VisitRequest" AS visit_request
      JOIN public."Post" AS listing
        ON listing."id" = visit_request."postId"
      WHERE visit_request."id" = target_visit_id
        AND visit_request."requesterId" = target_reviewer_id
        AND visit_request."ownerId" <> target_reviewer_id
        AND listing."authorId" = visit_request."ownerId"
        AND listing."type"::TEXT IN ('ROOM_AVAILABLE', 'PG_AVAILABLE')
        AND NOT EXISTS (
          SELECT 1
          FROM public."UserBlock" AS user_block
          WHERE (
            user_block."blockerId" = visit_request."requesterId"
            AND user_block."blockedId" = visit_request."ownerId"
          ) OR (
            user_block."blockerId" = visit_request."ownerId"
            AND user_block."blockedId" = visit_request."requesterId"
          )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public."UserModerationState" AS moderation_state
          WHERE moderation_state."userId" IN (
            visit_request."requesterId",
            visit_request."ownerId"
          )
            AND moderation_state."status"::TEXT = 'SUSPENDED'
        )
    );
$$;

REVOKE ALL ON FUNCTION nestmate_private.can_access_own_listing_reality_feedback(UUID, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.can_access_own_listing_reality_feedback(UUID, TEXT)
TO authenticated;

CREATE FUNCTION nestmate_private.can_submit_listing_reality_feedback(
  target_visit_id UUID,
  target_reviewer_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    nestmate_private.can_access_own_listing_reality_feedback(
      target_visit_id,
      target_reviewer_id
    )
    AND EXISTS (
      SELECT 1
      FROM public."VisitRequest" AS visit_request
      WHERE visit_request."id" = target_visit_id
        AND visit_request."requesterId" = target_reviewer_id
        AND visit_request."status"::TEXT = 'ACCEPTED'
        AND visit_request."scheduledAt" + interval '1 hour' <= CURRENT_TIMESTAMP
        AND EXISTS (
          SELECT 1
          FROM public."VisitAttendance" AS requester_attendance
          WHERE requester_attendance."visitId" = target_visit_id
            AND requester_attendance."userId" = visit_request."requesterId"
            AND requester_attendance."confirmation"::TEXT = 'HAPPENED'
        )
        AND EXISTS (
          SELECT 1
          FROM public."VisitAttendance" AS owner_attendance
          WHERE owner_attendance."visitId" = target_visit_id
            AND owner_attendance."userId" = visit_request."ownerId"
            AND owner_attendance."confirmation"::TEXT = 'HAPPENED'
        )
    );
$$;

REVOKE ALL ON FUNCTION nestmate_private.can_submit_listing_reality_feedback(UUID, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.can_submit_listing_reality_feedback(UUID, TEXT)
TO authenticated;

CREATE POLICY "Reviewers can read only their own listing reality feedback"
ON public."ListingRealityFeedback"
FOR SELECT
TO authenticated
USING (
  "reviewerId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_own_listing_reality_feedback("visitId", "reviewerId"))
);

CREATE POLICY "Verified visitors can create listing reality feedback"
ON public."ListingRealityFeedback"
FOR INSERT
TO authenticated
WITH CHECK (
  "reviewerId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_submit_listing_reality_feedback("visitId", "reviewerId"))
);

CREATE POLICY "Verified visitors can update their listing reality feedback"
ON public."ListingRealityFeedback"
FOR UPDATE
TO authenticated
USING (
  "reviewerId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_own_listing_reality_feedback("visitId", "reviewerId"))
)
WITH CHECK (
  "reviewerId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_submit_listing_reality_feedback("visitId", "reviewerId"))
);

CREATE FUNCTION nestmate_private.validate_listing_reality_feedback_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
  expected_post_id TEXT;
  expected_reviewer_id TEXT;
  listing_owner_id TEXT;
BEGIN
  SELECT
    visit_request."postId",
    visit_request."requesterId",
    visit_request."ownerId"
  INTO expected_post_id, expected_reviewer_id, listing_owner_id
  FROM public."VisitRequest" AS visit_request
  WHERE visit_request."id" = NEW."visitId";

  IF current_user_id IS NULL
    OR NEW."reviewerId" <> current_user_id
    OR NEW."reviewerId" <> expected_reviewer_id
    OR NEW."reviewerId" = listing_owner_id
    OR NEW."postId" <> expected_post_id
    OR NOT nestmate_private.can_submit_listing_reality_feedback(
      NEW."visitId",
      NEW."reviewerId"
    ) THEN
    RAISE EXCEPTION 'Reality ratings are available only to verified listing visitors.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW."visitId" IS DISTINCT FROM OLD."visitId"
    OR NEW."postId" IS DISTINCT FROM OLD."postId"
    OR NEW."reviewerId" IS DISTINCT FROM OLD."reviewerId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'Listing reality feedback identity cannot be changed.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW."photosAccuracy" NOT BETWEEN 1 AND 5
    OR NEW."costAccuracy" NOT BETWEEN 1 AND 5
    OR NEW."amenitiesAccuracy" NOT BETWEEN 1 AND 5
    OR NEW."conditionAccuracy" NOT BETWEEN 1 AND 5
    OR NEW."locationAccuracy" NOT BETWEEN 1 AND 5
    OR NEW."descriptionAccuracy" NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Reality ratings must be between 1 and 5.'
      USING ERRCODE = '22023';
  END IF;

  NEW."privateNote" := NULLIF(btrim(NEW."privateNote"), '');
  IF NEW."privateNote" IS NOT NULL
    AND char_length(NEW."privateNote") > 1000 THEN
    RAISE EXCEPTION 'Keep private reality notes within 1000 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW."createdAt" := CURRENT_TIMESTAMP;
  END IF;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.validate_listing_reality_feedback_write()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "validate_listing_reality_feedback_before_write"
BEFORE INSERT OR UPDATE ON public."ListingRealityFeedback"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.validate_listing_reality_feedback_write();

-- This k-anonymous server-only view contains no reviewer identity, visit ID, or note.
-- Client roles cannot query the private schema or this aggregate directly.
CREATE VIEW nestmate_private.listing_reality_aggregate
WITH (security_barrier = true)
AS
SELECT
  feedback."postId" AS "postId",
  count(DISTINCT feedback."visitId")::INTEGER AS "responseCount",
  round(avg(feedback."photosAccuracy")::NUMERIC, 2) AS "photosAccuracy",
  round(avg(feedback."costAccuracy")::NUMERIC, 2) AS "costAccuracy",
  round(avg(feedback."amenitiesAccuracy")::NUMERIC, 2) AS "amenitiesAccuracy",
  round(avg(feedback."conditionAccuracy")::NUMERIC, 2) AS "conditionAccuracy",
  round(avg(feedback."locationAccuracy")::NUMERIC, 2) AS "locationAccuracy",
  round(avg(feedback."descriptionAccuracy")::NUMERIC, 2) AS "descriptionAccuracy"
FROM public."ListingRealityFeedback" AS feedback
JOIN public."VisitRequest" AS visit_request
  ON visit_request."id" = feedback."visitId"
WHERE feedback."reviewerId" = visit_request."requesterId"
  AND feedback."reviewerId" <> visit_request."ownerId"
  AND visit_request."postId" = feedback."postId"
  AND visit_request."status"::TEXT = 'ACCEPTED'
  AND EXISTS (
    SELECT 1
    FROM public."VisitAttendance" AS requester_attendance
    WHERE requester_attendance."visitId" = feedback."visitId"
      AND requester_attendance."userId" = visit_request."requesterId"
      AND requester_attendance."confirmation"::TEXT = 'HAPPENED'
  )
  AND EXISTS (
    SELECT 1
    FROM public."VisitAttendance" AS owner_attendance
    WHERE owner_attendance."visitId" = feedback."visitId"
      AND owner_attendance."userId" = visit_request."ownerId"
      AND owner_attendance."confirmation"::TEXT = 'HAPPENED'
  )
GROUP BY feedback."postId"
HAVING count(DISTINCT feedback."visitId") >= 3;

REVOKE ALL PRIVILEGES ON nestmate_private.listing_reality_aggregate
FROM PUBLIC, anon, authenticated;
