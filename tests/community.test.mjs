import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../lib/community.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const communityModule = { exports: {} };

new Function("module", "exports", "require", compiled)(
  communityModule,
  communityModule.exports,
  require,
);

const {
  communityPath,
  formatCommunityAmount,
  validateCommunityPost,
} = communityModule.exports;

const validPost = {
  postType: "Room Available",
  communityId: "community-1",
  title: "Private room near the metro",
  amount: "18000",
  moveInDate: "2026-09-01",
  genderPreference: "Any gender",
  housingType: "2BHK",
  housingFeature: "Private room",
  description:
    "A bright private room in a calm home with easy access to the metro.",
  tags: "No brokerage, Metro nearby",
};

test("room listings produce structured database fields and useful tags", () => {
  const result = validateCommunityPost(validPost);

  assert.equal(result.success, true);
  assert.equal(result.data.type, "ROOM_AVAILABLE");
  assert.equal(result.data.propertyType, "APARTMENT");
  assert.equal(result.data.roomType, "PRIVATE_ROOM");
  assert.equal(result.data.bedrooms, 2);
  assert.deepEqual(result.data.tags, [
    "2BHK",
    "Private room",
    "No brokerage",
    "Metro nearby",
  ]);
});

test("need-a-room posts store a maximum budget", () => {
  const result = validateCommunityPost({
    ...validPost,
    postType: "Need a Room",
    housingType: "Either works",
    housingFeature: "Semi-furnished",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.monthlyAmountMin, null);
  assert.equal(result.data.monthlyAmountMax, 18000);
});

test("invalid and excessive user tags are rejected", () => {
  const result = validateCommunityPost({
    ...validPost,
    tags: "one, two, three, four, five, six",
  });

  assert.equal(result.success, false);
  assert.equal(Boolean(result.errors.tags), true);
});

test("community amounts use category-aware labels", () => {
  assert.match(formatCommunityAmount("Need a Room", null, 25000), /Up to/);
  assert.match(formatCommunityAmount("PG Available", 12000, null), /From/);
});

test("locality communities have stable city and locality routes", () => {
  assert.equal(
    communityPath({ citySlug: "bengaluru", localitySlug: "hsr-layout" }),
    "/community/bengaluru/hsr-layout",
  );
  assert.equal(
    communityPath({ citySlug: "navi mumbai", localitySlug: "sector/17" }),
    "/community/navi%20mumbai/sector%2F17",
  );
});
