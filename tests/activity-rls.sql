-- Rollback-only integration test for private interest-stage ownership and target visibility.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '51000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'activity-owner@example.test', '', now(), '{}', '{"full_name":"Activity Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '51000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'activity-target@example.test', '', now(), '{}', '{"full_name":"Activity Target"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '51000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'activity-blocked@example.test', '', now(), '{}', '{"full_name":"Activity Blocked"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '51000000-0000-4000-8000-0000000000d4', 'authenticated', 'authenticated', 'activity-suspended@example.test', '', now(), '{}', '{"full_name":"Activity Suspended"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '51000000-0000-4000-8000-0000000000e5', 'authenticated', 'authenticated', 'activity-outsider@example.test', '', now(), '{}', '{"full_name":"Activity Outsider"}', now(), now());

SELECT set_config('nestmate.activity_owner', (SELECT "id" FROM public."User" WHERE "authUserId" = '51000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.activity_target', (SELECT "id" FROM public."User" WHERE "authUserId" = '51000000-0000-4000-8000-0000000000b2'), true);
SELECT set_config('nestmate.activity_blocked', (SELECT "id" FROM public."User" WHERE "authUserId" = '51000000-0000-4000-8000-0000000000c3'), true);
SELECT set_config('nestmate.activity_suspended', (SELECT "id" FROM public."User" WHERE "authUserId" = '51000000-0000-4000-8000-0000000000d4'), true);
SELECT set_config('nestmate.activity_outsider', (SELECT "id" FROM public."User" WHERE "authUserId" = '51000000-0000-4000-8000-0000000000e5'), true);

INSERT INTO public."UserPreferences" ("id", "userId", "updatedAt") VALUES
  ('activity-pref-owner', current_setting('nestmate.activity_owner'), now()),
  ('activity-pref-target', current_setting('nestmate.activity_target'), now()),
  ('activity-pref-blocked', current_setting('nestmate.activity_blocked'), now()),
  ('activity-pref-suspended', current_setting('nestmate.activity_suspended'), now()),
  ('activity-pref-outsider', current_setting('nestmate.activity_outsider'), now())
ON CONFLICT ("userId") DO NOTHING;

INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('activity-test-city', 'Activity Test City', 'activity-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('activity-test-locality', 'Activity Test Locality', 'activity-test-locality', 'activity-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('activity-test-community', 'Activity Test Community', 'activity-test-community', 'activity-test-locality', now());
INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId",
  "communityId", "publishedAt", "updatedAt"
) VALUES (
  'activity-test-post',
  'ROOM_AVAILABLE'::public."PostType",
  'A room used only for activity RLS testing',
  'This temporary listing verifies private interest stages and target visibility.',
  current_setting('nestmate.activity_target'),
  'activity-test-community',
  now(),
  now()
);

INSERT INTO public."UserBlock" ("blockerId", "blockedId")
VALUES (current_setting('nestmate.activity_blocked'), current_setting('nestmate.activity_owner'));
INSERT INTO public."UserModerationState" (
  "userId", "status", "privateReason", "updatedById", "updatedAt"
) VALUES (
  current_setting('nestmate.activity_suspended'),
  'SUSPENDED'::public."UserModerationStatus",
  'Temporary activity RLS test state',
  current_setting('nestmate.activity_owner'),
  now()
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"51000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-0000000000a1', true);

INSERT INTO public."InterestActivity" ("userId", "targetType", "postId", "stage")
VALUES (current_setting('nestmate.activity_owner'), 'LISTING', 'activity-test-post', 'INTERESTED');
INSERT INTO public."InterestActivity" ("userId", "targetType", "targetUserId", "stage")
VALUES (current_setting('nestmate.activity_owner'), 'FLATMATE', current_setting('nestmate.activity_target'), 'SHORTLISTED');

DO $$
DECLARE
  self_denied BOOLEAN := FALSE;
  blocked_denied BOOLEAN := FALSE;
  suspended_denied BOOLEAN := FALSE;
  cross_owner_denied BOOLEAN := FALSE;
BEGIN
  IF (SELECT count(*) FROM public."InterestActivity") <> 2 THEN
    RAISE EXCEPTION 'The owner could not read visible activity.';
  END IF;
  BEGIN
    INSERT INTO public."InterestActivity" ("userId", "targetType", "targetUserId", "stage")
    VALUES (current_setting('nestmate.activity_owner'), 'FLATMATE', current_setting('nestmate.activity_owner'), 'INTERESTED');
  EXCEPTION WHEN insufficient_privilege THEN self_denied := TRUE;
  END;
  BEGIN
    INSERT INTO public."InterestActivity" ("userId", "targetType", "targetUserId", "stage")
    VALUES (current_setting('nestmate.activity_owner'), 'FLATMATE', current_setting('nestmate.activity_blocked'), 'INTERESTED');
  EXCEPTION WHEN insufficient_privilege THEN blocked_denied := TRUE;
  END;
  BEGIN
    INSERT INTO public."InterestActivity" ("userId", "targetType", "targetUserId", "stage")
    VALUES (current_setting('nestmate.activity_owner'), 'FLATMATE', current_setting('nestmate.activity_suspended'), 'INTERESTED');
  EXCEPTION WHEN insufficient_privilege THEN suspended_denied := TRUE;
  END;
  BEGIN
    INSERT INTO public."InterestActivity" ("userId", "targetType", "targetUserId", "stage")
    VALUES (current_setting('nestmate.activity_outsider'), 'FLATMATE', current_setting('nestmate.activity_target'), 'INTERESTED');
  EXCEPTION WHEN insufficient_privilege THEN cross_owner_denied := TRUE;
  END;
  IF NOT self_denied OR NOT blocked_denied OR NOT suspended_denied OR NOT cross_owner_denied THEN
    RAISE EXCEPTION 'One or more protected activity writes were accepted.';
  END IF;
END;
$$;

UPDATE public."InterestActivity" SET "stage" = 'CONTACTED', "updatedAt" = now()
WHERE "userId" = current_setting('nestmate.activity_owner') AND "postId" = 'activity-test-post';
DO $$
DECLARE
  target_swap_denied BOOLEAN := FALSE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."InterestActivity"
    WHERE "postId" = 'activity-test-post' AND "stage" = 'CONTACTED'
  ) THEN
    RAISE EXCEPTION 'The owner could not update an activity stage.';
  END IF;
  BEGIN
    UPDATE public."InterestActivity"
    SET "targetType" = 'FLATMATE',
        "postId" = NULL,
        "targetUserId" = current_setting('nestmate.activity_blocked')
    WHERE "postId" = 'activity-test-post';
  EXCEPTION WHEN insufficient_privilege THEN target_swap_denied := TRUE;
  END;
  IF NOT target_swap_denied THEN
    RAISE EXCEPTION 'An activity row could be changed to a blocked target.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"51000000-0000-4000-8000-0000000000e5","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-0000000000e5', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."InterestActivity") THEN
    RAISE EXCEPTION 'Another user could read private activity.';
  END IF;
  DELETE FROM public."InterestActivity" WHERE "userId" = current_setting('nestmate.activity_owner');
  IF FOUND THEN RAISE EXCEPTION 'Another user could delete private activity.'; END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"51000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-0000000000a1', true);
INSERT INTO public."UserBlock" ("blockerId", "blockedId")
VALUES (current_setting('nestmate.activity_owner'), current_setting('nestmate.activity_target'));
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."InterestActivity") THEN
    RAISE EXCEPTION 'Blocked listing or profile remained visible in activity.';
  END IF;
END;
$$;

ROLLBACK;
