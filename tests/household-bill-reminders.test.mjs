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

const household = compile("../lib/household.ts");
const migration = readFileSync(new URL("../prisma/migrations/20260907130000_household_bill_reminders/migration.sql", import.meta.url), "utf8");
const expenseComponent = readFileSync(new URL("../components/household/expense-splitting.tsx", import.meta.url), "utf8");
const notificationComponent = readFileSync(new URL("../components/notifications/notifications-panel.tsx", import.meta.url), "utf8");

function state(overrides = {}) {
  return household.householdBillState({
    dueDate: "2026-09-10",
    shareAmountMinor: 10_000,
    settledAmountMinor: 0,
    shareStatus: "OUTSTANDING",
    creditorId: "creditor",
    asOf: "2026-09-07",
    ...overrides,
  });
}

test("bill states use the viewer's own due date and settlement progress", () => {
  assert.equal(state(), "UPCOMING");
  assert.equal(state({ asOf: "2026-09-10" }), "DUE_TODAY");
  assert.equal(state({ asOf: "2026-09-11" }), "OVERDUE");
  assert.equal(state({ shareStatus: "PARTIALLY_SETTLED", settledAmountMinor: 2_500 }), "PARTIALLY_PAID");
  assert.equal(state({ shareStatus: "SETTLED", settledAmountMinor: 10_000 }), "PAID");
  assert.equal(state({ creditorId: null }), "PAID");
  assert.equal(state({ dueDate: null }), null);
});

test("reminders are generated before, on, and after the due date only while unpaid", () => {
  assert.match(migration, /due_date > p_as_of_date[\s\S]*due_date <= p_as_of_date \+ 3/);
  assert.match(migration, /due_date = p_as_of_date/);
  assert.match(migration, /due_date < p_as_of_date/);
  assert.match(migration, /settledAmountMinor" < share\."shareAmountMinor/);
  assert.match(migration, /'OUTSTANDING'[\s\S]*'PARTIALLY_SETTLED'/);
  assert.doesNotMatch(migration, /'SETTLED'::public\."HouseholdExpenseShareStatus"/);
});

test("one private notification is kept for each recipient, share, and timing state", () => {
  assert.match(migration, /Notification_system_dedupe_idx/);
  assert.match(migration, /share_id::TEXT \|\| ':' \|\| candidate\.reminder_state/);
  assert.match(migration, /ON CONFLICT \("recipientId", "type", "resourceId"\)[\s\S]*"actorId" IS NULL/);
  assert.match(migration, /'HOUSEHOLD_BILL'::public\."NotificationType"/);
  assert.match(migration, /nestmate-household-bill-reminders/);
  assert.match(migration, /30 0 \* \* \*/);
});

test("notification payloads avoid amounts, settlement notes, and other member details", () => {
  const reminderQuery = migration.match(/WITH eligible_shares AS \([\s\S]*?FROM reminder_candidates AS candidate/)?.[0] ?? "";
  assert.match(migration, /Your share for/);
  assert.doesNotMatch(reminderQuery, /HouseholdSettlement|settlement\."note"|amountMinor AS/);
  assert.match(migration, /"recipientId"[\s\S]*candidate\.recipient_id/);
  assert.match(migration, /"actorId"[\s\S]*NULL/);
});

test("raw settlement history is visible only to its two participants", () => {
  assert.match(migration, /Settlement participants can read household settlement history/);
  assert.match(migration, /"fromUserId" = \(SELECT nestmate_private\.current_nestmate_user_id\(\)\)/);
  assert.match(migration, /"toUserId" = \(SELECT nestmate_private\.current_nestmate_user_id\(\)\)/);
  assert.match(expenseComponent, /Settlement details private/);
});

test("household bill states and notification links are visible in the affected UI", () => {
  for (const label of ["Upcoming", "Due today", "Partially paid", "Paid", "Overdue"]) {
    assert.match(expenseComponent, new RegExp(label));
  }
  assert.match(expenseComponent, /id={`expense-\${expense\.id}`}/);
  assert.match(notificationComponent, /HOUSEHOLD_BILL: ReceiptIndianRupee/);
});

test("blocked, suspended, inactive, and archived household contexts do not produce reminders", () => {
  assert.match(migration, /household\."status" = 'ACTIVE'/);
  assert.match(migration, /membership\."status" = 'ACTIVE'/);
  assert.match(migration, /is_user_content_visible\(share\."memberId"\)/);
  assert.match(migration, /is_user_content_visible\(share\."creditorId"\)/);
  assert.match(migration, /FROM public\."UserBlock"/);
});
