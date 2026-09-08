CREATE TYPE public."VisitAttendanceConfirmation"
AS ENUM ('HAPPENED', 'MISSED', 'CANCELLED');

CREATE TABLE public."VisitAttendance" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "visitId" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "checkedInAt" TIMESTAMPTZ(3),
  "confirmation" public."VisitAttendanceConfirmation",
  "confirmedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VisitAttendance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VisitAttendance_confirmation_time_check" CHECK (
    ("confirmation" IS NULL AND "confirmedAt" IS NULL)
    OR ("confirmation" IS NOT NULL AND "confirmedAt" IS NOT NULL)
  ),
  CONSTRAINT "VisitAttendance_visitId_fkey"
    FOREIGN KEY ("visitId") REFERENCES public."VisitRequest"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VisitAttendance_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "VisitAttendance_visitId_userId_key"
ON public."VisitAttendance"("visitId", "userId");
CREATE INDEX "VisitAttendance_userId_updatedAt_idx"
ON public."VisitAttendance"("userId", "updatedAt" DESC);
CREATE INDEX "VisitAttendance_visitId_confirmation_idx"
ON public."VisitAttendance"("visitId", "confirmation");

ALTER TABLE public."VisitAttendance" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."VisitAttendance"
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public."VisitAttendance" TO authenticated;
REVOKE ALL ON TYPE public."VisitAttendanceConfirmation" FROM PUBLIC;
GRANT USAGE ON TYPE public."VisitAttendanceConfirmation" TO authenticated;

CREATE FUNCTION nestmate_private.can_access_own_visit_attendance(
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
    );
$$;

REVOKE ALL ON FUNCTION nestmate_private.can_access_own_visit_attendance(UUID, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nestmate_private.can_access_own_visit_attendance(UUID, TEXT)
TO authenticated;

CREATE POLICY "Users can read only their own visit attendance"
ON public."VisitAttendance"
FOR SELECT
TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_own_visit_attendance("visitId", "userId"))
);

CREATE POLICY "Users can create only their own visit attendance"
ON public."VisitAttendance"
FOR INSERT
TO authenticated
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_own_visit_attendance("visitId", "userId"))
);

CREATE POLICY "Users can update only their own visit attendance"
ON public."VisitAttendance"
FOR UPDATE
TO authenticated
USING (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_own_visit_attendance("visitId", "userId"))
)
WITH CHECK (
  "userId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND (SELECT nestmate_private.can_access_own_visit_attendance("visitId", "userId"))
);

CREATE FUNCTION nestmate_private.validate_visit_attendance_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id TEXT := nestmate_private.current_nestmate_user_id();
  visit_status TEXT;
  scheduled_at TIMESTAMPTZ;
  requester_id TEXT;
  owner_id TEXT;
  listing_status TEXT;
  listing_moderation_status TEXT;
  listing_availability_status TEXT;
  listing_published_at TIMESTAMPTZ;
BEGIN
  SELECT
    visit_request."status"::TEXT,
    visit_request."scheduledAt",
    visit_request."requesterId",
    visit_request."ownerId",
    listing."status"::TEXT,
    listing."moderationStatus"::TEXT,
    listing."availabilityStatus"::TEXT,
    listing."publishedAt"
  INTO
    visit_status,
    scheduled_at,
    requester_id,
    owner_id,
    listing_status,
    listing_moderation_status,
    listing_availability_status,
    listing_published_at
  FROM public."VisitRequest" AS visit_request
  JOIN public."Post" AS listing ON listing."id" = visit_request."postId"
  WHERE visit_request."id" = NEW."visitId";

  IF current_user_id IS NULL
    OR NEW."userId" <> current_user_id
    OR current_user_id NOT IN (requester_id, owner_id)
    OR NOT nestmate_private.can_access_own_visit_attendance(
      NEW."visitId",
      NEW."userId"
    )
    OR EXISTS (
      SELECT 1
      FROM public."UserModerationState" AS moderation_state
      WHERE moderation_state."userId" IN (requester_id, owner_id)
        AND moderation_state."status"::TEXT = 'SUSPENDED'
    ) THEN
    RAISE EXCEPTION 'This visit attendance record is unavailable.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW."visitId" IS DISTINCT FROM OLD."visitId"
    OR NEW."userId" IS DISTINCT FROM OLD."userId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'Visit attendance identity cannot be changed.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD."checkedInAt" IS NOT NULL
    AND NEW."checkedInAt" IS DISTINCT FROM OLD."checkedInAt" THEN
    RAISE EXCEPTION 'A visit check-in cannot be changed.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW."checkedInAt" IS NOT NULL
    AND (TG_OP = 'INSERT' OR OLD."checkedInAt" IS NULL) THEN
    IF visit_status <> 'ACCEPTED'
      OR scheduled_at IS NULL
      OR CURRENT_TIMESTAMP < scheduled_at - interval '30 minutes'
      OR CURRENT_TIMESTAMP > scheduled_at + interval '2 hours'
      OR listing_status <> 'ACTIVE'
      OR listing_moderation_status <> 'VISIBLE'
      OR listing_availability_status NOT IN ('AVAILABLE', 'RESERVED')
      OR listing_published_at IS NULL THEN
      RAISE EXCEPTION 'Check-in is available only near an accepted visit for an active listing.'
        USING ERRCODE = '22023';
    END IF;
    NEW."checkedInAt" := CURRENT_TIMESTAMP;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD."confirmation" IS NOT NULL
    AND (
      NEW."confirmation" IS DISTINCT FROM OLD."confirmation"
      OR NEW."confirmedAt" IS DISTINCT FROM OLD."confirmedAt"
    ) THEN
    RAISE EXCEPTION 'A final attendance confirmation cannot be changed.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW."confirmation" IS NOT NULL
    AND (TG_OP = 'INSERT' OR OLD."confirmation" IS NULL) THEN
    IF visit_status NOT IN ('ACCEPTED', 'CANCELLED')
      OR scheduled_at IS NULL
      OR CURRENT_TIMESTAMP < scheduled_at + interval '1 hour' THEN
      RAISE EXCEPTION 'Confirm attendance after the scheduled visit has ended.'
        USING ERRCODE = '22023';
    END IF;
    NEW."confirmedAt" := CURRENT_TIMESTAMP;
  ELSIF NEW."confirmation" IS NULL THEN
    NEW."confirmedAt" := NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW."createdAt" := CURRENT_TIMESTAMP;
  END IF;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nestmate_private.validate_visit_attendance_write()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "validate_visit_attendance_before_write"
BEFORE INSERT OR UPDATE ON public."VisitAttendance"
FOR EACH ROW
EXECUTE FUNCTION nestmate_private.validate_visit_attendance_write();
