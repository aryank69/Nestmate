import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../lib/visits.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const visitsModule = { exports: {} };
new Function("module", "exports", "require", output)(
  visitsModule,
  visitsModule.exports,
  require,
);

const visits = visitsModule.exports;
const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260904140000_visit_requests/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const actions = readFileSync(
  new URL("../app/visits/actions.ts", import.meta.url),
  "utf8",
);
const visitUi = readFileSync(
  new URL("../components/visits/visit-sections.tsx", import.meta.url),
  "utf8",
);

const now = new Date("2026-09-04T12:00:00.000Z");

test("visit dates require a safe future scheduling window", () => {
  assert.equal(visits.parseVisitDate("2026-09-04T12:20:00.000Z", now), null);
  assert.equal(
    visits.parseVisitDate("2026-09-04T13:00:00.000Z", now)?.toISOString(),
    "2026-09-04T13:00:00.000Z",
  );
  assert.equal(visits.parseVisitDate("2027-09-04T13:00:00.000Z", now), null);
});

test("notes are trimmed and limited to the database boundary", () => {
  assert.equal(visits.cleanVisitNote("  Please call at the gate.  "), "Please call at the gate.");
  assert.equal(visits.cleanVisitNote("   "), null);
  assert.equal(visits.cleanVisitNote("a".repeat(550)).length, 500);
});

test("only valid participant state transitions are accepted", () => {
  assert.equal(
    visits.canRespondToVisit({ role: "OWNER", status: "PENDING", action: "ACCEPT" }),
    true,
  );
  assert.equal(
    visits.canRespondToVisit({ role: "OWNER", status: "PENDING", action: "PROPOSE" }),
    true,
  );
  assert.equal(
    visits.canRespondToVisit({ role: "REQUESTER", status: "PROPOSED", action: "ACCEPT_PROPOSAL" }),
    true,
  );
  assert.equal(
    visits.canRespondToVisit({ role: "REQUESTER", status: "PROPOSED", action: "PROPOSE" }),
    true,
  );
  assert.equal(
    visits.canRespondToVisit({ role: "REQUESTER", status: "PENDING", action: "ACCEPT_PROPOSAL" }),
    false,
  );
  assert.equal(
    visits.canRespondToVisit({ role: "OWNER", status: "ACCEPTED", action: "DECLINE" }),
    false,
  );
});

test("upcoming and past visit grouping uses the active scheduled time", () => {
  assert.equal(visits.isPastVisit({
    status: "CANCELLED",
    requestedAt: "2026-09-06T12:00:00.000Z",
    proposedAt: null,
    scheduledAt: "2026-09-06T12:00:00.000Z",
  }, now), true);
  assert.equal(visits.visitStatusLabel("CANCELLED"), "Visit cancelled");
  assert.equal(visits.canRespondToVisit({
    role: "OWNER", status: "CANCELLED", action: "ACCEPT",
  }), false);
  assert.equal(
    visits.isPastVisit(
      {
        status: "ACCEPTED",
        requestedAt: "2026-09-05T12:00:00.000Z",
        proposedAt: "2026-09-06T12:00:00.000Z",
        scheduledAt: "2026-09-06T12:00:00.000Z",
      },
      now,
    ),
    false,
  );
  assert.equal(
    visits.isPastVisit(
      {
        status: "DECLINED",
        requestedAt: "2026-09-06T12:00:00.000Z",
        proposedAt: null,
        scheduledAt: null,
      },
      now,
    ),
    true,
  );
});

test("visit RLS, transition triggers, and notifications protect exact details", () => {
  assert.match(migration, /ALTER TABLE public\."VisitRequest" ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /can_access_visit_request/);
  assert.match(migration, /current_user_id IN \([\s\S]*"requesterId"[\s\S]*"ownerId"/);
  assert.match(migration, /validate_visit_request_update/);
  assert.match(migration, /'POST_ACTIVITY'::public\."NotificationType"/);
  assert.match(migration, /'\/visits\?visit='/);
  assert.doesNotMatch(migration, /GRANT SELECT[^;]*VisitRequest[^;]*anon/);
  assert.match(actions, /authenticatedVisitContext/);
  assert.match(actions, /authorId: \{ not: context\.user\.id \}/);
  assert.match(visitUi, /visible only to the requester and listing owner/i);
});
