CREATE TYPE public."LocationPrecision" AS ENUM ('EXACT', 'APPROXIMATE');

ALTER TABLE public."Post"
ADD COLUMN "latitude" NUMERIC(9, 6),
ADD COLUMN "longitude" NUMERIC(9, 6),
ADD COLUMN "locationPrecision" public."LocationPrecision";

ALTER TABLE public."Post"
ADD CONSTRAINT "Post_listing_location_check"
CHECK (
  (
    "latitude" IS NULL
    AND "longitude" IS NULL
    AND "locationPrecision" IS NULL
  )
  OR
  (
    "latitude" IS NOT NULL
    AND "longitude" IS NOT NULL
    AND "locationPrecision" IS NOT NULL
    AND "latitude" BETWEEN -90 AND 90
    AND "longitude" BETWEEN -180 AND 180
    AND "type" IN ('ROOM_AVAILABLE', 'PG_AVAILABLE')
    AND (
      "locationPrecision" <> 'APPROXIMATE'
      OR (
        "latitude" = round("latitude", 2)
        AND "longitude" = round("longitude", 2)
      )
    )
  )
);

COMMENT ON COLUMN public."Post"."latitude" IS
  'Public map latitude. Approximate locations are rounded before storage.';
COMMENT ON COLUMN public."Post"."longitude" IS
  'Public map longitude. Approximate locations are rounded before storage.';
COMMENT ON COLUMN public."Post"."locationPrecision" IS
  'Whether the poster chose an exact pin or a privacy-preserving approximate area.';
