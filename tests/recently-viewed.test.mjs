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

const recent = compile("../lib/recently-viewed.ts");
const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260904120000_recently_viewed/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const clearMigration = readFileSync(
  new URL(
    "../prisma/migrations/20260904123000_recent_view_clear_rpc/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const profileVisibilityMigration = readFileSync(
  new URL(
    "../prisma/migrations/20260904124500_recent_view_profile_visibility/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const actions = readFileSync(
  new URL("../app/recently-viewed/actions.ts", import.meta.url),
  "utf8",
);
const dataSource = readFileSync(
  new URL("../lib/recently-viewed-data.ts", import.meta.url),
  "utf8",
);
const listingPage = readFileSync(
  new URL("../app/community/post/[postId]/page.tsx", import.meta.url),
  "utf8",
);
const profilePage = readFileSync(
  new URL("../app/flatmates/[userId]/page.tsx", import.meta.url),
  "utf8",
);

test("recent view inputs are validated and use target-specific atomic upserts", () => {
  const timestamp = "2026-09-04T10:30:00.000Z";
  const post = recent.recentViewUpsert(
    "viewer-1",
    { targetType: "POST", targetId: "post-1" },
    timestamp,
  );
  const user = recent.recentViewUpsert(
    "viewer-1",
    { targetType: "USER", targetId: "user-2" },
    timestamp,
  );

  assert.deepEqual(post, {
    record: {
      viewerId: "viewer-1",
      postId: "post-1",
      viewedUserId: null,
      viewedAt: timestamp,
    },
    onConflict: "viewerId,postId",
  });
  assert.deepEqual(user, {
    record: {
      viewerId: "viewer-1",
      postId: null,
      viewedUserId: "user-2",
      viewedAt: timestamp,
    },
    onConflict: "viewerId,viewedUserId",
  });
  assert.equal(
    recent.recentViewUpsert(
      "viewer-1",
      { targetType: "POST", targetId: "../unsafe" },
      timestamp,
    ),
    null,
  );
});

test("history retrieval stays chronological and drops unavailable targets", () => {
  const rows = [
    {
      id: "view-old",
      postId: "post-1",
      viewedUserId: null,
      viewedAt: "2026-09-04T08:00:00.000Z",
    },
    {
      id: "view-new",
      postId: null,
      viewedUserId: "user-2",
      viewedAt: "2026-09-04T09:00:00.000Z",
    },
    {
      id: "view-hidden",
      postId: "deleted-post",
      viewedUserId: null,
      viewedAt: "2026-09-04T10:00:00.000Z",
    },
  ];
  const targets = [
    {
      targetId: "post-1",
      kind: "POST",
      title: "Room",
      eyebrow: "Room Available",
      description: "HSR Layout",
      details: [],
      href: "/community/post/post-1",
    },
    {
      targetId: "user-2",
      kind: "USER",
      title: "Mira",
      eyebrow: "Flatmate profile",
      description: "Designer",
      details: [],
      href: "/flatmates/user-2",
    },
  ];

  const history = recent.mergeRecentViews(
    rows,
    targets,
    new Date("2026-09-04T10:30:00.000Z"),
  );
  assert.deepEqual(history.map(({ historyId }) => historyId), ["view-new", "view-old"]);
  assert.ok(history.every(({ historyId }) => historyId !== "view-hidden"));
});

test("listing and flatmate detail pages record authenticated recent views", () => {
  assert.match(listingPage, /if \(error \|\| !authUserId\)/);
  assert.match(listingPage, /<RecentViewTracker targetType="POST"/);
  assert.match(profilePage, /<RecentViewTracker targetType="USER"/);
  assert.match(profilePage, /if \(!profile\) notFound\(\)/);
});

test("history actions authenticate, upsert timestamps, and scope removals to owner", () => {
  assert.match(actions, /auth\.getClaims\(\)/);
  assert.match(actions, /\.upsert\(mutation\.record, \{ onConflict: mutation\.onConflict \}\)/);
  assert.match(actions, /new Date\(\)\.toISOString\(\)/);
  assert.match(actions, /\.delete\(\)[\s\S]*?\.eq\("viewerId", context\.user\.id\)/);
  assert.match(actions, /\.rpc\("clear_recent_views"\)/);
  assert.match(actions, /status: "ACTIVE"/);
  assert.match(actions, /preferences: \{ isNot: null \}/);
  assert.match(actions, /blocksCreated:[\s\S]*?blocksReceived:/);
});

test("history retrieval filters deleted, unavailable, self, and blocked targets", () => {
  assert.match(dataSource, /status: "ACTIVE"/);
  assert.match(dataSource, /publishedAt: \{ not: null \}/);
  assert.match(dataSource, /id: \{ in: userIds, not: viewerId \}/);
  assert.match(dataSource, /preferences: \{ isNot: null \}/);
  assert.match(dataSource, /blocksCreated:[\s\S]*?blocksReceived:/);
  assert.match(dataSource, /mergeRecentViews\(rows, targets\)/);
});

test("recent-view migration enforces ownership, availability, and private access", () => {
  assert.match(migration, /CHECK \(num_nonnulls\("postId", "viewedUserId"\) = 1\)/);
  assert.match(migration, /UNIQUE INDEX "RecentView_viewerId_postId_key"/);
  assert.match(migration, /UNIQUE INDEX "RecentView_viewerId_viewedUserId_key"/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL PRIVILEGES[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(migration, /GRANT [^;]+ TO anon/);
  assert.match(migration, /FOR SELECT[\s\S]*?current_nestmate_user_id/);
  assert.match(migration, /FOR INSERT[\s\S]*?WITH CHECK/);
  assert.match(migration, /FOR UPDATE[\s\S]*?USING[\s\S]*?WITH CHECK/);
  assert.match(migration, /FOR DELETE[\s\S]*?current_nestmate_user_id/);
  assert.match(migration, /SECURITY DEFINER[\s\S]*?SET search_path = ''/);
  assert.match(migration, /user_block\."blockerId" = target_owner_id/);
  assert.match(migration, /viewed_post\."status" = 'ACTIVE'/);
  assert.match(clearMigration, /current_nestmate_user_id\(\)/);
  assert.match(clearMigration, /DELETE FROM public\."RecentView"[\s\S]*?"viewerId" = current_user_id/);
  assert.match(clearMigration, /public\.clear_recent_views\(\)[\s\S]*?SECURITY INVOKER/);
  assert.doesNotMatch(clearMigration, /GRANT EXECUTE[^;]+TO anon/);
  assert.match(
    profileVisibilityMigration,
    /FROM public\."UserPreferences" AS viewed_preferences/,
  );
});
