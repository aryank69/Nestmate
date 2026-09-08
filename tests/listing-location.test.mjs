import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);

function loadTypeScriptModule(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const loadedModule = { exports: {} };

  new Function("module", "exports", "require", compiled)(
    loadedModule,
    loadedModule.exports,
    require,
  );

  return loadedModule.exports;
}

const { validateCommunityPost } = loadTypeScriptModule("../lib/community.ts");
const { getMapProvider, publicMapPoint } = loadTypeScriptModule(
  "../lib/maps.ts",
);
const locationMapSource = readFileSync(
  new URL("../components/maps/property-location-map.tsx", import.meta.url),
  "utf8",
);
const communityPageSource = readFileSync(
  new URL("../components/community/community-page.tsx", import.meta.url),
  "utf8",
);
const migrationSource = readFileSync(
  new URL(
    "../prisma/migrations/20260903120000_listing_locations/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

const validListing = {
  postType: "Room Available",
  communityId: "community-1",
  title: "Private room near the metro",
  amount: "18000",
  moveInDate: "2026-09-15",
  genderPreference: "Any gender",
  housingType: "2BHK",
  housingFeature: "Private room",
  occupancy: "Single occupancy",
  furnishingStatus: "Semi-furnished",
  securityDeposit: "36000",
  maintenanceAmount: "2500",
  amenities: "Wi-Fi, Power backup",
  preferredOccupant: "Working professional",
  attachedBathroom: "Yes",
  parkingType: "Two-wheeler",
  locationLatitude: "17.448321",
  locationLongitude: "78.391543",
  locationPrecision: "Approximate",
  description:
    "A bright private room in a calm home with easy access to the metro.",
  tags: "No brokerage, Metro nearby",
};

test("approximate listing coordinates are rounded before persistence", () => {
  const result = validateCommunityPost(validListing);

  assert.equal(result.success, true);
  assert.equal(result.data.latitude, 17.45);
  assert.equal(result.data.longitude, 78.39);
  assert.equal(result.data.locationPrecision, "APPROXIMATE");
});

test("exact listing pins retain six-decimal coordinates", () => {
  const result = validateCommunityPost({
    ...validListing,
    locationPrecision: "Exact",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.latitude, 17.448321);
  assert.equal(result.data.longitude, 78.391543);
  assert.equal(result.data.locationPrecision, "EXACT");
});

test("partial and out-of-range coordinates are rejected", () => {
  const partial = validateCommunityPost({
    ...validListing,
    locationLongitude: "",
  });
  const outOfRange = validateCommunityPost({
    ...validListing,
    locationLatitude: "91",
    locationLongitude: "181",
  });

  assert.equal(partial.success, false);
  assert.match(partial.errors.locationLongitude, /between -180 and 180/i);
  assert.equal(outOfRange.success, false);
  assert.match(outOfRange.errors.locationLatitude, /between -90 and 90/i);
  assert.match(outOfRange.errors.locationLongitude, /between -180 and 180/i);
});

test("non-listing post types never persist property coordinates", () => {
  const result = validateCommunityPost({
    ...validListing,
    postType: "Need a Room",
    housingType: "Private room",
    housingFeature: "Semi-furnished",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.latitude, null);
  assert.equal(result.data.longitude, null);
  assert.equal(result.data.locationPrecision, null);
});

test("map provider receives only the rounded public point", () => {
  const location = publicMapPoint(
    { latitude: 17.448321, longitude: 78.391543 },
    "APPROXIMATE",
  );
  const embedUrl = new URL(getMapProvider().embedUrl(location));

  assert.deepEqual(location, {
    latitude: 17.45,
    longitude: 78.39,
    precision: "APPROXIMATE",
  });
  assert.equal(embedUrl.searchParams.get("marker"), "17.45,78.39");
  assert.doesNotMatch(embedUrl.toString(), /17\.448321|78\.391543/);
});

test("post details render the map with explicit privacy messaging", () => {
  assert.match(communityPageSource, /<PropertyLocationMap/);
  assert.match(locationMapSource, /Approximate location/);
  assert.match(locationMapSource, /rounded to a nearby area/);
  assert.match(locationMapSource, /referrerPolicy="no-referrer"/);
});

test("database constraint enforces paired listing coordinates and privacy rounding", () => {
  assert.match(migrationSource, /"latitude" NUMERIC\(9, 6\)/);
  assert.match(migrationSource, /"longitude" NUMERIC\(9, 6\)/);
  assert.match(migrationSource, /"type" IN \('ROOM_AVAILABLE', 'PG_AVAILABLE'\)/);
  assert.match(migrationSource, /"latitude" = round\("latitude", 2\)/);
  assert.match(migrationSource, /"longitude" = round\("longitude", 2\)/);
});
