CREATE TYPE public."VisitRequestStatus"
AS ENUM ('PENDING', 'PROPOSED', 'ACCEPTED', 'DECLINED');

CREATE TABLE public."VisitRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "postId" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "status" public."VisitRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMPTZ(3) NOT NULL,
  "proposedAt" TIMESTAMPTZ(3),
  "scheduledAt" TIMESTAMPTZ(3),
  "note" VARCHAR(500),
  "respondedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VisitRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VisitRequest_participants_differ_check"
    CHECK ("requesterId" <> "ownerId"),
  CONSTRAINT "VisitRequest_note_check"
    CHECK ("note" IS NULL OR char_length(btrim("note")) BETWEEN 1 AND 500),
  CONSTRAINT "VisitRequest_status_details_check" CHECK (
    ("status" = 'PENDING' AND "proposedAt" IS NULL AND "scheduledAt" IS NULL AND "respondedAt" IS NULL)
    OR ("status" = 'PROPOSED' AND "proposedAt" IS NOT NULL AND "scheduledAt" IS NULL AND "respondedAt" IS NOT NULL)
    OR ("status" = 'ACCEPTED' AND "scheduledAt" IS NOT NULL AND "respondedAt" IS NOT NULL)
    OR ("status" = 'DECLINED' AND "scheduledAt" IS NULL AND "respondedAt" IS NOT NULL)
  ),
  CONSTRAINT "VisitRequest_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES public."Post"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VisitRequest_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VisitRequest_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "VisitRequest_requesterId_requestedAt_idx"
ON public."VisitRequest"("requesterId", "requestedAt" DESC);
CREATE INDEX "VisitRequest_ownerId_requestedAt_idx"
ON public."VisitRequest"("ownerId", "requestedAt" DESC);
CREATE INDEX "VisitRequest_postId_status_requestedAt_idx"
ON public."VisitRequest"("postId", "status", "requestedAt");
CREATE UNIQUE INDEX "VisitRequest_one_open_per_requester_post_idx"
ON public."VisitRequest"("postId", "requesterId")
WHERE "status" IN (
  'PENDING'::public."VisitRequestStatus",
  'PROPOSED'::public."VisitRequestStatus"
);

ALTER TABLE public."VisitRequest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."VisitRequest"
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public."VisitRequest" TO authenticated;
REVOKE ALL ON TYPE public."VisitRequestStatus" FROM PUBLIC;
GRANT USAGE ON TYPE public."VisitRequestStatus" TO authenticated;

