import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);

function compile(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function("module", "exports", "require", output)(
    compiledModule,
    compiledModule.exports,
    require,
  );
  return compiledModule.exports;
}

const community = compile("../lib/community.ts");
const routeSource = readFileSync(new URL("../app/list-property/page.tsx", import.meta.url), "utf8");
const flowSource = readFileSync(new URL("../components/community/create-post-flow.tsx", import.meta.url), "utf8");
const actionSource = readFileSync(new URL("../app/community/actions.ts", import.meta.url), "utf8");
const navbarSource = readFileSync(new URL("../components/navbar.tsx", import.meta.url), "utf8");
const homepageSource = readFileSync(new URL("../components/hero-section.tsx", import.meta.url), "utf8");
const roomsSource = readFileSync(new URL("../components/rooms/room-discovery.tsx", import.meta.url), "utf8");
const discoveryDataSource = readFileSync(new URL("../lib/room-discovery-data.ts", import.meta.url), "utf8");

const validListing = {
  postType: "Room Available",
  communityId: "community-1",
  title: "Entire flat near the metro",
  amount: "28000",
  moveInDate: "2026-10-01",
  genderPreference: "Any gender",
  housingType: "2BHK",
  housingFeature: "Entire place",
  occupancy: "",
  furnishingStatus: "Semi-furnished",
  securityDeposit: "56000",
  maintenanceAmount: "2500",
  amenities: "Wi-Fi, power backup",
  preferredOccupant: "Working professional",
  attachedBathroom: "Yes",
  parkingType: "Two-wheeler",
  locationLatitude: "",
  locationLongitude: "",
  locationPrecision: "Approximate",
  description: "A well-kept entire flat with clear costs and good connectivity.",
  tags: "Metro nearby",
};

test("/list-property is an authenticated property-only entry point", () => {
  assert.ok(existsSync(new URL("../app/list-property/page.tsx", import.meta.url)));
  assert.match(routeSource, /redirect\("\/login\?next=\/list-property"\)/);
  assert.match(routeSource, /loadCommunityLocations/);
  assert.match(routeSource, /flow="property"/);
  assert.match(flowSource, /Room Available/);
  assert.match(flowSource, /Flat \/ Shared Flat/);
  assert.match(flowSource, /PG Available/);
  assert.match(flowSource, /flow === "property" \? propertyPostTypeOptions/);
  assert.match(actionSource, /savePropertyListingAction/);
  assert.match(actionSource, /input\.postType !== "Room Available"/);
  assert.match(actionSource, /input\.postType !== "PG Available"/);
});

test("navbar, homepage, and empty room discovery link to property creation", () => {
  for (const source of [navbarSource, homepageSource, roomsSource]) {
    assert.match(source, /href="\/list-property"/);
    assert.match(source, /List a Property/);
  }
});

test("flat and shared-flat choices map to discoverable structured room types", () => {
  const entirePlace = community.validateCommunityPost(validListing);
  const sharedRoom = community.validateCommunityPost({
    ...validListing,
    housingFeature: "Shared room",
  });

  assert.equal(entirePlace.success, true);
  assert.equal(entirePlace.data.type, "ROOM_AVAILABLE");
  assert.equal(entirePlace.data.roomType, "ENTIRE_PLACE");
  assert.equal(sharedRoom.success, true);
  assert.equal(sharedRoom.data.roomType, "SHARED_ROOM");
  assert.match(discoveryDataSource, /\["SHARED_ROOM", "ENTIRE_PLACE"\]/);
});

test("successful listings refresh discovery and redirect after images finish", () => {
  assert.match(actionSource, /revalidatePath\("\/rooms"\)/);
  assert.match(actionSource, /revalidatePath\("\/community\/post\/" \+ data\.id\)/);
  assert.match(flowSource, /imageSaveState === "complete"/);
  assert.match(flowSource, /router\.replace/);
  assert.match(flowSource, /"\/community\/post\/" \+ encodeURIComponent\(actionState\.postId\)/);
});

test("the existing seed remains free of fake listing records", () => {
  const seedSource = readFileSync(new URL("../prisma/seed.ts", import.meta.url), "utf8");
  assert.doesNotMatch(seedSource, /prisma\.post\.(create|upsert|createMany)/);
});
