import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);

function compile(relativePath, customRequire = require) {
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
    customRequire,
  );
  return compiledModule.exports;
}

const compatibility = compile("../lib/compatibility.ts");
const listingFreshness = compile("../lib/listing-freshness.ts");
const visitOutcomes = compile("../lib/visit-outcomes.ts");
const trustScore = compile("../lib/trust-score.ts");
const recommendations = compile("../lib/recommendations.ts", (id) =>
  id === "@/lib/compatibility"
    ? compatibility
    : id === "@/lib/listing-freshness"
      ? listingFreshness
      : id === "@/lib/visit-outcomes"
        ? visitOutcomes
      : id === "@/lib/trust-score"
        ? trustScore
      : require(id),
);
const discovery = compile("../lib/discovery.ts");
const recommendationUi = readFileSync(
  new URL(
    "../components/recommendations/recommendation-summary.tsx",
    import.meta.url,
  ),
  "utf8",
);
const recommendationSource = readFileSync(
  new URL("../lib/recommendations.ts", import.meta.url),
  "utf8",
);
const communityDataSource = readFileSync(
  new URL("../lib/community-data.ts", import.meta.url),
  "utf8",
);
const peopleDataSource = readFileSync(
  new URL("../lib/people-data.ts", import.meta.url),
  "utf8",
);
const communityRoomUi = readFileSync(
  new URL("../components/community/community-room.tsx", import.meta.url),
  "utf8",
);
const peopleDiscoveryUi = readFileSync(
  new URL("../components/people/people-discovery.tsx", import.meta.url),
  "utf8",
);

const viewer = {
  name: "Aarav",
  age: 27,
  profession: "Designer",
  organization: "Studio",
  preferredLocalities: ["HSR Layout"],
  budget: "₹18,000–₹24,000",
  moveInDate: "2026-10-01",
  bio: "Looking for a calm home.",
  commute: {
    destination: "Tech Park",
    latitude: 12.91,
    longitude: 77.64,
    preferredRangeKm: 10,
  },
  preferences: {
    diet: "Vegetarian",
    smoking: "Non-smoker",
    drinking: "Never",
    sleepSchedule: "Early bird",
    cleanliness: "Very tidy",
    pets: "Pet friendly",
    status: "Working professional",
  },
};

const compatibleProfile = {
  budget: { minimum: 19000, maximum: 24000 },
  preferredLocalities: ["HSR Layout"],
  diet: "Vegetarian",
  smoking: "Non-smoker",
  drinking: "Never",
  sleepSchedule: "Early bird",
  cleanliness: "Very tidy",
  pets: "Pet friendly",
  occupationStatus: "Working professional",
};

const neutralTrust = {
  score: 50,
  confidence: "neutral",
  label: "Trust history building",
  reasons: [],
};

function listing(overrides = {}) {
  return {
    id: "post-1",
    author: {
      id: "user-2",
      authUserId: "auth-2",
      name: "Mira",
      initials: "MI",
      role: "Engineer",
      compatibilityProfile: compatibleProfile,
      responsiveness: {
        level: "quick",
        label: "Usually responds quickly",
        description: "Based on a privacy-safe response pattern.",
        recommendationAlignment: 1,
      },
      trust: neutralTrust,
    },
    city: "Bengaluru",
    locality: "HSR Layout",
    category: "Room Available",
    title: "Sunny private room",
    description: "A calm and well connected home.",
    priceLabel: "₹20,000",
    monthlyAmountMin: 20000,
    monthlyAmountMax: 20000,
    securityDeposit: null,
    maintenanceAmount: null,
    moveInDate: "1 Oct 2026",
    moveInDateValue: "2026-10-01",
    tags: [],
    postedAt: "today",
    availability: {
      status: "AVAILABLE",
      label: "Available",
      isStale: false,
      ageDays: 0,
      lastConfirmedAt: "2026-09-04T00:00:00.000Z",
      freshnessLabel: "Confirmed today",
    },
    images: [],
    listingDetails: null,
    listingLocation: null,
    commute: {
      destinationLabel: "Tech Park",
      distanceKm: 6,
      distanceLabel: "~6 km away",
      relevanceLabel: "Within your preferred commute",
      withinPreferredRange: true,
      basedOnApproximateLocation: true,
    },
    recommendation: null,
    trust: neutralTrust,
    isOwner: false,
    ...overrides,
  };
}

