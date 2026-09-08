import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../prisma/migrations/20260907161543_household_expense_trends/migration.sql", import.meta.url),
  "utf8",
);
const loader = readFileSync(new URL("../lib/household-data.ts", import.meta.url), "utf8");
const types = readFileSync(new URL("../types/household.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/household/expense-trends.tsx", import.meta.url), "utf8");

test("trend aggregation is bounded to six or twelve indexed household months", () => {
  assert.match(migration, /p_month_count NOT IN \(6, 12\)/);
  assert.match(migration, /generate_series\(/);
  assert.match(migration, /expense\."householdId" = p_household_id/);
  assert.match(migration, /expense\."expenseDate" >= start_month/);
  assert.match(migration, /expense\."expenseDate" < range_end/);
  assert.match(migration, /LEFT JOIN expense_months USING \(month_start\)/);
});

test("month comparisons include totals, recurring split, one-time split, and zero-safe direction", () => {
  assert.match(migration, /FILTER \(WHERE "recurringTemplateId" IS NOT NULL\)/);
  assert.match(migration, /FILTER \(WHERE "recurringTemplateId" IS NULL\)/);
  assert.match(migration, /LAG\(total_minor\) OVER \(ORDER BY month_start\)/);
  assert.match(migration, /previous_total_minor = 0 AND total_minor > 0 THEN 'NEW'/);
  assert.match(migration, /WHEN total_minor > previous_total_minor THEN 'UP'/);
  assert.match(migration, /WHEN total_minor < previous_total_minor THEN 'DOWN'/);
});

test("category changes align utilities and subscriptions with existing budget categories", () => {
  assert.match(migration, /WHEN 'ELECTRICITY'.*THEN 'UTILITIES'/);
  assert.match(migration, /WHEN 'INTERNET'.*THEN 'UTILITIES'/);
  assert.match(migration, /WHEN 'SUBSCRIPTION'.*THEN 'SUBSCRIPTIONS'/);
  assert.match(migration, /'categoryChanges', category_json\.value/);
  assert.match(migration, /budget\."category" = 'OVERALL'/);
  assert.match(migration, /budgetUsagePercent/);
});

test("trend endpoint is authenticated, invoker-safe, and returns no member-level data", () => {
  assert.match(migration, /SECURITY INVOKER/);
  assert.match(migration, /SET search_path = ''/);
  assert.match(migration, /current_nestmate_user_id\(\)/);
  assert.match(migration, /can_access_household\(p_household_id\)/);
  assert.match(migration, /REVOKE ALL[\s\S]*FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE[\s\S]*TO authenticated/);
  assert.doesNotMatch(migration, /HouseholdExpenseShare|HouseholdSettlement|memberId|paidById|createdById/);
});

test("loader requests twelve months once and the UI supports six and twelve month views", () => {
  assert.match(loader, /get_household_expense_trends/);
  assert.match(loader, /p_end_month: `\$\{selectedMonth\}-01`/);
  assert.match(loader, /p_month_count: 12/);
  assert.match(types, /monthCount: 6 \| 12/);
  for (const label of [
    "Expense trends",
    "6 months",
    "12 months",
    "Latest month mix",
    "Recurring bills",
    "One-time expenses",
    "Category changes from last month",
  ]) {
    assert.match(component, new RegExp(label));
  }
  assert.match(component, /Household-level spending patterns only/);
});
