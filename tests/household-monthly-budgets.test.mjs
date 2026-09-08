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
const migration = readFileSync(new URL("../prisma/migrations/20260907155138_household_monthly_budgets/migration.sql", import.meta.url), "utf8");
const action = readFileSync(new URL("../app/household/actions.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/household/monthly-spending-summary.tsx", import.meta.url), "utf8");

test("budget usage switches deterministically at 80 and 100 percent", () => {
  assert.deepEqual(household.householdBudgetUsage({ spendMinor: 7_999, budgetMinor: 10_000 }), {
    usagePercent: 80,
    threshold: "BELOW",
  });
  assert.deepEqual(household.householdBudgetUsage({ spendMinor: 8_000, budgetMinor: 10_000 }), {
    usagePercent: 80,
    threshold: "EIGHTY",
  });
  assert.deepEqual(household.householdBudgetUsage({ spendMinor: 10_000, budgetMinor: 10_000 }), {
    usagePercent: 100,
    threshold: "ONE_HUNDRED",
  });
  assert.equal(household.householdBudgetUsage({ spendMinor: 12_500, budgetMinor: 10_000 }).usagePercent, 125);
});

test("budget categories support one overall and one category limit per month", () => {
  for (const category of ["OVERALL", "RENT", "UTILITIES", "GROCERIES", "MAINTENANCE", "SUBSCRIPTIONS", "OTHER"]) {
    assert.equal(household.isHouseholdBudgetCategory(category), true);
  }
  assert.match(migration, /HouseholdMonthlyBudget_householdId_month_category_key/);
  assert.match(migration, /"month" = date_trunc\('month', "month"\)::DATE/);
});

test("monthly spend maps electricity and internet into utilities", () => {
  assert.match(migration, /WHEN 'UTILITIES'[\s\S]*'ELECTRICITY'[\s\S]*'INTERNET'/);
  assert.match(migration, /WHEN 'SUBSCRIPTIONS'[\s\S]*'SUBSCRIPTION'/);
  assert.match(migration, /expense\."expenseDate" >= p_month/);
  assert.match(migration, /expense\."expenseDate" < p_month \+ INTERVAL '1 month'/);
});

test("alerts emit only the highest reached threshold and deduplicate by month", () => {
  assert.match(migration, /WHEN usage\.spend_minor \* 100 >= usage\.budget_minor \* 100 THEN 100/);
  assert.match(migration, /WHEN usage\.spend_minor \* 100 >= usage\.budget_minor \* 80 THEN 80/);
  assert.match(migration, /"householdId"::TEXT \|\| ':' \|\| to_char\(reached\."month", 'YYYY-MM'\)/);
  assert.match(migration, /ON CONFLICT \("recipientId", "type", "resourceId"\)[\s\S]*"actorId" IS NULL/);
  assert.match(migration, /HouseholdExpense_budget_alerts/);
});

test("budgets and alerts reuse household authorization and reveal no member payment details", () => {
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /can_access_household\("householdId"\)/);
  assert.match(migration, /can_manage_household\(p_household_id\)/);
  assert.match(migration, /CREATE FUNCTION public\.set_household_monthly_budget[\s\S]*SECURITY INVOKER/);
  assert.match(migration, /REVOKE ALL[\s\S]*FROM PUBLIC, anon/);
  assert.doesNotMatch(migration, /HouseholdSettlement|settlement\."note"/);
  assert.match(migration, /member\."status" = 'ACTIVE'/);
});

test("the action accepts blank removal and the UI shows spend against each limit", () => {
  assert.match(action, /setHouseholdMonthlyBudgetAction/);
  assert.match(action, /p_amount_minor: amountMinor/);
  assert.match(component, /Monthly budgets/);
  assert.match(component, /spent of/);
  assert.match(component, /Alerts are sent once at 80% and again at 100% for each month/);
  assert.match(component, /Leave a value blank and save to remove that limit/);
});
