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

const trust = compile("../lib/trust-score.ts");
const trustDataSource = readFileSync(
  new URL("../lib/trust-score-data.ts", import.meta.url),
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
const trustUiSource = readFileSync(
  new URL("../components/trust/trust-score-indicator.tsx", import.meta.url),
  "utf8",
);

const neutralResponsiveness = {
  level: "neutral",
  label: "Response history building",
  description: "Not enough activity yet.",
  recommendationAlignment: null,
};

function userEvidence(overrides = {}) {
  return {
    verificationKinds: [],
    profileCompleteness: 0.4,
    completedVisits: 0,
    attendanceConfirmed: 0,
    attendanceHappened: 0,
    responsiveness: neutralResponsiveness,
    reportCount: 0,
    moderationActions: [],
    isRestricted: false,
    ...overrides,
  };
}

test("new users remain neutral until enough independent trust history exists", () => {
  const empty = trust.calculateUserTrustScore(userEvidence());
  const oneSignal = trust.calculateUserTrustScore(
    userEvidence({ verificationKinds: ["EMAIL"] }),
  );

  assert.deepEqual(empty, {
    score: 50,
    confidence: "neutral",
    label: "Trust history building",
    reasons: [],
  });
  assert.deepEqual(oneSignal, empty);
  assert.equal(trust.trustRecommendationAlignment(empty), null);
});

test("profile trust is deterministic, bounded, and uses approved explanations", () => {
  const evidence = userEvidence({
    verificationKinds: ["EMAIL", "PHONE", "PROFILE_COMPLETE"],
    profileCompleteness: 0.9,
    completedVisits: 5,
    attendanceConfirmed: 5,
    attendanceHappened: 5,
    responsiveness: {
      ...neutralResponsiveness,
      level: "quick",
      recommendationAlignment: 1,
    },
  });
  const first = trust.calculateUserTrustScore(evidence);
  const second = trust.calculateUserTrustScore(evidence);

  assert.deepEqual(first, second);
  assert.equal(first.confidence, "established");
  assert.ok(first.score >= trust.TRUST_MIN_SCORE);
  assert.ok(first.score <= trust.TRUST_MAX_SCORE);
  assert.ok(first.reasons.includes("Verified profile"));
  assert.ok(first.reasons.includes("Profile information complete"));
  assert.ok(first.reasons.every((reason) => [
    "Verified profile",
    "Profile information complete",
    "Consistent visit history",
    "Usually responds quickly",
    "Active Roomzi history",
  ].includes(reason)));
});

test("attendance only contributes after the privacy-safe minimum sample", () => {
  const tooLittle = trust.calculateUserTrustScore(userEvidence({
    verificationKinds: ["EMAIL"],
    attendanceConfirmed: 2,
    attendanceHappened: 2,
  }));
  const enough = trust.calculateUserTrustScore(userEvidence({
    verificationKinds: ["EMAIL"],
    attendanceConfirmed: 3,
    attendanceHappened: 3,
  }));

  assert.equal(tooLittle.confidence, "neutral");
  assert.equal(enough.confidence, "established");
  assert.ok(enough.reasons.includes("Consistent visit history"));
});

test("listing trust uses only sufficiently aggregated feedback", () => {
  const ownerTrust = trust.calculateUserTrustScore(userEvidence({
    verificationKinds: ["EMAIL", "PHONE"],
  }));
  const feedback = {
    responseCount: 3,
    propertyAccuracy: 4.8,
    cleanliness: 4.5,
    communicationQuality: 4.6,
    safetyComfort: 4.7,
    overallExperience: 4.8,
  };
  const listingEvidence = {
    ownerTrust,
    verificationKinds: ["LISTING_DETAILS"],
    availability: { status: "AVAILABLE", isStale: false },
  };
  const insufficient = trust.calculateListingTrustScore({
    ...listingEvidence,
    feedback: { ...feedback, responseCount: 2 },
  });
  const aggregated = trust.calculateListingTrustScore({
    ...listingEvidence,
    feedback,
  });

  assert.ok(aggregated.score > insufficient.score);
  assert.ok(aggregated.reasons.includes("Positive aggregated visit feedback"));
  assert.equal("feedback" in aggregated, false);
  assert.equal("responseCount" in aggregated, false);
});

test("sensitive safety inputs affect only the bounded score, never explanations", () => {
  const baseline = trust.calculateUserTrustScore(userEvidence({
    verificationKinds: ["EMAIL", "PHONE"],
  }));
  const moderated = trust.calculateUserTrustScore(userEvidence({
    verificationKinds: ["EMAIL", "PHONE"],
    reportCount: 20,
    moderationActions: ["WARN", "RESTRICT", "SUSPEND"],
    isRestricted: true,
  }));

  assert.ok(moderated.score < baseline.score);
  assert.ok(moderated.score >= trust.TRUST_MIN_SCORE);
  assert.deepEqual(moderated.reasons, ["Verified profile"]);
  assert.doesNotMatch(JSON.stringify(moderated), /report|moderation|spam|restriction/i);
});

test("trust is a small ranking factor applied only after eligibility filters", () => {
  assert.equal(trust.TRUST_RANKING_WEIGHT, 4);
  assert.match(recommendationSource, /trust:\s*TRUST_RANKING_WEIGHT/);
  assert.match(recommendationSource, /trustRecommendationAlignment/);
  assert.match(
    communityDataSource,
    /const where = communityPostWhere\([\s\S]*?prisma\.post\.findMany\([\s\S]*?loadUserTrustScores\(/,
  );
  assert.match(communityDataSource, /authorId: \{ notIn: blockedUserIds \}/);
  assert.ok(
    peopleDataSource.indexOf("blocksCreated: { none:") <
      peopleDataSource.lastIndexOf("loadUserTrustScores("),
  );
  assert.ok(
    peopleDataSource.indexOf("blocksReceived: { none:") <
      peopleDataSource.lastIndexOf("loadUserTrustScores("),
  );
});

test("server evidence loading and UI preserve privacy boundaries", () => {
  assert.match(trustDataSource, /import "server-only"/);
  assert.match(trustDataSource, /nestmate_private\.visit_feedback_listing_aggregate/);
  assert.doesNotMatch(trustDataSource, /privateNote|privateDetails|report\.reason|report\.details/);
  assert.match(trustUiSource, /Private feedback, report details/);
  assert.match(trustUiSource, /anti-spam rules are never shown/);
  assert.doesNotMatch(trustUiSource, /reportCount|moderationActions|privateNote|privateDetails/);
});
