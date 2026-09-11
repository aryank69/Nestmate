import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);

function compile(relativePath, aliases = {}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  const localRequire = (specifier) => aliases[specifier] ?? require(specifier);
  new Function("module", "exports", "require", output)(
    compiledModule,
    compiledModule.exports,
    localRequire,
  );
  return compiledModule.exports;
}

const roomDiscovery = compile("../lib/room-discovery.ts");
const discovery = compile("../lib/discovery.ts");
const recovery = compile("../lib/zero-result-recovery.ts", {
  "@/lib/room-discovery": roomDiscovery,
  "@/lib/discovery": discovery,
});

const locations = [
  {
    id: "community-hsr",
    localityId: "locality-hsr",
    city: "Bengaluru",
    citySlug: "bengaluru",
    locality: "HSR Layout",
  },
  {
    id: "community-koramangala",
    localityId: "locality-koramangala",
    city: "Bengaluru",
    citySlug: "bengaluru",
    locality: "Koramangala",
  },
  {
    id: "community-bandra",
    localityId: "locality-bandra",
    city: "Mumbai",
    citySlug: "mumbai",
    locality: "Bandra",
  },
];

const roomFilters = {
  query: "quiet room",
  citySlug: "bengaluru",
  communityId: "community-hsr",
  kind: "ROOM_AVAILABLE",
  budgetMin: 15_000,
  budgetMax: 25_000,
  moveInBy: "2026-10-01",
  furnishing: "FURNISHED",
  roomType: "PRIVATE_ROOM",
  amenities: ["Wi-Fi"],
  maximumDistanceKm: 10,
  minimumLivingFit: 80,
  minimumRealityScore: 70,
  minimumReadiness: 65,
  sort: "recommended",
};

const peopleFilters = {
  query: "designer",
  localityId: "locality-hsr",
  budgetMin: 15_000,
  budgetMax: 25_000,
  moveInBy: "2026-10-01",
  diet: "VEGETARIAN",
  smoking: "NEVER",
  drinking: null,
  sleepSchedule: "EARLY_BIRD",
  cleanliness: null,
  pets: "PET_FRIENDLY",
  occupationStatus: "WORKING_PROFESSIONAL",
  minimumCompatibility: 80,
  preferredCommuteKm: 10,
  sort: "recommended",
};

test("room recovery offers explicit locality, budget, commute, date, and Living Fit changes", () => {
  const candidates = recovery.roomRecoveryCandidates(roomFilters, locations);
  const ids = candidates.map(({ id }) => id);
  assert.ok(ids.includes("room-locality-community-koramangala"));
  assert.ok(ids.includes("room-budget"));
  assert.ok(ids.includes("room-commute"));
  assert.ok(ids.includes("room-move-in"));
  assert.ok(ids.includes("room-living-fit"));
  assert.ok(ids.includes("room-details"));
  assert.ok(ids.includes("room-search"));
  assert.ok(!ids.includes("room-locality-community-bandra"));
});

test("each room suggestion preserves filters it does not explicitly relax", () => {
  const candidates = recovery.roomRecoveryCandidates(roomFilters, locations);
  const budget = candidates.find(({ id }) => id === "room-budget");
  assert.equal(budget.filters.query, roomFilters.query);
  assert.equal(budget.filters.communityId, roomFilters.communityId);
  assert.equal(budget.filters.maximumDistanceKm, roomFilters.maximumDistanceKm);
  assert.equal(budget.filters.minimumLivingFit, roomFilters.minimumLivingFit);
  assert.ok(budget.filters.budgetMin < roomFilters.budgetMin);
  assert.ok(budget.filters.budgetMax > roomFilters.budgetMax);
  assert.match(budget.href, /q=quiet\+room/);
  assert.match(budget.href, /locality=community-hsr/);
  assert.match(budget.relaxedCriteria[0], /Budget:/);

  const commute = candidates.find(({ id }) => id === "room-commute");
  assert.equal(commute.filters.budgetMin, roomFilters.budgetMin);
  assert.equal(commute.filters.moveInBy, roomFilters.moveInBy);
  assert.equal(commute.filters.maximumDistanceKm, 15);

  const moveIn = candidates.find(({ id }) => id === "room-move-in");
  assert.equal(moveIn.filters.moveInBy, "2026-10-15");
  assert.equal(moveIn.filters.minimumLivingFit, 80);

  const livingFit = candidates.find(({ id }) => id === "room-living-fit");
  assert.equal(livingFit.filters.minimumLivingFit, 70);
  assert.equal(livingFit.filters.minimumRealityScore, 70);
});