test("listing recommendations combine transparent housing and people signals", () => {
  const result = recommendations.calculateListingRecommendation(
    listing(),
    viewer,
  );

  assert.equal(result.score, 100);
  assert.equal(result.comparedWeight, 100);
  assert.deepEqual(
    result.factors.map((factor) => factor.key),
    [
      "locality",
      "budget",
      "compatibility",
      "commute",
      "moveIn",
      "lifestyle",
      "freshness",
      "responsiveness",
    ],
  );
  assert.ok(result.reasons.some((reason) => /locality matches/i.test(reason)));
  assert.ok(result.reasons.some((reason) => /budget matches|within your budget/i.test(reason)));
  assert.ok(result.reasons.some((reason) => /18-minute commute/i.test(reason)));
  assert.ok(result.reasons.some((reason) => /move-in date fits/i.test(reason)));
});

test("missing recommendation signals are skipped instead of becoming mismatches", () => {
  const result = recommendations.calculateListingRecommendation(
    listing({
      author: { ...listing().author, compatibilityProfile: undefined },
      commute: null,
      moveInDateValue: null,
    }),
    { ...viewer, preferredLocalities: [], budget: "", moveInDate: "" },
  );

  assert.equal(result.score, null);
  assert.equal(result.comparedWeight, 0);
  assert.deepEqual(result.factors, []);
});

test("partial matches still provide clear recommendation reasons", () => {
  const result = recommendations.calculateListingRecommendation(
    listing({
      moveInDateValue: "2026-11-10",
      monthlyAmountMin: 26000,
      monthlyAmountMax: 26000,
    }),
    viewer,
  );

  assert.ok(result.reasons.length > 0);
  assert.ok(result.reasons.every((reason) => reason.trim().length > 0));
  assert.ok(result.considerations.some((reason) => /above your budget/i.test(reason)));
});

test("people recommendations explain compatibility, timing, commute, and lifestyle", () => {
  const compatibilityResult = compatibility.calculateCompatibility(
    compatibility.compatibilityProfileFromUserProfile(viewer),
    compatibleProfile,
  );
  const result = recommendations.calculatePeopleRecommendation({
    compatibility: compatibilityResult,
    viewerMoveInDate: "2026-10-01",
    candidateMoveInDate: "2026-10-08",
    viewerCommuteKm: 10,
    candidateCommuteKm: 12,
    responsiveness: listing().author.responsiveness,
    trust: neutralTrust,
  });

  assert.ok(result.score >= 95);
  assert.equal(result.factors.length, 7);
  assert.ok(
    result.factors.some(
      (factor) => factor.key === "commute" && /commute ranges/i.test(factor.reason),
    ),
  );
  assert.ok(
    result.factors.some(
      (factor) => factor.key === "moveIn" && /move-in dates/i.test(factor.reason),
    ),
  );
});

test("responsiveness stays a small, transparent recommendation signal", () => {
  const limited = listing({
    author: {
      ...listing().author,
      responsiveness: {
        level: "limited",
        label: "Limited activity",
        description: "Recent activity is limited.",
        recommendationAlignment: 0.35,
      },
    },
  });
  const neutral = listing({
    author: {
      ...listing().author,
      responsiveness: {
        level: "neutral",
        label: "Response history building",
        description: "Not enough history.",
        recommendationAlignment: null,
      },
    },
  });
  const limitedResult = recommendations.calculateListingRecommendation(
    limited,
    viewer,
  );
  const neutralResult = recommendations.calculateListingRecommendation(
    neutral,
    viewer,
  );

  assert.equal(
    limitedResult.factors.find((factor) => factor.key === "responsiveness")?.weight,
    6,
  );
  assert.equal(
    neutralResult.factors.some((factor) => factor.key === "responsiveness"),
    false,
  );
  assert.ok(limitedResult.score < neutralResult.score);
});