CREATE FUNCTION nestmate_private.can_access_visit_request(target_visit_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."VisitRequest" AS visit_request
    CROSS JOIN LATERAL (
      SELECT nestmate_private.current_nestmate_user_id() AS current_user_id
    ) AS caller
    WHERE visit_request."id" = target_visit_id
      AND caller.current_user_id IN (
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

REVOKE ALL ON FUNCTION nestmate_private.can_access_visit_request(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.can_access_visit_request(UUID)
TO authenticated;

CREATE POLICY "Visit participants can read unblocked requests"
ON public."VisitRequest"
FOR SELECT
TO authenticated
USING (
  (SELECT nestmate_private.can_access_visit_request("id"))
);

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
      AND listing."availabilityStatus" = 'AVAILABLE'::public."ListingAvailabilityStatus"
      AND listing."publishedAt" IS NOT NULL
  )
);

CREATE POLICY "Visit participants can respond to unblocked requests"
ON public."VisitRequest"
FOR UPDATE
TO authenticated
USING (
  (SELECT nestmate_private.can_access_visit_request("id"))
)
WITH CHECK (
  (SELECT nestmate_private.can_access_visit_request("id"))
);

CREATE FUNCTION nestmate_private.validate_visit_request_insert()
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
    AND listing."availabilityStatus" = 'AVAILABLE'::public."ListingAvailabilityStatus"
    AND listing."publishedAt" IS NOT NULL;

  IF current_user_id IS NULL
    OR NEW."requesterId" <> current_user_id
    OR listing_owner_id IS NULL
    OR NEW."ownerId" <> listing_owner_id
    OR NEW."requesterId" = listing_owner_id THEN
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

CREATE TRIGGER "validate_visit_request_before_insert"
BEFORE INSERT ON public."VisitRequest"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.validate_visit_request_insert();

CREATE FUNCTION nestmate_private.validate_visit_request_update()
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
    AND OLD."status" IN (
      'PENDING'::public."VisitRequestStatus",
      'PROPOSED'::public."VisitRequestStatus"
    ) THEN
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
      RAISE EXCEPTION 'The owner cannot make that visit status change.'
        USING ERRCODE = '42501';
    END IF;
  ELSIF current_user_id = OLD."requesterId"
    AND OLD."status" = 'PROPOSED'::public."VisitRequestStatus" THEN
    IF NEW."status" = 'ACCEPTED'::public."VisitRequestStatus" THEN
      NEW."scheduledAt" := OLD."proposedAt";
      NEW."proposedAt" := OLD."proposedAt";
    ELSIF NEW."status" = 'DECLINED'::public."VisitRequestStatus" THEN
      NEW."scheduledAt" := NULL;
      NEW."proposedAt" := OLD."proposedAt";
    ELSE
      RAISE EXCEPTION 'The requester can only accept or decline a proposed time.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'You cannot respond to this visit request.'
      USING ERRCODE = '42501';
  END IF;

  NEW."respondedAt" := CURRENT_TIMESTAMP;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.validate_visit_request_update()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "validate_visit_request_before_update"
BEFORE UPDATE ON public."VisitRequest"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.validate_visit_request_update();

CREATE FUNCTION nestmate_private.notify_visit_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id TEXT;
  recipient_id TEXT;
  actor_name TEXT;
  listing_title TEXT;
  notification_title TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    actor_id := NEW."requesterId";
    recipient_id := NEW."ownerId";
    notification_title := 'requested a property visit';
  ELSIF NEW."status" IS NOT DISTINCT FROM OLD."status"
    AND NEW."proposedAt" IS NOT DISTINCT FROM OLD."proposedAt" THEN
    RETURN NEW;
  ELSE
    actor_id := nestmate_private.current_nestmate_user_id();
    IF actor_id = NEW."ownerId" THEN
      recipient_id := NEW."requesterId";
    ELSIF actor_id = NEW."requesterId" THEN
      recipient_id := NEW."ownerId";
    ELSE
      RETURN NEW;
    END IF;

    notification_title := CASE NEW."status"
      WHEN 'ACCEPTED'::public."VisitRequestStatus" THEN 'confirmed a property visit'
      WHEN 'PROPOSED'::public."VisitRequestStatus" THEN 'proposed another visit time'
      ELSE 'declined a property visit'
    END;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."UserBlock" AS user_block
    WHERE (
      user_block."blockerId" = actor_id
      AND user_block."blockedId" = recipient_id
    ) OR (
      user_block."blockerId" = recipient_id
      AND user_block."blockedId" = actor_id
    )
  ) THEN
    RETURN NEW;
  END IF;

  SELECT nestmate_user."name" INTO actor_name
  FROM public."User" AS nestmate_user
  WHERE nestmate_user."id" = actor_id;
  SELECT listing."title" INTO listing_title
  FROM public."Post" AS listing
  WHERE listing."id" = NEW."postId";

  INSERT INTO public."Notification" (
    "recipientId", "actorId", "type", "title", "body", "href", "resourceId"
  ) VALUES (
    recipient_id,
    actor_id,
    'POST_ACTIVITY'::public."NotificationType",
    left(actor_name || ' ' || notification_title, 140),
    left(listing_title, 300),
    '/visits?visit=' || NEW."id"::TEXT,
    'visit:' || NEW."id"::TEXT || ':' || NEW."status"::TEXT
  )
  ON CONFLICT ("recipientId", "type", "resourceId", "actorId")
  DO UPDATE SET
    "title" = EXCLUDED."title",
    "body" = EXCLUDED."body",
    "href" = EXCLUDED."href",
    "readAt" = NULL,
    "createdAt" = CURRENT_TIMESTAMP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.notify_visit_request()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "notify_after_visit_request_change"
AFTER INSERT OR UPDATE ON public."VisitRequest"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.notify_visit_request();
