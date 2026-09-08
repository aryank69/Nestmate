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

const migration = readFileSync(new URL(
  "../prisma/migrations/20260905150000_visit_availability/migration.sql",
  import.meta.url,
), "utf8");
const invokerMigration = readFileSync(new URL(
  "../prisma/migrations/20260905150100_visit_availability_invoker/migration.sql",
  import.meta.url,
), "utf8");
const cadenceMigration = readFileSync(new URL(
  "../prisma/migrations/20260905150200_visit_slot_cadence/migration.sql",
  import.meta.url,
), "utf8");
const actions = readFileSync(new URL("../app/visits/actions.ts", import.meta.url), "utf8");
const data = readFileSync(new URL("../lib/visit-availability-data.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../components/visits/visit-sections.tsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("../components/visits/visit-availability-editor.tsx", import.meta.url), "utf8");

test("weekly availability generates one-hour slots on the correct India weekday", () => {
  const slots = availability.generateVisitSlots({
    rules: [{ weekday: 1, startMinute: 600, endMinute: 720 }],
    now: new Date("2026-09-07T00:00:00.000Z"),
    days: 1,
  });
  assert.deepEqual(slots.map((slot) => slot.toISOString()), [
    "2026-09-07T04:30:00.000Z",
    "2026-09-07T05:00:00.000Z",
    "2026-09-07T05:30:00.000Z",
  ]);
});

test("blocked intervals and accepted visits remove overlaps but not boundary slots", () => {
  const slots = availability.generateVisitSlots({
    rules: [{ weekday: 1, startMinute: 600, endMinute: 840 }],
    blocks: [{ startsAt: "2026-09-07T05:00:00.000Z", endsAt: "2026-09-07T06:00:00.000Z" }],
    occupiedStarts: ["2026-09-07T07:00:00.000Z"],
    now: new Date("2026-09-07T00:00:00.000Z"),
    days: 1,
  });
  assert.deepEqual(slots.map((slot) => slot.toISOString()), [
    "2026-09-07T06:00:00.000Z",
  ]);
});

test("no recurring schedule means no slots and invalid intervals fail closed", () => {
  assert.deepEqual(availability.generateVisitSlots({ rules: [], days: 21 }), []);
  assert.equal(availability.intervalsOverlap("invalid", "invalid", new Date(), new Date()), false);
  assert.equal(availability.timeValueToMinute("09:30"), 570);
  assert.equal(availability.timeValueToMinute("25:00"), null);
});

test("request and reschedule UI submits only generated open slot values", () => {
  assert.match(ui, /availableSlots: string\[\]/);
  assert.match(ui, /Choose an open slot/);
  assert.match(ui, /other bookings stay private/i);
  assert.doesNotMatch(ui, /type="datetime-local"/);
  assert.match(editor, /recurring|weekly availability/i);
  assert.match(editor, /Blocked dates and times/);
  assert.match(editor, /never your schedule or other bookings/i);
  assert.match(data, /loadOwnerVisitSlots/);
  assert.match(data, /excludedVisitId/);
  assert.match(actions, /loadOwnerVisitSlots/);
  assert.match(actions, /no open visit slots in the next three weeks/i);
});

test("database policies isolate schedules and enforce valid slots under a lock", () => {
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/g);
  assert.match(migration, /Owners can read their visit availability/);
  assert.match(migration, /Owners can read their blocked visit times/);
  assert.match(migration, /current_nestmate_user_id/);
  assert.match(migration, /visit_time_is_available/);
  assert.match(migration, /AT TIME ZONE 'Asia\/Kolkata'/);
  assert.match(migration, /VisitAvailabilityBlock_range_check/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /That visit time is unavailable/);
  assert.match(migration, /REVOKE ALL ON FUNCTION nestmate_private\.visit_time_is_available/);
  assert.match(invokerMigration, /replace_visit_availability\(JSONB\) SECURITY INVOKER/);
  assert.match(cadenceMigration, /date_trunc\('minute', target_time\) = target_time/);
  assert.match(cadenceMigration, /MOD\([\s\S]*rule\."startMinute"[\s\S]*30/);
  assert.doesNotMatch(migration, /requester.*blocked period|booking.*requester/i);
});
