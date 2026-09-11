import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../lib/community.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const communityModule = { exports: {} };
const structuredListingMigration = readFileSync(
  new URL(
    "../prisma/migrations/20260902150000_structured_listing_details/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

new Function("module", "exports", "require", compiled)(
  communityModule,
  communityModule.exports,
  require,
);

const {
  communityPath,
  formatListingOccupancy,
  formatCommunityAmount,
  validateCommunityPost,
} = communityModule.exports;

const validPost = {
  postType: "Room Available",
  communityId: "community-1",
  title: "Private room near the metro",
  amount: "18000",
  moveInDate: "2026-09-01",
  genderPreference: "Any gender",
  housingType: "2BHK",
  housingFeature: "Private room",
  occupancy: "Single occupancy",
  furnishingStatus: "Semi-furnished",
  securityDeposit: "36000",
  maintenanceAmount: "2500",
  amenities: "Wi-Fi, Power backup, Wi-Fi",
  preferredOccupant: "Working professional",
  attachedBathroom: "Yes",
  parkingType: "Two-wheeler",
  occupationStatus: "Working professional",
  diet: "Vegetarian",
  smoking: "Non-smoker",
  drinking: "Never",
  sleepSchedule: "Early bird",
  cleanliness: "Very tidy",
  pets: "Pet friendly",
  preferredCommuteKm: "10",
  description:
    "A bright private room in a calm home with easy access to the metro.",
  tags: "No brokerage, Metro nearby",
};

test("room listings produce structured database fields and useful tags", () => {
  const result = validateCommunityPost(validPost);

  assert.equal(result.success, true);
  assert.equal(result.data.type, "ROOM_AVAILABLE");
  assert.equal(result.data.propertyType, "APARTMENT");
  assert.equal(result.data.roomType, "PRIVATE_ROOM");
  assert.equal(result.data.bedrooms, 2);
  assert.equal(result.data.availableSpots, 1);
  assert.equal(result.data.furnishingStatus, "SEMI_FURNISHED");
  assert.equal(result.data.securityDeposit, 36000);
  assert.equal(result.data.maintenanceAmount, 2500);
  assert.equal(result.data.preferredOccupant, "WORKING_PROFESSIONAL");
  assert.equal(result.data.attachedBathroom, true);
  assert.equal(result.data.parkingType, "TWO_WHEELER");
  assert.deepEqual(result.data.amenities, ["Wi-Fi", "Power backup"]);
  assert.deepEqual(result.data.tags, [
    "2BHK",
    "Private room",
    "No brokerage",
    "Metro nearby",
  ]);
});

test("need-a-room posts store a maximum budget", () => {
  const result = validateCommunityPost({
    ...validPost,
    postType: "Need a Room",
    housingType: "Either works",
    housingFeature: "Semi-furnished",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.monthlyAmountMin, null);
  assert.equal(result.data.monthlyAmountMax, 18000);
  assert.equal(result.data.securityDeposit, null);
  assert.equal(result.data.maintenanceAmount, null);
  assert.equal(result.data.preferredOccupant, null);
  assert.equal(result.data.attachedBathroom, null);
  assert.equal(result.data.parkingType, null);
  assert.equal(result.data.availableSpots, null);
  assert.deepEqual(result.data.amenities, []);
});

test("PG listings map occupancy and optional home details", () => {
  const result = validateCommunityPost({
    ...validPost,
    postType: "PG Available",
    housingType: "Twin sharing",
    housingFeature: "Included",
    furnishingStatus: "Furnished",
    preferredOccupant: "Student",
    attachedBathroom: "No",
    parkingType: "No parking",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.propertyType, "PG");
  assert.equal(result.data.roomType, "SHARED_ROOM");
  assert.equal(result.data.availableSpots, 2);
  assert.equal(result.data.mealsIncluded, true);
  assert.equal(result.data.furnishingStatus, "FURNISHED");
  assert.equal(result.data.preferredOccupant, "STUDENT");
  assert.equal(result.data.attachedBathroom, false);
  assert.equal(result.data.parkingType, "NONE");
});

test("listing detail occupancy labels stay distinct from room type", () => {
  assert.equal(formatListingOccupancy("Room Available", 1), "Single occupancy");
  assert.equal(formatListingOccupancy("Room Available", 2), "Double sharing");
  assert.equal(formatListingOccupancy("PG Available", 2), "Twin sharing");
  assert.equal(formatListingOccupancy("Room Available", null), null);
});

test("invalid listing costs and excessive amenities are rejected", () => {
  const result = validateCommunityPost({
    ...validPost,
    securityDeposit: "-1",
    maintenanceAmount: "12.5",
    amenities: "one, two, three, four, five, six, seven, eight, nine",
    occupancy: "Five sharing",
  });

  assert.equal(result.success, false);
  assert.equal(Boolean(result.errors.securityDeposit), true);
  assert.equal(Boolean(result.errors.maintenanceAmount), true);
  assert.equal(Boolean(result.errors.amenities), true);
  assert.equal(Boolean(result.errors.occupancy), true);
});

test("listing dates use an availability-specific validation message", () => {
  const result = validateCommunityPost({ ...validPost, moveInDate: "" });

  assert.equal(result.success, false);
  assert.match(result.errors.moveInDate, /availability date/);
});

test("invalid and excessive user tags are rejected", () => {
  const result = validateCommunityPost({
    ...validPost,
    tags: "one, two, three, four, five, six",
  });

  assert.equal(result.success, false);
  assert.equal(Boolean(result.errors.tags), true);
});

test("community amounts use category-aware labels", () => {
  assert.match(formatCommunityAmount("Need a Room", null, 25000), /Up to/);
  assert.match(formatCommunityAmount("PG Available", 12000, null), /From/);
});

test("locality communities have stable city and locality routes", () => {
  assert.equal(
    communityPath({ citySlug: "bengaluru", localitySlug: "hsr-layout" }),
    "/community/bengaluru/hsr-layout",
  );
  assert.equal(
    communityPath({ citySlug: "navi mumbai", localitySlug: "sector/17" }),
    "/community/navi%20mumbai/sector%2F17",
  );
});

test("structured listing migration adds constrained optional details", () => {
  assert.match(structuredListingMigration, /"maintenanceAmount" INTEGER/);
  assert.match(structuredListingMigration, /"preferredOccupant" public\."PreferredOccupant"/);
  assert.match(structuredListingMigration, /"attachedBathroom" BOOLEAN/);
  assert.match(structuredListingMigration, /"parkingType" public\."ParkingType"/);
  assert.match(structuredListingMigration, /Post_listing_costs_check/);
  assert.match(structuredListingMigration, /Post_structured_listing_details_check/);
});
