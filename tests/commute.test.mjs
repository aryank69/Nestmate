import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);

function compile(relativePath, customRequire = require) {
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
    customRequire,
  );
  return compiledModule.exports;
}

const commute = compile("../lib/commute.ts");
const discovery = compile("../lib/discovery.ts");
const saved = compile("../lib/saved.ts", (id) =>
  id === "@/lib/discovery" ? discovery : require(id),
);
const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260903130000_commute_preferences/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const profileRlsMigration = readFileSync(
  new URL(
    "../prisma/migrations/20260824170000_link_supabase_auth_profiles/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const communityDataSource = readFileSync(
  new URL("../lib/community-data.ts", import.meta.url),
  "utf8",
);
const peopleDataSource = readFileSync(
  new URL("../lib/people-data.ts", import.meta.url),
  "utf8",
);

test("commute preference validation accepts complete private destinations", () => {
  const result = commute.validateCommutePreference({
    destination: "Manyata Tech Park",
    latitude: 13.0497654,
    longitude: 77.6212345,
    preferredRangeKm: 12,
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.data, {
    destination: "Manyata Tech Park",
    latitude: 13.049765,
    longitude: 77.621235,
    preferredRangeKm: 12,
  });
});

test("partial destinations and unsafe commute ranges are rejected", () => {
  const partial = commute.validateCommutePreference({
    destination: "Office",
    latitude: 13.04,
    longitude: null,
    preferredRangeKm: 10,
  });
  const excessive = commute.validateCommutePreference({
    destination: "",
    latitude: null,
    longitude: null,
    preferredRangeKm: 101,
  });

  assert.equal(partial.success, false);
  assert.match(partial.message, /longitude/i);
  assert.equal(excessive.success, false);
  assert.match(excessive.message, /between 1 and 100 km/i);
});

test("distance calculation and relevance use straight-line estimates", () => {
  const distance = commute.distanceBetweenKm(
    { latitude: 28.6139, longitude: 77.209 },
    { latitude: 28.4595, longitude: 77.0266 },
  );
  const summary = commute.summarizeCommute(
    {
      latitude: 13.05,
      longitude: 77.62,
      precision: "APPROXIMATE",
    },
    {
      label: "Manyata Tech Park",
      latitude: 13.0498,
      longitude: 77.6212,
      preferredRangeKm: 5,
    },
  );

  assert.ok(distance > 24 && distance < 26);
  assert.equal(summary.withinPreferredRange, true);
  assert.equal(summary.relevanceLabel, "Within your preferred commute");
  assert.equal(summary.basedOnApproximateLocation, true);
  assert.match(summary.distanceLabel, /^~/);
});

test("commute bounding boxes narrow database candidates before exact filtering", () => {
  const origin = { latitude: 12.9716, longitude: 77.5946 };
  const bounds = commute.commuteBounds(origin, 10);

  assert.ok(bounds.latitudeMin < origin.latitude);
  assert.ok(bounds.latitudeMax > origin.latitude);
  assert.ok(bounds.longitudeMin < origin.longitude);
  assert.ok(bounds.longitudeMax > origin.longitude);
  assert.match(communityDataSource, /commute\.distanceKm > filters\.maximumDistanceKm/);
});

test("community and people commute filters are normalized and preserved", () => {
  const communityFilters = discovery.parseCommunityPostFilters({ distance: "10" });
  const peopleFilters = discovery.parsePeopleFilters({ commute: "15" });
  const communityQuery = discovery.communityFilterQuery(
    communityFilters,
    "ROOM_AVAILABLE",
  );
  const peopleQuery = discovery.peopleFilterQuery(peopleFilters);

  assert.equal(communityFilters.maximumDistanceKm, 10);
  assert.match(communityQuery, /distance=10/);
  assert.equal(peopleFilters.preferredCommuteKm, 15);
  assert.match(peopleQuery, /commute=15/);
  assert.equal(
    discovery.parseCommunityPostFilters({ distance: "0" }).maximumDistanceKm,
    null,
  );
  assert.equal(
    discovery.parsePeopleFilters({ commute: "200" }).preferredCommuteKm,
    null,
  );
});

test("saved searches retain commute filters and readable labels", () => {
  const community = saved.validateSavedSearchInput({
    name: "Near work",
    kind: "COMMUNITY_POSTS",
    href: "/community/bengaluru/hsr-layout?type=ROOM_AVAILABLE&distance=10",
  });
  const people = saved.validateSavedSearchInput({
    name: "Short commute flatmates",
    kind: "PEOPLE",
    href: "/flatmates?commute=15",
  });

  assert.equal(community.success, true);
  assert.match(community.data.path, /distance=10/);
  assert.ok(
    saved
      .savedSearchFilterLabels(community.data.kind, community.data.filters)
      .includes("Within 10 km"),
  );
  assert.equal(people.success, true);
  assert.match(people.data.path, /commute=15/);
  assert.ok(
    saved
      .savedSearchFilterLabels(people.data.kind, people.data.filters)
      .includes("Commute up to 15 km"),
  );
});

test("people discovery exposes commute range but never destination coordinates", () => {
  assert.match(peopleDataSource, /preferredCommuteLabel/);
  assert.match(peopleDataSource, /lte: filters\.preferredCommuteKm/);
  assert.doesNotMatch(
    peopleDataSource,
    /commuteDestination|commuteLatitude|commuteLongitude/,
  );
});

test("database constraints and existing owner-only RLS protect destination pins", () => {
  assert.match(migration, /"commuteLatitude" NUMERIC\(9, 6\)/);
  assert.match(migration, /"commuteLongitude" NUMERIC\(9, 6\)/);
  assert.match(migration, /"commuteDestination" IS NOT NULL/);
  assert.match(migration, /"preferredCommuteKm" BETWEEN 1 AND 100/);
  assert.match(migration, /Post_communityId_latitude_longitude_idx/);
  assert.match(
    profileRlsMigration,
    /CREATE POLICY "Users can read their own preferences"[\s\S]*auth\.uid\(\)/,
  );
  assert.match(
    profileRlsMigration,
    /CREATE POLICY "Users can update their own preferences"[\s\S]*WITH CHECK/,
  );
});

test("listing commute calculations use the privacy-normalized public point", () => {
  const normalizedAt = communityDataSource.indexOf("publicMapPoint(");
  const summarizedAt = communityDataSource.indexOf("summarizeCommute(");

  assert.ok(normalizedAt >= 0);
  assert.ok(summarizedAt > normalizedAt);
});