test("private visit outcomes add a small transparent recommendation signal", () => {
  const withMatchingHistory = recommendations.calculateListingRecommendation(
    listing(),
    {
      ...viewer,
      visitOutcomeHistory: [{
        outcome: "FINALIZED",
        category: "Room Available",
        locality: "HSR Layout",
        monthlyAmountMin: 20000,
        monthlyAmountMax: 20000,
      }],
    },
  );
  const withNegativeHistory = recommendations.calculateListingRecommendation(
    listing(),
    {
      ...viewer,
      visitOutcomeHistory: [{
        outcome: "NOT_SUITABLE",
        category: "Room Available",
        locality: "HSR Layout",
        monthlyAmountMin: 20000,
        monthlyAmountMax: 20000,
      }],
    },
  );

  const factor = withMatchingHistory.factors.find(
    (item) => item.key === "visitHistory",
  );
  assert.equal(factor?.weight, 5);
  assert.match(factor?.reason ?? "", /private visit outcomes/i);
  assert.ok(withMatchingHistory.score > withNegativeHistory.score);
});

test("recommendation ranking only reorders the eligible input results", () => {
  const lowerFit = listing({
    id: "lower",
    locality: "Whitefield",
    monthlyAmountMin: 50000,
    monthlyAmountMax: 50000,
    commute: {
      ...listing().commute,
      distanceKm: 30,
      distanceLabel: "~30 km away",
      relevanceLabel: "Beyond your preferred commute",
      withinPreferredRange: false,
    },
  });
  const higherFit = listing({ id: "higher" });
  const eligible = [lowerFit, higherFit];
  const ranked = recommendations.rankListingRecommendations(
    eligible,
    viewer,
    true,
  );
  const unchanged = recommendations.rankListingRecommendations(
    eligible,
    viewer,
    false,
  );

  assert.deepEqual(ranked.map((post) => post.id), ["higher", "lower"]);
  assert.deepEqual(new Set(ranked.map((post) => post.id)), new Set(["lower", "higher"]));
  assert.deepEqual(unchanged.map((post) => post.id), ["lower", "higher"]);
});

test("stale listings receive a lower transparent score and rank below fresh matches", () => {
  const stale = listing({
    id: "stale",
    availability: {
      ...listing().availability,
      isStale: true,
      ageDays: 45,
      freshnessLabel: "Needs confirmation · last checked 45 days ago",
    },
  });
  const fresh = listing({ id: "fresh" });
  const staleScore = recommendations.calculateListingRecommendation(stale, viewer);
  const freshScore = recommendations.calculateListingRecommendation(fresh, viewer);
  const ranked = recommendations.rankListingRecommendations(
    [stale, fresh],
    viewer,
    true,
  );

  assert.ok(freshScore.score > staleScore.score);
  assert.ok(staleScore.considerations.some((reason) => /confirmation/i.test(reason)));
  assert.deepEqual(ranked.map((post) => post.id), ["fresh", "stale"]);
});

test("people recommendation ranking only reorders eligible profiles", () => {
  const eligible = [
    { id: "lower", recommendation: { score: 48 }, trust: neutralTrust },
    { id: "higher", recommendation: { score: 86 }, trust: neutralTrust },
  ];
  const ranked = recommendations.rankPeopleRecommendations(eligible, true);
  const unchanged = recommendations.rankPeopleRecommendations(eligible, false);

  assert.deepEqual(ranked.map((profile) => profile.id), ["higher", "lower"]);
  assert.deepEqual(
    new Set(ranked.map((profile) => profile.id)),
    new Set(["lower", "higher"]),
  );
  assert.deepEqual(unchanged.map((profile) => profile.id), ["lower", "higher"]);
});

test("trust is a small tie-breaker and never adds ineligible results", () => {
  const lowerTrust = {
    score: 45,
    confidence: "established",
    label: "Trust history developing",
    reasons: [],
  };
  const higherTrust = {
    score: 82,
    confidence: "established",
    label: "Strong trust signals",
    reasons: ["Verified profile"],
  };
  const rankedListings = recommendations.rankListingRecommendations(
    [
      listing({ id: "lower-trust", trust: lowerTrust }),
      listing({ id: "higher-trust", trust: higherTrust }),
    ],
    viewer,
    true,
  );
  const rankedPeople = recommendations.rankPeopleRecommendations(
    [
      { id: "lower-trust", recommendation: { score: 70 }, trust: lowerTrust },
      { id: "higher-trust", recommendation: { score: 70 }, trust: higherTrust },
    ],
    true,
  );

  assert.deepEqual(rankedListings.map((post) => post.id), [
    "higher-trust",
    "lower-trust",
  ]);
  assert.deepEqual(rankedPeople.map((profile) => profile.id), [
    "higher-trust",
    "lower-trust",
  ]);
  assert.equal(rankedListings.length, 2);
  assert.equal(rankedPeople.length, 2);
});

