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

const activity = compile("../lib/activity.ts");
const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const migration = readFileSync(new URL("../prisma/migrations/20260905100000_interest_activity/migration.sql", import.meta.url), "utf8");
const dataSource = readFileSync(new URL("../lib/activity-data.ts", import.meta.url), "utf8");
const actionSource = readFileSync(new URL("../app/activity/actions.ts", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../components/activity/activity-page.tsx", import.meta.url), "utf8");
const controlSource = readFileSync(new URL("../components/activity/activity-stage-control.tsx", import.meta.url), "utf8");

test("activity filters accept only known private-view stages and target types", () => {
  assert.deepEqual(activity.parseActivityFilters({ stage: "CONTACTED", type: "FLATMATE" }), {
    stage: "CONTACTED",
    targetType: "FLATMATE",
  });
  assert.deepEqual(activity.parseActivityFilters({ stage: "ADMIN", type: "USER" }), {
    stage: null,
    targetType: null,
  });
});

test("the latest signal wins and manual activity wins exact timestamp ties", () => {
  const merged = activity.mergeActivitySignals([
    { targetType: "LISTING", targetId: "one", stage: "SHORTLISTED", source: "SAVED", occurredAt: "2026-09-01T10:00:00Z" },
    { targetType: "LISTING", targetId: "one", stage: "CONTACTED", source: "CHAT", occurredAt: "2026-09-02T10:00:00Z" },
    { targetType: "FLATMATE", targetId: "two", stage: "CONTACTED", source: "CHAT", occurredAt: "2026-09-03T10:00:00Z" },
    { targetType: "FLATMATE", targetId: "two", stage: "NOT_INTERESTED", source: "MANUAL", occurredAt: "2026-09-03T10:00:00Z" },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((item) => item.targetId === "one")?.stage, "CONTACTED");
  assert.equal(merged.find((item) => item.targetId === "two")?.stage, "NOT_INTERESTED");
});

test("visit states map to useful activity stages without exposing notes", () => {
  assert.equal(activity.visitStage({ status: "ACCEPTED" }), "VISIT_PLANNED");
  assert.equal(activity.visitStage({ status: "ACCEPTED", outcome: "FINALIZED" }), "FINALIZED");
  assert.equal(activity.visitStage({ status: "ACCEPTED", outcome: "NOT_SUITABLE" }), "NOT_INTERESTED");
  assert.equal(activity.visitStage({ status: "DECLINED" }), "INTERESTED");
});

test("activity schema enforces one target, indexed ownership, grants, and RLS", () => {
  assert.match(schema, /model InterestActivity \{/);
  assert.match(schema, /@@index\(\[userId, targetType, stage, updatedAt\(sort: Desc\)\]\)/);
  assert.match(migration, /InterestActivity_target_check/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL PRIVILEGES[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE[\s\S]*TO authenticated/);
  assert.match(migration, /current_nestmate_user_id\(\)/);
  assert.match(migration, /can_track_interest_target/);
  assert.match(migration, /is_user_content_visible\(target_owner_id\)/);
  assert.match(migration, /user_block\."blockerId" = current_user_id[\s\S]*user_block\."blockerId" = target_owner_id/);
  assert.match(migration, /FOR UPDATE[\s\S]*USING[\s\S]*WITH CHECK/);
});

test("activity retrieval merges existing signals then re-resolves only visible targets", () => {
  assert.match(dataSource, /from\("SavedPost"\)/);
  assert.match(dataSource, /from\("ShortlistedProfile"\)/);
  assert.match(dataSource, /prisma\.conversation\.findMany/);
  assert.match(dataSource, /messages: \{ some: \{\} \}/);
  assert.match(dataSource, /prisma\.visitRequest\.findMany/);
  assert.match(dataSource, /loadPeopleDiscovery/);
  assert.match(dataSource, /blocksCreated: \{ none: \{ blockedId: viewerId \} \}/);
  assert.match(dataSource, /blocksReceived: \{ none: \{ blockerId: viewerId \} \}/);
  assert.match(dataSource, /moderationStatus: "VISIBLE"/);
  assert.match(dataSource, /status: "SUSPENDED"/);
  assert.doesNotMatch(dataSource, /privateNote|commuteDestination|commuteLatitude|commuteLongitude/);
  assert.doesNotMatch(dataSource, /select:\s*\{[^}]*body:/);
});

test("stage writes recheck visibility and upsert only the authenticated owner target", () => {
  assert.match(actionSource, /auth\.getClaims\(\)/);
  assert.match(actionSource, /loadPeopleProfile\(/);
  assert.match(actionSource, /ROOM_AVAILABLE/);
  assert.match(actionSource, /PG_AVAILABLE/);
  assert.match(actionSource, /blocksCreated: \{ none: \{ blockedId: user\.id \} \}/);
  assert.match(actionSource, /blocksReceived: \{ none: \{ blockerId: user\.id \} \}/);
  assert.match(actionSource, /from\("InterestActivity"\)/);
  assert.match(actionSource, /onConflict/);
});

test("My Activity exposes filters and all requested stages through one reusable control", () => {
  assert.match(pageSource, /My Activity/);
  assert.match(pageSource, /name="stage"/);
  assert.match(pageSource, /name="type"/);
  assert.match(pageSource, /Private to you/);
  assert.match(controlSource, /INTEREST_STAGES\.map/);
  for (const stage of ["Interested", "Contacted", "Visit planned", "Shortlisted", "Finalized", "Not interested"]) {
    assert.match(readFileSync(new URL("../lib/activity.ts", import.meta.url), "utf8"), new RegExp(stage));
  }
});
