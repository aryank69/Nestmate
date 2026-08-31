import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../lib/compatibility.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const compatibilityModule = { exports: {} };

new Function("module", "exports", "require", compiled)(
  compatibilityModule,
  compatibilityModule.exports,
  require,
);

const { calculateCompatibility, COMPATIBILITY_WEIGHTS } =
  compatibilityModule.exports;

const completeProfile = {
  budget: { minimum: 18000, maximum: 25000 },
  preferredLocalities: ["Indiranagar", "HSR Layout"],
  diet: "Vegetarian",
  smoking: "Non-smoker",
  drinking: "Occasionally",
  sleepSchedule: "Early bird",
  cleanliness: "Very tidy",
  pets: "Pet friendly",
  occupationStatus: "Working professional",
};

test("weights form a transparent 100-point model", () => {
  assert.equal(
    Object.values(COMPATIBILITY_WEIGHTS).reduce(
      (total, weight) => total + weight,
      0,
    ),
    100,
  );
});

test("identical complete profiles receive a 100 score", () => {
  const result = calculateCompatibility(completeProfile, completeProfile);

  assert.equal(result.score, 100);
  assert.equal(result.comparedFactors, 9);
  assert.equal(result.mainMismatches.length, 0);
  assert.equal(result.label, "Excellent preference match");
});

test("locality matching is case-insensitive and budget overlap is recognized", () => {
  const other = {
    ...completeProfile,
    budget: { minimum: 24000, maximum: 30000 },
    preferredLocalities: ["  indiranagar  "],
  };
  const result = calculateCompatibility(completeProfile, other);

  assert.equal(
    result.factors.find((factor) => factor.key === "budget")?.alignment,
    1,
  );
  assert.equal(
    result.factors.find((factor) => factor.key === "locality")?.alignment,
    1,
  );
});

test("missing fields are excluded instead of being treated as mismatches", () => {
  const sparse = {
    budget: completeProfile.budget,
    preferredLocalities: completeProfile.preferredLocalities,
    diet: null,
    smoking: null,
    drinking: null,
    sleepSchedule: null,
    cleanliness: null,
    pets: null,
    occupationStatus: null,
  };
  const result = calculateCompatibility(completeProfile, sparse);

  assert.equal(result.score, 100);
  assert.equal(result.comparedFactors, 2);
  assert.equal(result.comparedWeight, 40);
});

test("important conflicts are surfaced as the main mismatching factors", () => {
  const other = {
    budget: { minimum: 40000, maximum: 50000 },
    preferredLocalities: ["Whitefield"],
    diet: "Non-vegetarian",
    smoking: "Regularly",
    drinking: "Regularly",
    sleepSchedule: "Night owl",
    cleanliness: "Relaxed",
    pets: "Have a pet",
    occupationStatus: "Student",
  };
  const result = calculateCompatibility(completeProfile, other);

  assert.notEqual(result.score, null);
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.deepEqual(
    result.mainMismatches.map((factor) => factor.key),
    ["budget", "locality"],
  );
});
