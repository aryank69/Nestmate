import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);

function compile(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function("module", "exports", "require", output)(
    compiledModule,
    compiledModule.exports,
    require,
  );
  return compiledModule.exports;
}

const responsiveness = compile("../lib/responsiveness.ts");
const dataSource = readFileSync(
  new URL("../lib/responsiveness-data.ts", import.meta.url),
  "utf8",
);
const directChatMigration = readFileSync(
  new URL(
    "../prisma/migrations/20260825000000_private_direct_chat/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const communityChatMigration = readFileSync(
  new URL(
    "../prisma/migrations/20260831130000_locality_group_chat/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

const now = new Date("2026-09-04T12:00:00.000Z");

test("consistent response history produces a coarse quick-response label", () => {
  const result = responsiveness.calculateResponsiveness(
    {
      responseDelayHours: [2, 4, 8, 18],
      activityCount: 12,
      latestActivityAt: "2026-09-04T08:15:00.000Z",
    },
    now,
  );

  assert.equal(result.label, "Usually responds quickly");
  assert.equal(result.recommendationAlignment, 1);
  assert.equal(Object.hasOwn(result, "lastSeenAt"), false);
  assert.doesNotMatch(JSON.stringify(result), /2026-|08:15/);
});

test("recent broad activity is shown without implying live online status", () => {
  const result = responsiveness.calculateResponsiveness(
    {
      responseDelayHours: [30],
      activityCount: 5,
      latestActivityAt: "2026-08-29T12:00:00.000Z",
    },
    now,
  );

  assert.equal(result.label, "Active recently");
  assert.match(result.description, /not online status/i);
});

test("limited activity requires sufficient history", () => {
  const limited = responsiveness.calculateResponsiveness(
    {
      responseDelayHours: [],
      activityCount: 6,
      latestActivityAt: "2026-06-01T12:00:00.000Z",
    },
    now,
  );
  const insufficient = responsiveness.calculateResponsiveness(
    {
      responseDelayHours: [],
      activityCount: 2,
      latestActivityAt: "2026-06-01T12:00:00.000Z",
    },
    now,
  );

  assert.equal(limited.label, "Limited activity");
  assert.equal(insufficient.label, "Response history building");
  assert.equal(insufficient.recommendationAlignment, null);
});

test("response delays reject invalid chronology", () => {
  assert.equal(
    responsiveness.responseDelayHours(
      "2026-09-04T10:00:00.000Z",
      "2026-09-04T12:00:00.000Z",
    ),
    2,
  );
  assert.equal(
    responsiveness.responseDelayHours(
      "2026-09-04T12:00:00.000Z",
      "2026-09-04T10:00:00.000Z",
    ),
    null,
  );
});

test("server aggregation reads timestamps only and existing message RLS remains private", () => {
  assert.match(dataSource, /import "server-only"/);
  assert.doesNotMatch(dataSource, /message\."body"|select:\s*\{[^}]*body/s);
  assert.match(directChatMigration, /conversation_participants_can_read_messages/);
  assert.match(directChatMigration, /is_conversation_participant\("conversationId"\)/);
  assert.match(communityChatMigration, /is_community_member\("communityId"\)/);
  assert.match(directChatMigration, /REVOKE ALL ON TABLE public\."Message" FROM PUBLIC, anon, authenticated/);
});
