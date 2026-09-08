import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const helperSource = readFileSync(
  new URL("../lib/spam-safeguards.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(helperSource, {
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

const { getSafetyRestrictionMessage, isSafetyRestrictionError } =
  safetyModule.exports;
const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260904170000_anti_spam_safeguards/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const postAction = readFileSync(
  new URL("../app/community/actions.ts", import.meta.url),
  "utf8",
);
const directChat = readFileSync(
  new URL("../components/chat/chat-page.tsx", import.meta.url),
  "utf8",
);
const communityChat = readFileSync(
  new URL("../components/community/community-chat.tsx", import.meta.url),
  "utf8",
);

test("restriction errors use clear generic messages without detection details", () => {
  assert.equal(isSafetyRestrictionError({ code: "42501" }), true);
  assert.equal(isSafetyRestrictionError({ code: "23514" }), false);
  assert.match(getSafetyRestrictionMessage("post"), /temporarily limited/i);
  assert.match(
    getSafetyRestrictionMessage("direct-message"),
    /unusual activity/i,
  );
  assert.doesNotMatch(
    `${postAction}${directChat}${communityChat}`,
    /duplicate_limit|burst_limit|contact_count|24 hours|30 minutes/,
  );
});

test("database detection covers duplicate content, burst traffic, contact reuse, and rapid new accounts", () => {
  assert.match(migration, /contentFingerprint/);
  assert.match(migration, /DUPLICATE_CONTENT/);
  assert.match(migration, /BURST_ACTIVITY/);
  assert.match(migration, /REPEATED_CONTACT/);
  assert.match(migration, /RAPID_ACCOUNT_ACTIVITY/);
  assert.match(migration, /https\?:\/\//);
  assert.match(migration, /\[a-z0-9\._%\+\\-\]\+@/i);
  assert.match(migration, /app_user\."createdAt"/);
  assert.match(migration, /record_post_safety_activity/);
  assert.match(migration, /record_direct_message_safety_activity/);
  assert.match(migration, /record_community_message_safety_activity/);
});

test("suspicious activity creates reviewable flags and temporary scoped restrictions, never bans", () => {
  assert.match(migration, /INSERT INTO public\."SafetyFlag"/);
  assert.match(migration, /"restrictedUntil"/);
  assert.match(migration, /can_perform_safety_scoped_activity/);
  assert.match(migration, /Restrictions expire automatically/);
  assert.doesNotMatch(migration, /DELETE FROM public\."User"/);
  assert.doesNotMatch(migration, /UPDATE public\."User"[\s\S]*?(ban|disable|suspend)/i);
});

test("detection internals are not exposed through RLS or table grants", () => {
  assert.match(
    migration,
    /ALTER TABLE public\."SafetyActivity" ENABLE ROW LEVEL SECURITY/,
  );
  assert.match(
    migration,
    /ALTER TABLE public\."SafetyFlag" ENABLE ROW LEVEL SECURITY/,
  );
  assert.match(
    migration,
    /REVOKE ALL PRIVILEGES ON TABLE public\."SafetyActivity"[\s\S]*authenticated/,
  );
  assert.match(
    migration,
    /REVOKE ALL PRIVILEGES ON TABLE public\."SafetyFlag"[\s\S]*authenticated/,
  );
  assert.doesNotMatch(
    migration,
    /CREATE POLICY[^;]+ON public\."Safety(Activity|Flag)"/,
  );
});

test("existing user reports are represented in the private moderation flag queue", () => {
  assert.match(migration, /flag_submitted_report/);
  assert.match(migration, /Report_create_safety_flag/);
  assert.match(migration, /USER_REPORT/);
  assert.match(migration, /"relatedReportId"/);
});

test("post and chat clients surface safety restrictions without changing normal errors", () => {
  assert.match(postAction, /getSafetyRestrictionMessage\("post"\)/);
  assert.match(directChat, /getSafetyRestrictionMessage\("direct-message"\)/);
  assert.match(
    communityChat,
    /getSafetyRestrictionMessage\("community-message"\)/,
  );
  assert.match(directChat, /Your message was not sent\. Please try again\./);
  assert.match(
    communityChat,
    /Your message was not sent\. Check your connection and try again\./,
  );
});
