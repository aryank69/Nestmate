import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../lib/verification.ts", import.meta.url),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const verificationModule = { exports: {} };
new Function("module", "exports", "require", output)(
  verificationModule,
  verificationModule.exports,
  require,
);
const verification = verificationModule.exports;

const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260904160000_verification_trust/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const badgeUi = readFileSync(
  new URL("../components/verification/trust-badges.tsx", import.meta.url),
  "utf8",
);
const communityUi = readFileSync(
  new URL("../components/community/community-page.tsx", import.meta.url),
  "utf8",
);
const peopleUi = readFileSync(
  new URL("../components/people/people-discovery.tsx", import.meta.url),
  "utf8",
);
const profileUi = readFileSync(
  new URL("../components/profile/profile-page.tsx", import.meta.url),
  "utf8",
);
const communityData = readFileSync(
  new URL("../lib/community-data.ts", import.meta.url),
  "utf8",
);

test("only active verified checks become public-safe badges", () => {
  const now = new Date("2026-09-04T12:00:00.000Z");
  const result = verification.verificationSummary([
    { kind: "EMAIL", status: "VERIFIED", verifiedAt: now, expiresAt: null },
    { kind: "PHONE", status: "PENDING", verifiedAt: null, expiresAt: null },
    {
      kind: "PROFILE_COMPLETE",
      status: "VERIFIED",
      verifiedAt: now,
      expiresAt: "2026-09-04T11:00:00.000Z",
    },
    { kind: "EMAIL", status: "VERIFIED", verifiedAt: now, expiresAt: null },
  ], now);

  assert.deepEqual(result.badges.map((badge) => badge.kind), ["EMAIL"]);
  assert.equal(result.badges[0].label, "Email verified");
});

test("badges explain the exact check without making a guarantee", () => {
  const result = verification.verificationSummary([
    {
      kind: "LISTING_DETAILS",
      status: "VERIFIED",
      verifiedAt: new Date(),
      expiresAt: null,
    },
  ]);

  assert.match(result.badges[0].description, /not been inspected/i);
  assert.match(badgeUi, /not a guarantee of identity, safety, or property quality/i);
});

test("verification model is extensible for stronger identity and property checks", () => {
  assert.match(migration, /'IDENTITY'/);
  assert.match(migration, /'PROPERTY'/);
  assert.match(migration, /'MANUAL_REVIEW'/);
  assert.match(migration, /'THIRD_PARTY'/);
  assert.match(migration, /"expiresAt" TIMESTAMPTZ/);
});

test("sensitive verification fields are private and users cannot self-verify", () => {
  assert.match(migration, /ALTER TABLE public\."VerificationCheck" ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /Users can read only their own verification status/);
  assert.match(migration, /GRANT SELECT \([\s\S]*"verifiedAt"[\s\S]*\) ON TABLE/);
  assert.doesNotMatch(
    migration.match(/GRANT SELECT \([\s\S]*?\) ON TABLE/)?.[0] ?? "",
    /providerReference|privateMetadata/,
  );
  assert.doesNotMatch(migration, /GRANT (INSERT|UPDATE|DELETE)[^;]*VerificationCheck/);
  assert.doesNotMatch(migration, /GRANT SELECT[^;]*VerificationCheck[^;]*anon/);
});

test("profile and listing checks synchronize from authoritative data", () => {
  assert.match(migration, /email_confirmed_at, phone_confirmed_at/);
  assert.match(migration, /sync_profile_complete_verification/);
  assert.match(migration, /sync_listing_details_verification/);
  assert.match(migration, /LISTING_DETAILS/);
});

test("trust badges render on profiles, post cards, and detail views", () => {
  assert.match(communityUi, /TrustBadges/);
  assert.match(communityUi, /verification=\{post\.author\.verification\}/);
  assert.match(communityUi, /verification=\{post\.verification\}/);
  assert.match(peopleUi, /verification=\{profile\.verification\}/);
  assert.match(profileUi, /verification=\{profile\.verification\}/);
  assert.match(communityData, /verificationSummary\(post\.verificationChecks\)/);
});
