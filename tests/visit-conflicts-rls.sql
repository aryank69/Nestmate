-- Rollback-only integration test for visit conflicts and listing eligibility.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '53000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'conflict-owner@example.test', '', now(), '{}', '{"full_name":"Conflict Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '53000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'conflict-requester-a@example.test', '', now(), '{}', '{"full_name":"Requester A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '53000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'conflict-requester-b@example.test', '', now(), '{}', '{"full_name":"Requester B"}', now(), now());

SELECT set_config('nestmate.conflict_owner', (SELECT "id" FROM public."User" WHERE "authUserId" = '53000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.conflict_requester_a', (SELECT "id" FROM public."User" WHERE "authUserId" = '53000000-0000-4000-8000-0000000000b2'), true);
SELECT set_config('nestmate.conflict_requester_b', (SELECT "id" FROM public."User" WHERE "authUserId" = '53000000-0000-4000-8000-0000000000c3'), true);

INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('conflict-test-city', 'Conflict Test City', 'conflict-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('conflict-test-locality', 'Conflict Test Locality', 'conflict-test-locality', 'conflict-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('conflict-test-community', 'Conflict Test Community', 'conflict-test-community', 'conflict-test-locality', now());
INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId", "communityId",
  "availabilityStatus", "publishedAt", "updatedAt"
)
VALUES
  ('conflict-post-a', 'ROOM_AVAILABLE', 'Available room A', 'Conflict fixture.', current_setting('nestmate.conflict_owner'), 'conflict-test-community', 'AVAILABLE', now(), now()),
  ('conflict-post-b', 'PG_AVAILABLE', 'Available PG B', 'Conflict fixture.', current_setting('nestmate.conflict_owner'), 'conflict-test-community', 'AVAILABLE', now(), now()),
  ('conflict-post-reserved', 'ROOM_AVAILABLE', 'Reserved room', 'Conflict fixture.', current_setting('nestmate.conflict_owner'), 'conflict-test-community', 'RESERVED', now(), now()),
  ('conflict-post-closed', 'PG_AVAILABLE', 'Closed PG', 'Conflict fixture.', current_setting('nestmate.conflict_owner'), 'conflict-test-community', 'CLOSED', now(), now());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"53000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '53000000-0000-4000-8000-0000000000b2', true);
INSERT INTO public."VisitRequest" (
  "id", "postId", "requesterId", "ownerId", "requestedAt"
)
VALUES (
  '53000000-0000-4000-8000-0000000000d4',
  'conflict-post-a',
  current_setting('nestmate.conflict_requester_a'),
  current_setting('nestmate.conflict_owner'),
  now() + interval '2 days'
);

SELECT set_config('request.jwt.claims', '{"sub":"53000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '53000000-0000-4000-8000-0000000000c3', true);
INSERT INTO public."VisitRequest" (
  "id", "postId", "requesterId", "ownerId", "requestedAt"
)
VALUES (
  '53000000-0000-4000-8000-0000000000e5',
  'conflict-post-b',
  current_setting('nestmate.conflict_requester_b'),
  current_setting('nestmate.conflict_owner'),
  now() + interval '2 days 30 minutes'
);

SELECT set_config('request.jwt.claims', '{"sub":"53000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '53000000-0000-4000-8000-0000000000a1', true);
UPDATE public."VisitRequest"
SET "status" = 'ACCEPTED'
WHERE "id" = '53000000-0000-4000-8000-0000000000d4';

DO $$
DECLARE
  conflict_denied BOOLEAN := FALSE;
BEGIN
  BEGIN
    UPDATE public."VisitRequest"
    SET "status" = 'ACCEPTED'
    WHERE "id" = '53000000-0000-4000-8000-0000000000e5';
  EXCEPTION WHEN exclusion_violation THEN
    conflict_denied := TRUE;
    IF SQLERRM <> 'That time is unavailable. Choose another time.' THEN
      RAISE EXCEPTION 'Conflict error leaked private scheduling details.';
    END IF;
  END;
  IF NOT conflict_denied THEN
    RAISE EXCEPTION 'An overlapping accepted visit was allowed.';
  END IF;
END;
$$;

UPDATE public."VisitRequest"
SET "status" = 'PROPOSED', "proposedAt" = now() + interval '2 days 1 hour'
WHERE "id" = '53000000-0000-4000-8000-0000000000e5';
UPDATE public."VisitRequest"
SET "status" = 'ACCEPTED'
WHERE "id" = '53000000-0000-4000-8000-0000000000e5';

DO $$
BEGIN
  IF (SELECT count(*) FROM public."VisitRequest" WHERE "status" = 'ACCEPTED') <> 2 THEN
    RAISE EXCEPTION 'Back-to-back non-overlapping visits were not accepted.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"53000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '53000000-0000-4000-8000-0000000000b2', true);
DO $$
DECLARE
  overlapping_request_denied BOOLEAN := FALSE;
  reserved_denied BOOLEAN := FALSE;
  closed_denied BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public."VisitRequest" (
      "id", "postId", "requesterId", "ownerId", "requestedAt"
    ) VALUES (
      '53000000-0000-4000-8000-0000000000f6',
      'conflict-post-b', current_setting('nestmate.conflict_requester_a'),
      current_setting('nestmate.conflict_owner'), now() + interval '2 days 15 minutes'
    );
  EXCEPTION WHEN exclusion_violation THEN
    overlapping_request_denied := TRUE;
  END;
  BEGIN
    INSERT INTO public."VisitRequest" (
      "id", "postId", "requesterId", "ownerId", "requestedAt"
    ) VALUES (
      '53000000-0000-4000-8000-0000000000f7',
      'conflict-post-reserved', current_setting('nestmate.conflict_requester_a'),
      current_setting('nestmate.conflict_owner'), now() + interval '4 days'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    reserved_denied := TRUE;
  END;
  BEGIN
    INSERT INTO public."VisitRequest" (
      "id", "postId", "requesterId", "ownerId", "requestedAt"
    ) VALUES (
      '53000000-0000-4000-8000-0000000000f8',
      'conflict-post-closed', current_setting('nestmate.conflict_requester_a'),
      current_setting('nestmate.conflict_owner'), now() + interval '4 days'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    closed_denied := TRUE;
  END;
  IF NOT overlapping_request_denied OR NOT reserved_denied OR NOT closed_denied THEN
    RAISE EXCEPTION 'A conflicting or unavailable listing visit request was allowed.';
  END IF;
  IF (SELECT count(*) FROM public."VisitRequest") <> 1 THEN
    RAISE EXCEPTION 'A requester could see another user''s private visit details.';
  END IF;
END;
$$;

ROLLBACK;
