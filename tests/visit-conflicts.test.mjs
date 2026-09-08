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
  const compiled = { exports: {} };
  new Function("module", "exports", "require", output)(
    compiled,
    compiled.exports,
    require,
  );
  return compiled.exports;
}

const conflicts = compile("../lib/visit-conflicts.ts");
const actions = readFileSync(
  new URL("../app/visits/actions.ts", import.meta.url),
  "utf8",
);
const ui = readFileSync(
  new URL("../components/visits/visit-sections.tsx", import.meta.url),
  "utf8",
);
const postDetail = readFileSync(
  new URL("../app/community/post/[postId]/page.tsx", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260905140000_visit_conflicts/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

test("one-hour visit slots reject true overlaps but allow boundary-touching visits", () => {
  const existing = "2026-09-08T10:00:00.000Z";
  assert.equal(conflicts.visitTimesOverlap(existing, "2026-09-08T09:30:00.000Z"), true);
  assert.equal(conflicts.visitTimesOverlap(existing, "2026-09-08T10:59:59.999Z"), true);
  assert.equal(conflicts.visitTimesOverlap(existing, "2026-09-08T09:00:00.000Z"), false);
  assert.equal(conflicts.visitTimesOverlap(existing, "2026-09-08T11:00:00.000Z"), false);
  assert.equal(conflicts.visitTimesOverlap(existing, "invalid"), false);
});

test("alternative suggestions are valid, free, bounded, and contain no visit identities", () => {
  const occupied = [
    "2026-09-08T10:00:00.000Z",
    "2026-09-08T11:00:00.000Z",
  ];
  const alternatives = conflicts.suggestAlternativeVisitTimes({
    requestedAt: "2026-09-08T10:30:00.000Z",
    occupiedStarts: occupied,
    now: new Date("2026-09-07T00:00:00.000Z"),
  });
  assert.equal(alternatives.length, 3);
  for (const alternative of alternatives) {
    assert.equal(
      occupied.some((scheduledAt) =>
        conflicts.visitTimesOverlap(alternative, scheduledAt),
      ),
      false,
    );
  }
  const message = conflicts.formatVisitConflictMessage(alternatives);
  assert.match(message, /^That time is unavailable\. Try /);
  assert.doesNotMatch(message, /owner|requester|listing|user|visit id/i);
});

test("listing availability gives clear Closed and Reserved rules", () => {
  const base = {
    status: "ACTIVE",
    moderationStatus: "VISIBLE",
    publishedAt: "2026-09-01T00:00:00.000Z",
  };
  assert.equal(
    conflicts.visitListingEligibility({ ...base, availabilityStatus: "AVAILABLE" }),
    null,
  );
  assert.match(
    conflicts.visitListingEligibility({ ...base, availabilityStatus: "RESERVED" }),
    /reserved.*not accepting new visit requests/i,
  );
  assert.match(
    conflicts.visitListingEligibility({ ...base, availabilityStatus: "CLOSED" }),
    /closed.*not accepting visit requests/i,
  );
  assert.match(
    conflicts.visitListingEligibility({ ...base, status: "DELETED", availabilityStatus: "AVAILABLE" }),
    /unavailable/i,
  );
});

test("server actions check conflicts for requests, proposals, acceptance, and rescheduling", () => {
  assert.match(actions, /ownerVisitConflictMessage/);
  assert.match(actions, /select: \{ scheduledAt: true \}/);
  assert.match(actions, /status: "ACCEPTED"/);
  assert.match(actions, /visitListingEligibility\(listing\)/);
  assert.match(actions, /error\.code === "23P01"/);
  assert.match(actions, /visit\.proposedAt \?\? visit\.requestedAt/);
  assert.doesNotMatch(actions, /select: \{[^}]*requesterId[^}]*scheduledAt/);
  assert.match(ui, /one-hour slot/i);
  assert.match(ui, /other bookings stay private/i);
  assert.match(ui, /listingAvailability !== "AVAILABLE"/);
  assert.match(ui, /listing is reserved, so new visit requests are paused/i);
  assert.match(postDetail, /listingAvailability=\{post\.availability\.status\}/);
});

test("the database serializes owner schedules and enforces privacy-safe conflicts", () => {
  assert.match(migration, /VisitRequest_ownerId_status_scheduledAt_idx/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /hashtextextended\(NEW\."ownerId", 0\)/);
  assert.match(migration, /accepted_visit\."ownerId" = NEW\."ownerId"/);
  assert.match(migration, /accepted_visit\."scheduledAt" < NEW\."scheduledAt" \+ interval '1 hour'/);
  assert.match(migration, /USING ERRCODE = '23P01'/);
  assert.match(migration, /That time is unavailable\. Choose another time\./);
  assert.doesNotMatch(migration, /conflict.*requesterId|conflict.*postId/i);
  assert.match(migration, /listing\."availabilityStatus" = 'AVAILABLE'/);
  assert.match(migration, /listing\."moderationStatus" = 'VISIBLE'/);
});
