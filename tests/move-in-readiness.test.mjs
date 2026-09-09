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

const readiness = compile("../lib/move-in-readiness.ts");
const dataSource = readFileSync(new URL("../lib/move-in-readiness-data.ts", import.meta.url), "utf8");
const communityData = readFileSync(new URL("../lib/community-data.ts", import.meta.url), "utf8");
const publicData = readFileSync(new URL("../lib/public-listing-data.ts", import.meta.url), "utf8");
const recommendationSource = readFileSync(new URL("../lib/recommendations.ts", import.meta.url), "utf8");
const cardSource = readFileSync(new URL("../components/community/community-page.tsx", import.meta.url), "utf8");
const publicPage = readFileSync(new URL("../app/listings/[postId]/page.tsx", import.meta.url), "utf8");
const indicatorSource = readFileSync(new URL("../components/listings/move-in-readiness-indicator.tsx", import.meta.url), "utf8");

const now = new Date("2026-09-09T12:00:00.000Z");
const responsive = {
  level: "quick",
  label: "Usually responds quickly",
  description: "Privacy-safe pattern.",
  recommendationAlignment: 1,
};
const completeDetails = Object.fromEntries([
  "rent", "availabilityDate", "furnishing", "roomType", "occupancy", "deposit",
  "maintenance", "preferredOccupant", "attachedBathroom", "parking", "amenities",
].map((key) => [key, true]));

function evidence(overrides = {}) {
  return {
    availability: { status: "AVAILABLE", isStale: false, ageDays: 3 },
    imageCount: 4,
    latestPhotoAt: "2026-09-05T12:00:00.000Z",
    verificationKinds: ["PROPERTY"],
    trust: { score: 78, confidence: "established", label: "Strong trust signals", reasons: [] },
    responsiveness: responsive,
    hasOpenVisitSlots: true,
    propertyDetails: completeDetails,
    ...overrides,
  };
}

test("readiness is deterministic, bounded, weighted, and separate from personal fit", () => {
  const first = readiness.calculateMoveInReadiness(evidence(), now);
  const second = readiness.calculateMoveInReadiness(evidence(), now);
  assert.deepEqual(first, second);
  assert.equal(first.score, 100);
  assert.equal(first.label, "High readiness");
  assert.equal(first.factors.reduce((sum, factor) => sum + factor.weight, 0), 100);
  assert.ok(first.reasons.includes("Recently updated"));
  assert.ok(first.reasons.includes("Recent photos provided"));
  assert.ok(first.reasons.includes("Visit slots available"));
  assert.doesNotMatch(JSON.stringify(first), /budget|locality|commute|lifestyle|move-in preference/i);
});

test("reserved, stale, incomplete listings with limited activity show low readiness cautions", () => {
  const result = readiness.calculateMoveInReadiness(evidence({
    availability: { status: "RESERVED", isStale: true, ageDays: 60 },
    imageCount: 0,
    verificationKinds: [],
    trust: { score: 50, confidence: "neutral", label: "Trust history building", reasons: [] },
    responsiveness: { ...responsive, level: "limited", recommendationAlignment: 0.35 },
    hasOpenVisitSlots: false,
    propertyDetails: Object.fromEntries(Object.keys(completeDetails).map((key) => [key, false])),
  }), now);
  assert.equal(result.label, "Low readiness");
  assert.ok(result.considerations.includes("Availability needs reconfirmation"));
  assert.ok(result.factors.some(({ reason }) => reason === "Key property details are missing"));
  assert.ok(result.factors.some(({ reason }) => reason === "Owner response activity is limited"));
});

test("neutral owner history is not treated as a negative signal", () => {
  const result = readiness.calculateMoveInReadiness(evidence({
    responsiveness: { ...responsive, level: "neutral", recommendationAlignment: null },
  }), now);
  const factor = result.factors.find(({ key }) => key === "responsiveness");
  assert.equal(factor.alignment, 0.5);
  assert.equal(factor.tone, "neutral");
});

test("visit availability data exposes only a boolean signal", () => {
  assert.match(dataSource, /import "server-only"/);
  assert.match(dataSource, /generateVisitSlots/);
  assert.match(dataSource, /new Map\(\s*uniqueOwnerIds\.map/);
  assert.doesNotMatch(dataSource, /return \{[\s\S]*?(rules|blocks|occupiedStarts|scheduledAt)/);
  assert.doesNotMatch(indicatorSource, /scheduledAt|startMinute|endMinute|privateNote/);
  assert.match(indicatorSource, /schedules, bookings, and message details are never shown/);
});

test("readiness renders on listing cards and both detail views", () => {
  assert.match(cardSource, /MoveInReadinessIndicator/);
  assert.match(cardSource, /value=\{post\.readiness\}/);
  assert.match(publicPage, /Move-in Readiness/);
  assert.match(publicPage, /value=\{listing\.readiness\}/);
  assert.match(communityData, /calculateMoveInReadiness/);
  assert.match(publicData, /calculateMoveInReadiness/);
});

test("readiness only breaks equal recommendation ranks and never changes Living Fit scoring", () => {
  assert.match(recommendationSource, /readinessRankingValue\(second\.readiness\)/);
  assert.match(recommendationSource, /readinessRankingValue\(first\.readiness\)/);
  assert.doesNotMatch(
    recommendationSource.slice(
      recommendationSource.indexOf("listingWeights:"),
      recommendationSource.indexOf("peopleWeights:"),
    ),
    /readiness/,
  );
});
