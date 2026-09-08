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


SELECT set_config('request.jwt.claims', '{"sub":"44000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-0000000000a1', true);
UPDATE public."VisitRequest" SET "status" = 'ACCEPTED' WHERE "id"='44000000-0000-4000-8000-0000000000d4';
UPDATE public."VisitRequest" SET "scheduledAt" = now()+interval '3 days', "calendarRevision"=999
WHERE "id"='44000000-0000-4000-8000-0000000000d4';
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public."VisitRequest" WHERE "calendarRevision"=2 AND "scheduledAt"=(now()+interval '3 days')::timestamptz(3))
 THEN RAISE EXCEPTION 'Reschedule/revision failed'; END IF;
 IF (SELECT count(*) FROM public."VisitChange") <> 2 THEN RAISE EXCEPTION 'History missing'; END IF;
 IF (SELECT count(*) FROM public."Notification" WHERE "resourceId" LIKE 'visit-change:%')<>1 THEN RAISE EXCEPTION 'Owner notification missing'; END IF;
 BEGIN
   UPDATE public."VisitRequest" SET "scheduledAt"=now()-interval '1 day';
   RAISE EXCEPTION 'Past time accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
   UPDATE public."VisitRequest" SET "note"='tampered', "scheduledAt"=now()+interval '4 days';
   RAISE EXCEPTION 'Private note changed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   DELETE FROM public."VisitChange";
   RAISE EXCEPTION 'History mutable';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- Optimistic concurrency: a stale revision must not overwrite the current schedule.
 UPDATE public."VisitRequest" SET "scheduledAt"=now()+interval '4 days' WHERE "calendarRevision"=1;
 IF FOUND THEN RAISE EXCEPTION 'Stale update allowed'; END IF;
END; $$;

SELECT set_config('request.jwt.claims', '{"sub":"44000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-0000000000c3', true);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public."VisitChange") THEN RAISE EXCEPTION 'Outsider saw history'; END IF;
 UPDATE public."VisitRequest" SET "status"='CANCELLED';
 IF FOUND THEN RAISE EXCEPTION 'Outsider cancelled visit'; END IF;
END; $$;

SELECT set_config('request.jwt.claims', '{"sub":"44000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-0000000000b2', true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public."Notification" WHERE "resourceId" LIKE 'visit-change:%')<>1 THEN RAISE EXCEPTION 'Requester notification missing'; END IF;
END; $$;
UPDATE public."VisitRequest" SET "scheduledAt"=now()+interval '4 days' WHERE "calendarRevision"=2;
UPDATE public."VisitRequest" SET "status"='CANCELLED', "scheduledAt"=NULL WHERE "calendarRevision"=3;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public."VisitRequest" WHERE "status"='CANCELLED' AND "calendarRevision"=4 AND "scheduledAt"=(now()+interval '4 days')::timestamptz(3))
 THEN RAISE EXCEPTION 'Cancellation must retain last calendar time'; END IF;
 IF (SELECT count(*) FROM public."VisitChange")<>4 THEN RAISE EXCEPTION 'Change history incomplete'; END IF;
 IF (SELECT count(*) FROM public."Notification" WHERE "resourceId" LIKE 'visit-change:%')<>3 THEN RAISE EXCEPTION 'Change notifications missing'; END IF;
 BEGIN
   UPDATE public."VisitRequest" SET "status"='ACCEPTED';
   RAISE EXCEPTION 'Cancelled visit reopened';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;

RESET ROLE;
INSERT INTO public."UserBlock" ("blockerId","blockedId")
VALUES (current_setting('nestmate.visit_owner'),current_setting('nestmate.visit_requester'));
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public."VisitChange") THEN RAISE EXCEPTION 'Blocked history visible'; END IF;
 IF EXISTS (SELECT 1 FROM public."VisitRequest") THEN RAISE EXCEPTION 'Blocked visit visible'; END IF;
END; $$;
ROLLBACK;
