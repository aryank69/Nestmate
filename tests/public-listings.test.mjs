import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function compile(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function("module", "exports", "require", "process", output)(compiledModule, compiledModule.exports, require, process);
  return compiledModule.exports;
}

const publicListings = compile("../lib/public-listings.ts");
const dataSource = readFileSync(new URL("../lib/public-listing-data.ts", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../app/listings/[postId]/page.tsx", import.meta.url), "utf8");
const internalPage = readFileSync(new URL("../app/community/post/[postId]/page.tsx", import.meta.url), "utf8");
const sitemapSource = readFileSync(new URL("../app/sitemap.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../prisma/migrations/20260907170443_public_listing_storage_visibility/migration.sql", import.meta.url), "utf8");

const eligible = {
  type: "ROOM_AVAILABLE",
  status: "ACTIVE",
  availabilityStatus: "AVAILABLE",
  moderationStatus: "VISIBLE",
  publishedAt: new Date(),
  communityActive: true,
  authorSuspended: false,
  viewerBlocked: false,
};

test("only active, published Room Available and PG Available listings are public", () => {
  assert.equal(publicListings.isEligiblePublicListing(eligible), true);
  assert.equal(publicListings.isEligiblePublicListing({ ...eligible, type: "PG_AVAILABLE", availabilityStatus: "RESERVED" }), true);
  for (const rejected of [
    { type: "NEED_ROOM" },
    { type: "NEED_FLATMATE" },
    { status: "DRAFT" },
    { status: "ARCHIVED" },
    { availabilityStatus: "CLOSED" },
    { moderationStatus: "HIDDEN" },
    { publishedAt: null },
    { communityActive: false },
    { authorSuspended: true },
    { viewerBlocked: true },
  ]) {
    assert.equal(publicListings.isEligiblePublicListing({ ...eligible, ...rejected }), false);
  }
});

test("public amenity text removes contact details and duplicates", () => {
  assert.deepEqual(
    publicListings.privacySafeListingTokens([
      "Wi-Fi",
      " wi-fi ",
      "Call +91 98765 43210",
      "owner@example.com",
      "https://example.com/tour",
      "Power backup",
    ]),
    ["Wi-Fi", "Power backup"],
  );
});

test("SEO copy is structured and canonical URLs use the configured site origin", () => {
  assert.equal(
    publicListings.publicListingTitle({
      category: "Room Available",
      locality: "Indiranagar",
      city: "Bengaluru",
      furnishing: "Furnished",
      roomType: "Private room",
    }),
    "Furnished Private room in Indiranagar Bengaluru",
  );
  const description = publicListings.publicListingMetadataDescription({
    category: "PG Available",
    locality: "Koregaon Park",
    city: "Pune",
    priceLabel: "From ₹12,000",
    availabilityLabel: "Available",
    amenities: ["Wi-Fi", "Meals", "Laundry"],
  });
  assert.ok(description.length <= 160);
  assert.match(description, /PG Available in Koregaon Park, Pune/);
});

test("server loader applies global privacy and signed-in block filters", () => {
  for (const rule of [
    /type: \{ in: \[\.\.\.PUBLIC_LISTING_DATABASE_TYPES\] \}/,
    /status: "ACTIVE"/,
    /availabilityStatus: \{ in: \["AVAILABLE", "RESERVED"\] \}/,
    /moderationStatus: "VISIBLE"/,
    /publishedAt: \{ not: null \}/,
    /community: \{ isActive: true \}/,
    /moderationState: \{ isNot: \{ status: "SUSPENDED" \} \}/,
    /blocksReceived: \{ none: \{ blockerId: viewer\.id \} \}/,
    /blocksCreated: \{ none: \{ blockedId: viewer\.id \} \}/,
  ]) assert.match(dataSource, rule);
  assert.doesNotMatch(dataSource, /select:[\s\S]*?latitude: true/);
  assert.doesNotMatch(dataSource, /select:[\s\S]*?longitude: true/);
  assert.doesNotMatch(dataSource, /select:[\s\S]*?description: true/);
  assert.doesNotMatch(dataSource, /select:[\s\S]*?email: true/);
  assert.match(dataSource, /privacySafeListingTokens\(post\.amenities\)/);
});

test("public page emits canonical, Open Graph, Twitter, and indexing metadata", () => {
  assert.match(pageSource, /alternates: \{ canonical \}/);
  assert.match(pageSource, /openGraph:/);
  assert.match(pageSource, /twitter:/);
  assert.match(pageSource, /robots: \{ index: true, follow: true \}/);
  assert.match(pageSource, /robots: \{ index: false, follow: false \}/);
  assert.match(pageSource, /Create account/);
  assert.match(pageSource, /Log in to contact/);
  assert.match(pageSource, /Exact location and member details are not shown publicly/);
  assert.match(internalPage, /robots: \{ index: false, follow: false \}/);
  assert.match(sitemapSource, /loadPublicListingSitemapEntries/);
});

test("Storage image visibility mirrors listing eligibility and block rules", () => {
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path = ''/);
  assert.match(migration, /"availabilityStatus" IN/);
  assert.match(migration, /'AVAILABLE'/);
  assert.match(migration, /'RESERVED'/);
  assert.match(migration, /"moderationStatus" = 'VISIBLE'/);
  assert.match(migration, /locality_community\."isActive" = TRUE/);
  assert.match(migration, /is_user_content_visible\(listing_post\."authorId"\)/);
  assert.match(migration, /FROM public\."UserBlock"/);
  assert.match(migration, /object_name = ANY\(listing_post\."imagePaths"\)/);
  assert.match(migration, /TO anon, authenticated/);
});
