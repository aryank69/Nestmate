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

const listingLogic = compile("../lib/my-listings.ts");
const pageSource = source("../app/my-listings/page.tsx");
const dataSource = source("../lib/my-listings-data.ts");
const actionSource = source("../app/community/actions.ts");
const dashboardSource = source(
  "../components/listings/my-listings-dashboard.tsx",
);
const navbarSource = source("../components/navbar.tsx");
const migration = source(
  "../prisma/migrations/20260910170000_my_listings_lifecycle/migration.sql",
);

test("listing lifecycle labels and owner actions are deterministic", () => {
  const visible = { moderationStatus: "VISIBLE" };
  const available = {
    ...visible,
    status: "ACTIVE",
    availabilityStatus: "AVAILABLE",
  };
  const reserved = { ...available, availabilityStatus: "RESERVED" };
  const paused = { ...available, status: "ARCHIVED" };
  const closed = { ...available, availabilityStatus: "CLOSED" };
  const unavailable = { ...available, moderationStatus: "HIDDEN" };

  assert.equal(listingLogic.myListingLifecycleStatus(available), "AVAILABLE");
  assert.equal(listingLogic.myListingLifecycleStatus(reserved), "RESERVED");
  assert.equal(listingLogic.myListingLifecycleStatus(paused), "PAUSED");
  assert.equal(listingLogic.myListingLifecycleStatus(closed), "CLOSED");
  assert.equal(
    listingLogic.myListingLifecycleStatus(unavailable),
    "UNAVAILABLE",
  );
  assert.deepEqual(listingLogic.myListingActions(available), {
    canPause: true,
    canReopen: false,
    canClose: true,
    canDelete: true,
    detailAvailable: true,
  });
  assert.equal(listingLogic.myListingActions(paused).canReopen, true);
  assert.equal(listingLogic.myListingActions(closed).canReopen, true);
  assert.equal(listingLogic.myListingActions(unavailable).canDelete, false);
});

test("Room, Flat/Shared Flat, and PG labels use existing structured fields", () => {
  assert.equal(
    listingLogic.myListingKind({
      type: "ROOM_AVAILABLE",
      roomType: "PRIVATE_ROOM",
    }),
    "Room",
  );
  assert.equal(
    listingLogic.myListingKind({
      type: "ROOM_AVAILABLE",
      roomType: "SHARED_ROOM",
    }),
    "Flat / Shared Flat",
  );
  assert.equal(
    listingLogic.myListingKind({
      type: "PG_AVAILABLE",
      roomType: null,
    }),
    "PG",
  );
});

test("dashboard data is isolated to the authenticated owner and hides blocked activity", () => {
  assert.match(pageSource, /auth\.getClaims\(\)/);
  assert.match(pageSource, /redirect\("\/login\?next=\/my-listings"\)/);
  assert.match(pageSource, /loadMyListings\(claims\.sub\)/);
  assert.match(dataSource, /where: \{ authUserId \}/);
  assert.match(dataSource, /authorId: owner\.id/);
  assert.match(dataSource, /type: \{ in: \["ROOM_AVAILABLE", "PG_AVAILABLE"\] \}/);
  assert.match(dataSource, /publishedAt: \{ not: null \}/);
  assert.match(dataSource, /blocksCreated/);
  assert.match(dataSource, /blocksReceived/);
  assert.match(dataSource, /hiddenUserIds\.has/);
  assert.match(dataSource, /recentViews/);
  assert.match(dataSource, /savedBy/);
  assert.match(dataSource, /interestActivity/);
  assert.match(dataSource, /visitRequests/);
  assert.match(dataSource, /type: "POST_ACTIVITY"/);
  assert.doesNotMatch(dataSource, /select: \{[^}]*body:/s);
  assert.doesNotMatch(dataSource, /messageContent|privateNote/);
});

test("management mutations validate ownership and retain RLS enforcement", () => {
  assert.match(actionSource, /export async function updateListingLifecycleAction/);
  assert.match(actionSource, /lifecycleValue !== "PAUSE"/);
  assert.match(actionSource, /lifecycleValue !== "REOPEN"/);
  assert.match(actionSource, /author: \{ authUserId: context\.claims\.sub \}/);
  assert.match(actionSource, /\.eq\("authorId", context\.user\.id\)/);
  assert.match(actionSource, /\.select\("id"\)\s*\.maybeSingle\(\)/);
  assert.match(actionSource, /status: "ARCHIVED"/);
  assert.match(actionSource, /availabilityStatus: "AVAILABLE"/);
  assert.match(actionSource, /updatePostAvailabilityAction/);
  assert.match(actionSource, /deleteCommunityPostAction/);
  assert.match(actionSource, /revalidatePath\("\/my-listings"\)/);

  assert.doesNotMatch(migration, /CREATE TABLE/i);
  assert.match(migration, /TO authenticated/);
  assert.match(migration, /app_user\."authUserId" = \(SELECT auth\.uid\(\)\)/);
  assert.match(migration, /'ACTIVE'::public\."PostStatus"/);
  assert.match(migration, /'ARCHIVED'::public\."PostStatus"/);
  assert.match(migration, /"moderationStatus" = 'VISIBLE'/);
  assert.match(migration, /can_perform_safety_scoped_activity/);
});

test("dashboard exposes requested metrics, states, and owner controls", () => {
  for (const label of [
    "Views",
    "Saves",
    "Messages / interests",
    "Visit requests",
    "Pause",
    "Reopen",
    "Close",
    "Delete",
    "List a Property",
  ]) {
    assert.match(dashboardSource, new RegExp(label.replace("/", "\\/")));
  }
  assert.match(dashboardSource, /You haven’t listed a property yet/);
  assert.match(dashboardSource, /href="\/list-property"/);
  assert.match(navbarSource, /label: "My Listings", href: "\/my-listings"/);
});
