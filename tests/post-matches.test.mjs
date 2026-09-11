import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
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
  const testRequire = (specifier) => aliases[specifier] ?? require(specifier);
  new Function("module", "exports", "require", output)(
    compiledModule,
    compiledModule.exports,
    testRequire,
  );
  return compiledModule.exports;
}

const community = compile("../lib/community.ts");
const postMatch = compile("../lib/post-match.ts", {
  "@/lib/community": community,
});
const routeSource = readFileSync(
  new URL("../app/matches/post/[postId]/page.tsx", import.meta.url),
  "utf8",
);
const dataSource = readFileSync(
  new URL("../lib/post-match-data.ts", import.meta.url),
  "utf8",
);
const peopleDataSource = readFileSync(
  new URL("../lib/people-data.ts", import.meta.url),
  "utf8",
);
const flowSource = readFileSync(
  new URL("../components/community/create-post-flow.tsx", import.meta.url),
  "utf8",
);
const matchesUi = readFileSync(
  new URL("../components/matches/post-matches.tsx", import.meta.url),
  "utf8",
);
const roomUi = readFileSync(
  new URL("../components/rooms/room-discovery.tsx", import.meta.url),
  "utf8",
);
const compareUi = readFileSync(
  new URL("../components/rooms/room-compare.tsx", import.meta.url),
  "utf8",
);

const source = {
  id: "post-1",
  type: "NEED_ROOM",
  title: "Looking for a room in HSR Layout",
  communityId: "community-hsr",
  localityId: "locality-hsr",
  locality: "HSR Layout",
  localitySlug: "hsr-layout",
  city: "Bengaluru",
  citySlug: "bengaluru",
  monthlyAmountMin: null,
  monthlyAmountMax: 25000,
  moveInDate: "2026-10-15",
  furnishingStatus: "SEMI_FURNISHED",
  propertyType: null,
  roomType: "PRIVATE_ROOM",
  tags: ["Status: Working professional", "Commute: up to 10 km"],
};

test("room requirements become ordinary eligible discovery filters", () => {
  const filters = postMatch.postMatchFilters(source);

  assert.equal(filters.room.communityId, "community-hsr");
  assert.equal(filters.room.citySlug, "bengaluru");
  assert.equal(filters.room.budgetMax, 25000);
  assert.equal(filters.room.moveInBy, "2026-10-15");
  assert.equal(filters.room.furnishing, "SEMI_FURNISHED");
  assert.equal(filters.room.maximumDistanceKm, 10);
  assert.equal(filters.room.sort, "recommended");
  assert.equal(filters.people.localityId, "locality-hsr");
  assert.deepEqual(filters.seekerTypes, ["NEED_ROOM", "NEED_FLATMATE"]);
});

test("property posts match seekers without generating another property search", () => {
  const filters = postMatch.postMatchFilters({
    ...source,
    type: "ROOM_AVAILABLE",
    monthlyAmountMin: 18000,
    monthlyAmountMax: 18000,
  });

  assert.equal(filters.room, null);
  assert.equal(filters.people.budgetMin, 18000);
  assert.equal(filters.people.budgetMax, 18000);
  assert.deepEqual(filters.seekerTypes, ["NEED_ROOM"]);
});

test("post-match route is private to the authenticated post owner", () => {
  assert.ok(
    existsSync(new URL("../app/matches/post/[postId]/page.tsx", import.meta.url)),
  );
  assert.match(routeSource, /supabase\.auth\.getClaims\(\)/);
  assert.match(routeSource, /redirect\(`\/login\?next=/);
  assert.match(dataSource, /author: \{ authUserId \}/);
  assert.match(dataSource, /status: "ACTIVE"/);
  assert.match(dataSource, /moderationStatus: "VISIBLE"/);
  assert.match(dataSource, /availabilityStatus: \{ in: \["AVAILABLE", "RESERVED"\] \}/);
});

test("match retrieval reuses ranked discovery and preserves eligibility rules", () => {
  assert.match(dataSource, /loadRoomDiscovery\(authUserId, filters\.room\)/);
  assert.match(dataSource, /loadPeopleDiscovery\(authUserId, filters\.people/);
  assert.match(dataSource, /requirementTypes: filters\.seekerTypes/);
  assert.match(dataSource, /requirementCommunityId: source\.communityId/);
  assert.match(peopleDataSource, /posts: \{ some: activeRequirementWhere \}/);
  assert.match(peopleDataSource, /blocksCreated: \{ none: \{ blockedId: viewer\.id \} \}/);
  assert.match(peopleDataSource, /blocksReceived: \{ none: \{ blockerId: viewer\.id \} \}/);
  assert.match(peopleDataSource, /status: "SUSPENDED"/);
});

test("successful post creation routes to matches with actionable cards", () => {
  assert.match(flowSource, /"\/matches\/post\/" \+ encodeURIComponent\(actionState\.postId\)/);
  assert.match(matchesUi, /RoomListingCard/);
  assert.match(matchesUi, /PeopleCard/);
  assert.match(matchesUi, /Compare shortlist/);
  assert.match(roomUi, /View details/);
  assert.match(roomUi, /Message/);
  assert.match(compareUi, /SavePostButton/);
  assert.match(compareUi, /Compare/);
});
