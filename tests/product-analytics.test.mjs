import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../lib/analytics.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const analyticsModule = { exports: {} };
new Function("module", "exports", "require", output)(
  analyticsModule,
  analyticsModule.exports,
  require,
);
const analytics = analyticsModule.exports;

const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260909125636_product_analytics/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const serverSource = readFileSync(
  new URL("../lib/analytics.server.ts", import.meta.url),
  "utf8",
);
const actionSource = readFileSync(
  new URL("../app/analytics/actions.ts", import.meta.url),
  "utf8",
);
const funnelSource = readFileSync(
  new URL("../components/analytics/product-funnel.tsx", import.meta.url),
  "utf8",
);

test("event sanitizer keeps only the explicit event-specific allowlist", () => {
  const event = analytics.sanitizeProductAnalyticsEvent({
    name: "MESSAGE_STARTED",
    properties: {
      source: "listing",
      hasListingContext: true,
      message: "private chat text",
      email: "member@example.com",
      commuteDestination: "Private office address",
      documentUrl: "https://private.example/file",
      targetUserId: "user-secret",
    },
  });

  assert.deepEqual(event, {
    name: "MESSAGE_STARTED",
    properties: { source: "listing", hasListingContext: true },
  });
  assert.equal(analytics.sanitizeProductAnalyticsEvent({ name: "UNKNOWN" }), null);
});

test("search analytics records filter categories, never raw values", () => {
  const properties = analytics.analyticsSearchProperties({
    surface: "people",
    query: "Aryan",
    budgetMin: 15_000,
    budgetMax: 25_000,
    moveInBy: "2026-10-01",
    locality: "private-locality-id",
    lifestyleCount: 3,
    commuteRange: 12,
    minimumCompatibility: 70,
    sort: "highest-compatibility",
  });

  assert.equal(properties.filterCount, 7);
  assert.equal(properties.hasBudget, true);
  assert.equal(properties.hasCommuteRange, true);
  assert.equal(properties.hasCompatibility, true);
  const serialized = JSON.stringify(properties);
  for (const privateValue of ["Aryan", "15000", "25000", "2026-10-01", "private-locality-id", "12", "70"]) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

test("funnel uses distinct members and calculates stage-to-stage conversion", () => {
  const result = analytics.calculateProductFunnel(
    [
      { userId: "a", name: "SIGNUP_COMPLETED" },
      { userId: "b", name: "SIGNUP_COMPLETED" },
      { userId: "a", name: "PROFILE_COMPLETED" },
      { userId: "a", name: "LISTING_VIEWED" },
      { userId: "a", name: "LISTING_VIEWED" },
      { userId: "b", name: "PROFILE_VIEWED" },
      { userId: "a", name: "MESSAGE_STARTED" },
      { userId: "b", name: "VISIT_REQUESTED" },
      { userId: "a", name: "VISIT_COMPLETED" },
      { userId: "a", name: "MATCH_FINALIZED" },
    ],
    30,
    new Date("2026-09-09T00:00:00.000Z"),
  );

  assert.deepEqual(
    result.stages.map(({ users }) => users),
    [2, 1, 1, 1],
  );
  assert.deepEqual(
    result.stages.map(({ conversionFromPrevious }) => conversionFromPrevious),
    [null, 50, 100, 100],
  );
  assert.deepEqual(result.onboarding, {
    signups: 2,
    profilesCompleted: 1,
    profileCompletionRate: 50,
  });
  assert.equal(result.totalEvents, 10);
});

test("storage is private and the internal view reads aggregate-safe fields", () => {
  assert.match(migration, /nestmate_private\.product_analytics_event/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL[\s\S]*PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /octet_length\(properties::TEXT\) <= 2048/);
  assert.match(serverSource, /ProductAnalyticsProvider/);
  assert.match(serverSource, /moderatorMembership\.findUnique/);
  assert.match(serverSource, /SELECT user_id AS "userId", event_name AS "name"/);
  assert.doesNotMatch(serverSource, /SELECT \*/);
  assert.match(actionSource, /auth\.getClaims\(\)/);
  assert.match(funnelSource, /Only aggregate counts are shown here/);
  assert.doesNotMatch(funnelSource, /userId|properties/);
});
