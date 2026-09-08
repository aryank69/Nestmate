-- Rollback-only integration test for private post-visit outcomes.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '45000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'outcome-owner@example.test', '', now(), '{}', '{"full_name":"Outcome Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '45000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'outcome-requester@example.test', '', now(), '{}', '{"full_name":"Outcome Requester"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '45000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'outcome-outsider@example.test', '', now(), '{}', '{"full_name":"Outcome Outsider"}', now(), now());

SELECT set_config('nestmate.outcome_owner', (SELECT "id" FROM public."User" WHERE "authUserId" = '45000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.outcome_requester', (SELECT "id" FROM public."User" WHERE "authUserId" = '45000000-0000-4000-8000-0000000000b2'), true);
SELECT set_config('nestmate.outcome_outsider', (SELECT "id" FROM public."User" WHERE "authUserId" = '45000000-0000-4000-8000-0000000000c3'), true);

INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('outcome-test-city', 'Outcome Test City', 'outcome-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('outcome-test-locality', 'Outcome Test Locality', 'outcome-test-locality', 'outcome-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('outcome-test-community', 'Outcome Test Community', 'outcome-test-community', 'outcome-test-locality', now());
INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId", "communityId",
  "availabilityStatus", "publishedAt", "updatedAt"
)
VALUES (
  'outcome-test-post',
  'ROOM_AVAILABLE'::public."PostType",
  'Outcome test room',
  'Temporary outcome RLS listing.',
  current_setting('nestmate.outcome_owner'),
  'outcome-test-community',
  'AVAILABLE'::public."ListingAvailabilityStatus",
  now(),
  now()
);

ALTER TABLE public."VisitRequest" DISABLE TRIGGER USER;
INSERT INTO public."VisitRequest" (
  "id", "postId", "requesterId", "ownerId", "status", "requestedAt",
  "scheduledAt", "respondedAt", "createdAt", "updatedAt"
)
VALUES
  (
    '45000000-0000-4000-8000-0000000000d4',
    'outcome-test-post',
    current_setting('nestmate.outcome_requester'),
    current_setting('nestmate.outcome_owner'),
    'ACCEPTED'::public."VisitRequestStatus",
    now() - interval '2 hours',
    now() - interval '1 hour',
    now() - interval '3 hours',
    now() - interval '1 day',
    now() - interval '3 hours'
  ),
  (
    '45000000-0000-4000-8000-0000000000e5',
    'outcome-test-post',
    current_setting('nestmate.outcome_requester'),
    current_setting('nestmate.outcome_owner'),
    'ACCEPTED'::public."VisitRequestStatus",
    now() + interval '1 day',
    now() + interval '2 days',
    now(),
    now(),
    now()
  );
ALTER TABLE public."VisitRequest" ENABLE TRIGGER USER;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"45000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '45000000-0000-4000-8000-0000000000b2', true);

INSERT INTO public."VisitOutcome" (
  "visitId", "userId", "outcome", "privateNote"
) VALUES (
  '45000000-0000-4000-8000-0000000000d4',
  current_setting('nestmate.outcome_requester'),
  'INTERESTED'::public."VisitOutcomeType",
  'Private requester note'
);

DO $$
DECLARE
  future_denied BOOLEAN := FALSE;
BEGIN
  IF (SELECT count(*) FROM public."VisitOutcome") <> 1 THEN
    RAISE EXCEPTION 'Requester could not read exactly their own outcome.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."VisitOutcome"
    WHERE "userId" = current_setting('nestmate.outcome_owner')
  ) THEN
    RAISE EXCEPTION 'Requester could read the owner outcome.';
  END IF;

  BEGIN
    INSERT INTO public."VisitOutcome" (
      "visitId", "userId", "outcome"
    ) VALUES (
      '45000000-0000-4000-8000-0000000000e5',
      current_setting('nestmate.outcome_requester'),
      'INTERESTED'::public."VisitOutcomeType"
    );
  EXCEPTION WHEN insufficient_privilege THEN
    future_denied := TRUE;
  END;
  IF NOT future_denied THEN
    RAISE EXCEPTION 'A future visit accepted an outcome.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"45000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '45000000-0000-4000-8000-0000000000c3', true);

DO $$
DECLARE
  outsider_insert_denied BOOLEAN := FALSE;
BEGIN
  IF EXISTS (SELECT 1 FROM public."VisitOutcome") THEN
    RAISE EXCEPTION 'Outsider could read private outcomes.';
  END IF;
  BEGIN
    INSERT INTO public."VisitOutcome" (
      "visitId", "userId", "outcome"
    ) VALUES (
      '45000000-0000-4000-8000-0000000000d4',
      current_setting('nestmate.outcome_outsider'),
      'FINALIZED'::public."VisitOutcomeType"
    );
  EXCEPTION WHEN insufficient_privilege THEN
    outsider_insert_denied := TRUE;
  END;
  IF NOT outsider_insert_denied THEN
    RAISE EXCEPTION 'Outsider could record an outcome.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"45000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '45000000-0000-4000-8000-0000000000a1', true);

INSERT INTO public."VisitOutcome" (
  "visitId", "userId", "outcome", "privateNote"
) VALUES (
  '45000000-0000-4000-8000-0000000000d4',
  current_setting('nestmate.outcome_owner'),
  'FINALIZED'::public."VisitOutcomeType",
  'Private owner note'
);

DO $$
BEGIN
  IF (SELECT count(*) FROM public."VisitOutcome") <> 1 THEN
    RAISE EXCEPTION 'Owner could read another participant outcome.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."Post"
    WHERE "id" = 'outcome-test-post'
      AND "availabilityStatus" = 'RESERVED'::public."ListingAvailabilityStatus"
  ) THEN
    RAISE EXCEPTION 'One finalized outcome did not reserve the listing.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"45000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '45000000-0000-4000-8000-0000000000b2', true);

UPDATE public."VisitOutcome"
SET "outcome" = 'FINALIZED'::public."VisitOutcomeType"
WHERE "visitId" = '45000000-0000-4000-8000-0000000000d4'
  AND "userId" = current_setting('nestmate.outcome_requester');

DO $$
BEGIN
  IF (SELECT count(*) FROM public."VisitOutcome") <> 1 THEN
    RAISE EXCEPTION 'Requester could read another participant outcome after update.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."Notification"
    WHERE "resourceId" LIKE 'visit-outcome:%'
  ) THEN
    RAISE EXCEPTION 'A private outcome leaked through notifications.';
  END IF;
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."Post"
    WHERE "id" = 'outcome-test-post'
      AND "availabilityStatus" = 'CLOSED'::public."ListingAvailabilityStatus"
  ) THEN
    RAISE EXCEPTION 'Mutual finalization did not close the listing.';
  END IF;
END;
$$;

ROLLBACK;
