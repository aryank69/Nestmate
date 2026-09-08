-- Rollback-only integration test for verified listing reality feedback.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '48000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'reality-owner@example.test', '', now(), '{}', '{"full_name":"Reality Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '48000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'reality-visitor-one@example.test', '', now(), '{}', '{"full_name":"Reality Visitor One"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '48000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'reality-visitor-two@example.test', '', now(), '{}', '{"full_name":"Reality Visitor Two"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '48000000-0000-4000-8000-0000000000b3', 'authenticated', 'authenticated', 'reality-visitor-three@example.test', '', now(), '{}', '{"full_name":"Reality Visitor Three"}', now(), now());

SELECT set_config('nestmate.reality_owner', (SELECT "id" FROM public."User" WHERE "authUserId" = '48000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.reality_visitor_one', (SELECT "id" FROM public."User" WHERE "authUserId" = '48000000-0000-4000-8000-0000000000b1'), true);
SELECT set_config('nestmate.reality_visitor_two', (SELECT "id" FROM public."User" WHERE "authUserId" = '48000000-0000-4000-8000-0000000000b2'), true);
SELECT set_config('nestmate.reality_visitor_three', (SELECT "id" FROM public."User" WHERE "authUserId" = '48000000-0000-4000-8000-0000000000b3'), true);

INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('reality-test-city', 'Reality Test City', 'reality-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('reality-test-locality', 'Reality Test Locality', 'reality-test-locality', 'reality-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('reality-test-community', 'Reality Test Community', 'reality-test-community', 'reality-test-locality', now());
INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId", "communityId",
  "availabilityStatus", "publishedAt", "updatedAt"
)
VALUES (
  'reality-test-post', 'ROOM_AVAILABLE'::public."PostType", 'Reality test room',
  'Temporary reality score RLS listing.', current_setting('nestmate.reality_owner'),
  'reality-test-community', 'AVAILABLE'::public."ListingAvailabilityStatus", now(), now()
);

ALTER TABLE public."VisitRequest" DISABLE TRIGGER USER;
INSERT INTO public."VisitRequest" (
  "id", "postId", "requesterId", "ownerId", "status", "requestedAt",
  "scheduledAt", "respondedAt", "createdAt", "updatedAt"
)
VALUES
  ('48000000-0000-4000-8000-0000000000d1', 'reality-test-post', current_setting('nestmate.reality_visitor_one'), current_setting('nestmate.reality_owner'), 'ACCEPTED'::public."VisitRequestStatus", now() - interval '4 hours', now() - interval '2 hours', now() - interval '3 hours', now() - interval '1 day', now()),
  ('48000000-0000-4000-8000-0000000000d2', 'reality-test-post', current_setting('nestmate.reality_visitor_two'), current_setting('nestmate.reality_owner'), 'ACCEPTED'::public."VisitRequestStatus", now() - interval '4 hours', now() - interval '2 hours', now() - interval '3 hours', now() - interval '1 day', now()),
  ('48000000-0000-4000-8000-0000000000d3', 'reality-test-post', current_setting('nestmate.reality_visitor_three'), current_setting('nestmate.reality_owner'), 'ACCEPTED'::public."VisitRequestStatus", now() - interval '4 hours', now() - interval '2 hours', now() - interval '3 hours', now() - interval '1 day', now());
ALTER TABLE public."VisitRequest" ENABLE TRIGGER USER;

ALTER TABLE public."VisitAttendance" DISABLE TRIGGER USER;
INSERT INTO public."VisitAttendance" (
  "visitId", "userId", "confirmation", "confirmedAt", "updatedAt"
)
VALUES
  ('48000000-0000-4000-8000-0000000000d1', current_setting('nestmate.reality_visitor_one'), 'HAPPENED'::public."VisitAttendanceConfirmation", now(), now()),
  ('48000000-0000-4000-8000-0000000000d1', current_setting('nestmate.reality_owner'), 'HAPPENED'::public."VisitAttendanceConfirmation", now(), now()),
  ('48000000-0000-4000-8000-0000000000d2', current_setting('nestmate.reality_visitor_two'), 'HAPPENED'::public."VisitAttendanceConfirmation", now(), now()),
  ('48000000-0000-4000-8000-0000000000d2', current_setting('nestmate.reality_owner'), 'HAPPENED'::public."VisitAttendanceConfirmation", now(), now()),
  ('48000000-0000-4000-8000-0000000000d3', current_setting('nestmate.reality_visitor_three'), 'HAPPENED'::public."VisitAttendanceConfirmation", now(), now()),
  ('48000000-0000-4000-8000-0000000000d3', current_setting('nestmate.reality_owner'), 'HAPPENED'::public."VisitAttendanceConfirmation", now(), now());
ALTER TABLE public."VisitAttendance" ENABLE TRIGGER USER;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"48000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '48000000-0000-4000-8000-0000000000b1', true);
INSERT INTO public."ListingRealityFeedback" (
  "visitId", "postId", "reviewerId", "photosAccuracy", "costAccuracy",
  "amenitiesAccuracy", "conditionAccuracy", "locationAccuracy",
  "descriptionAccuracy", "privateNote"
)
VALUES (
  '48000000-0000-4000-8000-0000000000d1', 'reality-test-post', current_setting('nestmate.reality_visitor_one'),
  5, 4, 4, 3, 5, 4, 'Visitor one private note'
);

SELECT set_config('request.jwt.claims', '{"sub":"48000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '48000000-0000-4000-8000-0000000000a1', true);
DO $$
DECLARE owner_denied BOOLEAN := FALSE;
BEGIN
  IF EXISTS (SELECT 1 FROM public."ListingRealityFeedback") THEN
    RAISE EXCEPTION 'Listing owner could read a visitor raw rating.';
  END IF;
  BEGIN
    INSERT INTO public."ListingRealityFeedback" (
      "visitId", "postId", "reviewerId", "photosAccuracy", "costAccuracy",
      "amenitiesAccuracy", "conditionAccuracy", "locationAccuracy", "descriptionAccuracy"
    ) VALUES (
      '48000000-0000-4000-8000-0000000000d2', 'reality-test-post', current_setting('nestmate.reality_owner'),
      5, 5, 5, 5, 5, 5
    );
  EXCEPTION WHEN insufficient_privilege THEN owner_denied := TRUE;
  END;
  IF NOT owner_denied THEN RAISE EXCEPTION 'Listing owner could rate their own listing.'; END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"48000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '48000000-0000-4000-8000-0000000000b2', true);
INSERT INTO public."ListingRealityFeedback" (
  "visitId", "postId", "reviewerId", "photosAccuracy", "costAccuracy",
  "amenitiesAccuracy", "conditionAccuracy", "locationAccuracy", "descriptionAccuracy"
)
VALUES (
  '48000000-0000-4000-8000-0000000000d2', 'reality-test-post', current_setting('nestmate.reality_visitor_two'),
  4, 4, 3, 4, 5, 4
);
DO $$
BEGIN
  IF (SELECT count(*) FROM public."ListingRealityFeedback") <> 1 THEN
    RAISE EXCEPTION 'A reviewer could access another visitor raw rating.';
  END IF;
END;
$$;

RESET ROLE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM nestmate_private.listing_reality_aggregate
    WHERE "postId" = 'reality-test-post'
  ) THEN
    RAISE EXCEPTION 'Reality score exposed fewer than three verified responses.';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"48000000-0000-4000-8000-0000000000b3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '48000000-0000-4000-8000-0000000000b3', true);
INSERT INTO public."ListingRealityFeedback" (
  "visitId", "postId", "reviewerId", "photosAccuracy", "costAccuracy",
  "amenitiesAccuracy", "conditionAccuracy", "locationAccuracy", "descriptionAccuracy"
)
VALUES (
  '48000000-0000-4000-8000-0000000000d3', 'reality-test-post', current_setting('nestmate.reality_visitor_three'),
  3, 5, 4, 4, 4, 5
);

RESET ROLE;
DO $$
DECLARE response_count INTEGER;
BEGIN
  SELECT "responseCount" INTO response_count
  FROM nestmate_private.listing_reality_aggregate
  WHERE "postId" = 'reality-test-post';
  IF response_count <> 3 THEN
    RAISE EXCEPTION 'Three verified visits did not produce the anonymous aggregate.';
  END IF;
  IF has_table_privilege('authenticated', 'nestmate_private.listing_reality_aggregate', 'SELECT') THEN
    RAISE EXCEPTION 'Authenticated clients can query the private aggregate.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'nestmate_private'
      AND table_name = 'listing_reality_aggregate'
      AND column_name IN ('reviewerId', 'visitId', 'privateNote')
  ) THEN
    RAISE EXCEPTION 'The public score aggregate contains identifying or private fields.';
  END IF;
END;
$$;

ROLLBACK;
