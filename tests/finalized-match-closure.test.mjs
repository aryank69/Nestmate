import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);

function compile(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function("module", "exports", "require", output)(compiledModule, compiledModule.exports, require);
  return compiledModule.exports;
}

const lifecycle = compile("../lib/finalized-match.ts");
const migration = readFileSync(new URL("../prisma/migrations/20260906170000_finalized_match_closure/migration.sql", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/documents/actions.ts", import.meta.url), "utf8");
const loader = readFileSync(new URL("../lib/shared-documents-data.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/documents/finalized-match-lifecycle.tsx", import.meta.url), "utf8");
const documentUi = readFileSync(new URL("../components/documents/document-sharing.tsx", import.meta.url), "utf8");
const milestoneUi = readFileSync(new URL("../components/documents/finalized-milestones.tsx", import.meta.url), "utf8");
const checklistUi = readFileSync(new URL("../components/move-in/move-in-checklist.tsx", import.meta.url), "utf8");
const activityLoader = readFileSync(new URL("../lib/activity-data.ts", import.meta.url), "utf8");
const communityLoader = readFileSync(new URL("../lib/community-data.ts", import.meta.url), "utf8");
const peopleLoader = readFileSync(new URL("../lib/people-data.ts", import.meta.url), "utf8");

test("reopening is limited to the closer, approved reasons, and seven days", () => {
  const base = {
    status: "CLOSED",
    closureReason: "CREATED_BY_MISTAKE",
    closedAt: "2026-09-01T10:00:00.000Z",
    closedById: "user-a",
    viewerId: "user-a",
    now: new Date("2026-09-08T09:59:59.000Z"),
  };
  assert.equal(lifecycle.canReopenFinalizedMatch(base), true);
  assert.equal(lifecycle.canReopenFinalizedMatch({ ...base, viewerId: "user-b" }), false);
  assert.equal(lifecycle.canReopenFinalizedMatch({ ...base, closureReason: "ARCHIVED" }), false);
  assert.equal(lifecycle.canReopenFinalizedMatch({ ...base, closureReason: "MOVE_IN_COMPLETED" }), false);
  assert.equal(lifecycle.canReopenFinalizedMatch({ ...base, now: new Date("2026-09-08T10:00:01.000Z") }), false);
  assert.equal(lifecycle.canReopenFinalizedMatch({ ...base, status: "ACTIVE" }), false);
});

test("database lifecycle transitions require participants and preserve an audit trail", () => {
  assert.match(migration, /FinalizedMatchStatus[\s\S]*ACTIVE[\s\S]*COMPLETED[\s\S]*CLOSED/);
  assert.match(migration, /MOVE_IN_CANCELLED[\s\S]*CREATED_BY_MISTAKE/);
  assert.match(migration, /OLD\."closedById" <> current_user_id/);
  assert.match(migration, /INTERVAL '7 days'/);
  assert.match(migration, /NEW\."status" IS DISTINCT FROM OLD\."statusBeforeClose"/);
  assert.match(migration, /audit_finalized_match_lifecycle_after_update/);
  assert.match(migration, /FinalizedMatchStatusChange[\s\S]*ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /Participants can close or safely reopen finalized matches[\s\S]*FOR UPDATE[\s\S]*WITH CHECK/);
  assert.doesNotMatch(migration, /GRANT (?:INSERT|UPDATE|DELETE)[^;]*FinalizedMatchStatusChange[^;]*authenticated/);
});

test("both move-in completion records promote the match without letting automation reopen archives", () => {
  assert.match(migration, /sync_match_completion_from_milestones_after_write/);
  assert.match(migration, /count\(\*\) = 2 INTO both_completed/);
  assert.match(migration, /"status" <> 'CLOSED'/);
  assert.match(migration, /Closed matches cannot be changed automatically/);
});

test("closed archives are readable but document, milestone, acknowledgement, checklist, and storage writes are denied", () => {
  assert.match(migration, /can_manage_finalized_document_space/);
  assert.match(migration, /space\."status" <> 'CLOSED'/);
  assert.match(migration, /Active participants can register their own uploaded documents/);
  assert.match(migration, /Active participants can update only their own milestone progress/);
  assert.match(migration, /Active participants can acknowledge current documents/);
  assert.match(migration, /can_manage_move_in_checklist/);
  assert.match(migration, /Active finalized participants can upload private match documents/);
  assert.match(migration, /Active uploaders can delete their private match documents/);
  assert.match(documentUi, /const readOnly = space\.status === "CLOSED"/);
  assert.match(milestoneUi, /disabled=\{readOnly \|\| pending \|\| !own\}/);
  assert.match(checklistUi, /isReadOnly/);
});

test("archive history returns only safe visit/status fields and explicitly omits private content", () => {
  assert.match(loader, /statusChanges/);
  assert.match(loader, /scheduledAt: true/);
  assert.match(loader, /createdAt: true/);
  assert.doesNotMatch(loader, /privateNote|feedback|note: true|exactAddress|object\.metadata/);
  assert.match(component, /Private notes, feedback, contact details/);
  assert.match(component, /deleted or revoked content are not included/);
});

test("closed targets are removed before activity, progress, and reminder aggregation", () => {
  assert.match(activityLoader, /from\("FinalizedDocumentSpace"\)/);
  assert.match(activityLoader, /\.eq\("status", "CLOSED"\)/);
  assert.match(activityLoader, /closedTargetKeys/);
  assert.match(activityLoader, /const activeSignals = signals\.filter/);
  assert.match(activityLoader, /mergeActivitySignals\(activeSignals\)/);
  assert.match(activityLoader, /const timeline = \[\.\.\.activeSignals\]/);
  assert.match(communityLoader, /closedPostIds/);
  assert.match(communityLoader, /status: "CLOSED", targetType: "LISTING"/);
  assert.match(communityLoader, /space\.post\?\.authorId !== viewer\?\.id/);
  assert.match(peopleLoader, /closedFlatmateIds/);
  assert.match(peopleLoader, /status: "CLOSED", targetType: "FLATMATE"/);
  assert.match(peopleLoader, /notIn: closedFlatmateIds/);
});

test("server actions constrain close and reopen updates to an accessible row", () => {
  assert.match(actions, /closeFinalizedMatchAction/);
  assert.match(actions, /reopenFinalizedMatchAction/);
  assert.match(actions, /auth\.getClaims\(\)/);
  assert.match(actions, /\.neq\("status", "CLOSED"\)/);
  assert.match(actions, /\.eq\("status", "CLOSED"\)/);
  assert.match(actions, /revalidatePath\("\/progress"\)/);
  assert.match(component, /window\.confirm/);
  assert.match(component, /space\.canReopen/);
});
