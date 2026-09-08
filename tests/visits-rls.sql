-- Rollback-only integration test for private visit scheduling and notifications.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '44000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'visit-owner@example.test', '', now(), '{}', '{"full_name":"Visit Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '44000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'visit-requester@example.test', '', now(), '{}', '{"full_name":"Visit Requester"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '44000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'visit-outsider@example.test', '', now(), '{}', '{"full_name":"Visit Outsider"}', now(), now());

SELECT set_config('nestmate.visit_owner', (SELECT "id" FROM public."User" WHERE "authUserId" = '44000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.visit_requester', (SELECT "id" FROM public."User" WHERE "authUserId" = '44000000-0000-4000-8000-0000000000b2'), true);

INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('visit-test-city', 'Visit Test City', 'visit-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('visit-test-locality', 'Visit Test Locality', 'visit-test-locality', 'visit-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('visit-test-community', 'Visit Test Community', 'visit-test-community', 'visit-test-locality', now());
INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId", "communityId",
  "availabilityStatus", "publishedAt", "updatedAt"
)
VALUES
  ('visit-test-post', 'ROOM_AVAILABLE'::public."PostType", 'Private visit test room', 'Temporary visit RLS listing.', current_setting('nestmate.visit_owner'), 'visit-test-community', 'AVAILABLE'::public."ListingAvailabilityStatus", now(), now()),
  ('visit-test-invalid-post', 'NEED_ROOM'::public."PostType", 'Invalid visit target', 'Temporary non-listing post.', current_setting('nestmate.visit_owner'), 'visit-test-community', 'AVAILABLE'::public."ListingAvailabilityStatus", now(), now());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"44000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-0000000000b2', true);

INSERT INTO public."VisitRequest" (
  "id", "postId", "requesterId", "ownerId", "requestedAt", "note"
)
VALUES (
  '44000000-0000-4000-8000-0000000000d4',
  'visit-test-post',
  current_setting('nestmate.visit_requester'),
  current_setting('nestmate.visit_owner'),
  now() + interval '2 days',
  'Please confirm the gate details.'
);

DO $$
DECLARE
  invalid_target_denied BOOLEAN := FALSE;
BEGIN
  IF (SELECT count(*) FROM public."VisitRequest") <> 1 THEN
    RAISE EXCEPTION 'The requester could not read their visit request.';
  END IF;
  IF EXISTS (SELECT 1 FROM public."Notification") THEN
    RAISE EXCEPTION 'The requester could read the owner notification.';
  END IF;

  BEGIN
    INSERT INTO public."VisitRequest" (
      "id", "postId", "requesterId", "ownerId", "requestedAt"
    ) VALUES (
      '44000000-0000-4000-8000-0000000000e5',
      'visit-test-invalid-post',
      current_setting('nestmate.visit_requester'),
      current_setting('nestmate.visit_owner'),
      now() + interval '2 days'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    invalid_target_denied := TRUE;
  END;
  IF NOT invalid_target_denied THEN
    RAISE EXCEPTION 'A visit was requested for an ineligible post type.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"44000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-0000000000c3', true);

DO $$
DECLARE
  affected INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM public."VisitRequest") THEN
    RAISE EXCEPTION 'An outsider could read private visit details.';
  END IF;
  UPDATE public."VisitRequest"
  SET "status" = 'ACCEPTED'::public."VisitRequestStatus"
  WHERE "id" = '44000000-0000-4000-8000-0000000000d4';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'An outsider could update a visit request.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"44000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-0000000000a1', true);

DO $$
BEGIN
  IF (SELECT count(*) FROM public."VisitRequest") <> 1 THEN
    RAISE EXCEPTION 'The owner could not read the visit request.';
  END IF;
  IF (SELECT count(*) FROM public."Notification" WHERE "href" LIKE '/visits?visit=%') <> 1 THEN
    RAISE EXCEPTION 'The owner did not receive the visit request notification.';
  END IF;
END;
$$;

UPDATE public."VisitRequest"
SET
  "status" = 'PROPOSED'::public."VisitRequestStatus",
  "proposedAt" = now() + interval '3 days'
WHERE "id" = '44000000-0000-4000-8000-0000000000d4';

SELECT set_config('request.jwt.claims', '{"sub":"44000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-0000000000b2', true);

DO $$
DECLARE
  note_change_denied BOOLEAN := FALSE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."VisitRequest"
    WHERE "status" = 'PROPOSED'::public."VisitRequestStatus"
      AND "proposedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'The requester could not see the proposed visit time.';
  END IF;
  IF (SELECT count(*) FROM public."Notification" WHERE "href" LIKE '/visits?visit=%') <> 1 THEN
    RAISE EXCEPTION 'The requester did not receive the proposal notification.';
  END IF;

  BEGIN
    UPDATE public."VisitRequest"
    SET "note" = 'Changed private note'
    WHERE "id" = '44000000-0000-4000-8000-0000000000d4';
  EXCEPTION WHEN insufficient_privilege THEN
    note_change_denied := TRUE;
  END;
  IF NOT note_change_denied THEN
    RAISE EXCEPTION 'The requester changed immutable visit details.';
  END IF;
END;
$$;

UPDATE public."VisitRequest"
SET "status" = 'ACCEPTED'::public."VisitRequestStatus"
WHERE "id" = '44000000-0000-4000-8000-0000000000d4';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."VisitRequest"
    WHERE "status" = 'ACCEPTED'::public."VisitRequestStatus"
      AND "scheduledAt" = "proposedAt"
  ) THEN
    RAISE EXCEPTION 'The requester could not accept the proposed time.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"44000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-0000000000a1', true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."Notification"
    WHERE "href" = '/visits?visit=44000000-0000-4000-8000-0000000000d4'
      AND "title" ILIKE '%confirmed%'
  ) THEN
    RAISE EXCEPTION 'The owner did not receive the accepted-visit notification.';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
