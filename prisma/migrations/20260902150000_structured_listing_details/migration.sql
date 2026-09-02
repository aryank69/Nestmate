CREATE TYPE public."PreferredOccupant" AS ENUM (
  'ANY',
  'WORKING_PROFESSIONAL',
  'STUDENT',
  'FAMILY'
);

CREATE TYPE public."ParkingType" AS ENUM (
  'NONE',
  'TWO_WHEELER',
  'CAR',
  'BOTH'
);

ALTER TABLE public."Post"
  ADD COLUMN "maintenanceAmount" INTEGER,
  ADD COLUMN "preferredOccupant" public."PreferredOccupant",
  ADD COLUMN "attachedBathroom" BOOLEAN,
  ADD COLUMN "parkingType" public."ParkingType";

ALTER TABLE public."Post"
ADD CONSTRAINT "Post_listing_costs_check"
CHECK (
  ("securityDeposit" IS NULL OR "securityDeposit" >= 0)
  AND ("maintenanceAmount" IS NULL OR "maintenanceAmount" >= 0)
);

ALTER TABLE public."Post"
ADD CONSTRAINT "Post_structured_listing_details_check"
CHECK (
  "type" IN (
    'ROOM_AVAILABLE'::public."PostType",
    'PG_AVAILABLE'::public."PostType"
  )
  OR (
    "maintenanceAmount" IS NULL
    AND "preferredOccupant" IS NULL
    AND "attachedBathroom" IS NULL
    AND "parkingType" IS NULL
  )
);

GRANT USAGE ON TYPE public."PreferredOccupant" TO authenticated;
GRANT USAGE ON TYPE public."ParkingType" TO authenticated;
