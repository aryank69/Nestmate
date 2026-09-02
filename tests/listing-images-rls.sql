-- Rollback-only integration test for listing-image Storage ownership and viewing.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '40000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'image-a@example.test', '', now(), '{}', '{"full_name":"Image A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '40000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'image-b@example.test', '', now(), '{}', '{"full_name":"Image B"}', now(), now());

SELECT set_config(
  'nestmate.image_user_a',
  (SELECT "id" FROM public."User" WHERE "authUserId" = '40000000-0000-4000-8000-0000000000a1'),
  true
);
SELECT set_config(
  'nestmate.image_user_b',
  (SELECT "id" FROM public."User" WHERE "authUserId" = '40000000-0000-4000-8000-0000000000b2'),
  true
);

INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('image-test-city', 'Image Test City', 'image-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('image-test-locality', 'Image Test Locality', 'image-test-locality', 'image-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('image-test-community', 'Image Test Community', 'image-test-community', 'image-test-locality', now());

INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId", "communityId",
  "imagePaths", "publishedAt", "updatedAt"
)
VALUES (
  'image-test-post',
  'ROOM_AVAILABLE'::public."PostType",
  'Room with a secure listing image',
  'This temporary listing verifies owner-only Storage writes and valid public reads.',
  current_setting('nestmate.image_user_a'),
  'image-test-community',
  ARRAY['40000000-0000-4000-8000-0000000000a1/image-test-post/10000000-0000-4000-8000-000000000001.jpg'],
  now(),
  now()
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);

INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
VALUES (
  'listing-images',
  '40000000-0000-4000-8000-0000000000a1/image-test-post/10000000-0000-4000-8000-000000000001.jpg',
  '40000000-0000-4000-8000-0000000000a1',
  '{"mimetype":"image/jpeg","size":1}'::jsonb
);

DO $$
BEGIN
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id = 'listing-images') <> 1 THEN
    RAISE EXCEPTION 'The listing owner could not read the valid image.';
  END IF;
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-0000000000b2","role":"authenticated"}',
  true
);

DO $$
DECLARE
  cross_upload_denied BOOLEAN := FALSE;
BEGIN
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id = 'listing-images') <> 1 THEN
    RAISE EXCEPTION 'Another user could not view a valid published listing image.';
  END IF;

  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
    VALUES (
      'listing-images',
      '40000000-0000-4000-8000-0000000000a1/image-test-post/20000000-0000-4000-8000-000000000002.jpg',
      '40000000-0000-4000-8000-0000000000b2',
      '{"mimetype":"image/jpeg","size":1}'::jsonb
    );
  EXCEPTION WHEN insufficient_privilege THEN
    cross_upload_denied := TRUE;
  END;

  IF NOT cross_upload_denied THEN
    RAISE EXCEPTION 'Another user could upload into the listing owner folder.';
  END IF;
END;
$$;

RESET ROLE;
UPDATE public."Post"
SET "imagePaths" = ARRAY[]::TEXT[], "updatedAt" = now()
WHERE "id" = 'image-test-post';

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'listing-images') THEN
    RAISE EXCEPTION 'An unreferenced image remained visible to a public viewer.';
  END IF;
END;
$$;

RESET ROLE;
UPDATE public."Post"
SET
  "imagePaths" = ARRAY['40000000-0000-4000-8000-0000000000a1/image-test-post/10000000-0000-4000-8000-000000000001.jpg'],
  "updatedAt" = now()
WHERE "id" = 'image-test-post';

ROLLBACK;
