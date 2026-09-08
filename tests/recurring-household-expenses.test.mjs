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
const migration = readFileSync(new URL("../prisma/migrations/20260907120000_recurring_household_expenses/migration.sql", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/household/actions.ts", import.meta.url), "utf8");
const loader = readFileSync(new URL("../lib/household-data.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/household/recurring-bills.tsx", import.meta.url), "utf8");
const expenseComponent = readFileSync(new URL("../components/household/expense-splitting.tsx", import.meta.url), "utf8");

test("monthly due dates clamp safely at each month end", () => {
  assert.equal(household.monthlyDueDateForCycle("2026-01-01", 31), "2026-01-31");
  assert.equal(household.monthlyDueDateForCycle("2026-02-01", 31), "2026-02-28");
  assert.equal(household.monthlyDueDateForCycle("2028-02-01", 31), "2028-02-29");
  assert.equal(household.monthlyDueDateForCycle("2026-04-01", 0), null);
});

test("recurring categories include subscriptions without changing expense math", () => {
  assert.equal(household.isHouseholdExpenseCategory("SUBSCRIPTION"), true);
  assert.deepEqual(
    household.splitExpenseAmountMinor({
      totalMinor: 10001,
      memberIds: ["a", "b"],
      method: "EQUAL",
    }),
    [
      { memberId: "a", amountMinor: 5001 },
      { memberId: "b", amountMinor: 5000 },
    ],
  );
});

test("one unique generated expense is enforced for every template cycle", () => {
  assert.match(migration, /HouseholdExpense_recurringTemplateId_billingCycleStart_key/);
  assert.match(migration, /ON CONFLICT \("recurringTemplateId", "billingCycleStart"\) DO NOTHING/);
  assert.match(migration, /generate_recurring_template_cycle/);
  assert.match(migration, /generate_due_recurring_household_expenses/);
  assert.match(migration, /CURRENT_DATE, CURRENT_DATE \+ 7/);
});

test("database cron and page catch-up generate upcoming bills", () => {
  assert.match(migration, /CREATE EXTENSION IF NOT EXISTS pg_cron/);
  assert.match(migration, /cron\.schedule\([\s\S]*nestmate-recurring-household-expenses/);
  assert.match(migration, /15 0 \* \* \*/);
  assert.match(loader, /generate_my_household_recurring_expenses/);
  assert.match(migration, /p_horizon_date > p_as_of_date \+ 62/);
});

test("template changes preserve generated expense and settlement history", () => {
  assert.match(migration, /UPDATE public\."HouseholdRecurringExpenseTemplate"/);
  assert.match(migration, /DELETE FROM public\."HouseholdRecurringExpenseParticipant"/);
  assert.doesNotMatch(migration, /DELETE FROM public\."HouseholdExpense"[\s\S]*recurringTemplateId/);
  assert.match(actions, /Existing expenses were preserved/);
  assert.match(component, /Edit future cycles/);
  assert.match(actions, /Previous expenses remain in the ledger/);
});

test("active members can pause, resume, edit, or end private templates", () => {
  assert.match(migration, /can_manage_household\(template_record\."householdId"\)/);
  assert.match(migration, /Ended recurring templates cannot be edited/);
  assert.match(migration, /'ACTIVE'.*'PAUSED'.*'ENDED'/s);
  assert.match(component, /Pause/);
  assert.match(component, /Resume/);
  assert.match(component, /> End</);
});

test("template and participant rows are protected by RLS and invoker RPC wrappers", () => {
  for (const table of ["HouseholdRecurringExpenseTemplate", "HouseholdRecurringExpenseParticipant"]) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\."${table}" ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(migration, /can_access_household/);
  assert.match(migration, /CREATE FUNCTION public\.create_recurring_household_expense[\s\S]*SECURITY INVOKER/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.create_recurring_household_expense[\s\S]*FROM PUBLIC, anon/);
  assert.doesNotMatch(migration, /GRANT (?:SELECT|INSERT|UPDATE|DELETE)[^;]*TO anon/);
});

test("generated bills use the existing settlement ledger and are visibly identified", () => {
  assert.match(migration, /INSERT INTO public\."HouseholdExpense"/);
  assert.match(migration, /INSERT INTO public\."HouseholdExpenseShare"/);
  assert.match(migration, /refresh_household_expense_status/);
  assert.match(expenseComponent, /Recurring bill/);
  assert.match(expenseComponent, /expense\.dueDate/);
});
