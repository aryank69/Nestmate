import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const helperSource = readFileSync(
  new URL("../lib/comparison.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const helperModule = { exports: {} };
new Function("module", "exports", "require", compiled)(
  helperModule,
  helperModule.exports,
  require,
);

const {
  bestComparisonIds,
  hasMeaningfulDifference,
  parseComparisonSelection,
} = helperModule.exports;
const comparisonData = readFileSync(
  new URL("../lib/comparison-data.ts", import.meta.url),
  "utf8",
);
const comparisonUi = readFileSync(
  new URL("../components/saved/listing-comparison.tsx", import.meta.url),
  "utf8",
);
const selectionUi = readFileSync(
  new URL("../components/saved/saved-post-grid.tsx", import.meta.url),
  "utf8",
);
const savedData = readFileSync(
  new URL("../lib/saved-data.ts", import.meta.url),
  "utf8",
);

test("comparison selection removes duplicates, rejects unsafe ids, and caps at four", () => {
  const parsed = parseComparisonSelection([
    "post_1,post_2,post_1",
    "post_3,post_4,post_5,bad/id",
  ]);
  assert.deepEqual(parsed.ids, ["post_1", "post_2", "post_3", "post_4"]);
  assert.equal(parsed.selectionWasTrimmed, true);
});

test("meaningful differences are normalized and equal values are not highlighted", () => {
  assert.equal(hasMeaningfulDifference(["Furnished", "furnished "]), false);
  assert.equal(hasMeaningfulDifference([["WiFi", "Gym"], ["Gym", "WiFi"]]), false);
  assert.equal(hasMeaningfulDifference(["Available", "Reserved"]), true);
  assert.equal(hasMeaningfulDifference([null, "₹2,000"]), true);
});

test("best-value labels appear only where selected values genuinely differ", () => {
  assert.deepEqual(
    [...bestComparisonIds([
      { id: "a", value: 18000 },
      { id: "b", value: 22000 },
      { id: "c", value: 18000 },
    ], "LOWEST")].sort(),
    ["a", "c"],
  );
  assert.deepEqual(
    [...bestComparisonIds([
      { id: "a", value: 82 },
      { id: "b", value: 82 },
    ], "HIGHEST")],
    [],
  );
});

test("comparison data is authorized through the user's saved rows and existing privacy rules", () => {
  assert.match(comparisonData, /from\("SavedPost"\)/);
  assert.match(comparisonData, /\.eq\("userId", input\.userId\)/);
  assert.match(comparisonData, /type: \{ in: \["ROOM_AVAILABLE", "PG_AVAILABLE"\] \}/);
  assert.match(comparisonData, /moderationStatus: "VISIBLE"/);
  assert.match(comparisonData, /blocksCreated: \{ none: \{ blockedId: input\.userId \} \}/);
  assert.match(comparisonData, /blocksReceived: \{ none: \{ blockerId: input\.userId \} \}/);
  assert.match(comparisonData, /status: "SUSPENDED"/);
  assert.match(comparisonData, /This listing is unavailable, was removed/);
});

test("comparison reuses existing recommendation, commute, freshness, and verification values", () => {
  assert.match(comparisonData, /calculateListingRecommendation\(post, viewer\)/);
  assert.doesNotMatch(comparisonData, /RECOMMENDATION_WEIGHTS|weightedPoints/);
  for (const label of [
    "Monthly rent",
    "Deposit",
    "Maintenance",
    "Furnishing",
    "Room type",
    "Amenities",
    "Availability date",
    "Distance & commute",
    "Living Fit",
    "Freshness",
    "Listing verification",
  ]) {
    assert.match(comparisonUi, new RegExp(label.replace(/[&]/g, "\\&")));
  }
  assert.match(comparisonUi, /Based on an approximate location/);
});

test("saved housing cards expose selection only for eligible listing types", () => {
  assert.match(savedData, /category === "Room Available" \|\| category === "PG Available"/);
  assert.match(selectionUi, /MAX_COMPARISON_LISTINGS/);
  assert.match(selectionUi, /Select 2–4 Room Available or PG Available listings/);
  assert.match(selectionUi, /comparisonEligible/);
});
