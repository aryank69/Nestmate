-- Rollback-only integration test for private verification records and safe states.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '46000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'verified-owner@example.test', '', now(), '{}', '{"full_name":"Verified Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '46000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'verification-outsider@example.test', '', now(), '{}', '{"full_name":"Verification Outsider"}', now(), now());

SELECT set_config('nestmate.verification_owner', (SELECT "id" FROM public."User" WHERE "authUserId" = '46000000-0000-4000-8000-0000000000a1'), true);
SELECT set_config('nestmate.verification_outsider', (SELECT "id" FROM public."User" WHERE "authUserId" = '46000000-0000-4000-8000-0000000000b2'), true);

INSERT INTO public."City" ("id", "name", "slug", "state", "updatedAt")
VALUES ('verification-test-city', 'Verification Test City', 'verification-test-city', 'Test State', now());
INSERT INTO public."Locality" ("id", "name", "slug", "cityId", "updatedAt")
VALUES ('verification-test-locality', 'Verification Test Locality', 'verification-test-locality', 'verification-test-city', now());
INSERT INTO public."Community" ("id", "name", "slug", "localityId", "updatedAt")
VALUES ('verification-test-community', 'Verification Test Community', 'verification-test-community', 'verification-test-locality', now());

UPDATE public."User"
SET
  "name" = 'Verified Owner',
  "dateOfBirth" = DATE '1998-01-01',
  "profession" = 'Designer',
  "bio" = 'A complete profile used only for verification policy testing.',
  "updatedAt" = now()
WHERE "id" = current_setting('nestmate.verification_owner');

UPDATE public."UserPreferences"
SET
  "budgetMin" = 18000,
  "budgetMax" = 24000,
  "preferredMoveInDate" = current_date + 30,
  "diet" = 'VEGETARIAN'::public."DietPreference",
  "smoking" = 'NEVER'::public."HabitFrequency",
  "drinking" = 'NEVER'::public."HabitFrequency",
  "sleepSchedule" = 'BALANCED'::public."SleepSchedule",
  "cleanliness" = 'MODERATE'::public."CleanlinessLevel",
  "pets" = 'PET_FRIENDLY'::public."PetPreference",
  "occupationStatus" = 'WORKING_PROFESSIONAL'::public."OccupationStatus",
  "updatedAt" = now()
WHERE "userId" = current_setting('nestmate.verification_owner');

INSERT INTO public."UserPreferredLocality" (
  "preferencesId", "localityId", "priority"
) VALUES (
  (SELECT "id" FROM public."UserPreferences" WHERE "userId" = current_setting('nestmate.verification_owner')),
  'verification-test-locality',
  0
);

INSERT INTO public."Post" (
  "id", "type", "title", "description", "monthlyAmountMin", "moveInDate",
  "propertyType", "roomType", "furnishingStatus", "preferredOccupant",
  "availableSpots", "authorId", "communityId", "publishedAt", "updatedAt"
) VALUES
  (
    'verification-complete-post',
    'ROOM_AVAILABLE'::public."PostType",
    'Complete verification test listing',
    'This structured listing contains enough information for the lightweight completeness check.',
    22000,
    current_date + 30,
    'APARTMENT'::public."PropertyType",
    'PRIVATE_ROOM'::public."RoomType",
    'FURNISHED'::public."FurnishingStatus",
    'ANY'::public."PreferredOccupant",
    1,
    current_setting('nestmate.verification_owner'),
    'verification-test-community',
    now(),
    now()
  ),
  (
    'verification-incomplete-post',
    'PG_AVAILABLE'::public."PostType",
    'Incomplete verification test listing',
    'Missing structured fields, so this check must remain pending.',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    current_setting('nestmate.verification_owner'),
    'verification-test-community',
    now(),
    now()
  );

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"46000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '46000000-0000-4000-8000-0000000000a1', true);

DO $$
DECLARE
  private_column_denied BOOLEAN := FALSE;
  self_verify_denied BOOLEAN := FALSE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."VerificationCheck"
    WHERE "userId" = current_setting('nestmate.verification_owner')
      AND "kind" = 'EMAIL'::public."VerificationKind"
      AND "status" = 'VERIFIED'::public."VerificationStatus"
  ) THEN
    RAISE EXCEPTION 'Confirmed email was not synchronized.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."VerificationCheck"
    WHERE "userId" = current_setting('nestmate.verification_owner')
      AND "kind" = 'PROFILE_COMPLETE'::public."VerificationKind"
      AND "status" = 'VERIFIED'::public."VerificationStatus"
  ) THEN
    RAISE EXCEPTION 'Complete profile was not verified.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."VerificationCheck"
    WHERE "postId" = 'verification-complete-post'
      AND "kind" = 'LISTING_DETAILS'::public."VerificationKind"
      AND "status" = 'VERIFIED'::public."VerificationStatus"
  ) THEN
    RAISE EXCEPTION 'Complete listing details were not verified.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."VerificationCheck"
    WHERE "postId" = 'verification-incomplete-post'
      AND "status" = 'PENDING'::public."VerificationStatus"
  ) THEN
    RAISE EXCEPTION 'Incomplete listing did not remain pending.';
  END IF;

  BEGIN
    EXECUTE 'SELECT "privateMetadata" FROM public."VerificationCheck" LIMIT 1';
  EXCEPTION WHEN insufficient_privilege THEN
    private_column_denied := TRUE;
  END;
  IF NOT private_column_denied THEN
    RAISE EXCEPTION 'Sensitive verification metadata was readable.';
  END IF;

  BEGIN
    INSERT INTO public."VerificationCheck" (
      "kind", "status", "method", "userId", "verifiedAt"
    ) VALUES (
      'IDENTITY'::public."VerificationKind",
      'VERIFIED'::public."VerificationStatus",
      'MANUAL_REVIEW'::public."VerificationMethod",
      current_setting('nestmate.verification_owner'),
      now()
    );
  EXCEPTION WHEN insufficient_privilege THEN
    self_verify_denied := TRUE;
  END;
  IF NOT self_verify_denied THEN
    RAISE EXCEPTION 'A user could self-award identity verification.';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"sub":"46000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '46000000-0000-4000-8000-0000000000b2', true);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public."VerificationCheck"
    WHERE "userId" = current_setting('nestmate.verification_owner')
      OR "postId" IN ('verification-complete-post', 'verification-incomplete-post')
  ) THEN
    RAISE EXCEPTION 'Another user could read private verification records.';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
