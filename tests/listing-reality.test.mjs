import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../lib/listing-reality.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const realityModule = { exports: {} };
new Function("module", "exports", "require", output)(
  realityModule,
  realityModule.exports,
  require,
);
const reality = realityModule.exports;

const migration = readFileSync(
  new URL("../prisma/migrations/20260908120000_listing_reality_feedback/migration.sql", import.meta.url),
  "utf8",
);
const actions = readFileSync(new URL("../app/visits/actions.ts", import.meta.url), "utf8");
const visitData = readFileSync(new URL("../lib/visit-data.ts", import.meta.url), "utf8");
const scoreData = readFileSync(new URL("../lib/listing-reality-data.ts", import.meta.url), "utf8");
const visitUi = readFileSync(new URL("../components/visits/visit-sections.tsx", import.meta.url), "utf8");
const scoreUi = readFileSync(new URL("../components/trust/listing-reality-score.tsx", import.meta.url), "utf8");
const publicPage = readFileSync(new URL("../app/listings/[postId]/page.tsx", import.meta.url), "utf8");

const validRatings = {
  photosAccuracy: 5,
  costAccuracy: 4,
  amenitiesAccuracy: 3,
  conditionAccuracy: 4,
  locationAccuracy: 5,
  descriptionAccuracy: 4,
};

test("all six listing reality ratings must be integers from 1 to 5", () => {
  assert.deepEqual(reality.parseListingRealityRatings(validRatings), validRatings);
  assert.equal(reality.parseListingRealityRatings({ ...validRatings, costAccuracy: 0 }), null);
  assert.equal(reality.parseListingRealityRatings({ ...validRatings, photosAccuracy: 5.5 }), null);
  assert.equal(reality.parseListingRealityRatings({ ...validRatings, amenitiesAccuracy: "" }), null);
  assert.equal(reality.cleanListingRealityNote("  private note  "), "private note");
  assert.equal(reality.cleanListingRealityNote("   "), null);
});

test("only a mutually confirmed requester can rate after the visit", () => {
  const now = new Date("2026-09-08T14:00:00.000Z");
  const eligible = {
    role: "REQUESTER",
    status: "ACCEPTED",
    scheduledAt: "2026-09-08T12:00:00.000Z",
    requesterAttendance: "HAPPENED",
    ownerAttendance: "HAPPENED",
  };
  assert.equal(reality.canSubmitListingRealityFeedback(eligible, now).eligible, true);
  assert.equal(
    reality.canSubmitListingRealityFeedback({ ...eligible, role: "OWNER" }, now).eligible,
    false,
  );
  assert.equal(
    reality.canSubmitListingRealityFeedback({ ...eligible, ownerAttendance: null }, now).eligible,
    false,
  );
  assert.equal(
    reality.canSubmitListingRealityFeedback(eligible, new Date("2026-09-08T12:30:00Z")).eligible,
    false,
  );
});

test("score stays hidden below the verified-response threshold", () => {
  const result = reality.calculateListingRealityScore({
    responseCount: 2,
    ...validRatings,
  });
  assert.equal(result.score, null);
  assert.equal(result.label, "Not enough verified feedback");
  assert.equal(result.responseCount, null);
  assert.deepEqual(result.categories, []);
});

test("verified aggregates become a transparent 0-100 score with categories", () => {
  const result = reality.calculateListingRealityScore({
    responseCount: 3,
    photosAccuracy: 5,
    costAccuracy: 4,
    amenitiesAccuracy: 3,
    conditionAccuracy: 2,
    locationAccuracy: 1,
    descriptionAccuracy: 5,
  });
  assert.equal(result.score, 58);
  assert.equal(result.responseCount, 3);
  assert.equal(result.categories.length, 6);
  assert.deepEqual(
    result.categories.map(({ label }) => label),
    ["Photos", "Rent & deposit", "Amenities", "Cleanliness & condition", "Location", "Listing description"],
  );
  assert.equal(result.categories[0].score, 100);
  assert.equal(result.categories[4].score, 0);
  assert.equal("reviewerId" in result, false);
  assert.equal("privateNote" in result, false);
});

test("database policy enforces verified visitors, owner prevention, and k-anonymity", () => {
  assert.match(migration, /ALTER TABLE public\."ListingRealityFeedback" ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /visit_request\."requesterId" = target_reviewer_id/);
  assert.match(migration, /visit_request\."ownerId" <> target_reviewer_id/);
  assert.match(migration, /requester_attendance[\s\S]*HAPPENED[\s\S]*owner_attendance[\s\S]*HAPPENED/);
  assert.match(migration, /HAVING count\(DISTINCT feedback\."visitId"\) >= 3/);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON nestmate_private\.listing_reality_aggregate/);
  assert.doesNotMatch(migration, /GRANT SELECT[^;]*ListingRealityFeedback[^;]*anon/);
  const aggregate = migration.slice(migration.indexOf("CREATE VIEW nestmate_private.listing_reality_aggregate"));
  assert.doesNotMatch(aggregate, /"privateNote"/);
  assert.doesNotMatch(aggregate, /"reviewerId" AS/);
  assert.doesNotMatch(aggregate, /feedback\."visitId" AS/);
});

test("server and UI expose only the reviewer's raw row and anonymous score", () => {
  assert.match(actions, /requesterId: context\.user\.id/);
  assert.match(actions, /\.eq\("reviewerId", context\.user\.id\)/);
  assert.match(visitData, /reviewerId: currentUser\.id/);
  assert.doesNotMatch(visitData, /counterpartRealityFeedback/);
  assert.match(scoreData, /nestmate_private\.listing_reality_aggregate/);
  assert.doesNotMatch(scoreData, /privateNote|reviewerId/);
  assert.match(visitUi, /owners cannot rate their own listing|visit\.role === "REQUESTER"/i);
  assert.match(visitUi, /identity, individual ratings, and note stay private/i);
  assert.match(scoreUi, /Not enough verified feedback/);
  assert.match(scoreUi, /Individual reviewers, ratings, and private notes are never shown/);
  assert.match(publicPage, /Listing Reality Score/);
});
