CREATE TABLE public."VisitFeedback" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "visitId" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "propertyAccuracy" SMALLINT NOT NULL,
  "cleanliness" SMALLINT NOT NULL,
  "communicationQuality" SMALLINT NOT NULL,
  "safetyComfort" SMALLINT NOT NULL,
  "overallExperience" SMALLINT NOT NULL,
  "privateNote" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VisitFeedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VisitFeedback_ratings_check" CHECK (
    "propertyAccuracy" BETWEEN 1 AND 5
    AND "cleanliness" BETWEEN 1 AND 5
    AND "communicationQuality" BETWEEN 1 AND 5
    AND "safetyComfort" BETWEEN 1 AND 5
    AND "overallExperience" BETWEEN 1 AND 5
  ),
  CONSTRAINT "VisitFeedback_privateNote_check" CHECK (
    "privateNote" IS NULL
    OR char_length(btrim("privateNote")) BETWEEN 1 AND 1000
  ),
  CONSTRAINT "VisitFeedback_visitId_fkey"
    FOREIGN KEY ("visitId") REFERENCES public."VisitRequest"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VisitFeedback_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "VisitFeedback_visitId_userId_key"
ON public."VisitFeedback"("visitId", "userId");
CREATE INDEX "VisitFeedback_userId_updatedAt_idx"
ON public."VisitFeedback"("userId", "updatedAt" DESC);

ALTER TABLE public."VisitFeedback" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."VisitFeedback"
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public."VisitFeedback" TO authenticated;

CREATE FUNCTION nestmate_private.can_access_own_visit_feedback(
  target_visit_id UUID,
  target_user_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    target_user_id = nestmate_private.current_nestmate_user_id()
    AND EXISTS (
      SELECT 1
      FROM public."VisitRequest" AS visit_request
      WHERE visit_request."id" = target_visit_id
        AND target_user_id IN (
          visit_request."requesterId",
          visit_request."ownerId"
        )
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

REVOKE ALL ON FUNCTION nestmate_private.can_access_own_visit_feedback(UUID, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.can_access_own_visit_feedback(UUID, TEXT)
TO authenticated;

CREATE FUNCTION nestmate_private.can_submit_visit_feedback(
  target_visit_id UUID,
  target_user_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    nestmate_private.can_access_own_visit_feedback(
      target_visit_id,
      target_user_id
    )
    AND EXISTS (
      SELECT 1
      FROM public."VisitRequest" AS visit_request
      WHERE visit_request."id" = target_visit_id
        AND visit_request."status"::TEXT = 'ACCEPTED'
        AND visit_request."scheduledAt" + interval '1 hour' <= CURRENT_TIMESTAMP
        AND (
          EXISTS (
            SELECT 1
            FROM public."VisitAttendance" AS attendance
            WHERE attendance."visitId" = target_visit_id
              AND attendance."userId" = target_user_id
              AND attendance."confirmation"::TEXT = 'HAPPENED'
          )
          OR EXISTS (
            SELECT 1
            FROM public."VisitOutcome" AS outcome
            WHERE outcome."visitId" = target_visit_id
              AND outcome."userId" = target_user_id
              AND outcome."outcome"::TEXT IN (
                'INTERESTED',
                'NOT_SUITABLE',
                'FINALIZED'
              )
          )
        )
    );
$$;

REVOKE ALL ON FUNCTION nestmate_private.can_submit_visit_feedback(UUID, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.can_submit_visit_feedback(UUID, TEXT)
TO authenticated;

CREATE POLICY "Users can read only their own visit feedback"
ON public."VisitFeedback"
FOR SELECT
TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_own_visit_feedback("visitId", "userId"))
);

CREATE POLICY "Users can create only their own completed visit feedback"
ON public."VisitFeedback"
FOR INSERT
TO authenticated
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_submit_visit_feedback("visitId", "userId"))
);

CREATE POLICY "Users can update only their own completed visit feedback"
ON public."VisitFeedback"
FOR UPDATE
TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_own_visit_feedback("visitId", "userId"))
)
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_submit_visit_feedback("visitId", "userId"))
);

CREATE FUNCTION nestmate_private.validate_visit_feedback_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
BEGIN
  IF current_user_id IS NULL
    OR NEW."userId" <> current_user_id
    OR NOT nestmate_private.can_submit_visit_feedback(
      NEW."visitId",
      NEW."userId"
    ) THEN
    RAISE EXCEPTION 'Feedback is available only for your own completed visit.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW."visitId" IS DISTINCT FROM OLD."visitId"
    OR NEW."userId" IS DISTINCT FROM OLD."userId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'Visit feedback identity cannot be changed.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW."propertyAccuracy" NOT BETWEEN 1 AND 5
    OR NEW."cleanliness" NOT BETWEEN 1 AND 5
    OR NEW."communicationQuality" NOT BETWEEN 1 AND 5
    OR NEW."safetyComfort" NOT BETWEEN 1 AND 5
    OR NEW."overallExperience" NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Feedback ratings must be between 1 and 5.'
      USING ERRCODE = '22023';
  END IF;

  NEW."privateNote" := NULLIF(btrim(NEW."privateNote"), '');
  IF NEW."privateNote" IS NOT NULL
    AND char_length(NEW."privateNote") > 1000 THEN
    RAISE EXCEPTION 'Keep private feedback notes within 1000 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW."createdAt" := CURRENT_TIMESTAMP;
  END IF;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.validate_visit_feedback_write()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "validate_visit_feedback_before_write"
BEFORE INSERT OR UPDATE ON public."VisitFeedback"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.validate_visit_feedback_write();

-- Future recommendation/trust consumers can use only this k-anonymous aggregate.
-- The private schema is not exposed through the Data API, and no client role can
-- query this view. Raw rows and notes never appear in its output.
CREATE VIEW nestmate_private.visit_feedback_listing_aggregate
WITH (security_barrier = true)
AS
SELECT
  visit_request."postId" AS "postId",
  count(*)::INTEGER AS "responseCount",
  round(avg(feedback."propertyAccuracy")::NUMERIC, 2) AS "propertyAccuracy",
  round(avg(feedback."cleanliness")::NUMERIC, 2) AS "cleanliness",
  round(avg(feedback."communicationQuality")::NUMERIC, 2) AS "communicationQuality",
  round(avg(feedback."safetyComfort")::NUMERIC, 2) AS "safetyComfort",
  round(avg(feedback."overallExperience")::NUMERIC, 2) AS "overallExperience"
FROM public."VisitFeedback" AS feedback
JOIN public."VisitRequest" AS visit_request
  ON visit_request."id" = feedback."visitId"
GROUP BY visit_request."postId"
HAVING count(*) >= 3;

REVOKE ALL PRIVILEGES ON nestmate_private.visit_feedback_listing_aggregate
FROM PUBLIC, anon, authenticated;