test("people recovery uses locality ids and explicit, isolated relaxations", () => {
  const candidates = recovery.peopleRecoveryCandidates(peopleFilters, locations);
  assert.ok(candidates.some(({ id }) => id === "people-search"));
  const nearby = candidates.find(({ id }) => id === "people-locality-locality-koramangala");
  assert.equal(nearby.filters.localityId, "locality-koramangala");
  assert.equal(nearby.filters.budgetMax, peopleFilters.budgetMax);
  assert.match(nearby.href, /locality=locality-koramangala/);

  const budget = candidates.find(({ id }) => id === "people-budget");
  assert.equal(budget.filters.localityId, peopleFilters.localityId);
  assert.equal(budget.filters.diet, peopleFilters.diet);
  assert.ok(budget.filters.budgetMax > peopleFilters.budgetMax);

  const commute = candidates.find(({ id }) => id === "people-commute");
  assert.equal(commute.filters.preferredCommuteKm, 15);
  assert.equal(commute.filters.minimumCompatibility, 80);

  const moveIn = candidates.find(({ id }) => id === "people-move-in");
  assert.equal(moveIn.filters.moveInBy, "2026-10-15");

  const closeFit = candidates.find(({ id }) => id === "people-living-fit");
  assert.equal(closeFit.filters.minimumCompatibility, 70);
  assert.equal(closeFit.filters.smoking, "NEVER");

  const lifestyle = candidates.find(({ id }) => id === "people-lifestyle");
  assert.equal(lifestyle.filters.diet, null);
  assert.equal(lifestyle.filters.smoking, null);
  assert.equal(lifestyle.filters.localityId, peopleFilters.localityId);
  assert.equal(lifestyle.filters.minimumCompatibility, 80);
});

test("recovery probes run only after zero results through existing secured loaders", () => {
  const roomData = readFileSync(new URL("../lib/room-discovery-data.ts", import.meta.url), "utf8");
  const peopleData = readFileSync(new URL("../lib/people-data.ts", import.meta.url), "utf8");
  const communityData = readFileSync(new URL("../lib/community-data.ts", import.meta.url), "utf8");
  const flatmatesPage = readFileSync(new URL("../app/flatmates/page.tsx", import.meta.url), "utf8");

  assert.match(roomData, /recoverySuggestions = listings\.length\s+\? \[\]/);
  assert.match(roomData, /loadRoomDiscoveryMatches/);
  assert.match(roomData, /loadCommunityPosts/);
  assert.match(flatmatesPage, /recoverySuggestions = profiles\.length\s+\? \[\]/);
  assert.match(peopleData, /loadPeopleDiscovery\(\s*viewerAuthUserId,\s*candidate\.filters/);
  assert.match(communityData, /blockedUserIds/);
  assert.match(communityData, /moderationStatus: "VISIBLE"/);
  assert.match(communityData, /availabilityStatus: \{ in: \["AVAILABLE", "RESERVED"\] \}/);
  assert.match(peopleData, /blocksCreated: \{ none:/);
  assert.match(peopleData, /blocksReceived: \{ none:/);
  assert.match(peopleData, /moderationState: \{ isNot: \{ status: "SUSPENDED" \} \}/);
});

test("zero-result UI requires an explicit action and names every relaxed criterion", () => {
  const panel = readFileSync(
    new URL("../components/discovery/zero-result-recovery.tsx", import.meta.url),
    "utf8",
  );
  const roomsUi = readFileSync(
    new URL("../components/rooms/room-discovery.tsx", import.meta.url),
    "utf8",
  );
  const peopleUi = readFileSync(
    new URL("../components/people/people-discovery.tsx", import.meta.url),
    "utf8",
  );

  assert.match(panel, /Nothing has changed yet/);
  assert.match(panel, /Criteria relaxed/);
  assert.match(panel, /Apply this change/);
  assert.match(panel, /href=\{suggestion\.href\}/);
  assert.match(roomsUi, /suggestions=\{recoverySuggestions\}/);
  assert.match(peopleUi, /suggestions=\{recoverySuggestions\}/);
  assert.match(peopleUi, /location\.localityId/);
});
