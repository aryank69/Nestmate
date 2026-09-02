import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../lib/discovery.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const discoveryModule = { exports: {} };

new Function("module", "exports", "require", compiled)(
  discoveryModule,
  discoveryModule.exports,
  require,
);

const {
  activeCommunityFilterCount,
  communityFilterQuery,
  parseCommunityPostFilters,
  parsePeopleFilters,
} = discoveryModule.exports;

test("community filters normalize invalid values and inverted budgets", () => {
  const filters = parseCommunityPostFilters({
    q: "  metro room  ",
    type: "ROOM_AVAILABLE",
    min: "25000",
    max: "15000",
    gender: "WOMEN",
    sort: "lowest-amount",
  });

  assert.equal(filters.query, "metro room");
  assert.equal(filters.postType, "ROOM_AVAILABLE");
  assert.equal(filters.budgetMin, 25000);
  assert.equal(filters.budgetMax, 25000);
  assert.equal(filters.genderPreference, "WOMEN");
  assert.equal(filters.sort, "lowest-amount");
});

test("community tab links preserve active database-backed filters", () => {
  const filters = parseCommunityPostFilters({ q: "quiet", max: "22000" });
  const query = new URLSearchParams(
    communityFilterQuery(filters, "NEED_FLATMATE"),
  );

  assert.equal(query.get("q"), "quiet");
  assert.equal(query.get("max"), "22000");
  assert.equal(query.get("type"), "NEED_FLATMATE");
  assert.equal(activeCommunityFilterCount(filters), 2);
});

test("people filters only accept known lifestyle and score values", () => {
  const filters = parsePeopleFilters({
    diet: "VEGETARIAN",
    smoking: "sometimes",
    sleep: "EARLY_BIRD",
    score: "70",
    sort: "highest-compatibility",
  });

  assert.equal(filters.diet, "VEGETARIAN");
  assert.equal(filters.smoking, null);
  assert.equal(filters.sleepSchedule, "EARLY_BIRD");
  assert.equal(filters.minimumCompatibility, 70);
  assert.equal(filters.sort, "highest-compatibility");
});

test("invalid dates, negative money, and scores above 100 are ignored", () => {
  const filters = parsePeopleFilters({
    min: "-1",
    moveInBy: "not-a-date",
    score: "101",
  });

  assert.equal(filters.budgetMin, null);
  assert.equal(filters.moveInBy, "");
  assert.equal(filters.minimumCompatibility, null);
});
