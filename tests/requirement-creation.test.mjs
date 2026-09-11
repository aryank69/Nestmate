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
const routeSource = readFileSync(
  new URL("../app/post-requirement/page.tsx", import.meta.url),
  "utf8",
);
const flowSource = readFileSync(
  new URL("../components/community/create-post-flow.tsx", import.meta.url),
  "utf8",
);
const actionSource = readFileSync(
  new URL("../app/community/actions.ts", import.meta.url),
  "utf8",
);
const defaultsSource = readFileSync(
  new URL("../lib/requirement-data.ts", import.meta.url),
  "utf8",
);
const peopleDataSource = readFileSync(
  new URL("../lib/people-data.ts", import.meta.url),
  "utf8",
);
const peopleUiSource = readFileSync(
  new URL("../components/people/people-discovery.tsx", import.meta.url),
  "utf8",
);
const moderationMigration = readFileSync(
  new URL(
    "../prisma/migrations/20260904180000_admin_moderation_dashboard/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

const validRequirement = {
  postType: "Need a Room",
  communityId: "community-hsr",
  title: "Looking for a quiet room near HSR Layout",
  amount: "22000",
  moveInDate: "2026-10-15",
  genderPreference: "Any gender",
  housingType: "Private room",
  housingFeature: "Semi-furnished",
  occupancy: "",
  furnishingStatus: "",
  securityDeposit: "",
  maintenanceAmount: "",
  amenities: "",
  preferredOccupant: "",
  attachedBathroom: "",
  parkingType: "",
  locationLatitude: "",
  locationLongitude: "",
  locationPrecision: "Approximate",
  occupationStatus: "Working professional",
  diet: "Vegetarian",
  smoking: "Non-smoker",
  drinking: "Never",
  sleepSchedule: "Early bird",
  cleanliness: "Very tidy",
  pets: "Pet friendly",
  preferredCommuteKm: "10",
  description:
    "Looking for a calm, well-connected home and considerate people with a similar daily routine.",
  tags: "Metro nearby",
};

test("dedicated route is authenticated, profile-prefilled, and requirement-only", () => {
  assert.ok(existsSync(new URL("../app/post-requirement/page.tsx", import.meta.url)));
  assert.match(routeSource, /redirect\("\/login\?next=\/post-requirement"\)/);
  assert.match(routeSource, /loadRequirementProfileDefaults/);
  assert.match(routeSource, /flow="requirement"/);
  assert.match(flowSource, /requirementPostTypeOptions/);
  assert.match(actionSource, /saveRequirementPostAction/);
  assert.match(actionSource, /input\.postType !== "Need a Room"/);
  assert.match(actionSource, /input\.postType !== "Need Flatmate"/);
});

test("requirement validation stores safe, readable preference tags", () => {
  const result = community.validateCommunityPost(validRequirement);

  assert.equal(result.success, true);
  assert.equal(result.data.type, "NEED_ROOM");
  assert.equal(result.data.monthlyAmountMax, 22000);
  assert.ok(result.data.tags.includes("Status: Working professional"));
  assert.ok(result.data.tags.includes("Food: Vegetarian"));
  assert.ok(result.data.tags.includes("Smoking: Non-smoker"));
  assert.ok(result.data.tags.includes("Commute: up to 10 km"));
  assert.equal(result.data.latitude, null);
  assert.equal(result.data.longitude, null);
});

test("room requirements can represent rooms, flats, and PG preferences", () => {
  const flat = community.validateCommunityPost({
    ...validRequirement,
    housingType: "Entire flat",
  });
  const pg = community.validateCommunityPost({
    ...validRequirement,
    housingType: "PG / co-living",
  });

  assert.equal(flat.success, true);
  assert.equal(flat.data.propertyType, "APARTMENT");
  assert.equal(flat.data.roomType, "ENTIRE_PLACE");
  assert.equal(pg.success, true);
  assert.equal(pg.data.propertyType, "PG");
});

test("requirement validation rejects unsafe status and commute values", () => {
  const result = community.validateCommunityPost({
    ...validRequirement,
    occupationStatus: "Influencer",
    preferredCommuteKm: "250",
  });

  assert.equal(result.success, false);
  assert.match(result.errors.occupationStatus, /work or study status/i);
  assert.match(result.errors.preferredCommuteKm, /between 1 and 100 km/i);
});

test("requirements publish into their selected locality and refresh discovery", () => {
  assert.match(actionSource, /validateCommunity\(input\.communityId\)/);
  assert.match(actionSource, /ensureCommunityMembership\(context, community\.id\)/);
  assert.match(actionSource, /communityId: community\.id/);
  assert.match(actionSource, /revalidatePath\("\/flatmates"\)/);
  assert.match(flowSource, /router\.replace/);
  assert.match(flowSource, /"\/matches\/post\/" \+ encodeURIComponent\(actionState\.postId\)/);
});

test("flatmate discovery surfaces only active visible requirements from unblocked users", () => {
  assert.match(peopleDataSource, /activeRequirementWhere/);
  assert.match(peopleDataSource, /\["NEED_ROOM", "NEED_FLATMATE"\]/);
  assert.match(peopleDataSource, /moderationStatus: "VISIBLE"/);
  assert.match(peopleDataSource, /blocksCreated: \{ none: \{ blockedId: viewer\.id \} \}/);
  assert.match(peopleDataSource, /blocksReceived: \{ none: \{ blockerId: viewer\.id \} \}/);
  assert.match(peopleUiSource, /profile\.activeRequirement/);
  assert.match(peopleUiSource, /Post a Requirement/);
});

test("profile defaults and published requirements do not expose private commute destinations", () => {
  assert.doesNotMatch(
    defaultsSource,
    /commuteDestination|commuteLatitude|commuteLongitude/,
  );
  assert.match(flowSource, /your destination stays private/i);
  assert.match(moderationMigration, /FOR INSERT\s+TO authenticated\s+WITH CHECK/);
  assert.match(moderationMigration, /app_user\."authUserId" = \(SELECT auth\.uid\(\)\)/);
  assert.match(moderationMigration, /user_block\."blockerId"/);
  assert.match(moderationMigration, /user_block\."blockedId" = "Post"\."authorId"/);
});
