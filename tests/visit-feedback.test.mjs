import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../lib/visit-feedback.ts", import.meta.url),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const feedbackModule = { exports: {} };
new Function("module", "exports", "require", output)(
  feedbackModule,
  feedbackModule.exports,
  require,
);
const feedback = feedbackModule.exports;

const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260906120000_private_visit_feedback/migration.sql",
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
const ui = readFileSync(
  new URL("../components/visits/visit-sections.tsx", import.meta.url),
  "utf8",
);

const validRatings = {
  propertyAccuracy: 5,
  cleanliness: 4,
  communicationQuality: 5,
  safetyComfort: 4,
  overallExperience: 5,
};

test("structured feedback requires every integer rating from 1 to 5", () => {
  assert.deepEqual(feedback.parseVisitFeedbackRatings(validRatings), validRatings);
  assert.equal(
    feedback.parseVisitFeedbackRatings({ ...validRatings, cleanliness: 0 }),
    null,
  );
  assert.equal(
    feedback.parseVisitFeedbackRatings({ ...validRatings, safetyComfort: 5.5 }),
    null,
  );
  assert.equal(
    feedback.parseVisitFeedbackRatings({ ...validRatings, overallExperience: "" }),
    null,
  );
  assert.equal(feedback.cleanVisitFeedbackNote("  My private note  "), "My private note");
  assert.equal(feedback.cleanVisitFeedbackNote("   "), null);
});

test("feedback opens only for completed accepted visits", () => {
  const now = new Date("2026-09-06T14:00:00.000Z");
  const base = {
    status: "ACCEPTED",
    scheduledAt: "2026-09-06T12:00:00.000Z",
  };
  assert.equal(
    feedback.canSubmitVisitFeedback(
      { ...base, attendanceConfirmation: "HAPPENED" },
      now,
    ).eligible,
    true,
  );
  assert.equal(
    feedback.canSubmitVisitFeedback(
      { ...base, attendanceConfirmation: "MISSED" },
      now,
    ).eligible,
    false,
  );
  assert.equal(
    feedback.canSubmitVisitFeedback(
      { ...base, outcome: "INTERESTED" },
      now,
    ).eligible,
    true,
  );
  assert.equal(
    feedback.canSubmitVisitFeedback(
      { ...base, outcome: "NO_SHOW" },
      now,
    ).eligible,
    false,
  );
  assert.equal(
    feedback.canSubmitVisitFeedback(
      { ...base, attendanceConfirmation: "HAPPENED" },
      new Date("2026-09-06T12:59:59.000Z"),
    ).eligible,
    false,
  );
});

test("RLS permits self-only read, create, and edit access", () => {
  assert.match(migration, /ALTER TABLE public\."VisitFeedback" ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /Users can read only their own visit feedback/);
  assert.match(migration, /Users can create only their own completed visit feedback/);
  assert.match(migration, /Users can update only their own completed visit feedback/);
  assert.match(migration, /FOR UPDATE[\s\S]*USING[\s\S]*WITH CHECK/);
  assert.match(migration, /"userId" = \(SELECT nestmate_private\.current_nestmate_user_id\(\)\)/);
  assert.match(migration, /VisitAttendance[\s\S]*HAPPENED/);
  assert.match(migration, /VisitOutcome[\s\S]*NOT_SUITABLE[\s\S]*FINALIZED/);
  assert.match(migration, /UserBlock/);
  assert.match(migration, /SUSPENDED/);
  assert.doesNotMatch(migration, /GRANT SELECT[^;]*VisitFeedback[^;]*anon/);
  assert.match(actions, /\.eq\("userId", context\.user\.id\)/);
});

test("raw feedback remains private in server data and UI", () => {
  assert.match(dataSource, /feedback: \{[\s\S]*where: \{ userId: currentUser\.id \}/);
  assert.match(dataSource, /myFeedback:/);
  assert.doesNotMatch(dataSource, /counterpartFeedback/);
  assert.match(ui, /Raw ratings and notes are visible only to you/);
  assert.match(ui, /notes and identities[\s\S]*never included/);
  assert.doesNotMatch(ui, /other participant['’]s feedback/i);
});

test("future aggregates are private, non-identifying, and k-anonymous", () => {
  const aggregate = migration.slice(
    migration.indexOf("CREATE VIEW nestmate_private.visit_feedback_listing_aggregate"),
  );
  assert.match(aggregate, /HAVING count\(\*\) >= 3/);
  assert.match(aggregate, /REVOKE ALL PRIVILEGES/);
  assert.doesNotMatch(aggregate, /"privateNote"/);
  assert.doesNotMatch(aggregate, /"userId"/);
  assert.doesNotMatch(aggregate, /feedback\."visitId" AS/);
});
