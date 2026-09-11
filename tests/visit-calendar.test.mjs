import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../lib/visit-calendar.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const calendarModule = { exports: {} };
new Function("module", "exports", "require", output)(calendarModule, calendarModule.exports, require);
const calendar = calendarModule.exports;

const routeSource = readFileSync(
  new URL("../app/visits/[visitId]/calendar/route.ts", import.meta.url),
  "utf8",
);
const uiSource = readFileSync(
  new URL("../components/visits/visit-sections.tsx", import.meta.url),
  "utf8",
);

test("only accepted visits with a confirmed time are calendar eligible", () => {
  assert.equal(calendar.canAddVisitToCalendar({ status: "ACCEPTED", scheduledAt: "2026-09-07T10:30:00Z" }), true);
  assert.equal(calendar.canAddVisitToCalendar({ status: "PENDING", scheduledAt: "2026-09-07T10:30:00Z" }), false);
  assert.equal(calendar.canAddVisitToCalendar({ status: "ACCEPTED", scheduledAt: null }), false);
  assert.equal(calendar.canAddVisitToCalendar({ status: "ACCEPTED", scheduledAt: "invalid" }), false);
});

test("calendar updates and cancellations preserve UID and advance revision with stable timestamps", () => {
  const input = {
    visitId: "52000000-0000-4000-8000-0000000000a1",
    scheduledAt: "2026-09-07T10:30:00Z",
    listingTitle: "Room", locality: "Koramangala", city: "Bengaluru",
    listingUrl: "https://roomzi.example/community/post/listing-1",
    generatedAt: new Date("2026-09-05T09:00:00Z"),
    updatedAt: "2026-09-05T09:00:00Z",
  };
  const original = calendar.createVisitCalendarEvent(input);
  const updated = calendar.createVisitCalendarEvent({ ...input, revision: 1, scheduledAt: "2026-09-08T11:00:00Z" });
  const cancelled = calendar.createVisitCalendarEvent({ ...input, revision: 2, status: "CANCELLED", scheduledAt: "2026-09-08T11:00:00Z" });
  for (const event of [updated, cancelled]) {
    assert.equal(event.match(/UID:[^\r]+/)[0], original.match(/UID:[^\r]+/)[0]);
    assert.match(event, /DTSTART:20260908T110000Z/);
    assert.match(event, /LAST-MODIFIED:20260905T090000Z/);
    assert.match(event, /CLASS:PRIVATE/);
  }
  assert.match(updated, /SEQUENCE:1\r\n/);
  assert.match(cancelled, /SEQUENCE:2\r\n/);
  assert.match(cancelled, /STATUS:CANCELLED/);
  assert.equal(calendar.canAddVisitToCalendar({ status: "CANCELLED", scheduledAt: input.scheduledAt }), true);
  assert.throws(() => calendar.createVisitCalendarEvent({ ...input, revision: -1 }));
  assert.equal(cancelled, calendar.createVisitCalendarEvent({ ...input, revision: 2, status: "CANCELLED", scheduledAt: "2026-09-08T11:00:00Z" }));
});

test("ICS output is provider-neutral, escaped, and contains only privacy-safe visit details", () => {
  const event = calendar.createVisitCalendarEvent({
    visitId: "52000000-0000-4000-8000-0000000000a1",
    scheduledAt: "2026-09-07T10:30:00.000Z",
    listingTitle: "Sunny room, near metro; furnished",
    locality: "Koramangala",
    city: "Bengaluru",
    listingUrl: "https://roomzi.example/community/post/listing-1",
    generatedAt: new Date("2026-09-05T09:00:00.000Z"),
  });

  assert.match(event, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.match(event, /DTSTART:20260907T103000Z/);
  assert.match(event, /DTEND:20260907T113000Z/);
  assert.match(event, /SUMMARY:Roomzi visit: Sunny room\\, near metro\\; furnished/);
  assert.match(event, /LOCATION:Koramangala\\, Bengaluru \(approximate\)/);
  assert.match(event, /URL:https:\/\/roomzi\.example\/community\/post\/listing-1/);
  assert.match(event, /STATUS:CONFIRMED/);
  assert.doesNotMatch(event, /private note|gate code|latitude|longitude|counterpart/i);
  assert.match(event, /END:VCALENDAR\r\n$/);
});

test("calendar download rechecks authentication, participation, blocks, listing visibility, and accepted status", () => {
  assert.match(routeSource, /auth\.getClaims\(\)/);
  assert.match(routeSource, /OR: \[\{ requesterId: viewer\.id \}, \{ ownerId: viewer\.id \}\]/);
  assert.match(routeSource, /status: \{ in: \["ACCEPTED", "CANCELLED"\] \}/);
  assert.match(routeSource, /scheduledAt: \{ not: null \}/);
  assert.match(routeSource, /blocksCreated: \{ none: \{ blockedId: viewer\.id \} \}/);
  assert.match(routeSource, /moderationStatus: "VISIBLE"/);
  assert.match(routeSource, /availabilityStatus: \{ in: \["AVAILABLE", "RESERVED", "CLOSED"\] \}/);
  assert.match(routeSource, /Content-Type": "text\/calendar; charset=utf-8"/);
  assert.match(routeSource, /Content-Disposition/);
  assert.doesNotMatch(routeSource, /note: true|latitude: true|longitude: true|privateNote/);
});

test("accepted visit cards expose a standard calendar download action", () => {
  assert.match(uiSource, /\["ACCEPTED", "CANCELLED"\]\.includes\(visit\.status\) && visit\.scheduledAt/);
  assert.match(uiSource, /\/visits\/\$\{encodeURIComponent\(visit\.id\)\}\/calendar/);
  assert.match(uiSource, /download/);
  assert.match(uiSource, /Add to calendar/);
  assert.match(uiSource, /approximate locality only/);
});
