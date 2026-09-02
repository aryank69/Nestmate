import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadTypeScriptModule(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
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

const imageHelpers = loadTypeScriptModule(
  path.join(process.cwd(), "lib/listing-images.ts"),
);

test("only room and PG listings support images", () => {
  assert.equal(imageHelpers.supportsListingImages("Room Available"), true);
  assert.equal(imageHelpers.supportsListingImages("PG Available"), true);
  assert.equal(imageHelpers.supportsListingImages("Need a Room"), false);
  assert.equal(imageHelpers.supportsListingImages("Need Flatmate"), false);
});

test("listing image validation enforces type, size, and non-empty files", () => {
  assert.equal(
    imageHelpers.validateListingImageFile(
      { type: "image/webp", size: 1 },
    ),
    null,
  );
  assert.match(
    imageHelpers.validateListingImageFile(
      { type: "image/gif", size: 1 },
    ),
    /JPG, PNG, or WebP/,
  );
  assert.match(
    imageHelpers.validateListingImageFile(
      { type: "image/png", size: 0 },
    ),
    /empty/,
  );
  assert.match(
    imageHelpers.validateListingImageFile({
      type: "image/jpeg",
      size: imageHelpers.MAX_LISTING_IMAGE_BYTES + 1,
    }),
    /5 MB/,
  );
});

test("listing image paths stay inside the authenticated user's post folder", () => {
  const userId = "40000000-0000-4000-8000-0000000000a1";
  const postId = "post-safe";
  assert.equal(
    imageHelpers.isOwnedListingImagePath(
      `${userId}/${postId}/10000000-0000-4000-8000-000000000001.jpg`,
      userId,
      postId,
    ),
    true,
  );
  assert.equal(
    imageHelpers.isOwnedListingImagePath(
      `40000000-0000-4000-8000-0000000000b2/${postId}/10000000-0000-4000-8000-000000000001.jpg`,
      userId,
      postId,
    ),
    false,
  );
  assert.equal(
    imageHelpers.isOwnedListingImagePath(
      `${userId}/other-post/10000000-0000-4000-8000-000000000001.jpg`,
      userId,
      postId,
    ),
    false,
  );
});

test("storage migration creates a private constrained bucket and owner policies", () => {
  const migration = fs.readFileSync(
    path.join(
      process.cwd(),
      "prisma/migrations/20260902140000_secure_listing_images/migration.sql",
    ),
    "utf8",
  );
  assert.match(migration, /'listing-images'[\s\S]*FALSE[\s\S]*5242880/);
  assert.match(migration, /FOR INSERT\s+TO authenticated/);
  assert.match(migration, /owner_id = \(SELECT auth\.uid\(\)\)::TEXT/);
  assert.match(migration, /FOR DELETE\s+TO authenticated/);
  assert.match(migration, /TO anon, authenticated\s+USING/);
  assert.doesNotMatch(migration, /ON storage\.objects\s+FOR UPDATE/);
});
