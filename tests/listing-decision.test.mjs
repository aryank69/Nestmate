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

const decision = compile("../lib/listing-decision.ts");
const decisionSource = readFileSync(new URL("../lib/listing-decision.ts", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../components/listings/listing-decision-panel.tsx", import.meta.url), "utf8");
const roomSource = readFileSync(new URL("../components/community/community-room.tsx", import.meta.url), "utf8");
const cardSource = readFileSync(new URL("../components/community/community-page.tsx", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("../app/community/post/[postId]/page.tsx", import.meta.url), "utf8");
const publicSource = readFileSync(new URL("../app/listings/[postId]/page.tsx", import.meta.url), "utf8");
const recommendationSource = readFileSync(new URL("../lib/recommendations.ts", import.meta.url), "utf8");

const livingFit = {
  score: 82,
  label: "Strong fit",
  comparedWeight: 80,
  factors: [],
  reasons: ["Budget matches"],
  considerations: [],
};
const reality = {
  score: 78,
  label: "Mostly accurate",
  responseCount: 4,
  categories: [{ key: "photosAccuracy", label: "Photos", score: 90, indicator: "Very accurate" }],
};
const readiness = {
  score: 88,
  level: "high",
  label: "High readiness",
  reasons: ["Recently updated"],
  considerations: [],
  factors: [],
};
const insufficientMetric = { status: "INSUFFICIENT", value: null, detail: "Not enough data." };
const localityPulse = {
  minimumSampleSize: 5,
  activeListings: { status: "AVAILABLE", value: 12, detail: "Eligible listings." },
  peopleSearching: insufficientMetric,
  medianRent: insufficientMetric,
  typicalDeposit: insufficientMetric,
  listingFreshness: { status: "AVAILABLE", value: "About 80% recently confirmed", detail: "Broad share." },
  supplyDemandTrend: insufficientMetric,
  popularMoveInPeriod: insufficientMetric,
  commutePattern: insufficientMetric,
};

test("strong recommendation keeps every signal separate and has no combined score", () => {
  const result = decision.buildListingDecision({ livingFit, reality, readiness, localityPulse, locality: "Indiranagar" });
  assert.equal(result.label, "Strong Match");
  assert.deepEqual(result.signals.map(({ key }) => key), ["livingFit", "reality", "readiness", "localityPulse"]);
  assert.equal("score" in result, false);
  assert.match(result.signals[0].value, /82%/);
  assert.match(result.signals[2].value, /88\/100/);
  assert.match(result.signals[3].value, /80% recently confirmed/);
});

test("low available evidence produces Low Priority with a visible explanation", () => {
  const result = decision.buildListingDecision({
    livingFit: { ...livingFit, score: 35, label: "Lower fit", reasons: [], considerations: ["Rent is outside your budget"] },
    reality,
    readiness,
    localityPulse,
    locality: "Indiranagar",
  });
  assert.equal(result.label, "Low Priority");
  assert.match(result.explanation, /need attention/i);
  assert.equal(result.signals[0].status, "caution");
  assert.match(result.signals[0].explanation, /outside your budget/i);
});

test("missing Living Fit, Reality, and Locality Pulse are neutral rather than negative", () => {
  const result = decision.buildListingDecision({
    livingFit: null,
    reality: { score: null, label: "Not enough verified feedback", responseCount: null, categories: [] },
    readiness,
    localityPulse: null,
    locality: "Indiranagar",
  });
  assert.equal(result.label, "Worth Considering");
  assert.equal(result.signals.filter(({ status }) => status === "missing").length, 3);
  assert.match(result.signals[1].value, /Not enough verified feedback/);
  assert.match(result.signals[3].value, /Not enough locality data/);
});

test("privacy-thresholded locality data remains insufficient in the panel", () => {
  const pulse = Object.fromEntries(Object.keys(localityPulse).map((key) =>
    key === "minimumSampleSize" ? [key, 5] : [key, insufficientMetric]
  ));
  const result = decision.buildListingDecision({ livingFit, reality, readiness, localityPulse: pulse, locality: "Indiranagar" });
  const locality = result.signals.find(({ key }) => key === "localityPulse");
  assert.equal(locality.status, "missing");
  assert.match(locality.value, /Not enough locality data/);
  assert.match(locality.explanation, /At least 5 eligible records/);
});

test("panel renders all explanations on cards and member/public details", () => {
  assert.match(decisionSource, /Living Fit/);
  assert.match(decisionSource, /Reality Score/);
  assert.match(decisionSource, /Move-in Readiness/);
  assert.match(decisionSource, /Locality Pulse/);
  assert.match(panelSource, /Missing data is not treated as a negative/);
  assert.match(cardSource, /ListingDecisionPanel/);
  assert.match(roomSource, /localityPulse=\{localityPulse\}/);
  assert.match(detailSource, /loadLocalityPulseForPost/);
  assert.match(publicSource, /ListingDecisionPanel/);
});

test("decision display does not alter filters, visibility, RLS, or Living Fit ranking", () => {
  assert.doesNotMatch(recommendationSource, /listing-decision|buildListingDecision/);
  assert.doesNotMatch(panelSource, /privateNote|scheduledAt|startMinute|endMinute|commuteDestination/);
  assert.doesNotMatch(decision.toString(), /privateNote|report|moderation|message/);
});
