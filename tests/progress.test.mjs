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
const dataSource = readFileSync(new URL("../lib/activity-data.ts", import.meta.url), "utf8");
const progressUi = readFileSync(new URL("../components/activity/progress-page.tsx", import.meta.url), "utf8");
const progressPage = readFileSync(new URL("../app/progress/page.tsx", import.meta.url), "utf8");

test("progress metrics summarize current safe stages and visit milestones", () => {
  const current = [
    { targetType: "LISTING", targetId: "active", stage: "INTERESTED", source: "MANUAL", occurredAt: "2026-09-01T00:00:00Z" },
    { targetType: "FLATMATE", targetId: "contacted", stage: "CONTACTED", source: "CHAT", occurredAt: "2026-09-02T00:00:00Z" },
    { targetType: "LISTING", targetId: "short", stage: "SHORTLISTED", source: "SAVED", occurredAt: "2026-09-03T00:00:00Z" },
    { targetType: "LISTING", targetId: "final", stage: "FINALIZED", source: "VISIT", occurredAt: "2026-09-04T00:00:00Z" },
    { targetType: "FLATMATE", targetId: "drop", stage: "NOT_INTERESTED", source: "MANUAL", occurredAt: "2026-09-05T00:00:00Z" },
  ];
  const metrics = activity.calculateProgressMetrics(
    current,
    [
      { targetId: "active", status: "ACCEPTED", scheduledAt: "2026-09-10T10:00:00Z", hasOutcome: false },
      { targetId: "short", status: "ACCEPTED", scheduledAt: "2026-09-01T10:00:00Z", hasOutcome: true },
    ],
    new Date("2026-09-05T10:00:00Z"),
  );
  assert.deepEqual(metrics, {
    activeOptions: 3,
    contacted: 1,
    visitsPlanned: 1,
    visitsCompleted: 1,
    shortlisted: 1,
    finalized: 1,
    dropped: 1,
  });
});

test("completed visit targets are not double-counted as planned", () => {
  const metrics = activity.calculateProgressMetrics(
    [],
    [
      { targetId: "same", status: "PENDING", scheduledAt: null, hasOutcome: false },
      { targetId: "same", status: "ACCEPTED", scheduledAt: "2026-09-01T10:00:00Z", hasOutcome: true },
    ],
    new Date("2026-09-05T10:00:00Z"),
  );
  assert.equal(metrics.visitsPlanned, 0);
  assert.equal(metrics.visitsCompleted, 1);
});

test("confirmed attendance overrides the legacy time-based completion fallback", () => {
  const now = new Date("2026-09-06T14:00:00Z");
  const happened = activity.calculateProgressMetrics(
    [],
    [{
      targetId: "happened",
      status: "ACCEPTED",
      scheduledAt: "2026-09-06T10:00:00Z",
      hasOutcome: false,
      attendanceConfirmation: "HAPPENED",
    }],
    now,
  );
  const missed = activity.calculateProgressMetrics(
    [],
    [{
      targetId: "missed",
      status: "ACCEPTED",
      scheduledAt: "2026-09-06T10:00:00Z",
      hasOutcome: false,
      attendanceConfirmation: "MISSED",
    }],
    now,
  );
  assert.equal(happened.visitsCompleted, 1);
  assert.equal(missed.visitsCompleted, 0);
});

test("progress and timeline are calculated only after target visibility is rechecked", () => {
  assert.match(dataSource, /visibleTargetKeys/);
  assert.match(dataSource, /visibleTargetKeys\.has\(activityTargetKey\(signal\)\)/);
  assert.match(dataSource, /filter\(\(visit\) => listingById\.has\(visit\.postId\)\)/);
  assert.match(dataSource, /calculateProgressMetrics\(items, progressVisits\)/);
  assert.match(dataSource, /participantOneId: viewerId/);
  assert.match(dataSource, /participantTwoId: viewerId/);
  assert.match(dataSource, /requesterId: viewerId/);
  assert.match(dataSource, /outcomes:[\s\S]*where: \{ userId: viewerId \}/);
  assert.match(dataSource, /loadPeopleDiscovery/);
  assert.match(dataSource, /blocksCreated: \{ none: \{ blockedId: viewerId \} \}/);
  assert.match(dataSource, /blocksReceived: \{ none: \{ blockerId: viewerId \} \}/);
  assert.match(dataSource, /moderationStatus: "VISIBLE"/);
  assert.match(dataSource, /availabilityStatus: \{ in: \["AVAILABLE", "RESERVED"\] \}/);
  assert.doesNotMatch(dataSource, /privateNote|commuteDestination|commuteLatitude|commuteLongitude/);
  assert.doesNotMatch(dataSource, /select:\s*\{[^}]*body:/);
});

test("the private progress page shows all requested metrics and a small safe timeline", () => {
  assert.match(progressPage, /auth\.getClaims\(\)/);
  assert.match(progressPage, /redirect\("\/login\?next=\/progress"\)/);
  for (const label of [
    "Active options",
    "Contacted",
    "Visits planned",
    "Visits completed",
    "Shortlisted",
    "Finalized",
    "Dropped",
    "Recent activity",
  ]) {
    assert.match(progressUi, new RegExp(label));
  }
  assert.match(progressUi, /Message contents, private notes, and exact private locations are never included/);
  assert.match(dataSource, /\.slice\(0, 8\)/);
});
