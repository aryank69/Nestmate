CREATE TYPE "OnboardingIntent" AS ENUM (
  'FIND_ROOM',
  'FIND_ROOMMATE',
  'LIST_PROPERTY',
  'POST_REQUIREMENT'
);

ALTER TABLE public."UserPreferences"
ADD COLUMN "onboardingIntent" "OnboardingIntent",
ADD COLUMN "onboardingCompletedAt" TIMESTAMPTZ(3),
ADD COLUMN "onboardingSkippedAt" TIMESTAMPTZ(3);

-- Do not interrupt members who already configured or used NestMate before
-- first-time onboarding existed. New preference rows retain NULL timestamps.
UPDATE public."UserPreferences"
SET "onboardingSkippedAt" = now()
WHERE "onboardingCompletedAt" IS NULL
  AND "onboardingSkippedAt" IS NULL;

ALTER TABLE public."UserPreferences"
ADD CONSTRAINT "UserPreferences_onboarding_state_check"
CHECK (
  "onboardingCompletedAt" IS NULL
  OR "onboardingSkippedAt" IS NULL
);

COMMENT ON COLUMN public."UserPreferences"."onboardingIntent" IS
  'The user-selected entry flow; this is a product preference, never an authorization claim.';
COMMENT ON COLUMN public."UserPreferences"."onboardingCompletedAt" IS
  'Marks completion of the lightweight discovery setup.';
COMMENT ON COLUMN public."UserPreferences"."onboardingSkippedAt" IS
  'Marks an explicit first-time onboarding skip without fabricating profile data.';

-- Existing UserPreferences SELECT/UPDATE grants and owner-only RLS policies
-- automatically cover these columns; no broader access is introduced.
