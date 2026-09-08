CREATE TYPE public."VisitOutcomeType"
AS ENUM ('INTERESTED', 'NOT_SUITABLE', 'FINALIZED', 'NO_SHOW');

CREATE TABLE public."VisitOutcome" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "visitId" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "outcome" public."VisitOutcomeType" NOT NULL,
  "privateNote" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VisitOutcome_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VisitOutcome_privateNote_check"
    CHECK (
      "privateNote" IS NULL
      OR char_length(btrim("privateNote")) BETWEEN 1 AND 500
    ),
  CONSTRAINT "VisitOutcome_visitId_fkey"
    FOREIGN KEY ("visitId") REFERENCES public."VisitRequest"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VisitOutcome_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "VisitOutcome_visitId_userId_key"
ON public."VisitOutcome"("visitId", "userId");

CREATE INDEX "VisitOutcome_userId_outcome_updatedAt_idx"
ON public."VisitOutcome"("userId", "outcome", "updatedAt" DESC);

ALTER TABLE public."VisitOutcome" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."VisitOutcome"
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public."VisitOutcome" TO authenticated;
REVOKE ALL ON TYPE public."VisitOutcomeType" FROM PUBLIC;
GRANT USAGE ON TYPE public."VisitOutcomeType" TO authenticated;

CREATE FUNCTION nestmate_private.can_record_visit_outcome(
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
        AND visit_request."status" = 'ACCEPTED'::public."VisitRequestStatus"
        AND visit_request."scheduledAt" <= CURRENT_TIMESTAMP
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
    );
$$;

REVOKE ALL ON FUNCTION nestmate_private.can_record_visit_outcome(UUID, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.can_record_visit_outcome(UUID, TEXT)
TO authenticated;

CREATE POLICY "Users can read only their own visit outcomes"
ON public."VisitOutcome"
FOR SELECT
TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (
    SELECT nestmate_private.can_record_visit_outcome("visitId", "userId")
  )
);

CREATE POLICY "Users can create only their own completed visit outcomes"
ON public."VisitOutcome"
FOR INSERT
TO authenticated
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (
    SELECT nestmate_private.can_record_visit_outcome("visitId", "userId")
  )
);

CREATE POLICY "Users can update only their own completed visit outcomes"
ON public."VisitOutcome"
FOR UPDATE
TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (
    SELECT nestmate_private.can_record_visit_outcome("visitId", "userId")
  )
)
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (
    SELECT nestmate_private.can_record_visit_outcome("visitId", "userId")
  )
);

CREATE FUNCTION nestmate_private.validate_visit_outcome_write()
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
    OR NOT nestmate_private.can_record_visit_outcome(
      NEW."visitId",
      NEW."userId"
    ) THEN
    RAISE EXCEPTION 'An outcome can only be recorded for your own completed visit.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW."visitId" IS DISTINCT FROM OLD."visitId"
    OR NEW."userId" IS DISTINCT FROM OLD."userId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'Visit outcome identity cannot be changed.'
      USING ERRCODE = '42501';
  END IF;

  NEW."privateNote" := NULLIF(btrim(NEW."privateNote"), '');
  IF NEW."privateNote" IS NOT NULL
    AND char_length(NEW."privateNote") > 500 THEN
    RAISE EXCEPTION 'Keep the private note within 500 characters.'
      USING ERRCODE = '22023';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW."createdAt" := CURRENT_TIMESTAMP;
  END IF;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.validate_visit_outcome_write()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "validate_visit_outcome_before_write"
BEFORE INSERT OR UPDATE ON public."VisitOutcome"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.validate_visit_outcome_write();

CREATE FUNCTION nestmate_private.apply_finalized_visit_outcome()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  finalized_count INTEGER;
  target_post_id TEXT;
BEGIN
  SELECT visit_request."postId" INTO target_post_id
  FROM public."VisitRequest" AS visit_request
  WHERE visit_request."id" = NEW."visitId";

  SELECT count(DISTINCT visit_outcome."userId") INTO finalized_count
  FROM public."VisitOutcome" AS visit_outcome
  WHERE visit_outcome."visitId" = NEW."visitId"
    AND visit_outcome."outcome" = 'FINALIZED'::public."VisitOutcomeType";

  IF finalized_count >= 2 THEN
    UPDATE public."Post" AS listing
    SET
      "availabilityStatus" = 'CLOSED'::public."ListingAvailabilityStatus",
      "lastConfirmedAt" = CURRENT_TIMESTAMP,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE listing."id" = target_post_id
      AND listing."type" IN (
        'ROOM_AVAILABLE'::public."PostType",
        'PG_AVAILABLE'::public."PostType"
      )
      AND listing."status" = 'ACTIVE'::public."PostStatus"
      AND listing."availabilityStatus" <> 'CLOSED'::public."ListingAvailabilityStatus";
  ELSIF finalized_count = 1 THEN
    UPDATE public."Post" AS listing
    SET
      "availabilityStatus" = 'RESERVED'::public."ListingAvailabilityStatus",
      "lastConfirmedAt" = CURRENT_TIMESTAMP,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE listing."id" = target_post_id
      AND listing."type" IN (
        'ROOM_AVAILABLE'::public."PostType",
        'PG_AVAILABLE'::public."PostType"
      )
      AND listing."status" = 'ACTIVE'::public."PostStatus"
      AND listing."availabilityStatus" = 'AVAILABLE'::public."ListingAvailabilityStatus";
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.apply_finalized_visit_outcome()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "apply_finalized_visit_outcome_after_write"
AFTER INSERT OR UPDATE OF "outcome" ON public."VisitOutcome"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.apply_finalized_visit_outcome();
