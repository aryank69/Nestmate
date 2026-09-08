-- Rollback-only integration test for recent-view ownership and block privacy.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '41000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'recent-a@example.test', '', now(), '{}', '{"full_name":"Recent A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '41000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'recent-b@example.test', '', now(), '{}', '{"full_name":"Recent B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '41000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'recent-target@example.test', '', now(), '{}', '{"full_name":"Recent Target"}', now(), now());

SELECT set_config(
  'nestmate.recent_user_a',
  (SELECT "id" FROM public."User" WHERE "authUserId" = '41000000-0000-4000-8000-0000000000a1'),
  true
);
SELECT set_config(
  'nestmate.recent_user_b',
  (SELECT "id" FROM public."User" WHERE "authUserId" = '41000000-0000-4000-8000-0000000000b2'),
  true
);
SELECT set_config(
  'nestmate.recent_target',
  (SELECT "id" FROM public."User" WHERE "authUserId" = '41000000-0000-4000-8000-0000000000c3'),
  true
);

INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('recent-test-city', 'Recent Test City', 'recent-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('recent-test-locality', 'Recent Test Locality', 'recent-test-locality', 'recent-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('recent-test-community', 'Recent Test Community', 'recent-test-community', 'recent-test-locality', now());
INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId",
  "communityId", "publishedAt", "updatedAt"
)
VALUES (
  'recent-test-post',
  'ROOM_AVAILABLE'::public."PostType",
  'A room used only for recent-view RLS testing',
  'This temporary listing verifies private, deduplicated viewing history.',
  current_setting('nestmate.recent_target'),
  'recent-test-community',
  now(),
  now()
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"41000000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);

INSERT INTO public."RecentView" ("viewerId", "postId", "viewedAt")
VALUES (current_setting('nestmate.recent_user_a'), 'recent-test-post', '2026-09-04 08:00:00+00');
INSERT INTO public."RecentView" ("viewerId", "viewedUserId", "viewedAt")
VALUES (
  current_setting('nestmate.recent_user_a'),
  current_setting('nestmate.recent_target'),
  '2026-09-04 08:05:00+00'
);
INSERT INTO public."RecentView" ("viewerId", "postId", "viewedAt")
VALUES (current_setting('nestmate.recent_user_a'), 'recent-test-post', '2026-09-04 09:00:00+00')
ON CONFLICT ("viewerId", "postId")
DO UPDATE SET "viewedAt" = EXCLUDED."viewedAt";

DO $$
DECLARE
  cross_insert_denied BOOLEAN := FALSE;
BEGIN
  IF (SELECT count(*) FROM public."RecentView") <> 2 THEN
    RAISE EXCEPTION 'Owner history was not readable or deduplicated.';
  END IF;
  IF (
    SELECT "viewedAt" <> '2026-09-04 09:00:00+00'::TIMESTAMPTZ
    FROM public."RecentView"
    WHERE "postId" = 'recent-test-post'
  ) THEN
    RAISE EXCEPTION 'Duplicate listing view did not refresh its timestamp.';
  END IF;

  BEGIN
    INSERT INTO public."RecentView" ("viewerId", "postId")
    VALUES (current_setting('nestmate.recent_user_b'), 'recent-test-post');
  EXCEPTION WHEN insufficient_privilege THEN
    cross_insert_denied := TRUE;
  END;
  IF NOT cross_insert_denied THEN
    RAISE EXCEPTION 'A user could create history for another account.';
  END IF;
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"41000000-0000-4000-8000-0000000000b2","role":"authenticated"}',
  true
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."RecentView") THEN
    RAISE EXCEPTION 'Another user could read private viewing history.';
  END IF;
  DELETE FROM public."RecentView"
  WHERE "viewerId" = current_setting('nestmate.recent_user_a');
  IF FOUND THEN
    RAISE EXCEPTION 'Another user could delete the owner history.';
  END IF;
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"41000000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);
INSERT INTO public."UserBlock" ("blockerId", "blockedId")
VALUES (
  current_setting('nestmate.recent_user_a'),
  current_setting('nestmate.recent_target')
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."RecentView") THEN
    RAISE EXCEPTION 'Blocked listing or profile remained visible in history.';
  END IF;
END;
$$;

SELECT public.clear_recent_views();

RESET ROLE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public."RecentView"
    WHERE "viewerId" = current_setting('nestmate.recent_user_a')
  ) THEN
    RAISE EXCEPTION 'The owner could not clear hidden history rows.';
  END IF;
END;
$$;

ROLLBACK;
