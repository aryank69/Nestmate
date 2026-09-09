import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../lib/locality-pulse.ts", import.meta.url),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const pulseModule = { exports: {} };
new Function("module", "exports", "require", output)(
  pulseModule,
  pulseModule.exports,
  require,
);
const pulse = pulseModule.exports;

const dataSource = readFileSync(
  new URL("../lib/locality-pulse-data.ts", import.meta.url),
  "utf8",
);
const componentSource = readFileSync(
  new URL("../components/community/locality-pulse.tsx", import.meta.url),
  "utf8",
);
const roomSource = readFileSync(
  new URL("../lib/community-data.ts", import.meta.url),
  "utf8",
);

function aggregate(overrides = {}) {
  return {
    activeListings: 8,
    peopleSearching: 6,
    rentSampleSize: 7,
    medianRent: 12_340,
    depositSampleSize: 6,
    medianDeposit: 24_760,
    freshListingCount: 6,
    recentSupply: 8,
    recentDemand: 2,
    previousSupply: 4,
    previousDemand: 6,
    moveInSampleSize: 9,
    moveInSoon: 5,
    moveInOneToTwoMonths: 3,
    moveInTwoToThreeMonths: 1,
    moveInLater: 0,
    commuteSampleSize: 7,
    medianPreferredCommuteKm: 8,
    ...overrides,
  };
}

test("pulse metrics are accurate, rounded, and explain their meaning", () => {
  const result = pulse.buildLocalityPulse(aggregate(), { staleAfterDays: 30 });

  assert.equal(result.minimumSampleSize, 5);
  assert.equal(result.activeListings.value, 8);
  assert.equal(result.peopleSearching.value, 6);
  assert.match(result.medianRent.value, /12,500\/month/);
  assert.match(result.typicalDeposit.value, /25,000/);
  assert.equal(result.listingFreshness.value, "About 80% recently confirmed");
  assert.equal(result.supplyDemandTrend.value, "Supply gaining");
  assert.equal(
    result.popularMoveInPeriod.value,
    "Ready now or next 30 days · 1–2 months",
  );
  assert.equal(result.commutePattern.value, "5–10 km preferred commute");
});
test("every sensitive metric is suppressed below the minimum sample", () => {
  const result = pulse.buildLocalityPulse(
    aggregate({
      activeListings: 4,
      peopleSearching: 4,
      rentSampleSize: 4,
      depositSampleSize: 4,
      recentSupply: 2,
      recentDemand: 2,
      previousSupply: 2,
      previousDemand: 2,
      moveInSampleSize: 4,
      commuteSampleSize: 4,
    }),
    { minimumSampleSize: 1 },
  );

  assert.equal(result.minimumSampleSize, 5);
  for (const metric of Object.values(result).filter(
    (value) => typeof value === "object",
  )) {
    assert.equal(metric.status, "INSUFFICIENT");
    assert.equal(metric.value, null);
  }
});

test("move-in summaries suppress small buckets even when the total is sufficient", () => {
  const result = pulse.buildLocalityPulse(
    aggregate({
      moveInSampleSize: 8,
      moveInSoon: 2,
      moveInOneToTwoMonths: 2,
      moveInTwoToThreeMonths: 2,
      moveInLater: 2,
    }),
  );

  assert.equal(result.popularMoveInPeriod.status, "INSUFFICIENT");
  assert.equal(result.popularMoveInPeriod.value, null);
});

test("the database query is locality-scoped and returns aggregates only", () => {
  assert.match(dataSource, /community\."id" = \$\{communityId\}/);
  assert.match(dataSource, /community\."localityId" = \$\{localityId\}/);
  assert.match(dataSource, /scope\.community_id = post\."communityId"/);
  assert.match(dataSource, /scope\.locality_id = preferred_locality\."localityId"/);
  assert.match(dataSource, /count\(DISTINCT "authorId"\)/);
  assert.match(dataSource, /percentile_cont\(0\.5\)/);
  assert.match(dataSource, /COALESCE\(moderation\."status"::text, ''\) <> 'SUSPENDED'/);
  assert.doesNotMatch(
    dataSource,
    /commuteDestination|commuteLatitude|commuteLongitude|dateOfBirth|email/,
  );
});

test("the locality room receives only the privacy-safe pulse result", () => {
  assert.match(roomSource, /loadLocalityPulse\(community\.id, community\.localityId\)/);
  assert.match(componentSource, /Minimum \{pulse\.minimumSampleSize\} records/);
  assert.match(componentSource, /Not enough data/);
  assert.match(componentSource, /private destinations,[\s\S]*never shown/);
  assert.doesNotMatch(componentSource, /sampleSize|authorId|userId/);
});
