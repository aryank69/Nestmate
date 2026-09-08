import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadTypeScriptModule(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function("module", "exports", "require", output)(
    compiledModule,
    compiledModule.exports,
    require,
  );
  return compiledModule.exports;
}

const helpers = loadTypeScriptModule(
  path.join(process.cwd(), "lib/finalized-milestones.ts"),
);
const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260906160000_finalized_match_milestones/migration.sql",
  ),
  "utf8",
);
const actions = fs.readFileSync(
  path.join(process.cwd(), "app/documents/actions.ts"),
  "utf8",
);
const component = fs.readFileSync(
  path.join(process.cwd(), "components/documents/finalized-milestones.tsx"),
  "utf8",
);

test("the finalized flow exposes the eight requested coordination milestones", () => {
  assert.deepEqual(
    helpers.FINALIZED_MILESTONES.map(({ kind }) => kind),
    [
      "AGREEMENT_DRAFTED",
      "AGREEMENT_REVIEWED",
      "AGREEMENT_ACKNOWLEDGED",
      "DEPOSIT_CONFIRMED",
      "DOCUMENTS_EXCHANGED",
      "INVENTORY_COMPLETED",
      "KEYS_HANDED_OVER",
      "MOVE_IN_COMPLETED",
    ],
  );
  assert.equal(helpers.isFinalizedMilestoneKind("MOVE_IN_COMPLETED"), true);
  assert.equal(helpers.isFinalizedMilestoneKind("PAYMENT_VERIFIED"), false);
});

test("participant progress is isolated and deterministically counted", () => {
  const milestones = [
    {
      id: "one",
      spaceId: "space",
      userId: "user-a",
      kind: "AGREEMENT_DRAFTED",
      status: "COMPLETED",
      completedAt: "2026-09-06T10:00:00.000Z",
      updatedAt: "2026-09-06T10:00:00.000Z",
    },
    {
      id: "two",
      spaceId: "space",
      userId: "user-b",
      kind: "AGREEMENT_DRAFTED",
      status: "PENDING",
      completedAt: null,
      updatedAt: "2026-09-06T10:00:00.000Z",
    },
  ];
  assert.deepEqual(helpers.milestoneProgress(milestones, "user-a"), {
    completed: 1,
    total: 8,
  });
  assert.deepEqual(helpers.milestoneProgress(milestones, "user-b"), {
    completed: 0,
    total: 8,
  });
  assert.equal(helpers.milestonesByKind(milestones).get("AGREEMENT_DRAFTED").length, 2);
});

test("migration seeds both participants and protects participant-owned transitions", () => {
  assert.match(migration, /FinalizedMatchMilestone_spaceId_userId_kind_key/);
  assert.match(migration, /participantOneId[\s\S]*participantTwoId[\s\S]*unnest\(ARRAY/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /GRANT UPDATE \("status"\)/);
  assert.match(migration, /Participants can update only their own milestone progress[\s\S]*current_nestmate_user_id/);
  assert.doesNotMatch(migration, /GRANT (?:INSERT|DELETE)[\s\S]*FinalizedMatchMilestone/);
  assert.doesNotMatch(migration, /TO anon/);
});

test("server timestamps maintain pending and completed status consistency", () => {
  assert.match(migration, /FinalizedMatchMilestone_completion_check/);
  assert.match(migration, /NEW\."completedAt" := COALESCE\(OLD\."completedAt", CURRENT_TIMESTAMP\)/);
  assert.match(migration, /NEW\."completedAt" := NULL/);
  assert.match(migration, /NEW\."updatedAt" := CURRENT_TIMESTAMP/);
});

test("agreement documents, acknowledgements, and private checklist tasks advance milestones", () => {
  assert.match(migration, /sync_milestones_from_document_after_insert/);
  assert.match(migration, /AGREEMENT_DRAFTED/);
  assert.match(migration, /sync_milestones_from_acknowledgement_after_write/);
  assert.match(migration, /AGREEMENT_REVIEWED[\s\S]*AGREEMENT_ACKNOWLEDGED/);
  assert.match(migration, /DEPOSIT_CONFIRMATION[\s\S]*DEPOSIT_CONFIRMED/);
  assert.match(migration, /ID_DOCUMENT_EXCHANGE[\s\S]*DOCUMENTS_EXCHANGED/);
  assert.match(migration, /INVENTORY_PHOTOS[\s\S]*INVENTORY_COMPLETED/);
  assert.match(migration, /KEYS[\s\S]*KEYS_HANDED_OVER/);
});

test("the action updates only the authenticated participant row", () => {
  assert.match(actions, /updateFinalizedMilestoneAction/);
  assert.match(actions, /auth\.getClaims\(\)/);
  assert.match(actions, /from\("FinalizedMatchMilestone"\)[\s\S]*\.eq\("userId", context\.userId\)/);
  assert.match(actions, /coordination only, not legal or payment verification/);
});

test("the UI shows participant timestamps and explicit non-proof guidance", () => {
  assert.match(component, /Shared agreement &amp; move-in milestones/);
  assert.match(component, /completedLabel\(own\?\.completedAt/);
  assert.match(component, /completedLabel\(counterpart\?\.completedAt/);
  assert.match(component, /not legal proof, signatures/);
  assert.match(component, /never copied here/);
  assert.doesNotMatch(component, /privateDetail|objectPath|monthlyAmount|depositAmount/);
});
