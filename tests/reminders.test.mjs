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

const reminders = compile("../lib/reminders.ts");
const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const migration = readFileSync(new URL("../prisma/migrations/20260905110000_private_reminders/migration.sql", import.meta.url), "utf8");
const dataSource = readFileSync(new URL("../lib/reminder-data.ts", import.meta.url), "utf8");
const actionSource = readFileSync(new URL("../app/reminders/actions.ts", import.meta.url), "utf8");
const uiSource = readFileSync(new URL("../components/reminders/reminders-page.tsx", import.meta.url), "utf8");
const notificationsPage = readFileSync(new URL("../app/notifications/page.tsx", import.meta.url), "utf8");
const navbarSource = readFileSync(new URL("../components/navbar.tsx", import.meta.url), "utf8");

test("reminder windows and snooze durations fail safely at their boundaries", () => {
  const now = new Date("2026-09-05T10:00:00Z");
  assert.equal(reminders.isDateWithinWindow("2026-09-05T00:00:00Z", now, 7), true);
  assert.equal(reminders.isDateWithinWindow("2026-09-12T00:00:00Z", now, 7), true);
  assert.equal(reminders.isDateWithinWindow("2026-09-13T00:00:00Z", now, 7), false);
  assert.equal(reminders.isDateWithinWindow("2026-09-04T23:59:59Z", now, 7), false);
  assert.equal(reminders.snoozeUntil(3, now)?.toISOString(), "2026-09-08T10:00:00.000Z");
  assert.equal(reminders.snoozeUntil(2, now), null);
});

test("dismissed and currently snoozed reminders stay hidden", () => {
  const now = new Date("2026-09-05T10:00:00Z");
  assert.equal(reminders.isReminderVisible({ dismissedAt: now.toISOString(), snoozedUntil: null }, now), false);
  assert.equal(reminders.isReminderVisible({ dismissedAt: null, snoozedUntil: "2026-09-06T10:00:00Z" }, now), false);
  assert.equal(reminders.isReminderVisible({ dismissedAt: null, snoozedUntil: "2026-09-04T10:00:00Z" }, now), true);
  assert.equal(reminders.reminderKey("CHAT_FOLLOW_UP", "CONVERSATION", "abc"), "CHAT_FOLLOW_UP:CONVERSATION:abc");
});

test("reminder persistence is owner-only and exposes only state columns for updates", () => {
  assert.match(schema, /model Reminder \{/);
  assert.match(schema, /@@unique\(\[userId, reminderKey\]\)/);
  assert.match(schema, /@@index\(\[userId, inactiveAt, dismissedAt, snoozedUntil, dueAt\]\)/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL PRIVILEGES[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT SELECT ON TABLE public\."Reminder" TO authenticated/);
  assert.match(migration, /GRANT UPDATE \("dismissedAt", "snoozedUntil", "updatedAt"\)/);
  assert.doesNotMatch(migration, /GRANT INSERT|GRANT DELETE/);
  assert.match(migration, /FOR SELECT[\s\S]*current_nestmate_user_id/);
  assert.match(migration, /FOR UPDATE[\s\S]*USING[\s\S]*WITH CHECK/);
});

test("generation uses only safe targets and never selects private content", () => {
  assert.match(dataSource, /loadActivityData/);
  assert.match(dataSource, /stage !== "FINALIZED" && stage !== "NOT_INTERESTED"/);
  assert.match(dataSource, /blocksCreated: \{ none: \{ blockedId: viewerId \} \}/);
  assert.match(dataSource, /blocksReceived: \{ none: \{ blockerId: viewerId \} \}/);
  assert.match(dataSource, /moderationStatus: "VISIBLE"/);
  assert.match(dataSource, /availabilityStatus: \{ in: \["AVAILABLE", "RESERVED"\] \}/);
  assert.match(dataSource, /messages:[\s\S]*select: \{ senderId: true, createdAt: true \}/);
  assert.match(dataSource, /latestMessage\.senderId === viewerId/);
  assert.match(dataSource, /visibleTargetKeys\.has/);
  assert.match(dataSource, /inactiveAt: null/);
  assert.match(dataSource, /reminderKey: \{ notIn: keys \}/);
  assert.doesNotMatch(dataSource, /privateNote|commuteDestination|commuteLatitude|commuteLongitude/);
  assert.doesNotMatch(dataSource, /select:\s*\{[^}]*body:/);
});

test("reminders cover visits, follow-ups, idle shortlists, and move-in dates", () => {
  for (const kind of ["UPCOMING_VISIT", "CHAT_FOLLOW_UP", "SHORTLIST_IDLE", "MOVE_IN_APPROACHING"]) {
    assert.match(dataSource, new RegExp(kind));
  }
  assert.match(dataSource, /scheduledAt: \{ gte: now, lte: visitWindowEnd \}/);
  assert.match(dataSource, /lastMessageAt: \{ gte: sourceAgeStart, lte: followUpBefore \}/);
  assert.match(dataSource, /REMINDER_SHORTLIST_IDLE_DAYS/);
  assert.match(dataSource, /REMINDER_MOVE_IN_DAYS/);
});

test("dismiss and snooze actions authenticate and update only the caller's row", () => {
  assert.match(actionSource, /auth\.getClaims\(\)/);
  assert.match(actionSource, /snoozeUntil/);
  assert.match(actionSource, /\.eq\("id", reminderId\)/);
  assert.match(actionSource, /\.eq\("userId", user\.id\)/);
  assert.match(actionSource, /dismissedAt/);
  assert.match(actionSource, /snoozedUntil/);
});

test("the Reminders page provides clear controls and notification integration", () => {
  assert.match(uiSource, /Reminders/);
  assert.match(uiSource, /Snooze/);
  assert.match(uiSource, /Dismiss/);
  assert.match(uiSource, /Tomorrow/);
  assert.match(uiSource, /Message contents, private notes, and exact private locations are never included/);
  assert.match(uiSource, /nestmate:reminders-changed/);
  assert.match(notificationsPage, /loadReminderData/);
  assert.match(notificationsPage, /initialReminderCount/);
  assert.match(navbarSource, /addEventListener\("nestmate:reminders-changed"/);
});
