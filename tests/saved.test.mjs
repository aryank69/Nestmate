import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);

function compile(sourcePath, customRequire = require) {
  const source = readFileSync(new URL(sourcePath, import.meta.url), "utf8");
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
    customRequire,
  );
  return compiledModule.exports;
}

const discovery = compile("../lib/discovery.ts");
const saved = compile("../lib/saved.ts", (id) =>
  id === "@/lib/discovery" ? discovery : require(id),
);

const { savedSearchFilterLabels, validateSavedSearchInput } = saved;

test("community searches are normalized into safe reusable local links", () => {
  const result = validateSavedSearchInput({
    name: "  HSR rooms  ",
    kind: "COMMUNITY_POSTS",
    href: "/community/bengaluru/hsr-layout?type=ROOM_AVAILABLE&max=25000&unsafe=yes",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.name, "HSR rooms");
  assert.equal(
    result.data.path,
    "/community/bengaluru/hsr-layout?type=ROOM_AVAILABLE&max=25000",
  );
  assert.equal(result.data.filters.postType, "ROOM_AVAILABLE");
});

test("saved searches reject external and mismatched routes", () => {
  assert.equal(
    validateSavedSearchInput({
      name: "External",
      kind: "PEOPLE",
      href: "https://example.com/flatmates",
    }).success,
    false,
  );
  assert.equal(
    validateSavedSearchInput({
      name: "Wrong kind",
      kind: "PEOPLE",
      href: "/community/bengaluru/hsr-layout",
    }).success,
    false,
  );
});

test("saved people searches retain compatibility and lifestyle preferences", () => {
  const result = validateSavedSearchInput({
    name: "Quiet vegetarian match",
    kind: "PEOPLE",
    href: "/flatmates?diet=VEGETARIAN&smoking=NEVER&score=70",
  });

  assert.equal(result.success, true);
  assert.match(result.data.path, /diet=VEGETARIAN/);
  assert.match(result.data.path, /score=70/);
  assert.deepEqual(
    savedSearchFilterLabels(result.data.kind, result.data.filters),
    ["70%+ compatibility", "Vegetarian", "Never"],
  );
});

test("saved table migration grants only authenticated access with ownership RLS", () => {
  const migration = readFileSync(
    new URL(
      "../prisma/migrations/20260902130000_saved_posts_and_searches/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /ALTER TABLE public\."SavedPost" ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE public\."SavedSearch" ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /TO authenticated[\s\S]*current_nestmate_user_id/);
  assert.doesNotMatch(migration, /GRANT [^;]+ TO anon/);
});
