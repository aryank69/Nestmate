import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const migration = readFileSync(new URL("../prisma/migrations/20260904200000_flatmate_shortlists/migration.sql", import.meta.url), "utf8");
const dataSource = readFileSync(new URL("../lib/shortlist-data.ts", import.meta.url), "utf8");
const peopleData = readFileSync(new URL("../lib/people-data.ts", import.meta.url), "utf8");
const actionSource = readFileSync(new URL("../app/shortlist/actions.ts", import.meta.url), "utf8");
const shortlistUi = readFileSync(new URL("../components/people/flatmate-shortlist.tsx", import.meta.url), "utf8");
const comparisonUi = readFileSync(new URL("../components/people/flatmate-comparison.tsx", import.meta.url), "utf8");

test("flatmate shortlists have owner/target relationships and database-level ownership", () => {
  assert.match(schema, /model ShortlistedProfile \{/);
  assert.match(schema, /@@id\(\[userId, targetUserId\]\)/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /GRANT SELECT, INSERT, DELETE[\s\S]*TO authenticated/);
  assert.match(migration, /current_nestmate_user_id\(\)/);
  assert.match(migration, /can_access_recent_view\(NULL, "targetUserId"\)/);
  assert.match(migration, /is_user_content_visible\("targetUserId"\)/);
  assert.doesNotMatch(migration, /FOR UPDATE/);
});

test("shortlist writes recheck profile visibility before relying on RLS", () => {
  assert.match(actionSource, /loadPeopleProfile\(/);
  assert.match(actionSource, /from\("ShortlistedProfile"\)/);
  assert.match(actionSource, /\.eq\("userId", context\.user\.id\)/);
  assert.match(actionSource, /private or no longer available/);
});

test("shortlist and comparison reuse the privacy-filtered people query", () => {
  assert.match(dataSource, /loadPeopleDiscovery\(/);
  assert.match(dataSource, /DEFAULT_PEOPLE_FILTERS/);
  assert.match(dataSource, /from\("ShortlistedProfile"\)/);
  assert.match(dataSource, /\.eq\("userId", userId\)/);
  assert.match(peopleData, /blocksCreated: \{ none: \{ blockedId: viewer\.id \} \}/);
  assert.match(peopleData, /blocksReceived: \{ none: \{ blockerId: viewer\.id \} \}/);
  assert.match(peopleData, /status: "SUSPENDED"/);
  assert.match(peopleData, /preferences: \{ is: preferenceWhere\(filters\) \}/);
});

test("comparison caps selection and shows every requested safe comparison signal", () => {
  assert.match(shortlistUi, /MAX_COMPARISON_LISTINGS/);
  assert.match(dataSource, /parseComparisonSelection\(rawIds\)/);
  for (const label of [
    "Compatibility",
    "Budget",
    "Preferred locality",
    "Commute range",
    "Lifestyle",
    "Verification",
    "Responsiveness",
    "Move-in",
    "Occupation / status",
  ]) {
    assert.match(comparisonUi, new RegExp(label.replace("/", "\\/")));
  }
  assert.match(comparisonUi, /bestComparisonIds/);
  assert.match(comparisonUi, /hasMeaningfulDifference/);
});

test("private commute destinations and coordinates never enter the shortlist projection", () => {
  assert.doesNotMatch(dataSource, /commuteDestination|commuteLatitude|commuteLongitude/);
  assert.doesNotMatch(comparisonUi, /profile\.commuteDestination|profile\.commuteLatitude|profile\.commuteLongitude/);
  assert.match(comparisonUi, /Private destination names and exact coordinates are never included/);
  assert.match(peopleData, /preferredCommuteLabel/);
});

test("unavailable, hidden, or unshortlisted comparison ids get a generic placeholder", () => {
  assert.match(dataSource, /allowedIds\.has\(id\)/);
  assert.match(dataSource, /no longer available from your shortlist/);
  assert.match(comparisonUi, /EyeOff/);
});
