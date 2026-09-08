import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../lib/support.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const supportModule = { exports: {} };
new Function("module", "exports", "require", compiled)(
  supportModule,
  supportModule.exports,
  require,
);

const {
  cleanSupportMessage,
  supportCategoryLabels,
  supportStatusLabels,
  validateManageSupportCaseInput,
  validateSupportCaseInput,
} = supportModule.exports;
const migration = readFileSync(
  new URL("../prisma/migrations/20260904190000_support_and_appeals/migration.sql", import.meta.url),
  "utf8",
);
const userActions = readFileSync(new URL("../app/support/actions.ts", import.meta.url), "utf8");
const moderatorActions = readFileSync(
  new URL("../app/admin/moderation/support-actions.ts", import.meta.url),
  "utf8",
);
const moderationDashboard = readFileSync(
  new URL("../components/moderation/moderation-dashboard.tsx", import.meta.url),
  "utf8",
);

test("support request validation accepts every intended category and requires useful context", () => {
  for (const category of Object.keys(supportCategoryLabels)) {
    assert.equal(
      validateSupportCaseInput({
        category,
        subject: "Help with my NestMate account",
        description: "I need help understanding a recent decision on my account.",
      }).success,
      true,
    );
  }
  assert.equal(
    validateSupportCaseInput({ category: "UNKNOWN", subject: "Valid subject", description: "A long enough description for support." }).success,
    false,
  );
  assert.equal(
    validateSupportCaseInput({ category: "GENERAL_SUPPORT", subject: "Hi", description: "Too short" }).success,
    false,
  );
  assert.equal(cleanSupportMessage("  More private context  "), "More private context");
  assert.equal(cleanSupportMessage(" "), null);
});

test("moderator support updates validate statuses and bounded private text", () => {
  for (const status of Object.keys(supportStatusLabels)) {
    assert.equal(
      validateManageSupportCaseInput({
        caseId: "49000000-0000-4000-8000-000000000101",
        status,
        response: status === "UNDER_REVIEW" ? "We are reviewing this now." : "",
        internalNote: "",
      }).success,
      true,
    );
  }
  assert.equal(
    validateManageSupportCaseInput({ caseId: "bad", status: "OPEN", response: "", internalNote: "" }).success,
    false,
  );
});

test("support tables combine least-privilege grants with owner and moderator RLS", () => {
  for (const table of ["SupportCase", "SupportCaseMessage", "SupportCaseInternalNote"]) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\.\"${table}\" ENABLE ROW LEVEL SECURITY`));
    assert.match(migration, new RegExp(`REVOKE ALL PRIVILEGES ON TABLE public\\.\"${table}\"`));
  }
  assert.match(migration, /Users can create their own open support cases/);
  assert.match(migration, /Case owners and moderators can read support messages/);
  assert.match(migration, /Moderators can read support case internal notes/);
  assert.doesNotMatch(migration, /GRANT (INSERT|UPDATE|DELETE) ON TABLE public\."SupportCaseInternalNote"/);
  assert.doesNotMatch(migration, /GRANT UPDATE ON TABLE public\."SupportCase"/);
});

test("moderator case management is a guarded, audited database operation", () => {
  assert.match(migration, /nestmate_private\.manage_support_case[\s\S]*SECURITY DEFINER/);
  assert.match(migration, /public\.manage_support_case[\s\S]*SECURITY INVOKER/);
  assert.match(migration, /NOT nestmate_private\.is_current_moderator\(FALSE\)/);
  assert.match(migration, /Moderators cannot manage their own case/);
  assert.match(migration, /INSERT INTO public\."ModerationAuditLog"/);
  assert.match(migration, /'SUPPORT_CASE_UPDATE'::public\."NotificationType"/);
  assert.match(migration, /'SUPPORT_CASE'::public\."ModerationQueueType"/);
});

test("the app uses authenticated server actions and exposes support in moderation", () => {
  assert.match(userActions, /getSupportContext/);
  assert.match(userActions, /senderRole: "USER"/);
  assert.match(moderatorActions, /getModeratorContext/);
  assert.match(moderatorActions, /rpc\("manage_support_case"/);
  assert.match(moderationDashboard, /Support cases/);
  assert.match(moderationDashboard, /ModerationSupportCases/);
});
