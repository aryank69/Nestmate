-- Rollback-only integration test for private anti-spam flags and restrictions.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '47000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'spam-poster@example.test', '', now(), '{}', '{"full_name":"Spam Poster"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '47000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'spam-messenger@example.test', '', now(), '{}', '{"full_name":"Spam Messenger"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '47000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'spam-community@example.test', '', now(), '{}', '{"full_name":"Spam Community"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '47000000-0000-4000-8000-0000000000d4', 'authenticated', 'authenticated', 'spam-rapid@example.test', '', now(), '{}', '{"full_name":"Spam Rapid"}', now(), now());

SELECT set_config('nestmate.spam_poster', (SELECT "id" FROM public."User" WHERE "authUserId" = '47000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.spam_messenger', (SELECT "id" FROM public."User" WHERE "authUserId" = '47000000-0000-4000-8000-0000000000b2'), true);
SELECT set_config('nestmate.spam_community_user', (SELECT "id" FROM public."User" WHERE "authUserId" = '47000000-0000-4000-8000-0000000000c3'), true);
SELECT set_config('nestmate.spam_rapid_user', (SELECT "id" FROM public."User" WHERE "authUserId" = '47000000-0000-4000-8000-0000000000d4'), true);

INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('spam-test-city', 'Spam Test City', 'spam-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('spam-test-locality', 'Spam Test Locality', 'spam-test-locality', 'spam-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('spam-test-community', 'Spam Test Community', 'spam-test-community', 'spam-test-locality', now());

INSERT INTO public."CommunityMember" ("userId", "communityId") VALUES
  (current_setting('nestmate.spam_poster'), 'spam-test-community'),
  (current_setting('nestmate.spam_messenger'), 'spam-test-community'),
  (current_setting('nestmate.spam_community_user'), 'spam-test-community');

INSERT INTO public."Conversation" (
  "id", "participantOneId", "participantTwoId", "updatedAt"
)
SELECT
  '47000000-0000-4000-8000-0000000000e5',
  least(current_setting('nestmate.spam_poster'), current_setting('nestmate.spam_messenger')),
  greatest(current_setting('nestmate.spam_poster'), current_setting('nestmate.spam_messenger')),
  now();

-- Private detection is usable by trusted database code for a new-account signal.
DO $$
DECLARE
  activity_number INTEGER;
BEGIN
  FOR activity_number IN 1..15 LOOP
    PERFORM nestmate_private.record_safety_activity(
      current_setting('nestmate.spam_rapid_user'),
      'COMMUNITY_MESSAGE'::public."SafetyActivityScope",
      'COMMUNITY_MESSAGE'::public."ReportTargetType",
      gen_random_uuid()::TEXT,
      'A distinct rapid account test message number ' || activity_number::TEXT
    );
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public."SafetyFlag"
    WHERE "actorId" = current_setting('nestmate.spam_rapid_user')
      AND "category" = 'RAPID_ACCOUNT_ACTIVITY'::public."SafetyFlagCategory"
      AND "status" = 'OPEN'::public."SafetyFlagStatus"
      AND "restrictedUntil" > now()
  ) THEN
    RAISE EXCEPTION 'Rapid new-account activity was not flagged.';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"47000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '47000000-0000-4000-8000-0000000000a1', true);

DO $$
DECLARE
  activity_number INTEGER;
  restricted BOOLEAN := FALSE;
  activity_read_denied BOOLEAN := FALSE;
  flag_read_denied BOOLEAN := FALSE;
BEGIN
  FOR activity_number IN 1..5 LOOP
    INSERT INTO public."Post" (
      "id", "type", "title", "description", "authorId", "communityId",
      "availabilityStatus", "publishedAt", "updatedAt"
    ) VALUES (
      'spam-post-' || activity_number::TEXT,
      'ROOM_AVAILABLE'::public."PostType",
      'Distinct safety listing ' || activity_number::TEXT,
      'A unique listing description used to test short-period posting safeguards ' || activity_number::TEXT,
      current_setting('nestmate.spam_poster'),
      'spam-test-community',
      'AVAILABLE'::public."ListingAvailabilityStatus",
      now(),
      now()
    );
  END LOOP;

  BEGIN
    INSERT INTO public."Post" (
      "id", "type", "title", "description", "authorId", "communityId",
      "availabilityStatus", "publishedAt", "updatedAt"
    ) VALUES (
      'spam-post-restricted',
      'ROOM_AVAILABLE'::public."PostType",
      'Restricted safety listing',
      'This listing should be rejected while the temporary scoped restriction is active.',
      current_setting('nestmate.spam_poster'),
      'spam-test-community',
      'AVAILABLE'::public."ListingAvailabilityStatus",
      now(),
      now()
    );
  EXCEPTION WHEN insufficient_privilege THEN
    restricted := TRUE;
  END;

  BEGIN
    EXECUTE 'SELECT * FROM public."SafetyActivity" LIMIT 1';
  EXCEPTION WHEN insufficient_privilege THEN
    activity_read_denied := TRUE;
  END;
  BEGIN
    EXECUTE 'SELECT * FROM public."SafetyFlag" LIMIT 1';
  EXCEPTION WHEN insufficient_privilege THEN
    flag_read_denied := TRUE;
  END;

  IF NOT restricted THEN
    RAISE EXCEPTION 'Burst posting was not temporarily restricted.';
  END IF;
  IF NOT activity_read_denied OR NOT flag_read_denied THEN
    RAISE EXCEPTION 'Private detection details were exposed to a user.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"47000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '47000000-0000-4000-8000-0000000000b2', true);

DO $$
DECLARE
  message_number INTEGER;
  restricted BOOLEAN := FALSE;
BEGIN
  FOR message_number IN 1..3 LOOP
    INSERT INTO public."Message" ("conversationId", "senderId", "body")
    VALUES (
      '47000000-0000-4000-8000-0000000000e5',
      current_setting('nestmate.spam_messenger'),
      'The same repeated direct message for safeguard testing.'
    );
  END LOOP;

  BEGIN
    INSERT INTO public."Message" ("conversationId", "senderId", "body")
    VALUES (
      '47000000-0000-4000-8000-0000000000e5',
      current_setting('nestmate.spam_messenger'),
      'One more direct message while temporarily restricted.'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    restricted := TRUE;
  END;

  IF NOT restricted THEN
    RAISE EXCEPTION 'Repeated direct messages were not restricted.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"47000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '47000000-0000-4000-8000-0000000000c3', true);

DO $$
DECLARE
  message_number INTEGER;
  restricted BOOLEAN := FALSE;
BEGIN
  FOR message_number IN 1..3 LOOP
    INSERT INTO public."CommunityMessage" ("communityId", "senderId", "body")
    VALUES (
      'spam-test-community',
      current_setting('nestmate.spam_community_user'),
      'Please contact +91 98765 43210 about option ' || message_number::TEXT
    );
  END LOOP;

  BEGIN
    INSERT INTO public."CommunityMessage" ("communityId", "senderId", "body")
    VALUES (
      'spam-test-community',
      current_setting('nestmate.spam_community_user'),
      'A follow-up message while temporarily restricted.'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    restricted := TRUE;
  END;

  IF NOT restricted THEN
    RAISE EXCEPTION 'Repeated contact details were not restricted.';
  END IF;
END;
$$;

-- The original participant can report a real message, feeding the same private
-- moderation flag queue without receiving access to its internal details.
SELECT set_config('request.jwt.claims', '{"sub":"47000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '47000000-0000-4000-8000-0000000000a1', true);

INSERT INTO public."Report" (
  "reporterId", "reportedUserId", "targetType", "targetId", "reason"
)
SELECT
  current_setting('nestmate.spam_poster'),
  current_setting('nestmate.spam_messenger'),
  'DIRECT_MESSAGE'::public."ReportTargetType",
  message."id"::TEXT,
  'SPAM'::public."ReportReason"
FROM public."Message" AS message
WHERE message."senderId" = current_setting('nestmate.spam_messenger')
ORDER BY message."createdAt"
LIMIT 1;

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."SafetyFlag"
    WHERE "actorId" = current_setting('nestmate.spam_poster')
      AND "category" = 'BURST_ACTIVITY'::public."SafetyFlagCategory"
      AND "scope" = 'POST'::public."SafetyActivityScope"
      AND "restrictedUntil" > now()
  ) THEN
    RAISE EXCEPTION 'Burst posting did not produce a private moderation flag.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."SafetyFlag"
    WHERE "actorId" = current_setting('nestmate.spam_messenger')
      AND "category" = 'DUPLICATE_CONTENT'::public."SafetyFlagCategory"
  ) THEN
    RAISE EXCEPTION 'Repeated direct messages did not produce a flag.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."SafetyFlag"
    WHERE "actorId" = current_setting('nestmate.spam_community_user')
      AND "category" = 'REPEATED_CONTACT'::public."SafetyFlagCategory"
  ) THEN
    RAISE EXCEPTION 'Repeated contact details did not produce a flag.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."SafetyFlag"
    WHERE "actorId" = current_setting('nestmate.spam_messenger')
      AND "category" = 'USER_REPORT'::public."SafetyFlagCategory"
      AND "relatedReportId" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A user report did not enter the moderation flag queue.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."User"
    WHERE "id" IN (
      current_setting('nestmate.spam_poster'),
      current_setting('nestmate.spam_messenger'),
      current_setting('nestmate.spam_community_user'),
      current_setting('nestmate.spam_rapid_user')
    )
  ) THEN
    RAISE EXCEPTION 'Safeguards removed or banned a user instead of flagging.';
  END IF;
END;
$$;

ROLLBACK;
