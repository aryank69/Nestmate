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
const migration = readFileSync(new URL("../prisma/migrations/20260907100000_household_coordination/migration.sql", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/household/actions.ts", import.meta.url), "utf8");
const dataSource = readFileSync(new URL("../lib/household-data.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/household/household-page.tsx", import.meta.url), "utf8");

test("household items cover coordination without payment processing", () => {
  assert.deepEqual(household.HOUSEHOLD_ITEM_KINDS.map(({ value }) => value), [
    "RENT_DUE", "UTILITY", "CHORE", "EXPENSE", "TASK", "NOTE",
  ]);
  assert.equal(household.isHouseholdItemKind("EXPENSE"), true);
  assert.equal(household.isHouseholdItemKind("PAYMENT"), false);
  assert.equal(household.isHouseholdRecurrence("MONTHLY"), true);
  assert.equal(household.isHouseholdRecurrence("DAILY"), false);
  assert.equal(household.householdAmountMinor("1250.50"), 125050);
  assert.equal(household.householdAmountMinor("0"), undefined);
});

test("households are created only from confirmed completed move-ins", () => {
  assert.match(migration, /sync_household_after_match_change/);
  assert.match(migration, /"status" = 'COMPLETED'[\s\S]*"closureReason" = 'MOVE_IN_COMPLETED'/);
  assert.match(migration, /Household_finalizedSpaceId_key/);
  assert.match(migration, /participantOneId[\s\S]*participantTwoId/);
  assert.match(migration, /MOVE_IN_RESET/);
});

test("RLS limits every household table to active participants", () => {
  for (const table of ["Household", "HouseholdMember", "HouseholdItem"]) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\."${table}" ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(migration, /can_access_household/);
  assert.match(migration, /current_nestmate_user_id\(\)/);
  assert.match(migration, /viewer_membership\."status" = 'ACTIVE'::public\."HouseholdMemberStatus"/);
  assert.match(migration, /UserBlock/);
  assert.match(migration, /is_user_content_visible/);
  assert.doesNotMatch(migration, /GRANT (?:SELECT|INSERT|UPDATE|DELETE)[^;]*TO anon/);
});

test("financial details are private coordination data with no payment fields", () => {
  assert.match(migration, /"amountMinor" INTEGER/);
  assert.match(migration, /HouseholdItem_amount_check/);
  assert.doesNotMatch(migration, /bankAccount|paymentIntent|cardNumber|upiId|stripe/i);
  assert.doesNotMatch(dataSource, /bankAccount|paymentIntent|cardNumber|upiId|stripe|privateNote/i);
  assert.match(component, /does not collect or transfer money/);
  assert.match(component, /Do not store bank details/);
});

test("archiving makes items read-only and leaving removes member access", () => {
  assert.match(migration, /can_manage_household[\s\S]*"status" = 'ACTIVE'/);
  assert.match(migration, /validate_household_member_leave/);
  assert.match(migration, /archive_household_after_member_leaves/);
  assert.match(migration, /"status" = 'LEFT'/);
  assert.match(component, /Archived · read-only/);
  assert.match(component, /immediately lose access/);
  assert.match(actions, /\.update\(\{ status: "LEFT" \}/);
  assert.match(actions, /\.update\(\{ status: "ARCHIVED" \}\)/);
});

test("item assignment, completion, editing, and deletion stay membership-scoped", () => {
  assert.match(migration, /Items can only be assigned to an active household member/);
  assert.match(migration, /Only the creator can edit household item details/);
  assert.match(migration, /Creators can delete active household items/);
  assert.match(migration, /NEW\."completedAt" := CASE/);
  assert.match(actions, /auth\.getClaims\(\)/);
  assert.match(actions, /\.eq\("householdId", input\.householdId\)/);
  assert.match(component, /Mark complete/);
});
