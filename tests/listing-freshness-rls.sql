-- Rollback-only integration test for listing availability ownership and visibility.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '42000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'fresh-owner@example.test', '', now(), '{}', '{"full_name":"Fresh Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '42000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'fresh-other@example.test', '', now(), '{}', '{"full_name":"Fresh Other"}', now(), now());

SELECT set_config(
  'nestmate.fresh_owner',
  (SELECT "id" FROM public."User" WHERE "authUserId" = '42000000-0000-4000-8000-0000000000a1'),
  true
);

INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('fresh-test-city', 'Fresh Test City', 'fresh-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('fresh-test-locality', 'Fresh Test Locality', 'fresh-test-locality', 'fresh-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('fresh-test-community', 'Fresh Test Community', 'fresh-test-community', 'fresh-test-locality', now());
INSERT INTO public."Post" (
  "id", "type", "title", "description", "authorId",
  "communityId", "publishedAt", "updatedAt"
)
VALUES (
  'fresh-test-post',
  'ROOM_AVAILABLE'::public."PostType",
  'A room used only for freshness RLS testing',
  'This temporary listing verifies owner-only status changes and closed visibility.',
  current_setting('nestmate.fresh_owner'),
  'fresh-test-community',
  now(),
  now()
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"42000000-0000-4000-8000-0000000000b2","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '42000000-0000-4000-8000-0000000000b2', true);

DO $$
DECLARE
  affected INTEGER;
BEGIN
  IF (SELECT count(*) FROM public."Post" WHERE "id" = 'fresh-test-post') <> 1 THEN
    RAISE EXCEPTION 'An available listing was not visible to another user.';
  END IF;

  UPDATE public."Post"
  SET "availabilityStatus" = 'CLOSED'::public."ListingAvailabilityStatus"
  WHERE "id" = 'fresh-test-post';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'A non-owner changed listing availability.';
  END IF;
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"42000000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '42000000-0000-4000-8000-0000000000a1', true);

UPDATE public."Post"
SET
  "availabilityStatus" = 'CLOSED'::public."ListingAvailabilityStatus",
  "lastConfirmedAt" = now(),
  "updatedAt" = now()
WHERE "id" = 'fresh-test-post';

DO $$
BEGIN
  IF (
    SELECT "availabilityStatus" <> 'CLOSED'::public."ListingAvailabilityStatus"
    FROM public."Post"
    WHERE "id" = 'fresh-test-post'
  ) THEN
    RAISE EXCEPTION 'The owner update did not close the listing.';
  END IF;
  IF (SELECT count(*) FROM public."Post" WHERE "id" = 'fresh-test-post') <> 1 THEN
    RAISE EXCEPTION 'The owner lost access to their closed listing.';
  END IF;
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"42000000-0000-4000-8000-0000000000b2","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '42000000-0000-4000-8000-0000000000b2', true);

DO $$
BEGIN
  IF auth.uid() <> '42000000-0000-4000-8000-0000000000b2'::UUID THEN
    RAISE EXCEPTION 'JWT context did not switch users; auth.uid() is %', auth.uid();
  END IF;
  IF EXISTS (SELECT 1 FROM public."Post" WHERE "id" = 'fresh-test-post') THEN
    RAISE EXCEPTION 'A closed listing remained visible to another user.';
  END IF;
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"42000000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '42000000-0000-4000-8000-0000000000a1', true);

UPDATE public."Post"
SET
  "availabilityStatus" = 'RESERVED'::public."ListingAvailabilityStatus",
  "lastConfirmedAt" = now(),
  "updatedAt" = now()
WHERE "id" = 'fresh-test-post';

RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT "availabilityStatus" <> 'RESERVED'::public."ListingAvailabilityStatus"
    FROM public."Post"
    WHERE "id" = 'fresh-test-post'
  ) THEN
    RAISE EXCEPTION 'The owner could not reopen a closed listing as reserved.';
  END IF;
END;
$$;

ROLLBACK;
