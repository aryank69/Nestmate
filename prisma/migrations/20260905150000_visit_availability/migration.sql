CREATE TABLE public."VisitAvailabilityRule" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ownerId" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "weekday" INTEGER NOT NULL CHECK ("weekday" BETWEEN 0 AND 6),
  "startMinute" INTEGER NOT NULL CHECK ("startMinute" BETWEEN 0 AND 1380),
  "endMinute" INTEGER NOT NULL CHECK ("endMinute" BETWEEN 60 AND 1440),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VisitAvailabilityRule_window_check" CHECK ("endMinute" - "startMinute" >= 60)
);
CREATE UNIQUE INDEX "VisitAvailabilityRule_ownerId_weekday_key"
ON public."VisitAvailabilityRule"("ownerId", "weekday");
CREATE INDEX "VisitAvailabilityRule_ownerId_weekday_idx"
ON public."VisitAvailabilityRule"("ownerId", "weekday");

CREATE TABLE public."VisitAvailabilityBlock" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ownerId" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "startsAt" TIMESTAMPTZ(3) NOT NULL,
  "endsAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VisitAvailabilityBlock_range_check" CHECK (
    "endsAt" > "startsAt" AND "endsAt" <= "startsAt" + interval '7 days'
  )
);
CREATE INDEX "VisitAvailabilityBlock_ownerId_startsAt_endsAt_idx"
ON public."VisitAvailabilityBlock"("ownerId", "startsAt", "endsAt");

ALTER TABLE public."VisitAvailabilityRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VisitAvailabilityBlock" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."VisitAvailabilityRule" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public."VisitAvailabilityBlock" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."VisitAvailabilityRule" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."VisitAvailabilityBlock" TO authenticated;

CREATE POLICY "Owners can read their visit availability"
ON public."VisitAvailabilityRule" FOR SELECT TO authenticated
USING ("ownerId" = (SELECT nestmate_private.current_nestmate_user_id()));
CREATE POLICY "Listing owners can add their visit availability"
ON public."VisitAvailabilityRule" FOR INSERT TO authenticated
WITH CHECK (
  "ownerId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND EXISTS (
    SELECT 1 FROM public."Post" AS listing
    WHERE listing."authorId" = "VisitAvailabilityRule"."ownerId"
      AND listing."type" IN ('ROOM_AVAILABLE'::public."PostType", 'PG_AVAILABLE'::public."PostType")
  )
);
CREATE POLICY "Owners can update their visit availability"
ON public."VisitAvailabilityRule" FOR UPDATE TO authenticated
USING ("ownerId" = (SELECT nestmate_private.current_nestmate_user_id()))
WITH CHECK ("ownerId" = (SELECT nestmate_private.current_nestmate_user_id()));
CREATE POLICY "Owners can delete their visit availability"
ON public."VisitAvailabilityRule" FOR DELETE TO authenticated
USING ("ownerId" = (SELECT nestmate_private.current_nestmate_user_id()));

CREATE POLICY "Owners can read their blocked visit times"
ON public."VisitAvailabilityBlock" FOR SELECT TO authenticated
USING ("ownerId" = (SELECT nestmate_private.current_nestmate_user_id()));
CREATE POLICY "Listing owners can block visit times"
ON public."VisitAvailabilityBlock" FOR INSERT TO authenticated
WITH CHECK (
  "ownerId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND EXISTS (
    SELECT 1 FROM public."Post" AS listing
    WHERE listing."authorId" = "VisitAvailabilityBlock"."ownerId"
      AND listing."type" IN ('ROOM_AVAILABLE'::public."PostType", 'PG_AVAILABLE'::public."PostType")
  )
);
CREATE POLICY "Owners can update their blocked visit times"
ON public."VisitAvailabilityBlock" FOR UPDATE TO authenticated
USING ("ownerId" = (SELECT nestmate_private.current_nestmate_user_id()))
WITH CHECK ("ownerId" = (SELECT nestmate_private.current_nestmate_user_id()));
CREATE POLICY "Owners can delete their blocked visit times"
ON public."VisitAvailabilityBlock" FOR DELETE TO authenticated
USING ("ownerId" = (SELECT nestmate_private.current_nestmate_user_id()));

