import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../lib/trust-safety.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const safetyModule = { exports: {} };

new Function("module", "exports", "require", compiled)(
  safetyModule,
  safetyModule.exports,
  require,
);

const {
  MAX_REPORT_DETAILS_LENGTH,
  cleanReportDetails,
  isValidNestMateUserId,
  validateReportInput,
} = safetyModule.exports;

test("valid reports are normalized without changing their structured target", () => {
  const result = validateReportInput({
    targetType: "POST",
    targetId: "  post-1  ",
    reason: "SCAM",
    details: "  The payment request looks suspicious.  ",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.targetId, "post-1");
  assert.equal(result.data.details, "The payment request looks suspicious.");
});

test("unknown report categories and missing targets are rejected", () => {
  assert.equal(
    validateReportInput({
      targetType: "UNKNOWN",
      targetId: "post-1",
      reason: "SPAM",
    }).success,
    false,
  );
  assert.equal(
    validateReportInput({
      targetType: "POST",
      targetId: "   ",
      reason: "SPAM",
    }).success,
    false,
  );
});

test("report details are optional and capped at the database limit", () => {
  assert.equal(cleanReportDetails("   "), null);
  assert.equal(
    cleanReportDetails("a".repeat(MAX_REPORT_DETAILS_LENGTH + 50)).length,
    MAX_REPORT_DETAILS_LENGTH,
  );
});

test("user IDs must be non-empty and stay within the database input limit", () => {
  assert.equal(isValidNestMateUserId("user-1"), true);
  assert.equal(isValidNestMateUserId(" "), false);
  assert.equal(isValidNestMateUserId("a".repeat(129)), false);
});
