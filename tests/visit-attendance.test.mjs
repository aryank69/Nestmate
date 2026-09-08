import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../lib/visit-attendance.ts", import.meta.url),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const attendanceModule = { exports: {} };
new Function("module", "exports", "require", output)(
  attendanceModule,
  attendanceModule.exports,
  require,
);
const attendance = attendanceModule.exports;

const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260906110000_visit_attendance/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const stateMigration = readFileSync(
  new URL(
    "../prisma/migrations/20260906110200_visit_attendance_state_guard/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const actions = readFileSync(
  new URL("../app/visits/actions.ts", import.meta.url),
  "utf8",
);
const dataSource = readFileSync(
  new URL("../lib/visit-data.ts", import.meta.url),
  "utf8",
);
const activitySource = readFileSync(
  new URL("../lib/activity-data.ts", import.meta.url),
  "utf8",
);
const ui = readFileSync(
  new URL("../components/visits/visit-sections.tsx", import.meta.url),
  "utf8",
);

const activePost = {
  status: "ACTIVE",
  moderationStatus: "VISIBLE",
  availabilityStatus: "AVAILABLE",
  publishedAt: "2026-09-06T00:00:00.000Z",
};

test("check-in is limited to the safe window for an active accepted visit", () => {
  const visit = {
    status: "ACCEPTED",
    scheduledAt: "2026-09-06T12:00:00.000Z",
    post: activePost,
  };
  assert.equal(
    attendance.visitCheckInEligibility(
      visit,
      new Date("2026-09-06T11:30:00.000Z"),
    ).eligible,
    true,
  );
  assert.equal(
    attendance.visitCheckInEligibility(
      visit,
      new Date("2026-09-06T14:00:00.000Z"),
    ).eligible,
    true,
  );
  assert.equal(
    attendance.visitCheckInEligibility(
      visit,
      new Date("2026-09-06T11:29:59.000Z"),
    ).eligible,
    false,
  );
  assert.equal(
    attendance.visitCheckInEligibility(
      visit,
      new Date("2026-09-06T14:00:01.000Z"),
    ).eligible,
    false,
  );
  assert.equal(
    attendance.visitCheckInEligibility(
      { ...visit, post: { ...activePost, availabilityStatus: "CLOSED" } },
      new Date("2026-09-06T12:00:00.000Z"),
    ).eligible,
    false,
  );
});

test("attendance confirmation starts after the visit and supports cancellations", () => {
  const scheduledAt = "2026-09-06T12:00:00.000Z";
  assert.equal(
    attendance.visitAttendanceConfirmationEligibility(
      { status: "ACCEPTED", scheduledAt },
      new Date("2026-09-06T13:00:00.000Z"),
    ).eligible,
    true,
  );
  assert.equal(
    attendance.visitAttendanceConfirmationEligibility(
      { status: "CANCELLED", scheduledAt },
      new Date("2026-09-06T13:00:00.000Z"),
    ).eligible,
    true,
  );
  assert.equal(
    attendance.visitAttendanceConfirmationEligibility(
      { status: "ACCEPTED", scheduledAt },
      new Date("2026-09-06T12:59:59.000Z"),
    ).eligible,
    false,
  );
  assert.equal(
    attendance.visitAttendanceConfirmationEligibility(
      { status: "PENDING", scheduledAt },
      new Date("2026-09-06T14:00:00.000Z"),
    ).eligible,
    false,
  );
});

test("attendance values are constrained and improve completed-visit progress", () => {
  assert.equal(attendance.parseVisitAttendanceConfirmation("HAPPENED"), "HAPPENED");
  assert.equal(attendance.parseVisitAttendanceConfirmation("NO_SHOW"), null);
  assert.equal(attendance.visitAttendanceLabel("MISSED"), "Visit was missed");
  const base = {
    status: "ACCEPTED",
    scheduledAt: "2026-09-06T10:00:00.000Z",
    hasOutcome: false,
  };
  assert.equal(
    attendance.visitCountsAsCompleted(
      { ...base, attendanceConfirmation: "HAPPENED" },
      new Date("2026-09-06T14:00:00.000Z"),
    ),
    true,
  );
  assert.equal(
    attendance.visitCountsAsCompleted(
      { ...base, attendanceConfirmation: "MISSED" },
      new Date("2026-09-06T14:00:00.000Z"),
    ),
    false,
  );
  assert.match(activitySource, /attendanceConfirmation:/);
});

test("RLS isolates each participant attendance and database rules mirror app eligibility", () => {
  assert.match(migration, /ALTER TABLE public\."VisitAttendance" ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /Users can read only their own visit attendance/);
  assert.match(migration, /"userId" = \(SELECT nestmate_private\.current_nestmate_user_id\(\)\)/);
  assert.match(migration, /scheduled_at - interval '30 minutes'/);
  assert.match(migration, /scheduled_at \+ interval '2 hours'/);
  assert.match(migration, /scheduled_at \+ interval '1 hour'/);
  assert.match(migration, /UserBlock/);
  assert.match(migration, /SUSPENDED/);
  assert.match(migration, /final attendance confirmation cannot be changed/i);
  assert.match(stateMigration, /check-in cannot be added after final attendance confirmation/i);
  assert.match(stateMigration, /REVOKE ALL ON FUNCTION/);
  assert.doesNotMatch(migration, /GRANT SELECT[^;]*VisitAttendance[^;]*anon/);
});

test("the server exposes no counterpart check-in and shares a final status only mutually", () => {
  assert.match(dataSource, /mine\?\.confirmation && counterpart\?\.confirmation/);
  assert.match(dataSource, /counterpartConfirmation: counterpart\.confirmation/);
  assert.doesNotMatch(dataSource, /counterpartCheckedInAt/);
  assert.match(actions, /getClaims\(\)/);
  assert.match(actions, /Confirm that the visit happened before recording an outcome/);
  assert.match(ui, /No GPS is collected/);
  assert.match(ui, /remains private until they confirm too/);
  assert.doesNotMatch(migration, /latitude|longitude|geograph|gps/i);
});