CREATE FUNCTION public.replace_visit_availability(schedule_rules JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller TEXT := nestmate_private.current_nestmate_user_id();
BEGIN
  IF caller IS NULL
    OR jsonb_typeof(schedule_rules) <> 'array'
    OR jsonb_array_length(schedule_rules) > 7
    OR NOT EXISTS (
      SELECT 1 FROM public."Post" AS listing
      WHERE listing."authorId" = caller
        AND listing."type" IN ('ROOM_AVAILABLE'::public."PostType", 'PG_AVAILABLE'::public."PostType")
    ) THEN
    RAISE EXCEPTION 'Visit availability cannot be changed.' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(schedule_rules) AS rule(weekday INTEGER, "startMinute" INTEGER, "endMinute" INTEGER)
    WHERE rule.weekday NOT BETWEEN 0 AND 6
      OR rule."startMinute" NOT BETWEEN 0 AND 1380
      OR rule."endMinute" NOT BETWEEN 60 AND 1440
      OR rule."endMinute" - rule."startMinute" < 60
  ) OR (
    SELECT count(*) FROM jsonb_to_recordset(schedule_rules)
      AS rule(weekday INTEGER, "startMinute" INTEGER, "endMinute" INTEGER)
  ) <> (
    SELECT count(DISTINCT rule.weekday) FROM jsonb_to_recordset(schedule_rules)
      AS rule(weekday INTEGER, "startMinute" INTEGER, "endMinute" INTEGER)
  ) THEN
    RAISE EXCEPTION 'Each day needs one valid availability window.' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public."VisitAvailabilityRule" WHERE "ownerId" = caller;
  INSERT INTO public."VisitAvailabilityRule" (
    "ownerId", "weekday", "startMinute", "endMinute", "updatedAt"
  )
  SELECT caller, rule.weekday, rule."startMinute", rule."endMinute", CURRENT_TIMESTAMP
  FROM jsonb_to_recordset(schedule_rules)
    AS rule(weekday INTEGER, "startMinute" INTEGER, "endMinute" INTEGER);
