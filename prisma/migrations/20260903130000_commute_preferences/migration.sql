ALTER TABLE public."UserPreferences"
ADD COLUMN "commuteDestination" VARCHAR(120),
ADD COLUMN "commuteLatitude" NUMERIC(9, 6),
ADD COLUMN "commuteLongitude" NUMERIC(9, 6),
ADD COLUMN "preferredCommuteKm" INTEGER;

ALTER TABLE public."UserPreferences"
ADD CONSTRAINT "UserPreferences_commute_destination_check"
CHECK (
  (
    "commuteDestination" IS NULL
    AND "commuteLatitude" IS NULL
    AND "commuteLongitude" IS NULL
  )
  OR
  (
    "commuteDestination" IS NOT NULL
    AND "commuteLatitude" IS NOT NULL
    AND "commuteLongitude" IS NOT NULL
    AND
    length(btrim("commuteDestination")) BETWEEN 2 AND 120
    AND "commuteLatitude" BETWEEN -90 AND 90
    AND "commuteLongitude" BETWEEN -180 AND 180
  )
);

ALTER TABLE public."UserPreferences"
ADD CONSTRAINT "UserPreferences_preferred_commute_check"
CHECK (
  "preferredCommuteKm" IS NULL
  OR "preferredCommuteKm" BETWEEN 1 AND 100
);

CREATE INDEX "UserPreferences_preferredCommuteKm_idx"
ON public."UserPreferences" ("preferredCommuteKm");

CREATE INDEX "Post_communityId_latitude_longitude_idx"
ON public."Post" ("communityId", "latitude", "longitude");

COMMENT ON COLUMN public."UserPreferences"."commuteDestination" IS
  'Private user-supplied label for a workplace, college, or important destination.';
COMMENT ON COLUMN public."UserPreferences"."commuteLatitude" IS
  'Private destination latitude used only for viewer-specific commute calculations.';
COMMENT ON COLUMN public."UserPreferences"."commuteLongitude" IS
  'Private destination longitude used only for viewer-specific commute calculations.';
COMMENT ON COLUMN public."UserPreferences"."preferredCommuteKm" IS
  'Optional public commute-range preference; destination coordinates remain private.';
