import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const helperSource = readFileSync(
  new URL("../lib/moderation.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const helperModule = { exports: {} };
new Function("module", "exports", "require", compiled)(
  helperModule,
  helperModule.exports,
  require,
);
const { validateModerationActionInput } = helperModule.exports;

const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260904180000_admin_moderation_dashboard/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const dashboardPage = readFileSync(
  new URL("../app/admin/moderation/page.tsx", import.meta.url),
  "utf8",
);
const moderationData = readFileSync(
  new URL("../lib/moderation-data.ts", import.meta.url),
  "utf8",
);
const communityData = readFileSync(
  new URL("../lib/community-data.ts", import.meta.url),
  "utf8",
);
const peopleData = readFileSync(
  new URL("../lib/people-data.ts", import.meta.url),
  "utf8",
);

test("moderation actions require valid queue items, private reasons, and bounded restrictions", () => {
  assert.equal(
    validateModerationActionInput({
      queueType: "REPORT",
      queueId: "report-1",
      action: "WARN",
      reason: "Repeated unsolicited contact",
    }).success,
    true,
  );
  assert.equal(
    validateModerationActionInput({
      queueType: "REPORT",
      queueId: "report-1",
      action: "RESTRICT",
      reason: "Burst posting",
      restrictionHours: 169,
    }).success,
    false,
  );
  assert.equal(
    validateModerationActionInput({
      queueType: "USER_STATE",
      queueId: "user-1",
      action: "WARN",
      reason: "Reviewed state",
    }).success,
    false,
  );
});

test("moderator roles are stored server-side and never derived from user metadata", () => {
  assert.match(migration, /CREATE TABLE public\."ModeratorMembership"/);
  assert.match(migration, /current_moderator_role/);
  assert.match(migration, /app_user\."authUserId" = \(SELECT auth\.uid\(\)\)/);
  assert.doesNotMatch(migration, /user_metadata|raw_user_meta_data/);
  assert.match(migration, /Users can read their own moderator role/);
});

test("privileged actions are checked in a private definer function with an invoker wrapper", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION nestmate_private\.perform_moderation_action[\s\S]*SECURITY DEFINER/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.perform_moderation_action[\s\S]*SECURITY INVOKER/,
  );
  assert.match(migration, /Moderator access is required/);
  assert.match(migration, /Only an admin can suspend or restore an account/);
  assert.match(migration, /Moderators cannot act on their own account or content/);
});

test("moderation tables use RLS and audit records are append-only for clients", () => {
  for (const table of [
    "ModeratorMembership",
    "UserModerationState",
    "ModerationReview",
    "ModerationAuditLog",
  ]) {
    assert.match(
      migration,
      new RegExp(`ALTER TABLE public\\.\"${table}\" ENABLE ROW LEVEL SECURITY`),
    );
  }
  assert.match(migration, /Moderators can read the audit trail/);
  assert.doesNotMatch(
    migration,
    /GRANT (INSERT|UPDATE|DELETE)[^;]*ModerationAuditLog/,
  );
  assert.match(migration, /INSERT INTO public\."ModerationAuditLog"/);
});

test("internal flags and verification issues are available only through moderator policies", () => {
  assert.match(migration, /Moderators can review suspicious activity flags/);
  assert.match(migration, /Moderators can review reports/);
  assert.match(migration, /Moderators can review safe verification status fields/);
  assert.doesNotMatch(
    migration.match(/GRANT SELECT \([^;]+VerificationCheck/)?.[0] ?? "",
    /privateMetadata|providerReference/,
  );
  assert.match(moderationData, /privateDetailLines/);
  assert.match(dashboardPage, /notFound\(\)/);
});

test("hidden content and suspended accounts are excluded from application discovery", () => {
  assert.match(migration, /"moderationStatus" = 'VISIBLE'/);
  assert.match(migration, /is_user_content_visible/);
  assert.match(communityData, /moderationStatus: "VISIBLE"/);
  assert.match(communityData, /status: "SUSPENDED"/);
  assert.match(peopleData, /status: "SUSPENDED"/);
});
