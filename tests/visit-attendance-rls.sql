-- Rollback-only integration test for private visit check-in and attendance.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '46000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'attendance-owner@example.test', '', now(), '{}', '{"full_name":"Attendance Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '46000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'attendance-requester@example.test', '', now(), '{}', '{"full_name":"Attendance Requester"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '46000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'attendance-outsider@example.test', '', now(), '{}', '{"full_name":"Attendance Outsider"}', now(), now());

SELECT set_config('nestmate.attendance_owner', (SELECT "id" FROM public."User" WHERE "authUserId" = '46000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.attendance_requester', (SELECT "id" FROM public."User" WHERE "authUserId" = '46000000-0000-4000-8000-0000000000b2'), true);
SELECT set_config('nestmate.attendance_outsider', (SELECT "id" FROM public."User" WHERE "authUserId" = '46000000-0000-4000-8000-0000000000c3'), true);

INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('attendance-test-city', 'Attendance Test City', 'attendance-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('attendance-test-locality', 'Attendance Test Locality', 'attendance-test-locality', 'attendance-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('attendance-test-community', 'Attendance Test Community', 'attendance-test-community', 'attendance-test-locality', now());
INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId", "communityId",
  "availabilityStatus", "publishedAt", "updatedAt"
)
VALUES
  ('attendance-test-post', 'ROOM_AVAILABLE'::public."PostType", 'Attendance test room', 'Temporary attendance RLS listing.', current_setting('nestmate.attendance_owner'), 'attendance-test-community', 'AVAILABLE'::public."ListingAvailabilityStatus", now(), now()),
  ('attendance-closed-post', 'PG_AVAILABLE'::public."PostType", 'Closed attendance test PG', 'Temporary closed attendance listing.', current_setting('nestmate.attendance_owner'), 'attendance-test-community', 'CLOSED'::public."ListingAvailabilityStatus", now(), now());

ALTER TABLE public."VisitRequest" DISABLE TRIGGER USER;
INSERT INTO public."VisitRequest" (
  "id", "postId", "requesterId", "ownerId", "status", "requestedAt",
  "scheduledAt", "respondedAt", "createdAt", "updatedAt"
)
VALUES
  ('46000000-0000-4000-8000-0000000000d4', 'attendance-test-post', current_setting('nestmate.attendance_requester'), current_setting('nestmate.attendance_owner'), 'ACCEPTED'::public."VisitRequestStatus", now() - interval '1 hour', now(), now() - interval '1 hour', now() - interval '1 day', now()),
  ('46000000-0000-4000-8000-0000000000e5', 'attendance-test-post', current_setting('nestmate.attendance_requester'), current_setting('nestmate.attendance_owner'), 'ACCEPTED'::public."VisitRequestStatus", now() - interval '3 hours', now() - interval '2 hours', now() - interval '3 hours', now() - interval '1 day', now()),
  ('46000000-0000-4000-8000-0000000000f6', 'attendance-test-post', current_setting('nestmate.attendance_requester'), current_setting('nestmate.attendance_owner'), 'ACCEPTED'::public."VisitRequestStatus", now(), now() + interval '2 days', now(), now(), now()),
  ('46000000-0000-4000-8000-0000000000a7', 'attendance-closed-post', current_setting('nestmate.attendance_requester'), current_setting('nestmate.attendance_owner'), 'ACCEPTED'::public."VisitRequestStatus", now() - interval '1 hour', now(), now() - interval '1 hour', now() - interval '1 day', now());
ALTER TABLE public."VisitRequest" ENABLE TRIGGER USER;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"46000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '46000000-0000-4000-8000-0000000000b2', true);

INSERT INTO public."VisitAttendance" ("visitId", "userId", "checkedInAt")
VALUES ('46000000-0000-4000-8000-0000000000d4', current_setting('nestmate.attendance_requester'), now());
INSERT INTO public."VisitAttendance" ("visitId", "userId", "confirmation", "confirmedAt")
VALUES ('46000000-0000-4000-8000-0000000000e5', current_setting('nestmate.attendance_requester'), 'HAPPENED'::public."VisitAttendanceConfirmation", now());

DO $$
DECLARE
  early_denied BOOLEAN := FALSE;
  closed_denied BOOLEAN := FALSE;
BEGIN
  IF (SELECT count(*) FROM public."VisitAttendance") <> 2 THEN
    RAISE EXCEPTION 'Requester could not read exactly their own attendance rows.';
  END IF;
  BEGIN
    INSERT INTO public."VisitAttendance" ("visitId", "userId", "confirmation", "confirmedAt")
    VALUES ('46000000-0000-4000-8000-0000000000f6', current_setting('nestmate.attendance_requester'), 'HAPPENED'::public."VisitAttendanceConfirmation", now());
  EXCEPTION WHEN invalid_parameter_value THEN
    early_denied := TRUE;
  END;
  BEGIN
    INSERT INTO public."VisitAttendance" ("visitId", "userId", "checkedInAt")
    VALUES ('46000000-0000-4000-8000-0000000000a7', current_setting('nestmate.attendance_requester'), now());
  EXCEPTION WHEN invalid_parameter_value THEN
    closed_denied := TRUE;
  END;
  IF NOT early_denied OR NOT closed_denied THEN
    RAISE EXCEPTION 'Timing or closed-listing attendance rule was not enforced.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"46000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '46000000-0000-4000-8000-0000000000a1', true);
INSERT INTO public."VisitAttendance" ("visitId", "userId", "checkedInAt")
VALUES ('46000000-0000-4000-8000-0000000000d4', current_setting('nestmate.attendance_owner'), now());
INSERT INTO public."VisitAttendance" ("visitId", "userId", "confirmation", "confirmedAt")
VALUES ('46000000-0000-4000-8000-0000000000e5', current_setting('nestmate.attendance_owner'), 'MISSED'::public."VisitAttendanceConfirmation", now());

DO $$
DECLARE
  final_change_denied BOOLEAN := FALSE;
  late_check_in_denied BOOLEAN := FALSE;
BEGIN
  IF (SELECT count(*) FROM public."VisitAttendance") <> 2 THEN
    RAISE EXCEPTION 'Owner could read another participant attendance row.';
  END IF;
  BEGIN
    UPDATE public."VisitAttendance"
    SET "confirmation" = 'CANCELLED'::public."VisitAttendanceConfirmation"
    WHERE "visitId" = '46000000-0000-4000-8000-0000000000e5';
  EXCEPTION WHEN insufficient_privilege THEN
    final_change_denied := TRUE;
  END;
  BEGIN
    UPDATE public."VisitAttendance"
    SET "checkedInAt" = now()
    WHERE "visitId" = '46000000-0000-4000-8000-0000000000e5';
  EXCEPTION WHEN insufficient_privilege THEN
    late_check_in_denied := TRUE;
  END;
  IF NOT final_change_denied OR NOT late_check_in_denied THEN
    RAISE EXCEPTION 'Final attendance could be changed or followed by a check-in.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"46000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '46000000-0000-4000-8000-0000000000c3', true);
DO $$
DECLARE
  outsider_denied BOOLEAN := FALSE;
BEGIN
  IF EXISTS (SELECT 1 FROM public."VisitAttendance") THEN
    RAISE EXCEPTION 'Outsider could read private attendance.';
  END IF;
  BEGIN
    INSERT INTO public."VisitAttendance" ("visitId", "userId", "checkedInAt")
    VALUES ('46000000-0000-4000-8000-0000000000d4', current_setting('nestmate.attendance_outsider'), now());
  EXCEPTION WHEN insufficient_privilege THEN
    outsider_denied := TRUE;
  END;
  IF NOT outsider_denied THEN
    RAISE EXCEPTION 'Outsider could create attendance.';
  END IF;
END;
$$;

RESET ROLE;
INSERT INTO public."UserBlock" ("blockerId", "blockedId")
VALUES (current_setting('nestmate.attendance_owner'), current_setting('nestmate.attendance_requester'));
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"46000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '46000000-0000-4000-8000-0000000000b2', true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."VisitAttendance") THEN
    RAISE EXCEPTION 'Attendance remained visible after a participant block.';
  END IF;
END;
$$;

ROLLBACK;
