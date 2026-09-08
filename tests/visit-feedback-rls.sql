-- Rollback-only integration test for private post-visit feedback.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '47000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'feedback-owner@example.test', '', now(), '{}', '{"full_name":"Feedback Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '47000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'feedback-requester@example.test', '', now(), '{}', '{"full_name":"Feedback Requester"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '47000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'feedback-outsider@example.test', '', now(), '{}', '{"full_name":"Feedback Outsider"}', now(), now());

SELECT set_config('nestmate.feedback_owner', (SELECT "id" FROM public."User" WHERE "authUserId" = '47000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.feedback_requester', (SELECT "id" FROM public."User" WHERE "authUserId" = '47000000-0000-4000-8000-0000000000b2'), true);
SELECT set_config('nestmate.feedback_outsider', (SELECT "id" FROM public."User" WHERE "authUserId" = '47000000-0000-4000-8000-0000000000c3'), true);

INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('feedback-test-city', 'Feedback Test City', 'feedback-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('feedback-test-locality', 'Feedback Test Locality', 'feedback-test-locality', 'feedback-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('feedback-test-community', 'Feedback Test Community', 'feedback-test-community', 'feedback-test-locality', now());
INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId", "communityId",
  "availabilityStatus", "publishedAt", "updatedAt"
)
VALUES (
  'feedback-test-post', 'ROOM_AVAILABLE'::public."PostType", 'Feedback test room',
  'Temporary feedback RLS listing.', current_setting('nestmate.feedback_owner'),
  'feedback-test-community', 'AVAILABLE'::public."ListingAvailabilityStatus", now(), now()
);

ALTER TABLE public."VisitRequest" DISABLE TRIGGER USER;
INSERT INTO public."VisitRequest" (
  "id", "postId", "requesterId", "ownerId", "status", "requestedAt",
  "scheduledAt", "respondedAt", "createdAt", "updatedAt"
)
VALUES
  ('47000000-0000-4000-8000-0000000000d4', 'feedback-test-post', current_setting('nestmate.feedback_requester'), current_setting('nestmate.feedback_owner'), 'ACCEPTED'::public."VisitRequestStatus", now() - interval '3 hours', now() - interval '2 hours', now() - interval '3 hours', now() - interval '1 day', now()),
  ('47000000-0000-4000-8000-0000000000e5', 'feedback-test-post', current_setting('nestmate.feedback_requester'), current_setting('nestmate.feedback_owner'), 'ACCEPTED'::public."VisitRequestStatus", now(), now() + interval '2 days', now(), now(), now());
ALTER TABLE public."VisitRequest" ENABLE TRIGGER USER;

ALTER TABLE public."VisitAttendance" DISABLE TRIGGER USER;
INSERT INTO public."VisitAttendance" (
  "visitId", "userId", "confirmation", "confirmedAt", "updatedAt"
)
VALUES
  ('47000000-0000-4000-8000-0000000000d4', current_setting('nestmate.feedback_requester'), 'HAPPENED'::public."VisitAttendanceConfirmation", now() - interval '1 hour', now()),
  ('47000000-0000-4000-8000-0000000000d4', current_setting('nestmate.feedback_owner'), 'HAPPENED'::public."VisitAttendanceConfirmation", now() - interval '1 hour', now()),
  ('47000000-0000-4000-8000-0000000000e5', current_setting('nestmate.feedback_requester'), 'HAPPENED'::public."VisitAttendanceConfirmation", now(), now());
ALTER TABLE public."VisitAttendance" ENABLE TRIGGER USER;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"47000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '47000000-0000-4000-8000-0000000000b2', true);

INSERT INTO public."VisitFeedback" (
  "visitId", "userId", "propertyAccuracy", "cleanliness",
  "communicationQuality", "safetyComfort", "overallExperience", "privateNote"
)
VALUES (
  '47000000-0000-4000-8000-0000000000d4', current_setting('nestmate.feedback_requester'),
  5, 4, 5, 4, 5, '  Requester private note  '
);
UPDATE public."VisitFeedback"
SET "cleanliness" = 5, "privateNote" = 'Updated requester note'
WHERE "visitId" = '47000000-0000-4000-8000-0000000000d4';

DO $$
DECLARE
  future_denied BOOLEAN := FALSE;
BEGIN
  IF (SELECT count(*) FROM public."VisitFeedback") <> 1 THEN
    RAISE EXCEPTION 'Requester could not read exactly their own feedback.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."VisitFeedback"
    WHERE "cleanliness" = 5 AND "privateNote" = 'Updated requester note'
  ) THEN
    RAISE EXCEPTION 'Requester could not update their own feedback.';
  END IF;
  BEGIN
    INSERT INTO public."VisitFeedback" (
      "visitId", "userId", "propertyAccuracy", "cleanliness",
      "communicationQuality", "safetyComfort", "overallExperience"
    ) VALUES (
      '47000000-0000-4000-8000-0000000000e5', current_setting('nestmate.feedback_requester'),
      5, 5, 5, 5, 5
    );
  EXCEPTION WHEN insufficient_privilege THEN
    future_denied := TRUE;
  END;
  IF NOT future_denied THEN
    RAISE EXCEPTION 'A future visit accepted feedback.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"47000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '47000000-0000-4000-8000-0000000000a1', true);
INSERT INTO public."VisitFeedback" (
  "visitId", "userId", "propertyAccuracy", "cleanliness",
  "communicationQuality", "safetyComfort", "overallExperience", "privateNote"
)
VALUES (
  '47000000-0000-4000-8000-0000000000d4', current_setting('nestmate.feedback_owner'),
  4, 4, 5, 5, 4, 'Owner private note'
);

DO $$
DECLARE
  other_edit_denied BOOLEAN := FALSE;
BEGIN
  IF (SELECT count(*) FROM public."VisitFeedback") <> 1 THEN
    RAISE EXCEPTION 'Owner could read requester feedback.';
  END IF;
  BEGIN
    UPDATE public."VisitFeedback"
    SET "cleanliness" = 1
    WHERE "userId" = current_setting('nestmate.feedback_requester');
    IF FOUND THEN other_edit_denied := FALSE; ELSE other_edit_denied := TRUE; END IF;
  END;
  IF NOT other_edit_denied THEN
    RAISE EXCEPTION 'Owner could update requester feedback.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"47000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '47000000-0000-4000-8000-0000000000c3', true);
DO $$
DECLARE
  outsider_denied BOOLEAN := FALSE;
BEGIN
  IF EXISTS (SELECT 1 FROM public."VisitFeedback") THEN
    RAISE EXCEPTION 'Outsider could read private feedback.';
  END IF;
  BEGIN
    INSERT INTO public."VisitFeedback" (
      "visitId", "userId", "propertyAccuracy", "cleanliness",
      "communicationQuality", "safetyComfort", "overallExperience"
    ) VALUES (
      '47000000-0000-4000-8000-0000000000d4', current_setting('nestmate.feedback_outsider'),
      5, 5, 5, 5, 5
    );
  EXCEPTION WHEN insufficient_privilege THEN
    outsider_denied := TRUE;
  END;
  IF NOT outsider_denied THEN
    RAISE EXCEPTION 'Outsider could submit visit feedback.';
  END IF;
END;
$$;

RESET ROLE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM nestmate_private.visit_feedback_listing_aggregate
    WHERE "postId" = 'feedback-test-post'
  ) THEN
    RAISE EXCEPTION 'Aggregate exposed fewer than three feedback responses.';
  END IF;
  IF has_table_privilege('authenticated', 'nestmate_private.visit_feedback_listing_aggregate', 'SELECT') THEN
    RAISE EXCEPTION 'Authenticated role can query the private aggregate.';
  END IF;
END;
$$;

INSERT INTO public."UserBlock" ("blockerId", "blockedId")
VALUES (current_setting('nestmate.feedback_owner'), current_setting('nestmate.feedback_requester'));
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"47000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '47000000-0000-4000-8000-0000000000b2', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."VisitFeedback") THEN
    RAISE EXCEPTION 'Feedback remained visible after a participant block.';
  END IF;
END;
$$;

ROLLBACK;
