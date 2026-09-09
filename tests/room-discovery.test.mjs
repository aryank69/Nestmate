import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);

function compile(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function("module", "exports", "require", output)(compiledModule, compiledModule.exports, require);
  return compiledModule.exports;
}

const discovery = compile("../lib/room-discovery.ts");
const dataSource = readFileSync(new URL("../lib/room-discovery-data.ts", import.meta.url), "utf8");
const sharedDataSource = readFileSync(new URL("../lib/community-data.ts", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../components/rooms/room-discovery.tsx", import.meta.url), "utf8");
const compareSource = readFileSync(new URL("../components/rooms/room-compare.tsx", import.meta.url), "utf8");

function filters(overrides = {}) {
  return {
    query: "",
    citySlug: "",
    communityId: "",
    kind: "ALL",
    budgetMin: null,
    budgetMax: null,
    moveInBy: "",
    furnishing: null,
    roomType: null,
    amenities: [],
    maximumDistanceKm: null,
    minimumLivingFit: null,
    minimumRealityScore: null,
    minimumReadiness: null,
    sort: "recommended",
    ...overrides,
  };
}

function post(id, overrides = {}) {
  return {
    id,
    monthlyAmountMin: 15_000,
    monthlyAmountMax: 15_000,
    listingDetails: { amenities: ["Wi-Fi", "Power backup"] },
    recommendation: { score: 76 },
    reality: { score: 82 },
    readiness: { score: 70 },
    ...overrides,
  };
}

test("room filters sanitize URL input and preserve all discovery controls", () => {
  const parsed = discovery.parseRoomDiscoveryFilters({
    q: "  HSR room  ",
    city: "bengaluru",
    locality: "community-1",
    kind: "FLAT_SHARED",
    min: "25000",
    max: "15000",
    moveInBy: "2026-10-01",
    furnishing: "FURNISHED",
    roomType: "SHARED_ROOM",
    amenities: " Wi-Fi,Power backup,wi-fi ",
    distance: "10",
    livingFit: "70",
    reality: "80",
    readiness: "65",
    sort: "highest-readiness",
  });

  assert.equal(parsed.query, "HSR room");
  assert.equal(parsed.kind, "FLAT_SHARED");
  assert.equal(parsed.budgetMax, 25000);
  assert.deepEqual(parsed.amenities, ["Wi-Fi", "Power backup"]);
  assert.equal(parsed.maximumDistanceKm, 10);
  assert.equal(parsed.minimumLivingFit, 70);
  assert.equal(parsed.minimumRealityScore, 80);
  assert.equal(parsed.minimumReadiness, 65);
  assert.equal(parsed.sort, "highest-readiness");
});
test("score and amenity filters remain constraints before result sorting", () => {
  const results = discovery.filterRoomDiscoveryResults([
    post("good"),
    post("missing-reality", { reality: { score: null } }),
    post("low-fit", { recommendation: { score: 55 } }),
    post("missing-amenity", { listingDetails: { amenities: ["Wi-Fi"] } }),
  ], filters({
    amenities: ["power backup"],
    minimumLivingFit: 70,
    minimumRealityScore: 70,
    minimumReadiness: 65,
  }));

  assert.deepEqual(results.map(({ id }) => id), ["good"]);
});

test("lowest-rent and readiness sorts are deterministic without changing scores", () => {
  const posts = [
    post("higher", { monthlyAmountMin: 20_000, readiness: { score: 95 } }),
    post("lower", { monthlyAmountMin: 10_000, readiness: { score: 60 } }),
  ];
  assert.deepEqual(
    discovery.filterRoomDiscoveryResults([...posts], filters({ sort: "lowest-rent" })).map(({ id }) => id),
    ["lower", "higher"],
  );
  assert.deepEqual(
    discovery.filterRoomDiscoveryResults([...posts], filters({ sort: "highest-readiness" })).map(({ id }) => id),
    ["higher", "lower"],
  );
  assert.equal(posts[0].recommendation.score, 76);
});

test("the room loader reuses the secured listing pipeline and batches locality scope", () => {
  assert.match(dataSource, /loadCommunityPosts/);
  assert.match(dataSource, /rankListingRecommendations/);
  assert.match(dataSource, /calculateListingRecommendation/);
  assert.match(dataSource, /cityLocations\.map/);
  assert.match(sharedDataSource, /status: "ACTIVE"/);
  assert.match(sharedDataSource, /moderationStatus: "VISIBLE"/);
  assert.match(sharedDataSource, /availabilityStatus: \{ in: \["AVAILABLE", "RESERVED"\] \}/);
  assert.match(sharedDataSource, /authorId: \{ notIn: blockedUserIds \}/);
  assert.match(sharedDataSource, /closedPostIds/);
  assert.match(sharedDataSource, /createListingImageUrlMap/);
  assert.doesNotMatch(dataSource, /prisma\.post\.findMany/);
});

test("responsive results expose required listing signals and safe actions", () => {
  for (const field of [
    "furnishing",
    "roomType",
    "amenities",
    "distance",
    "livingFit",
    "reality",
    "readiness",
  ]) {
    assert.match(pageSource, new RegExp(`name=\\"${field}\\"`));
  }
  assert.match(pageSource, /PostImageGallery/);
  assert.match(pageSource, /Living Fit/);
  assert.match(pageSource, /MoveInReadinessIndicator/);
  assert.match(pageSource, /ListingRealityScoreIndicator/);
  assert.match(pageSource, /View details/);
  assert.match(pageSource, /Message/);
  assert.match(pageSource, /md:grid-cols-2 xl:grid-cols-3/);
  assert.match(compareSource, /MAX_COMPARISON_LISTINGS/);
  assert.match(compareSource, /SavePostButton/);
  assert.match(compareSource, /saved\/compare\?ids=/);
});
