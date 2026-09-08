CREATE OR REPLACE FUNCTION nestmate_private.validate_visit_request_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
BEGIN
  IF NEW."postId" IS DISTINCT FROM OLD."postId"
    OR NEW."requesterId" IS DISTINCT FROM OLD."requesterId"
    OR NEW."ownerId" IS DISTINCT FROM OLD."ownerId"
    OR NEW."requestedAt" IS DISTINCT FROM OLD."requestedAt"
    OR NEW."note" IS DISTINCT FROM OLD."note"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Visit request identity and original details cannot be changed.'
      USING ERRCODE = '42501';
  END IF;

  IF current_user_id = OLD."ownerId"
    AND OLD."status" IN ('PENDING'::public."VisitRequestStatus", 'PROPOSED'::public."VisitRequestStatus") THEN
    IF NEW."status" = 'ACCEPTED'::public."VisitRequestStatus" THEN
      NEW."scheduledAt" := COALESCE(OLD."proposedAt", OLD."requestedAt");
      NEW."proposedAt" := OLD."proposedAt";
    ELSIF NEW."status" = 'DECLINED'::public."VisitRequestStatus" THEN
      NEW."scheduledAt" := NULL;
      NEW."proposedAt" := OLD."proposedAt";
    ELSIF NEW."status" = 'PROPOSED'::public."VisitRequestStatus" THEN
      IF NEW."proposedAt" IS NULL
        OR NEW."proposedAt" < CURRENT_TIMESTAMP + interval '30 minutes'
        OR NEW."proposedAt" > CURRENT_TIMESTAMP + interval '180 days' THEN
        RAISE EXCEPTION 'Choose a proposed time between 30 minutes and 180 days from now.'
          USING ERRCODE = '22023';
      END IF;
      NEW."scheduledAt" := NULL;
    ELSE
      RAISE EXCEPTION 'The owner cannot make that visit status change.' USING ERRCODE = '42501';
    END IF;
  ELSIF current_user_id = OLD."requesterId"
    AND OLD."status" = 'PROPOSED'::public."VisitRequestStatus" THEN
    IF NEW."status" = 'ACCEPTED'::public."VisitRequestStatus" THEN
      NEW."scheduledAt" := OLD."proposedAt";
      NEW."proposedAt" := OLD."proposedAt";
    ELSIF NEW."status" = 'DECLINED'::public."VisitRequestStatus" THEN
      NEW."scheduledAt" := NULL;
      NEW."proposedAt" := OLD."proposedAt";
    ELSIF NEW."status" = 'PROPOSED'::public."VisitRequestStatus" THEN
      IF NEW."proposedAt" IS NULL
        OR NEW."proposedAt" IS NOT DISTINCT FROM OLD."proposedAt"
        OR NEW."proposedAt" < CURRENT_TIMESTAMP + interval '30 minutes'
        OR NEW."proposedAt" > CURRENT_TIMESTAMP + interval '180 days' THEN
        RAISE EXCEPTION 'Choose a different available time within the next 180 days.'
          USING ERRCODE = '22023';
      END IF;
      NEW."scheduledAt" := NULL;
    ELSE
      RAISE EXCEPTION 'The requester cannot make that visit status change.' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'You cannot respond to this visit request.' USING ERRCODE = '42501';
  END IF;

  IF NEW."status" = 'PROPOSED'::public."VisitRequestStatus"
    AND NEW."proposedAt" IS DISTINCT FROM OLD."proposedAt" THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW."ownerId", 0));
    IF NOT nestmate_private.visit_time_is_available(NEW."ownerId", NEW."proposedAt", NEW."id") THEN
      RAISE EXCEPTION 'That visit time is unavailable.' USING ERRCODE = '23P01';
    END IF;
  END IF;

  NEW."respondedAt" := CURRENT_TIMESTAMP;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.validate_visit_request_update()
FROM PUBLIC, anon, authenticated;
