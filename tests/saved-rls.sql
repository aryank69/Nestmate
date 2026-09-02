-- Rollback-only integration test for saved-post and saved-search ownership.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'saved-a@example.test', '', now(), '{}', '{"full_name":"Saved A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'saved-b@example.test', '', now(), '{}', '{"full_name":"Saved B"}', now(), now());

SELECT set_config(
  'nestmate.saved_user_a',
  (SELECT "id" FROM public."User" WHERE "authUserId" = '30000000-0000-4000-8000-0000000000a1'),
  true
);
SELECT set_config(
  'nestmate.saved_user_b',
  (SELECT "id" FROM public."User" WHERE "authUserId" = '30000000-0000-4000-8000-0000000000b2'),
  true
);

INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('saved-test-city', 'Saved Test City', 'saved-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('saved-test-locality', 'Saved Test Locality', 'saved-test-locality', 'saved-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('saved-test-community', 'Saved Test Community', 'saved-test-community', 'saved-test-locality', now());
INSERT INTO public."Post" (
  "id", "type", "title", "description", "monthlyAmountMin",
  "authorId", "communityId", "publishedAt", "updatedAt"
)
VALUES (
  'saved-test-post',
  'ROOM_AVAILABLE'::public."PostType",
  'A room used only for saved-item RLS testing',
  'This temporary post verifies that favorites remain private to the authenticated owner.',
  18000,
  current_setting('nestmate.saved_user_a'),
  'saved-test-community',
  now(),
  now()
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);

INSERT INTO public."SavedPost" ("userId", "postId")
VALUES (current_setting('nestmate.saved_user_a'), 'saved-test-post');
INSERT INTO public."SavedSearch" ("userId", "name", "kind", "path", "filters")
VALUES (
  current_setting('nestmate.saved_user_a'),
  'A private search',
  'COMMUNITY_POSTS'::public."SavedSearchKind",
  '/community/saved-test-city/saved-test-locality?max=20000',
  '{"version":1,"budgetMax":20000}'::jsonb
);

DO $$
DECLARE
  cross_insert_denied BOOLEAN := FALSE;
BEGIN
  IF (SELECT count(*) FROM public."SavedPost") <> 1
    OR (SELECT count(*) FROM public."SavedSearch") <> 1 THEN
    RAISE EXCEPTION 'The owner could not read their saved records.';
  END IF;

  BEGIN
    INSERT INTO public."SavedSearch" ("userId", "name", "kind", "path", "filters")
    VALUES (
      current_setting('nestmate.saved_user_b'),
      'Forbidden search',
      'PEOPLE'::public."SavedSearchKind",
      '/flatmates',
      '{"version":1}'::jsonb
    );
  EXCEPTION WHEN insufficient_privilege THEN
    cross_insert_denied := TRUE;
  END;

  IF NOT cross_insert_denied THEN
    RAISE EXCEPTION 'A user could create a saved search for another user.';
  END IF;
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-0000000000b2","role":"authenticated"}',
  true
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."SavedPost")
    OR EXISTS (SELECT 1 FROM public."SavedSearch") THEN
    RAISE EXCEPTION 'Another user could read private saved records.';
  END IF;

  DELETE FROM public."SavedPost"
  WHERE "userId" = current_setting('nestmate.saved_user_a');
  IF FOUND THEN
    RAISE EXCEPTION 'Another user could delete the owner saved post.';
  END IF;
END;
$$;

INSERT INTO public."SavedPost" ("userId", "postId")
VALUES (current_setting('nestmate.saved_user_b'), 'saved-test-post');

RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public."SavedPost") <> 2
    OR (SELECT count(*) FROM public."SavedSearch") <> 1 THEN
    RAISE EXCEPTION 'Saved ownership isolation test produced unexpected rows.';
  END IF;
END;
$$;

ROLLBACK;
