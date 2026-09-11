import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function compile(relativePath) {
  const output = ts.transpileModule(source(relativePath), {
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

const requirementLogic = compile("../lib/my-requirements.ts");
const pageSource = source("../app/my-requirements/page.tsx");
const dataSource = source("../lib/my-requirements-data.ts");
const matchDataSource = source("../lib/post-match-data.ts");
const actionSource = source("../app/community/actions.ts");
const dashboardSource = source(
  "../components/requirements/my-requirements-dashboard.tsx",
);
const navbarSource = source("../components/navbar.tsx");
const lifecycleMigration = source(
  "../prisma/migrations/20260910170000_my_listings_lifecycle/migration.sql",
);

test("requirement labels and recent-activity windows are deterministic", () => {
  assert.equal(requirementLogic.requirementKind("NEED_ROOM"), "Need a Room");
  assert.equal(
    requirementLogic.requirementKind("NEED_FLATMATE"),
    "Need a Flatmate",
  );
  const now = new Date("2026-09-10T12:00:00.000Z");
  const activity = requirementLogic.recentRequirementActivity(
    [
      "2026-09-10T10:00:00.000Z",
      "2026-09-03T12:00:00.000Z",
      "2026-08-01T12:00:00.000Z",
    ],
    now,
  );
  assert.deepEqual(activity, { count: 2, label: "Activity today" });
  assert.deepEqual(requirementLogic.recentRequirementActivity([], now), {
    count: 0,
    label: "No activity yet",
  });
});

test("dashboard data is scoped to owned requirements and excludes blocked activity", () => {
  assert.match(pageSource, /auth\.getClaims\(\)/);
  assert.match(
    pageSource,
    /redirect\("\/login\?next=\/my-requirements"\)/,
  );
  assert.match(pageSource, /loadMyRequirements\(claims\.sub\)/);
  assert.match(dataSource, /where: \{ authUserId \}/);
  assert.match(dataSource, /authorId: owner\.id/);
  assert.match(dataSource, /type: \{ in: \["NEED_ROOM", "NEED_FLATMATE"\] \}/);
  assert.match(dataSource, /publishedAt: \{ not: null \}/);
  assert.match(dataSource, /blocksCreated/);
  assert.match(dataSource, /blocksReceived/);
  assert.match(dataSource, /hiddenUserIds\.has/);
  assert.match(dataSource, /savedBy/);
  assert.match(dataSource, /interestActivity/);
  assert.match(dataSource, /type: "POST_ACTIVITY"/);
  assert.doesNotMatch(dataSource, /select: \{[^}]*body:/s);
  assert.doesNotMatch(dataSource, /messageContent|privateNote/);
});

test("match totals reuse the existing privacy-aware post recommendation loader", () => {
  assert.match(dataSource, /loadPostMatches\(authUserId, post\.id\)/);
  assert.match(dataSource, /matches\?\.matchCounts\.total/);
  assert.match(matchDataSource, /loadRoomDiscovery\(authUserId/);
  assert.match(matchDataSource, /loadPeopleDiscovery\(authUserId/);
  assert.match(matchDataSource, /matchCounts:/);
  assert.match(matchDataSource, /total: listingMatchCount \+ peopleMatchCount/);
  assert.match(
    dataSource,
    /post\.status !== "ACTIVE"[\s\S]*post\.availabilityStatus === "CLOSED"[\s\S]*post\.moderationStatus !== "VISIBLE"/,
  );
});

test("pause, reopen, close, and delete remain owner checked and RLS protected", () => {
  assert.match(actionSource, /export async function updateListingLifecycleAction/);
  for (const type of [
    "NEED_ROOM",
    "ROOM_AVAILABLE",
    "NEED_FLATMATE",
    "PG_AVAILABLE",
  ]) {
    assert.match(actionSource, new RegExp(`"${type}"`));
  }
  assert.match(actionSource, /author: \{ authUserId: context\.claims\.sub \}/);
  assert.match(actionSource, /\.eq\("authorId", context\.user\.id\)/);
  assert.match(actionSource, /\.select\("id"\)\s*\.maybeSingle\(\)/);
  assert.match(actionSource, /status: "ARCHIVED"/);
  assert.match(actionSource, /availabilityStatus: "AVAILABLE"/);
  assert.match(actionSource, /updatePostAvailabilityAction/);
  assert.match(actionSource, /deleteCommunityPostAction/);
  assert.match(actionSource, /revalidatePath\("\/my-requirements"\)/);

  assert.match(lifecycleMigration, /TO authenticated/);
  assert.match(
    lifecycleMigration,
    /app_user\."authUserId" = \(SELECT auth\.uid\(\)\)/,
  );
  assert.match(lifecycleMigration, /'ACTIVE'::public\."PostStatus"/);
  assert.match(lifecycleMigration, /'ARCHIVED'::public\."PostStatus"/);
  assert.match(lifecycleMigration, /"moderationStatus" = 'VISIBLE'/);
  assert.match(lifecycleMigration, /can_perform_safety_scoped_activity/);
});

test("dashboard exposes requested activity, lifecycle controls, and empty CTA", () => {
  for (const label of [
    "Matches",
    "Saves / interests",
    "Messages",
    "Recent activity",
    "Edit",
    "Pause",
    "Reopen",
    "Close",
    "Delete",
    "Post a Requirement",
  ]) {
    assert.match(dashboardSource, new RegExp(label.replace("/", "\\/")));
  }
  assert.match(dashboardSource, /You haven’t posted a requirement yet/);
  assert.match(dashboardSource, /href="\/post-requirement"/);
  assert.match(
    navbarSource,
    /label: "My Requirements", href: "\/my-requirements"/,
  );
});
