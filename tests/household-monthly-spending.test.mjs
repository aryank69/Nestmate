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
const migration = readFileSync(new URL("../prisma/migrations/20260907152421_monthly_household_spending_summary/migration.sql", import.meta.url), "utf8");
const loader = readFileSync(new URL("../lib/household-data.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/household/monthly-spending-summary.tsx", import.meta.url), "utf8");

test("month selection accepts only valid year-month values", () => {
  assert.equal(household.householdMonthValue("2026-09", "2026-01"), "2026-09");
  assert.equal(household.householdMonthValue("2026-13", "2026-01"), "2026-01");
  assert.equal(household.householdMonthValue("September", "2026-01"), "2026-01");
  assert.equal(household.householdMonthValue(["2026-09"], "2026-01"), "2026-01");
});

test("monthly aggregation uses an indexed household and expense-date range", () => {
  assert.match(migration, /expense\."householdId" = p_household_id/);
  assert.match(migration, /expense\."expenseDate" >= month_start/);
  assert.match(migration, /expense\."expenseDate" < month_end/);
  assert.match(migration, /SUM\("amountMinor"\)/);
  assert.match(migration, /SUM\(paid_minor\)/);
  assert.match(migration, /SUM\(outstanding_minor\)/);
});

test("category totals and largest expenses are deterministic", () => {
  assert.match(migration, /GROUP BY "category"/);
  assert.match(migration, /ORDER BY amount_minor DESC, category::TEXT/);
  assert.match(migration, /ORDER BY "amountMinor" DESC, "expenseDate" DESC, "id"/);
  assert.match(migration, /LIMIT 5/);
});

test("the RPC is authenticated, invoker-safe, and household scoped", () => {
  assert.match(migration, /SECURITY INVOKER/);
  assert.match(migration, /can_access_household\(p_household_id\)/);
  assert.match(migration, /current_nestmate_user_id\(\)/);
  assert.match(migration, /REVOKE ALL[\s\S]*FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE[\s\S]*TO authenticated/);
});

test("member-level output contains only the current viewer's aggregate", () => {
  assert.match(migration, /WHERE "memberId" = current_user_id/);
  assert.match(migration, /WHERE "paidById" = current_user_id/);
  assert.doesNotMatch(migration, /HouseholdSettlement|settlement\."note"|member\."name"/);
  assert.doesNotMatch(migration, /jsonb_agg\([\s\S]*memberId/);
});

test("the loader requests only the selected month and the UI shows required summaries", () => {
  assert.match(loader, /get_household_monthly_spending_summary/);
  assert.match(loader, /p_month: `\${selectedMonth}-01`/);
  for (const label of [
    "Total shared expenses",
    "Amount paid",
    "Amount outstanding",
    "By category",
    "Largest expenses",
    "Your private summary",
  ]) {
    assert.match(component, new RegExp(label));
  }
  assert.match(component, /Other members can see shared household totals, but not this personal breakdown/);
});