END;
$$;
REVOKE ALL ON FUNCTION public.replace_visit_availability(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_visit_availability(JSONB) TO authenticated;

CREATE FUNCTION nestmate_private.validate_visit_availability_block()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller TEXT := nestmate_private.current_nestmate_user_id();
BEGIN
  IF caller IS NULL OR caller <> NEW."ownerId" THEN
    RAISE EXCEPTION 'This blocked time cannot be changed.' USING ERRCODE = '42501';
  END IF;
  IF NEW."startsAt" < CURRENT_TIMESTAMP + interval '30 minutes'
    OR NEW."startsAt" > CURRENT_TIMESTAMP + interval '180 days' THEN
    RAISE EXCEPTION 'Choose a blocked time within the next 180 days.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW."ownerId", 0));
  IF EXISTS (
    SELECT 1 FROM public."VisitRequest" AS accepted_visit
    WHERE accepted_visit."ownerId" = NEW."ownerId"
      AND accepted_visit."status" = 'ACCEPTED'::public."VisitRequestStatus"
      AND accepted_visit."scheduledAt" < NEW."endsAt"
      AND accepted_visit."scheduledAt" + interval '1 hour' > NEW."startsAt"
  ) THEN
    RAISE EXCEPTION 'That blocked period overlaps a confirmed visit.' USING ERRCODE = '23P01';
  END IF;
  NEW."createdAt" := CASE WHEN TG_OP = 'INSERT' THEN CURRENT_TIMESTAMP ELSE OLD."createdAt" END;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.validate_visit_availability_block()
FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "validate_visit_availability_block_before_write"
BEFORE INSERT OR UPDATE ON public."VisitAvailabilityBlock"
FOR EACH ROW EXECUTE FUNCTION nestmate_private.validate_visit_availability_block();

CREATE FUNCTION nestmate_private.visit_time_is_available(
  target_owner_id TEXT,
  target_time TIMESTAMPTZ,
  excluded_visit_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT target_time IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public."VisitAvailabilityRule" AS rule
      WHERE rule."ownerId" = target_owner_id
        AND rule."weekday" = EXTRACT(DOW FROM target_time AT TIME ZONE 'Asia/Kolkata')::INTEGER
        AND rule."startMinute" <= (
          EXTRACT(HOUR FROM target_time AT TIME ZONE 'Asia/Kolkata')::INTEGER * 60
          + EXTRACT(MINUTE FROM target_time AT TIME ZONE 'Asia/Kolkata')::INTEGER
        )
        AND rule."endMinute" >= (
          EXTRACT(HOUR FROM target_time AT TIME ZONE 'Asia/Kolkata')::INTEGER * 60
          + EXTRACT(MINUTE FROM target_time AT TIME ZONE 'Asia/Kolkata')::INTEGER
          + 60
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public."VisitAvailabilityBlock" AS blocked
      WHERE blocked."ownerId" = target_owner_id
        AND blocked."startsAt" < target_time + interval '1 hour'
        AND blocked."endsAt" > target_time
    )
    AND NOT EXISTS (
      SELECT 1 FROM public."VisitRequest" AS accepted_visit
      WHERE accepted_visit."ownerId" = target_owner_id
        AND accepted_visit."status" = 'ACCEPTED'::public."VisitRequestStatus"
        AND accepted_visit."id" IS DISTINCT FROM excluded_visit_id
        AND accepted_visit."scheduledAt" < target_time + interval '1 hour'
        AND accepted_visit."scheduledAt" + interval '1 hour' > target_time
    );
$$;
REVOKE ALL ON FUNCTION nestmate_private.visit_time_is_available(TEXT, TIMESTAMPTZ, UUID)
FROM PUBLIC, anon, authenticated;

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
    AND listing."type" IN ('ROOM_AVAILABLE'::public."PostType", 'PG_AVAILABLE'::public."PostType")
    AND listing."status" = 'ACTIVE'::public."PostStatus"
    AND listing."moderationStatus" = 'VISIBLE'::public."ContentModerationStatus"
    AND listing."availabilityStatus" = 'AVAILABLE'::public."ListingAvailabilityStatus"
    AND listing."publishedAt" IS NOT NULL;

  IF current_user_id IS NULL OR NEW."requesterId" <> current_user_id
    OR listing_owner_id IS NULL OR NEW."ownerId" <> listing_owner_id
    OR NEW."requesterId" = listing_owner_id
    OR EXISTS (
      SELECT 1 FROM public."UserModerationState" AS state
      WHERE state."userId" IN (NEW."requesterId", NEW."ownerId")
        AND state."status" = 'SUSPENDED'::public."UserModerationStatus"
    ) THEN
    RAISE EXCEPTION 'This listing is unavailable for visit requests.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."UserBlock" AS user_block
    WHERE (user_block."blockerId" = NEW."requesterId" AND user_block."blockedId" = NEW."ownerId")
       OR (user_block."blockerId" = NEW."ownerId" AND user_block."blockedId" = NEW."requesterId")
  ) THEN
    RAISE EXCEPTION 'This listing is unavailable for visit requests.' USING ERRCODE = '42501';
  END IF;
  IF NEW."requestedAt" < CURRENT_TIMESTAMP + interval '30 minutes'
    OR NEW."requestedAt" > CURRENT_TIMESTAMP + interval '180 days' THEN
    RAISE EXCEPTION 'Choose a visit time between 30 minutes and 180 days from now.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW."ownerId", 0));
  IF NOT nestmate_private.visit_time_is_available(NEW."ownerId", NEW."requestedAt", NULL) THEN
    RAISE EXCEPTION 'That visit time is unavailable.' USING ERRCODE = '23P01';
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

CREATE OR REPLACE FUNCTION nestmate_private.enforce_accepted_visit_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
BEGIN
  IF current_user_id IS NULL OR current_user_id NOT IN (NEW."requesterId", NEW."ownerId")
    OR NOT nestmate_private.can_access_visit_request(NEW."id") THEN
    RAISE EXCEPTION 'This visit is unavailable.' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW."ownerId", 0));
  IF NOT nestmate_private.visit_time_is_available(NEW."ownerId", NEW."scheduledAt", NEW."id") THEN
    RAISE EXCEPTION 'That visit time is unavailable.' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.enforce_accepted_visit_conflict()
FROM PUBLIC, anon, authenticated;
