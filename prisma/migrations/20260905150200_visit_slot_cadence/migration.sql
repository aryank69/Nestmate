-- Match the 30-minute cadence produced by the application. This prevents a
-- modified client from submitting an arbitrary minute inside an open window.
CREATE OR REPLACE FUNCTION nestmate_private.visit_time_is_available(
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
    AND date_trunc('minute', target_time) = target_time
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
        AND MOD(
          EXTRACT(HOUR FROM target_time AT TIME ZONE 'Asia/Kolkata')::INTEGER * 60
          + EXTRACT(MINUTE FROM target_time AT TIME ZONE 'Asia/Kolkata')::INTEGER
          - rule."startMinute",
          30
        ) = 0
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
