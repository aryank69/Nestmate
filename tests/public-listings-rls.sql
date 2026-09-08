-- Rollback-only integration test for public listing-image visibility and privacy.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '47000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'public-owner@example.test', '', now(), '{}', '{"full_name":"Public Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '47000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'public-viewer@example.test', '', now(), '{}', '{"full_name":"Public Viewer"}', now(), now());

SELECT set_config('nestmate.public_owner', (
  SELECT "id" FROM public."User"
  WHERE "authUserId" = '47000000-0000-4000-8000-0000000000a1'
), true);
SELECT set_config('nestmate.public_viewer', (
  SELECT "id" FROM public."User"
  WHERE "authUserId" = '47000000-0000-4000-8000-0000000000b2'
), true);

INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('public-test-city', 'Public Test City', 'public-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('public-test-locality', 'Public Test Locality', 'public-test-locality', 'public-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('public-test-community', 'Public Test Community', 'public-test-community', 'public-test-locality', now());

INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId", "communityId",
  "imagePaths", "publishedAt", "updatedAt"
)
VALUES (
  'public-test-post',
  'ROOM_AVAILABLE'::public."PostType",
  'Private free-form title that must never power public SEO',
  'Private contact details and exact-address text must never power public SEO.',
  current_setting('nestmate.public_owner'),
  'public-test-community',
  ARRAY['47000000-0000-4000-8000-0000000000a1/public-test-post/17000000-0000-4000-8000-000000000001.jpg'],
  now(),
  now()
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"47000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '47000000-0000-4000-8000-0000000000a1', true);

INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
VALUES (
  'listing-images',
  '47000000-0000-4000-8000-0000000000a1/public-test-post/17000000-0000-4000-8000-000000000001.jpg',
  '47000000-0000-4000-8000-0000000000a1',
  '{"mimetype":"image/jpeg","size":1}'::jsonb
);

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM storage.objects WHERE name = '47000000-0000-4000-8000-0000000000a1/public-test-post/17000000-0000-4000-8000-000000000001.jpg') <> 1 THEN
    RAISE EXCEPTION 'An eligible public listing image was not visible anonymously.';
  END IF;
END;
$$;

RESET ROLE;
UPDATE public."Post"
SET "availabilityStatus" = 'CLOSED'::public."ListingAvailabilityStatus", "updatedAt" = now()
WHERE "id" = 'public-test-post';

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects WHERE name = '47000000-0000-4000-8000-0000000000a1/public-test-post/17000000-0000-4000-8000-000000000001.jpg') THEN
    RAISE EXCEPTION 'A closed listing image remained publicly visible.';
  END IF;
END;
$$;

RESET ROLE;
UPDATE public."Post"
SET "availabilityStatus" = 'AVAILABLE'::public."ListingAvailabilityStatus",
    "moderationStatus" = 'HIDDEN'::public."ContentModerationStatus",
    "updatedAt" = now()
WHERE "id" = 'public-test-post';

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects WHERE name = '47000000-0000-4000-8000-0000000000a1/public-test-post/17000000-0000-4000-8000-000000000001.jpg') THEN
    RAISE EXCEPTION 'A hidden listing image remained publicly visible.';
  END IF;
END;
$$;

RESET ROLE;
UPDATE public."Post"
SET "moderationStatus" = 'VISIBLE'::public."ContentModerationStatus", "updatedAt" = now()
WHERE "id" = 'public-test-post';
UPDATE public."Community"
SET "isActive" = FALSE, "updatedAt" = now()
WHERE "id" = 'public-test-community';

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects WHERE name = '47000000-0000-4000-8000-0000000000a1/public-test-post/17000000-0000-4000-8000-000000000001.jpg') THEN
    RAISE EXCEPTION 'An image in an inactive locality community remained public.';
  END IF;
END;
$$;

RESET ROLE;
UPDATE public."Community"
SET "isActive" = TRUE, "updatedAt" = now()
WHERE "id" = 'public-test-community';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"47000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '47000000-0000-4000-8000-0000000000b2', true);
INSERT INTO public."UserBlock" ("blockerId", "blockedId")
VALUES (current_setting('nestmate.public_viewer'), current_setting('nestmate.public_owner'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects WHERE name = '47000000-0000-4000-8000-0000000000a1/public-test-post/17000000-0000-4000-8000-000000000001.jpg') THEN
    RAISE EXCEPTION 'A blocked viewer could still read the listing image.';
  END IF;
END;
$$;

RESET ROLE;
INSERT INTO public."UserModerationState" (
  "userId", "status", "privateReason", "updatedById", "updatedAt"
)
VALUES (
  current_setting('nestmate.public_owner'),
  'SUSPENDED'::public."UserModerationStatus",
  'Rollback-only public visibility test',
  current_setting('nestmate.public_viewer'),
  now()
);

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects WHERE name = '47000000-0000-4000-8000-0000000000a1/public-test-post/17000000-0000-4000-8000-000000000001.jpg') THEN
    RAISE EXCEPTION 'A suspended owner listing image remained public.';
  END IF;
END;
$$;

RESET ROLE;
DELETE FROM public."UserModerationState"
WHERE "userId" = current_setting('nestmate.public_owner');
UPDATE public."Post"
SET "status" = 'ARCHIVED'::public."PostStatus", "updatedAt" = now()
WHERE "id" = 'public-test-post';

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'listing-images') THEN
    RAISE EXCEPTION 'An archived listing image was exposed publicly.';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
