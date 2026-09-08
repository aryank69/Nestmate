import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);

function compile(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
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

const checklist = compile("../lib/move-in-checklist.ts");
const schema = readFileSync(
  new URL("../prisma/schema.prisma", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260906130000_move_in_checklists/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const dataSource = readFileSync(
  new URL("../lib/move-in-checklist-data.ts", import.meta.url),
  "utf8",
);
const actionSource = readFileSync(
  new URL("../app/move-in/[checklistId]/actions.ts", import.meta.url),
  "utf8",
);
const activityDataSource = readFileSync(
  new URL("../lib/activity-data.ts", import.meta.url),
  "utf8",
);
const visitDataSource = readFileSync(
  new URL("../lib/visit-data.ts", import.meta.url),
  "utf8",
);
const uiSource = readFileSync(
  new URL("../components/move-in/move-in-checklist.tsx", import.meta.url),
  "utf8",
);

test("the default checklist covers every requested move-in task", () => {
  assert.deepEqual(
    checklist.MOVE_IN_CHECKLIST_TASKS.map(({ kind }) => kind),
    [
      "DEPOSIT_CONFIRMATION",
      "RENT_AMOUNT",
      "MOVE_IN_DATE",
      "ID_DOCUMENT_EXCHANGE",
      "AGREEMENT_STATUS",
      "INVENTORY_PHOTOS",
      "UTILITY_RESPONSIBILITIES",
      "KEYS",
      "EMERGENCY_CONTACT_DETAILS",
    ],
  );
  assert.equal(checklist.MOVE_IN_CHECKLIST_TASKS.length, 9);
});

test("private details and completion progress are deterministic and bounded", () => {
  assert.equal(checklist.cleanMoveInPrivateDetail("  Confirmed  "), "Confirmed");
  assert.equal(checklist.cleanMoveInPrivateDetail("   "), "");
  assert.equal(checklist.cleanMoveInPrivateDetail(123), null);
  assert.equal(
    checklist.cleanMoveInPrivateDetail("x".repeat(700)).length,
    checklist.MAX_MOVE_IN_PRIVATE_DETAIL_LENGTH,
  );
  assert.deepEqual(
    checklist.moveInChecklistProgress([
      { isCompleted: true },
      { isCompleted: false },
      { isCompleted: true },
    ]),
    { completedCount: 2, totalCount: 3, percentage: 67 },
  );
});

test("finalized activity and each participant's finalized visit create private checklists", () => {
  assert.match(migration, /create_move_in_checklist_from_activity_after_write/);
  assert.match(migration, /NEW\."stage" = 'FINALIZED'/);
  assert.match(migration, /create_move_in_checklist_from_visit_outcome_after_write/);
  assert.match(migration, /NEW\."outcome" = 'FINALIZED'/);
  assert.match(migration, /checklist\."userId" IN \([\s\S]*requesterId[\s\S]*ownerId/);
  assert.match(migration, /ON CONFLICT \("userId", "postId"\) DO UPDATE/);
  assert.match(activityDataSource, /moveInChecklistId/);
  assert.match(visitDataSource, /moveInChecklists:[\s\S]*where: \{ userId: currentUser\.id \}/);
});

test("schema and RLS isolate checklist rows and sensitive task values", () => {
  assert.match(schema, /model MoveInChecklist \{/);
  assert.match(schema, /model MoveInChecklistItem \{/);
  assert.match(schema, /@@unique\(\[checklistId, kind\]\)/);
  assert.match(migration, /ALTER TABLE public\."MoveInChecklist" ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE public\."MoveInChecklistItem" ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /can_access_move_in_checklist/);
  assert.match(migration, /current_nestmate_user_id\(\)/);
  assert.match(migration, /FOR UPDATE[\s\S]*USING[\s\S]*WITH CHECK/);
  assert.match(
    migration,
    /GRANT UPDATE \("privateDetail", "isCompleted"\)[\s\S]*TO authenticated/,
  );
  assert.doesNotMatch(migration, /GRANT (?:SELECT|INSERT|UPDATE|DELETE)[^;]*TO anon/);
  assert.doesNotMatch(migration, /GRANT INSERT[^;]*"MoveInChecklist"[^;]*authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION nestmate_private\.create_default_move_in_checklist/);
});

test("server actions reauthenticate, reauthorize, validate, and return minimal state", () => {
  assert.match(actionSource, /auth\.getClaims\(\)/);
  assert.match(actionSource, /loadMoveInChecklist\(claims\.sub, checklistId\)/);
  assert.match(actionSource, /checklist\.items\.some/);
  assert.match(actionSource, /from\("MoveInChecklistItem"\)/);
  assert.match(actionSource, /\.eq\("id", itemId\)/);
  assert.match(actionSource, /\.eq\("checklistId", checklistId\)/);
  assert.doesNotMatch(actionSource, /return updated|return checklist/);
  assert.match(dataSource, /import "server-only"/);
  assert.match(dataSource, /blocksCreated|userBlock\.findFirst/);
  assert.match(dataSource, /status === "SUSPENDED"/);
});

test("the checklist UI warns against payment, identity, and agreement misuse", () => {
  assert.match(uiSource, /private to you/i);
  assert.match(uiSource, /Never enter bank details, payment credentials/);
  assert.match(uiSource, /full ID numbers/);
  assert.match(uiSource, /does not process payments/);
  assert.match(uiSource, /create legal agreements/);
  assert.match(uiSource, /Mark complete/);
  assert.doesNotMatch(uiSource, /stripe|paymentIntent|upload|storage\.from/i);
});
