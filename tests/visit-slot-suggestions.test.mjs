import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../lib/visit-availability.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiled = { exports: {} };
new Function("module", "exports", "require", output)(compiled, compiled.exports, require);
const availability = compiled.exports;

const data = readFileSync(new URL("../lib/visit-data.ts", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/visits/actions.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../components/visits/visit-sections.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL(
  "../prisma/migrations/20260906100000_smart_visit_slot_suggestions/migration.sql",
  import.meta.url,
), "utf8");
const counterProposalMigration = readFileSync(new URL(
  "../prisma/migrations/20260906101000_visit_counter_proposals/migration.sql",
  import.meta.url,
), "utf8");

test("preferred day and time outrank an earlier neutral slot deterministically", () => {
  const preference = availability.normalizeVisitSlotPreference({
    preferredWeekdays: [2],
    preferredStartMinute: 600,
    preferredEndMinute: 720,
  });
  const input = {
    slots: [
      "2026-09-07T04:30:00.000Z",
      "2026-09-08T04:30:00.000Z",
      "2026-09-08T05:00:00.000Z",
    ],
    preference,
    now: new Date("2026-09-07T00:00:00.000Z"),
  };
  const first = availability.rankVisitSlotSuggestions(input);
  const second = availability.rankVisitSlotSuggestions(input);
  assert.deepEqual(first, second);
  assert.equal(first[0].startsAt, "2026-09-08T04:30:00.000Z");
  assert.deepEqual(first[0].reasons, ["PREFERRED_DAY", "PREFERRED_TIME"]);
});

test("blocked and booked slots never enter the ranked suggestion set", () => {
  const slots = availability.generateVisitSlots({
    rules: [{ weekday: 1, startMinute: 600, endMinute: 840 }],
    blocks: [{ startsAt: "2026-09-07T05:00:00.000Z", endsAt: "2026-09-07T06:00:00.000Z" }],
    occupiedStarts: ["2026-09-07T07:00:00.000Z"],
    now: new Date("2026-09-07T00:00:00.000Z"),
    days: 1,
  });
  const suggestions = availability.rankVisitSlotSuggestions({
    slots,
    now: new Date("2026-09-07T00:00:00.000Z"),
  });
  assert.deepEqual(suggestions.map((item) => item.startsAt), [
    "2026-09-07T06:00:00.000Z",
  ]);
});

test("invalid preference windows fail closed and neutral ranking uses earliest slots", () => {
  assert.equal(availability.normalizeVisitSlotPreference({
    preferredWeekdays: [1], preferredStartMinute: 600, preferredEndMinute: 630,
  }), null);
  const ranked = availability.rankVisitSlotSuggestions({
    slots: ["2026-09-08T05:00:00.000Z", "2026-09-07T05:00:00.000Z"],
    now: new Date("2026-09-07T00:00:00.000Z"),
  });
  assert.equal(ranked[0].startsAt, "2026-09-07T05:00:00.000Z");
  assert.deepEqual(ranked[0].reasons, ["SOONEST_AVAILABLE"]);
});

test("both visit sides receive safe ranked slots without raw preference fields", () => {
  assert.match(data, /slotPreference:[\s\S]*preferredWeekdays/);
  assert.match(data, /suggestedSlots: rankVisitSlotSuggestions/);
  assert.match(ui, /perspective=\{visit\.role\}/);
  assert.match(ui, /Fits the visitor’s shared preference/);
  assert.match(ui, /Private schedules and other bookings are never shown/);
  assert.match(actions, /VisitSlotPreference/);
  assert.match(ui, /Choose another time/);
  assert.match(ui, /raw preference is never shown to the owner/i);
  assert.doesNotMatch(ui, /visitor.?s preferred(Start|End|Weekday)/i);
});

test("preference rows are requester-only and validated at the database boundary", () => {
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /Requesters can read their visit slot preference/);
  assert.match(migration, /"requesterId" = \(SELECT nestmate_private\.current_nestmate_user_id\(\)\)/);
  assert.match(migration, /VisitSlotPreference_time_window_check/);
  assert.match(migration, /VisitSlotPreference_weekdays_check/);
  assert.match(migration, /validate_visit_slot_preference/);
  assert.match(migration, /REVOKE ALL ON FUNCTION nestmate_private\.validate_visit_slot_preference/);
  assert.match(counterProposalMigration, /current_user_id = OLD\."requesterId"[\s\S]*NEW\."status" = 'PROPOSED'/);
  assert.match(counterProposalMigration, /visit_time_is_available/);
  assert.match(counterProposalMigration, /pg_advisory_xact_lock/);
});
