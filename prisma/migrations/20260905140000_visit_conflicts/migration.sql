CREATE INDEX "VisitRequest_ownerId_status_scheduledAt_idx"
ON public."VisitRequest"("ownerId", "status", "scheduledAt");

DROP POLICY "Interested users can request eligible listing visits"
ON public."VisitRequest";

CREATE POLICY "Interested users can request eligible listing visits"
ON public."VisitRequest"
FOR INSERT
TO authenticated
WITH CHECK (
  "requesterId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND "status" = 'PENDING'::public."VisitRequestStatus"
  AND EXISTS (
    SELECT 1
    FROM public."Post" AS listing
    WHERE listing."id" = "VisitRequest"."postId"
      AND listing."authorId" = "VisitRequest"."ownerId"
      AND listing."authorId" <> "VisitRequest"."requesterId"
      AND listing."type" IN (
        'ROOM_AVAILABLE'::public."PostType",
        'PG_AVAILABLE'::public."PostType"
      )
      AND listing."status" = 'ACTIVE'::public."PostStatus"
      AND listing."moderationStatus" = 'VISIBLE'::public."ContentModerationStatus"
      AND listing."availabilityStatus" = 'AVAILABLE'::public."ListingAvailabilityStatus"
      AND listing."publishedAt" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public."UserModerationState" AS moderation_state
        WHERE moderation_state."userId" IN (
          "VisitRequest"."requesterId",
          "VisitRequest"."ownerId"
        )
          AND moderation_state."status" = 'SUSPENDED'::public."UserModerationStatus"
      )
  )
);

CREATE OR REPLACE FUNCTION nestmate_private.validate_visit_request_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
  listing_owner_id TEXT;
BEGIN
  SELECT listing."authorId" INTO listing_owner_id
  FROM public."Post" AS listing
  WHERE listing."id" = NEW."postId"
    AND listing."type" IN (
      'ROOM_AVAILABLE'::public."PostType",
      'PG_AVAILABLE'::public."PostType"
    )
    AND listing."status" = 'ACTIVE'::public."PostStatus"
    AND listing."moderationStatus" = 'VISIBLE'::public."ContentModerationStatus"
    AND listing."availabilityStatus" = 'AVAILABLE'::public."ListingAvailabilityStatus"
    AND listing."publishedAt" IS NOT NULL;

  IF current_user_id IS NULL
    OR NEW."requesterId" <> current_user_id
    OR listing_owner_id IS NULL
    OR NEW."ownerId" <> listing_owner_id
    OR NEW."requesterId" = listing_owner_id
    OR EXISTS (
      SELECT 1
      FROM public."UserModerationState" AS moderation_state
      WHERE moderation_state."userId" IN (NEW."requesterId", NEW."ownerId")
        AND moderation_state."status" = 'SUSPENDED'::public."UserModerationStatus"
    ) THEN
    RAISE EXCEPTION 'This listing is unavailable for visit requests.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."UserBlock" AS user_block
    WHERE (
      user_block."blockerId" = NEW."requesterId"
      AND user_block."blockedId" = NEW."ownerId"
    ) OR (
      user_block."blockerId" = NEW."ownerId"
      AND user_block."blockedId" = NEW."requesterId"
    )
  ) THEN
    RAISE EXCEPTION 'This listing is unavailable for visit requests.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW."requestedAt" < CURRENT_TIMESTAMP + interval '30 minutes'
    OR NEW."requestedAt" > CURRENT_TIMESTAMP + interval '180 days' THEN
    RAISE EXCEPTION 'Choose a visit time between 30 minutes and 180 days from now.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW."ownerId", 0)
  );
  IF EXISTS (
    SELECT 1
    FROM public."VisitRequest" AS accepted_visit
    WHERE accepted_visit."ownerId" = NEW."ownerId"
      AND accepted_visit."status" = 'ACCEPTED'::public."VisitRequestStatus"
      AND accepted_visit."scheduledAt" < NEW."requestedAt" + interval '1 hour'
      AND accepted_visit."scheduledAt" + interval '1 hour' > NEW."requestedAt"
  ) THEN
    RAISE EXCEPTION 'That time is unavailable. Choose another time.'
      USING ERRCODE = '23P01';
  END IF;

  NEW."status" := 'PENDING'::public."VisitRequestStatus";
  NEW."proposedAt" := NULL;
  NEW."scheduledAt" := NULL;
  NEW."respondedAt" := NULL;
  NEW."note" := NULLIF(btrim(NEW."note"), '');
  NEW."createdAt" := CURRENT_TIMESTAMP;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.validate_visit_request_insert()
FROM PUBLIC, anon, authenticated;

CREATE FUNCTION nestmate_private.enforce_accepted_visit_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
BEGIN
  IF current_user_id IS NULL
    OR current_user_id NOT IN (NEW."requesterId", NEW."ownerId")
    OR NOT nestmate_private.can_access_visit_request(NEW."id") THEN
    RAISE EXCEPTION 'This visit is unavailable.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW."ownerId", 0)
  );
  IF EXISTS (
    SELECT 1
    FROM public."VisitRequest" AS accepted_visit
    WHERE accepted_visit."id" <> NEW."id"
      AND accepted_visit."ownerId" = NEW."ownerId"
      AND accepted_visit."status" = 'ACCEPTED'::public."VisitRequestStatus"
      AND accepted_visit."scheduledAt" < NEW."scheduledAt" + interval '1 hour'
      AND accepted_visit."scheduledAt" + interval '1 hour' > NEW."scheduledAt"
  ) THEN
    RAISE EXCEPTION 'That time is unavailable. Choose another time.'
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.enforce_accepted_visit_conflict()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "zy_enforce_accepted_visit_conflict"
BEFORE UPDATE ON public."VisitRequest"
FOR EACH ROW
WHEN (
  NEW."status"::TEXT = 'ACCEPTED'
  AND (
    OLD."status"::TEXT <> 'ACCEPTED'
    OR NEW."scheduledAt" IS DISTINCT FROM OLD."scheduledAt"
  )
)
EXECUTE FUNCTION nestmate_private.enforce_accepted_visit_conflict();