test("recommended sorting preserves every existing filter value", () => {
  const filters = discovery.parseCommunityPostFilters({
    type: "ROOM_AVAILABLE",
    min: "15000",
    max: "25000",
    moveInBy: "2026-10-15",
    gender: "WOMEN",
    distance: "10",
  });
  const query = new URLSearchParams(
    discovery.communityFilterQuery(filters, filters.postType),
  );

  assert.equal(filters.sort, "recommended");
  assert.equal(query.get("type"), "ROOM_AVAILABLE");
  assert.equal(query.get("min"), "15000");
  assert.equal(query.get("max"), "25000");
  assert.equal(query.get("moveInBy"), "2026-10-15");
  assert.equal(query.get("gender"), "WOMEN");
  assert.equal(query.get("distance"), "10");
  assert.equal(query.has("sort"), false);
});

test("Living Fit explanations disclose weights, privacy boundaries, and that no AI is used", () => {
  assert.match(recommendationUi, /Living Fit/);
  assert.match(recommendationUi, /Why it fits/);
  assert.match(recommendationUi, /Things to consider/);
  assert.match(recommendationUi, /How Living Fit is calculated/);
  assert.match(recommendationUi, /factor\.weight/);
  assert.match(recommendationUi, /Missing details are skipped/);
  assert.match(recommendationUi, /No AI is used/);
  assert.match(recommendationUi, /filters, blocks, or visibility rules/);
  assert.match(recommendationUi, /distance-based estimate, not a live traffic/);
  assert.match(communityRoomUi, /Highest Living Fit/);
  assert.match(peopleDiscoveryUi, /Highest Living Fit/);
  assert.doesNotMatch(recommendationSource, /latitude|longitude|commuteDestination/);
});

test("Living Fit adds configurable property-term reasons without exposing private fields", () => {
  assert.equal(
    recommendations.calculateListingLivingFit,
    recommendations.calculateListingRecommendation,
  );
  assert.equal(
    recommendations.calculateFlatmateLivingFit,
    recommendations.calculatePeopleRecommendation,
  );
  const preferredTerms = recommendations.calculateListingRecommendation(
    listing({ securityDeposit: 40000, maintenanceAmount: 2000 }),
    viewer,
  );
  const highTerms = recommendations.calculateListingRecommendation(
    listing({ securityDeposit: 80000, maintenanceAmount: 6000 }),
    viewer,
  );
  const preferredFactor = preferredTerms.factors.find(({ key }) => key === "property");
  const highFactor = highTerms.factors.find(({ key }) => key === "property");

  assert.equal(
    preferredFactor?.weight,
    recommendations.LIVING_FIT_CONFIG.listingWeights.property,
  );
  assert.equal(preferredFactor?.status, "strong");
  assert.equal(highFactor?.status, "weak");
  assert.match(highFactor?.reason ?? "", /Deposit is .* above the preferred range/);
  assert.ok(highTerms.score < preferredTerms.score);
  assert.ok(highTerms.considerations.some((reason) => /deposit/i.test(reason)));
  assert.doesNotMatch(highFactor?.reason ?? "", /destination|latitude|longitude/i);
});

test("recommendations consume filtered inputs without bypassing data access rules", () => {
  assert.doesNotMatch(
    recommendationSource,
    /@\/lib\/prisma|@supabase\/|createClient|findMany|findUnique/,
  );
  assert.match(
    communityDataSource,
    /const where = communityPostWhere\([\s\S]*?blockedUserIds[\s\S]*?prisma\.post\.findMany\(\{[\s\S]*?where: \{ \.\.\.where/,
  );
  assert.ok(
    communityDataSource.includes("authorId: { notIn: blockedUserIds }"),
  );
  assert.ok(
    peopleDataSource.indexOf("blocksCreated: { none:") <
      peopleDataSource.indexOf("rankPeopleRecommendations(profiles"),
  );
  assert.ok(
    peopleDataSource.indexOf("blocksReceived: { none:") <
      peopleDataSource.indexOf("rankPeopleRecommendations(profiles"),
  );
});
