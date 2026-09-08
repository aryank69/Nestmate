CREATE TABLE public."VisitSlotPreference" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "visitId" UUID NOT NULL REFERENCES public."VisitRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "requesterId" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "preferredWeekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "preferredStartMinute" INTEGER,
  "preferredEndMinute" INTEGER,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VisitSlotPreference_time_window_check" CHECK (
    ("preferredStartMinute" IS NULL AND "preferredEndMinute" IS NULL)
    OR (
      "preferredStartMinute" BETWEEN 0 AND 1380
      AND "preferredEndMinute" BETWEEN 60 AND 1440
      AND "preferredEndMinute" - "preferredStartMinute" >= 60
    )
  ),
  CONSTRAINT "VisitSlotPreference_weekdays_check" CHECK (
    cardinality("preferredWeekdays") <= 7
    AND "preferredWeekdays" <@ ARRAY[0, 1, 2, 3, 4, 5, 6]
  )
);
CREATE UNIQUE INDEX "VisitSlotPreference_visitId_key"
ON public."VisitSlotPreference"("visitId");
CREATE INDEX "VisitSlotPreference_requesterId_updatedAt_idx"
ON public."VisitSlotPreference"("requesterId", "updatedAt" DESC);

ALTER TABLE public."VisitSlotPreference" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."VisitSlotPreference" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."VisitSlotPreference" TO authenticated;

CREATE POLICY "Requesters can read their visit slot preference"
ON public."VisitSlotPreference" FOR SELECT TO authenticated
USING ("requesterId" = (SELECT nestmate_private.current_nestmate_user_id()));
CREATE POLICY "Requesters can add their visit slot preference"
ON public."VisitSlotPreference" FOR INSERT TO authenticated
WITH CHECK (
  "requesterId" = (SELECT nestmate_private.current_nestmate_user_id())
  AND EXISTS (
    SELECT 1 FROM public."VisitRequest" AS visit
    WHERE visit."id" = "VisitSlotPreference"."visitId"
      AND visit."requesterId" = "VisitSlotPreference"."requesterId"
  )
);
CREATE POLICY "Requesters can update their visit slot preference"
ON public."VisitSlotPreference" FOR UPDATE TO authenticated
USING ("requesterId" = (SELECT nestmate_private.current_nestmate_user_id()))
WITH CHECK ("requesterId" = (SELECT nestmate_private.current_nestmate_user_id()));
CREATE POLICY "Requesters can delete their visit slot preference"
ON public."VisitSlotPreference" FOR DELETE TO authenticated
USING ("requesterId" = (SELECT nestmate_private.current_nestmate_user_id()));

CREATE FUNCTION nestmate_private.validate_visit_slot_preference()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller TEXT := nestmate_private.current_nestmate_user_id();
BEGIN
  IF caller IS NULL OR caller <> NEW."requesterId"
    OR NOT EXISTS (
      SELECT 1 FROM public."VisitRequest" AS visit
      WHERE visit."id" = NEW."visitId"
        AND visit."requesterId" = caller
    ) THEN
    RAISE EXCEPTION 'This visit preference cannot be changed.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(NEW."preferredWeekdays") AS weekday
    GROUP BY weekday HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Preferred weekdays must be unique.' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW."visitId" IS DISTINCT FROM OLD."visitId"
    OR NEW."requesterId" IS DISTINCT FROM OLD."requesterId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'Visit preference ownership cannot be changed.' USING ERRCODE = '42501';
  END IF;
  NEW."createdAt" := CASE WHEN TG_OP = 'INSERT' THEN CURRENT_TIMESTAMP ELSE OLD."createdAt" END;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION nestmate_private.validate_visit_slot_preference()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "validate_visit_slot_preference_before_write"
BEFORE INSERT OR UPDATE ON public."VisitSlotPreference"
FOR EACH ROW EXECUTE FUNCTION nestmate_private.validate_visit_slot_preference();
