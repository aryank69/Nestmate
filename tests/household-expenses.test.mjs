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
const migration = [
  "../prisma/migrations/20260907110000_household_expense_splitting/migration.sql",
  "../prisma/migrations/20260907111000_household_expense_rpc_hardening/migration.sql",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
const actions = readFileSync(new URL("../app/household/actions.ts", import.meta.url), "utf8");
const dataSource = readFileSync(new URL("../lib/household-data.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/household/expense-splitting.tsx", import.meta.url), "utf8");

test("equal expense splits preserve every paisa deterministically", () => {
  assert.deepEqual(
    household.splitExpenseAmountMinor({
      totalMinor: 10_001,
      memberIds: ["member-a", "member-b", "member-c"],
      method: "EQUAL",
    }),
    [
      { memberId: "member-a", amountMinor: 3_334 },
      { memberId: "member-b", amountMinor: 3_334 },
      { memberId: "member-c", amountMinor: 3_333 },
    ],
  );
});

test("custom splits must be positive, unique, and equal the total", () => {
  assert.deepEqual(
    household.splitExpenseAmountMinor({
      totalMinor: 15_000,
      memberIds: ["member-a", "member-b"],
      method: "CUSTOM",
      customAmountsMinor: { "member-a": 10_000, "member-b": 5_000 },
    }),
    [
      { memberId: "member-a", amountMinor: 10_000 },
      { memberId: "member-b", amountMinor: 5_000 },
    ],
  );
  assert.equal(household.splitExpenseAmountMinor({
    totalMinor: 15_000,
    memberIds: ["member-a", "member-b"],
    method: "CUSTOM",
    customAmountsMinor: { "member-a": 10_000, "member-b": 4_999 },
  }), null);
  assert.equal(household.splitExpenseAmountMinor({
    totalMinor: 15_000,
    memberIds: ["member-a", "member-a"],
    method: "EQUAL",
  }), null);
});

test("outstanding balances never become negative", () => {
  assert.equal(household.outstandingExpenseAmountMinor({
    shareAmountMinor: 8_000,
    settledAmountMinor: 3_000,
  }), 5_000);
  assert.equal(household.outstandingExpenseAmountMinor({
    shareAmountMinor: 8_000,
    settledAmountMinor: 9_000,
  }), 0);
});

test("database functions validate splits atomically and prevent over-settlement", () => {
  assert.match(migration, /CREATE FUNCTION public\.create_household_expense/);
  assert.match(migration, /Custom shares must be positive and add up to the expense total/);
  assert.match(migration, /base_amount := p_amount_minor \/ member_count/);
  assert.match(migration, /position <= remainder/);
  assert.match(migration, /Settlement amount exceeds the remaining balance/);
  assert.match(migration, /FOR UPDATE OF settlement, share/);
  assert.match(migration, /The other member must confirm this settlement/);
  assert.match(migration, /refresh_household_expense_status/);
});

test("expense, split, and settlement records are member-only through RLS", () => {
  for (const table of ["HouseholdExpense", "HouseholdExpenseShare", "HouseholdSettlement"]) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\."${table}" ENABLE ROW LEVEL SECURITY`));
    assert.match(migration, new RegExp(`can_access_household`));
  }
  assert.match(migration, /REVOKE ALL PRIVILEGES[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT SELECT[\s\S]*TO authenticated/);
  assert.doesNotMatch(migration, /GRANT (?:SELECT|INSERT|UPDATE|DELETE)[^;]*TO anon/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.create_household_expense[\s\S]*FROM PUBLIC, anon/);
  assert.match(migration, /can_manage_household/);
  assert.match(migration, /CREATE FUNCTION public\.create_household_expense[\s\S]*SECURITY INVOKER/);
  assert.match(migration, /nestmate_private\.create_household_expense_internal/);
});

test("financial records contain no payment credentials or payment processing", () => {
  for (const source of [migration, actions, dataSource, component]) {
    assert.doesNotMatch(source, /cardNumber|bankAccount|paymentIntent|checkoutSession|stripeSecret|upiId/i);
  }
  assert.match(component, /not payment confirmations/);
  assert.match(component, /Do not add bank, card, UPI, or account details/);
});

test("the household UI supports categories, selected members, split modes, and confirmation history", () => {
  assert.deepEqual(household.HOUSEHOLD_SPLIT_METHODS.map(({ value }) => value), ["EQUAL", "CUSTOM"]);
  assert.match(component, /Split among/);
  assert.match(component, /Settlement history/);
  assert.match(component, /Awaiting confirmation/);
  assert.match(component, /Record settlement/);
  assert.match(actions, /create_household_expense/);
  assert.match(actions, /record_household_settlement/);
  assert.match(actions, /set_household_settlement_status/);
});
