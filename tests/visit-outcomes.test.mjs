import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../lib/visit-outcomes.ts", import.meta.url),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const outcomeModule = { exports: {} };
new Function("module", "exports", "require", output)(
  outcomeModule,
  outcomeModule.exports,
  require,
);
const outcomes = outcomeModule.exports;

const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260904150000_visit_outcomes/migration.sql",
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

test("outcomes are accepted only for completed confirmed visits", () => {
  const now = new Date("2026-09-04T12:00:00.000Z");
  assert.equal(
    outcomes.canRecordVisitOutcome(
      { status: "ACCEPTED", scheduledAt: "2026-09-04T11:00:00.000Z" },
      now,
    ),
    true,
  );
  assert.equal(
    outcomes.canRecordVisitOutcome(
      { status: "ACCEPTED", scheduledAt: "2026-09-04T13:00:00.000Z" },
      now,
    ),
    false,
  );
  assert.equal(
    outcomes.canRecordVisitOutcome(
      { status: "DECLINED", scheduledAt: "2026-09-04T11:00:00.000Z" },
      now,
    ),
    false,
  );
});

test("outcome values and private notes are constrained", () => {
  assert.equal(outcomes.parseVisitOutcome("FINALIZED"), "FINALIZED");
  assert.equal(outcomes.parseVisitOutcome("PUBLIC_REVIEW"), null);
  assert.equal(outcomes.cleanVisitOutcomeNote("  Personal reminder  "), "Personal reminder");
  assert.equal(outcomes.cleanVisitOutcomeNote("a".repeat(600)).length, 500);
  assert.equal(outcomes.visitOutcomeLabel("NOT_SUITABLE"), "Not suitable");
});

test("listing history rewards positive similarity and avoids treating no-shows as preference", () => {
  const listing = {
    category: "Room Available",
    locality: "Indiranagar",
    monthlyAmountMin: 22000,
    monthlyAmountMax: 22000,
  };
  const positive = outcomes.listingVisitOutcomeAlignment(listing, [{
    ...listing,
    outcome: "FINALIZED",
  }]);
  const negative = outcomes.listingVisitOutcomeAlignment(listing, [{
    ...listing,
    outcome: "NOT_SUITABLE",
  }]);

  assert.equal(positive, 1);
  assert.equal(negative, 0);
  assert.equal(
    outcomes.listingVisitOutcomeAlignment(listing, [{ ...listing, outcome: "NO_SHOW" }]),
    null,
  );
});

test("RLS keeps each participant outcome separate and private", () => {
  assert.match(migration, /ALTER TABLE public\."VisitOutcome" ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /Users can read only their own visit outcomes/);
  assert.match(migration, /"userId" = \(SELECT nestmate_private\.current_nestmate_user_id\(\)\)/);
  assert.match(migration, /can_record_visit_outcome/);
  assert.doesNotMatch(migration, /GRANT SELECT[^;]*VisitOutcome[^;]*anon/);
  assert.match(dataSource, /outcomes: \{[\s\S]*where: \{ userId: currentUser\.id \}/);
  assert.match(ui, /visible only to you/i);
  assert.doesNotMatch(ui, /counterpart.*outcome/i);
});

test("mutual finalization closes a listing while one finalization reserves it", () => {
  assert.match(migration, /finalized_count >= 2[\s\S]*'CLOSED'/);
  assert.match(migration, /finalized_count = 1[\s\S]*'RESERVED'/);
  assert.match(migration, /"lastConfirmedAt" = CURRENT_TIMESTAMP/);
  assert.match(actions, /scheduledAt: \{ lte: new Date\(\) \}/);
  assert.match(actions, /onConflict: "visitId,userId"/);
});

test("private feedback is not copied into public listing or notification data", () => {
  assert.doesNotMatch(migration, /INSERT INTO public\."Notification"/);
  assert.doesNotMatch(migration, /SET[\s\S]*"description"/);
  assert.doesNotMatch(migration, /SET[\s\S]*"tags"/);
});
