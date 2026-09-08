import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
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

const freshness = compile("../lib/listing-freshness.ts");
const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260904130000_listing_freshness/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const policyFixMigration = readFileSync(
  new URL(
    "../prisma/migrations/20260904131500_listing_freshness_policy_fix/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const communityData = readFileSync(
  new URL("../lib/community-data.ts", import.meta.url),
  "utf8",
);
const actionSource = readFileSync(
  new URL("../app/community/actions.ts", import.meta.url),
  "utf8",
);

const now = new Date("2026-09-04T12:00:00.000Z");

test("freshness becomes stale at the configurable age boundary", () => {
  const fresh = freshness.listingFreshness(
    "AVAILABLE",
    "2026-08-06T12:00:00.000Z",
    now,
    30,
  );
  const stale = freshness.listingFreshness(
    "AVAILABLE",
    "2026-08-05T12:00:00.000Z",
    now,
    30,
  );

  assert.equal(fresh.isStale, false);
  assert.equal(fresh.ageDays, 29);
  assert.equal(stale.isStale, true);
  assert.equal(stale.ageDays, 30);
  assert.match(stale.freshnessLabel, /Needs confirmation/);
});

test("listing status parsing and configuration fail safely", () => {
  assert.equal(freshness.parseListingAvailabilityStatus("RESERVED"), "RESERVED");
  assert.equal(freshness.parseListingAvailabilityStatus("ARCHIVED"), null);
  assert.equal(freshness.resolveListingStaleAfterDays("45"), 45);
  assert.equal(freshness.resolveListingStaleAfterDays("0"), 30);
  assert.equal(freshness.resolveListingStaleAfterDays("not-a-number"), 30);
});

test("closed listings are never presented as stale and rank as unavailable", () => {
  const closed = freshness.listingFreshness(
    "CLOSED",
    "2025-01-01T00:00:00.000Z",
    now,
    30,
  );

  assert.equal(closed.isStale, false);
  assert.equal(closed.label, "Closed");
  assert.equal(freshness.freshnessRecommendationAlignment(closed), 0);
});

test("fresh listings are promoted without removing eligible results", () => {
  const ranked = freshness.rankFreshListingsFirst([
    { id: "stale", availability: { isStale: true } },
    { id: "fresh", availability: { isStale: false } },
  ]);

  assert.deepEqual(ranked.map(({ id }) => id), ["fresh", "stale"]);
  assert.deepEqual(new Set(ranked.map(({ id }) => id)), new Set(["fresh", "stale"]));
});

test("queries, owner mutations, and RLS consistently protect closed listings", () => {
  assert.match(communityData, /availabilityStatus: \{ in: \["AVAILABLE", "RESERVED"\] \}/);
  assert.match(communityData, /availabilityStatus: "CLOSED" as const/);
  assert.match(actionSource, /updatePostAvailabilityAction/);
  assert.match(actionSource, /lastConfirmedAt: now/);
  assert.match(migration, /ListingAvailabilityStatus/);
  assert.match(policyFixMigration, /DROP POLICY IF EXISTS "Visitors can read active community posts"/);
  assert.match(policyFixMigration, /DROP POLICY IF EXISTS "Users can read unblocked active community posts"/);
  assert.match(policyFixMigration, /app_user\."authUserId" = \(SELECT auth\.uid\(\)\)/);
  assert.match(policyFixMigration, /user_block\."blockerId"/);
  assert.match(migration, /saved_post\."availabilityStatus" IN/);
  assert.match(migration, /viewed_post\."availabilityStatus" IN/);
});
