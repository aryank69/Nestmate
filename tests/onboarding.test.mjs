import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);

function compile(relativePath, aliases = {}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  const localRequire = (specifier) => aliases[specifier] ?? require(specifier);
  new Function("module", "exports", "require", output)(
    compiledModule,
    compiledModule.exports,
    localRequire,
  );
  return compiledModule.exports;
}

const commute = compile("../lib/commute.ts");
const onboarding = compile("../lib/onboarding.ts", {
  "@/lib/commute": commute,
});
const location = {
  id: "community-hsr",
  localityId: "locality-hsr",
  city: "Bengaluru",
  citySlug: "bengaluru",
  locality: "HSR Layout",
};
const validValues = {
  intent: "FIND_ROOM",
  communityId: location.id,
  budgetMin: "15000",
  budgetMax: "28000",
  moveInDate: "2026-11-01",
  commuteDestination: "Manyata Tech Park",
  commuteLatitude: "13.0475",
  commuteLongitude: "77.6201",
  preferredCommuteKm: "15",
};

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260910153140_first_time_onboarding/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const profileRls = readFileSync(
  new URL(
    "../prisma/migrations/20260824170000_link_supabase_auth_profiles/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const actionSource = readFileSync(new URL("../app/onboarding/actions.ts", import.meta.url), "utf8");
const formSource = readFileSync(
  new URL("../components/onboarding/onboarding-form.tsx", import.meta.url),
  "utf8",
);
const authActionSource = readFileSync(new URL("../app/auth/actions.ts", import.meta.url), "utf8");
const callbackSource = readFileSync(new URL("../app/auth/callback/route.ts", import.meta.url), "utf8");
const loginSource = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
const signupSource = readFileSync(new URL("../app/signup/page.tsx", import.meta.url), "utf8");
const profileSource = readFileSync(new URL("../app/profile/page.tsx", import.meta.url), "utf8");

test("onboarding validates essential fields and reuses optional commute preferences", () => {
  const result = onboarding.validateOnboardingValues(validValues);
  assert.equal(result.success, true);
  assert.equal(result.data.intent, "FIND_ROOM");
  assert.equal(result.data.budgetMax, 28000);
  assert.equal(result.data.commute.preferredRangeKm, 15);

  const labelOnly = onboarding.validateOnboardingValues({
    ...validValues,
    commuteLatitude: "",
    commuteLongitude: "",
  });
  assert.equal(labelOnly.success, true);
  assert.equal(labelOnly.data.commute.destination, "Manyata Tech Park");
  assert.equal(labelOnly.data.commute.latitude, null);
});

test("invalid intent, locality, budgets, dates, and coordinate pairs get clear errors", () => {
  const result = onboarding.validateOnboardingValues({
    ...validValues,
    intent: "",
    communityId: "",
    budgetMin: "30000",
    budgetMax: "20000",
    moveInDate: "not-a-date",
    commuteLongitude: "",
  });
  assert.equal(result.success, false);
  assert.match(result.errors.intent, /choose/i);
  assert.match(result.errors.communityId, /city and locality/i);
  assert.match(result.errors.budgetMax, /at least/i);
  assert.match(result.errors.moveInDate, /valid/i);
  assert.match(result.errors.commuteDestination, /longitude/i);
});

test("intent routing prefills existing discovery and creation routes without leaking commute details", () => {
  const roomUrl = onboarding.onboardingDestination(
    onboarding.validateOnboardingValues(validValues).data,
    location,
  );
  assert.match(roomUrl, /^\/rooms\?/);
  assert.match(roomUrl, /locality=community-hsr/);
  assert.match(roomUrl, /city=bengaluru/);
  assert.match(roomUrl, /min=15000/);
  assert.match(roomUrl, /max=28000/);
  assert.match(roomUrl, /moveInBy=2026-11-01/);
  assert.match(roomUrl, /distance=15/);
  assert.match(roomUrl, /sort=recommended/);
  assert.doesNotMatch(roomUrl, /Manyata|latitude|longitude|13\.0475|77\.6201/);

  const roommateUrl = onboarding.onboardingDestination(
    { ...onboarding.validateOnboardingValues(validValues).data, intent: "FIND_ROOMMATE" },
    location,
  );
  assert.match(roommateUrl, /^\/flatmates\?/);
  assert.match(roommateUrl, /locality=locality-hsr/);
  assert.match(roommateUrl, /commute=15/);

  for (const [intent, pathname] of [
    ["LIST_PROPERTY", "/list-property?"],
    ["POST_REQUIREMENT", "/post-requirement?"],
  ]) {
    const url = onboarding.onboardingDestination(
      { ...onboarding.validateOnboardingValues(validValues).data, intent },
      location,
    );
    assert.ok(url.startsWith(pathname));
    assert.match(url, /city=bengaluru/);
    assert.match(url, /locality=community-hsr/);
  }
});

test("onboarding state lives on existing preferences and preserves existing members", () => {
  assert.match(schema, /enum OnboardingIntent/);
  assert.match(schema, /onboardingIntent\s+OnboardingIntent\?/);
  assert.match(schema, /onboardingCompletedAt\s+DateTime\?/);
  assert.match(schema, /onboardingSkippedAt\s+DateTime\?/);
  assert.match(migration, /ALTER TABLE public\."UserPreferences"/);
  assert.match(migration, /SET "onboardingSkippedAt" = now\(\)/);
  assert.match(migration, /UserPreferences_onboarding_state_check/);
  assert.doesNotMatch(migration, /CREATE TABLE/);
});

test("persistence and skip flows rely on the authenticated owner and existing RLS", () => {
  assert.match(actionSource, /auth\.getClaims\(\)/);
  assert.match(actionSource, /from\("UserPreferences"\)/);
  assert.match(actionSource, /onboardingCompletedAt: now/);
  assert.match(actionSource, /onboardingSkippedAt: now/);
  assert.match(actionSource, /replace_my_preferred_localities/);
  assert.match(actionSource, /redirect\(nextPath\)/);
  assert.doesNotMatch(actionSource, /service[_-]?role|SUPABASE_SERVICE_ROLE/i);
  assert.match(profileRls, /CREATE POLICY "Users can read their own preferences"/);
  assert.match(profileRls, /CREATE POLICY "Users can update their own preferences"/);
  assert.match(profileRls, /USING[\s\S]*auth\.uid\(\)/);
  assert.match(profileRls, /WITH CHECK[\s\S]*auth\.uid\(\)/);
});

test("signup, login, and confirmation callback send first-time users through onboarding", () => {
  for (const source of [authActionSource, callbackSource, loginSource, signupSource]) {
    assert.match(source, /postAuthPath/);
  }
  assert.ok(existsSync(new URL("../app/onboarding/page.tsx", import.meta.url)));
  assert.match(profileSource, /href="\/onboarding\?edit=1"/);
});

test("the form is responsive, skippable, editable, and explains commute privacy", () => {
  for (const field of [
    "intent",
    "communityId",
    "budgetMin",
    "budgetMax",
    "moveInDate",
    "commuteDestination",
    "preferredCommuteKm",
  ]) {
    assert.match(formSource, new RegExp('name="' + field + '"'));
  }
  assert.match(formSource, /sm:grid-cols-2/);
  assert.match(formSource, /Skip for now/);
  assert.match(formSource, /Use current location/);
  assert.match(formSource, /coordinates stay private/i);
  assert.match(formSource, /isEditing/);
});
