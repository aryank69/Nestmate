-- Rollback-only integration test for private visit availability and slot enforcement.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('00000000-0000-0000-0000-000000000000', '54000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'availability-owner@example.test', '', now(), '{}', '{"full_name":"Availability Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '54000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'availability-requester-a@example.test', '', now(), '{}', '{"full_name":"Availability Requester A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '54000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'availability-requester-b@example.test', '', now(), '{}', '{"full_name":"Availability Requester B"}', now(), now());

SELECT set_config('nestmate.availability_owner', (SELECT "id" FROM public."User" WHERE "authUserId" = '54000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.availability_requester_a', (SELECT "id" FROM public."User" WHERE "authUserId" = '54000000-0000-4000-8000-0000000000b2'), true);
SELECT set_config('nestmate.availability_requester_b', (SELECT "id" FROM public."User" WHERE "authUserId" = '54000000-0000-4000-8000-0000000000c3'), true);
SELECT set_config(
  'nestmate.availability_slot',
  (((date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') + interval '2 days 12 hours') AT TIME ZONE 'Asia/Kolkata')::TEXT),
  true
);

INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('availability-test-city', 'Availability Test City', 'availability-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('availability-test-locality', 'Availability Test Locality', 'availability-test-locality', 'availability-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('availability-test-community', 'Availability Test Community', 'availability-test-community', 'availability-test-locality', now());
INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId", "communityId",
  "availabilityStatus", "publishedAt", "updatedAt"
) VALUES
  ('availability-post-a', 'ROOM_AVAILABLE', 'Availability room A', 'Fixture.', current_setting('nestmate.availability_owner'), 'availability-test-community', 'AVAILABLE', now(), now()),
  ('availability-post-b', 'PG_AVAILABLE', 'Availability PG B', 'Fixture.', current_setting('nestmate.availability_owner'), 'availability-test-community', 'AVAILABLE', now(), now());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"54000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '54000000-0000-4000-8000-0000000000a1', true);
SELECT public.replace_visit_availability(jsonb_build_array(jsonb_build_object(
  'weekday', EXTRACT(DOW FROM current_setting('nestmate.availability_slot')::TIMESTAMPTZ AT TIME ZONE 'Asia/Kolkata')::INTEGER,
  'startMinute', 720,
  'endMinute', 1080
)));
INSERT INTO public."VisitAvailabilityBlock" (
  "id", "ownerId", "startsAt", "endsAt", "updatedAt"
) VALUES (
  '54000000-0000-4000-8000-0000000000d4', current_setting('nestmate.availability_owner'),
  current_setting('nestmate.availability_slot')::TIMESTAMPTZ + interval '3 hours',
  current_setting('nestmate.availability_slot')::TIMESTAMPTZ + interval '4 hours', now()
);

SELECT set_config('request.jwt.claims', '{"sub":"54000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '54000000-0000-4000-8000-0000000000b2', true);
DO $$
DECLARE mutation_denied BOOLEAN := FALSE;
BEGIN
  IF (SELECT count(*) FROM public."VisitAvailabilityRule") <> 0
    OR (SELECT count(*) FROM public."VisitAvailabilityBlock") <> 0 THEN
    RAISE EXCEPTION 'Another user could read private owner schedule details.';
  END IF;
  BEGIN
    INSERT INTO public."VisitAvailabilityRule" (
      "ownerId", "weekday", "startMinute", "endMinute", "updatedAt"
    ) VALUES (current_setting('nestmate.availability_owner'), 0, 600, 720, now());
  EXCEPTION WHEN insufficient_privilege THEN mutation_denied := TRUE;
  END;
  IF NOT mutation_denied THEN
    RAISE EXCEPTION 'Another user could change private owner availability.';
  END IF;
END;
$$;

INSERT INTO public."VisitRequest" (
  "id", "postId", "requesterId", "ownerId", "requestedAt"
) VALUES (
  '54000000-0000-4000-8000-0000000000e5', 'availability-post-a',
  current_setting('nestmate.availability_requester_a'), current_setting('nestmate.availability_owner'),
  current_setting('nestmate.availability_slot')::TIMESTAMPTZ
);
INSERT INTO public."VisitSlotPreference" (
  "id", "visitId", "requesterId", "preferredWeekdays",
  "preferredStartMinute", "preferredEndMinute", "updatedAt"
) VALUES (
  '54000000-0000-4000-8000-0000000000d5',
  '54000000-0000-4000-8000-0000000000e5',
  current_setting('nestmate.availability_requester_a'),
  ARRAY[EXTRACT(DOW FROM current_setting('nestmate.availability_slot')::TIMESTAMPTZ AT TIME ZONE 'Asia/Kolkata')::INTEGER],
  720, 1080, now()
);
DO $$ BEGIN
  IF (SELECT count(*) FROM public."VisitSlotPreference") <> 1 THEN
    RAISE EXCEPTION 'The requester could not read their own slot preference.';
  END IF;
END; $$;

SELECT set_config('request.jwt.claims', '{"sub":"54000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '54000000-0000-4000-8000-0000000000a1', true);
UPDATE public."VisitRequest"
SET "status" = 'PROPOSED',
    "proposedAt" = current_setting('nestmate.availability_slot')::TIMESTAMPTZ + interval '30 minutes'
WHERE "id" = '54000000-0000-4000-8000-0000000000e5';
DO $$
DECLARE preference_write_denied BOOLEAN := FALSE;
BEGIN
  IF (SELECT count(*) FROM public."VisitSlotPreference") <> 0 THEN
    RAISE EXCEPTION 'The listing owner could read the visitor''s raw slot preference.';
  END IF;
  BEGIN
    INSERT INTO public."VisitSlotPreference" (
      "id", "visitId", "requesterId", "preferredWeekdays", "updatedAt"
    ) VALUES (
      '54000000-0000-4000-8000-0000000000d6',
      '54000000-0000-4000-8000-0000000000e5',
      current_setting('nestmate.availability_owner'), ARRAY[1], now()
    );
  EXCEPTION WHEN insufficient_privilege THEN preference_write_denied := TRUE;
  END;
  IF NOT preference_write_denied THEN
    RAISE EXCEPTION 'The listing owner could write the visitor''s slot preference.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"54000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '54000000-0000-4000-8000-0000000000b2', true);
UPDATE public."VisitRequest"
SET "status" = 'PROPOSED',
    "proposedAt" = current_setting('nestmate.availability_slot')::TIMESTAMPTZ
WHERE "id" = '54000000-0000-4000-8000-0000000000e5';

SELECT set_config('request.jwt.claims', '{"sub":"54000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '54000000-0000-4000-8000-0000000000a1', true);
UPDATE public."VisitRequest" SET "status" = 'ACCEPTED'
WHERE "id" = '54000000-0000-4000-8000-0000000000e5';

DO $$
DECLARE overlap_denied BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public."VisitAvailabilityBlock" (
      "id", "ownerId", "startsAt", "endsAt", "updatedAt"
    ) VALUES (
      '54000000-0000-4000-8000-0000000000f6', current_setting('nestmate.availability_owner'),
      current_setting('nestmate.availability_slot')::TIMESTAMPTZ + interval '30 minutes',
      current_setting('nestmate.availability_slot')::TIMESTAMPTZ + interval '90 minutes', now()
    );
  EXCEPTION WHEN exclusion_violation THEN overlap_denied := TRUE;
  END;
  IF NOT overlap_denied THEN RAISE EXCEPTION 'A blocked time overlapped a confirmed visit.'; END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"54000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '54000000-0000-4000-8000-0000000000c3', true);
DO $$
DECLARE blocked_denied BOOLEAN := FALSE; off_schedule_denied BOOLEAN := FALSE; cadence_denied BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public."VisitRequest" (
      "id", "postId", "requesterId", "ownerId", "requestedAt"
    ) VALUES (
      '54000000-0000-4000-8000-0000000000f7', 'availability-post-b',
      current_setting('nestmate.availability_requester_b'), current_setting('nestmate.availability_owner'),
      current_setting('nestmate.availability_slot')::TIMESTAMPTZ + interval '3 hours'
    );
  EXCEPTION WHEN exclusion_violation THEN
    blocked_denied := SQLERRM = 'That visit time is unavailable.';
  END;
  BEGIN
    INSERT INTO public."VisitRequest" (
      "id", "postId", "requesterId", "ownerId", "requestedAt"
    ) VALUES (
      '54000000-0000-4000-8000-0000000000f8', 'availability-post-b',
      current_setting('nestmate.availability_requester_b'), current_setting('nestmate.availability_owner'),
      current_setting('nestmate.availability_slot')::TIMESTAMPTZ + interval '7 hours'
    );
  EXCEPTION WHEN exclusion_violation THEN
    off_schedule_denied := SQLERRM = 'That visit time is unavailable.';
  END;
  BEGIN
    INSERT INTO public."VisitRequest" (
      "id", "postId", "requesterId", "ownerId", "requestedAt"
    ) VALUES (
      '54000000-0000-4000-8000-0000000000f9', 'availability-post-b',
      current_setting('nestmate.availability_requester_b'), current_setting('nestmate.availability_owner'),
      current_setting('nestmate.availability_slot')::TIMESTAMPTZ + interval '7 minutes'
    );
  EXCEPTION WHEN exclusion_violation THEN
    cadence_denied := SQLERRM = 'That visit time is unavailable.';
  END;
  IF NOT blocked_denied OR NOT off_schedule_denied OR NOT cadence_denied THEN
    RAISE EXCEPTION 'A blocked or off-schedule visit was allowed, or its error leaked details.';
  END IF;
END;
$$;

ROLLBACK;
