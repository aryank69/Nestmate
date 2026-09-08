import {
  calculateCompatibility,
  compatibilityProfileFromUserProfile,
} from "@/lib/compatibility";
import {
  freshnessRecommendationAlignment,
  rankFreshListingsFirst,
} from "@/lib/listing-freshness";
import {
  listingVisitOutcomeAlignment,
  personVisitOutcomeAlignment,
} from "@/lib/visit-outcomes";
import {
  TRUST_RANKING_WEIGHT,
  trustRecommendationAlignment,
} from "@/lib/trust-score";
import type { CompatibilityResult } from "@/types/compatibility";
import type { CommunityPost } from "@/types/community";
import type { PeopleDiscoveryProfile } from "@/types/discovery";
import type {
  RecommendationFactor,
  RecommendationFactorKey,
  RecommendationResult,
} from "@/types/recommendation";
import type { UserProfile } from "@/types/profile";
import type { VisitOutcomeType } from "@/types/visit";

export const LIVING_FIT_CONFIG = {
  listingWeights: {
    locality: 19,
    budget: 19,
    compatibility: 15,
    commute: 15,
    moveIn: 8,
    lifestyle: 8,
    property: 8,
    freshness: 10,
    responsiveness: 6,
    visitHistory: 5,
    trust: TRUST_RANKING_WEIGHT,
  },
  peopleWeights: {
    locality: 19,
    budget: 17,
    compatibility: 23,
    commute: 11,
    moveIn: 9,
    lifestyle: 15,
    responsiveness: 6,
    visitHistory: 5,
    trust: TRUST_RANKING_WEIGHT,
  },
  scoreBands: { excellent: 85, strong: 70, good: 55, possible: 40 },
  commuteMinutesPerKm: 3,
  propertyTerms: {
    preferredDepositMonths: 2,
    cautionDepositMonths: 3,
    preferredMaintenanceShare: 0.1,
    cautionMaintenanceShare: 0.2,
  },
  reasonLimits: { positive: 5, negative: 3 },
} as const;

export const LISTING_RECOMMENDATION_WEIGHTS =
  LIVING_FIT_CONFIG.listingWeights satisfies Record<
    RecommendationFactorKey,
    number
  >;

type PeopleRecommendationFactorKey = Exclude<
  RecommendationFactorKey,
  "freshness" | "property"
>;

export const PEOPLE_RECOMMENDATION_WEIGHTS =
  LIVING_FIT_CONFIG.peopleWeights satisfies Record<
    PeopleRecommendationFactorKey,
    number
  >;

type FactorInput = {
  key: RecommendationFactorKey;
  label: string;
  weight: number;
  alignment: number | null;
  strongReason: string;
  partialReason: string;
  weakReason: string;
};

const CORE_LIVING_FIT_FACTORS = new Set<RecommendationFactorKey>([
  "locality",
  "budget",
  "compatibility",
  "commute",
  "moveIn",
  "lifestyle",
  "property",
]);

function clampAlignment(value: number) {
  return Math.max(0, Math.min(1, value));
}

function scoreLabel(score: number | null) {
  if (score === null) return "Add more preferences to calculate Living Fit";
  if (score >= LIVING_FIT_CONFIG.scoreBands.excellent) return "Excellent fit";
  if (score >= LIVING_FIT_CONFIG.scoreBands.strong) return "Strong fit";
  if (score >= LIVING_FIT_CONFIG.scoreBands.good) return "Good fit";
  if (score >= LIVING_FIT_CONFIG.scoreBands.possible) return "Possible fit";
  return "Lower fit";
}

function buildRecommendation(inputs: FactorInput[]): RecommendationResult {
  const factors = inputs.flatMap((input): RecommendationFactor[] => {
    if (input.alignment === null) return [];
    const alignment = clampAlignment(input.alignment);
    const status =
      alignment >= 0.7 ? "strong" : alignment >= 0.4 ? "partial" : "weak";
    return [{
      key: input.key,
      label: input.label,
      weight: input.weight,
      alignment,
      weightedPoints: Number((input.weight * alignment).toFixed(2)),
      status,
      reason:
        status === "strong"
          ? input.strongReason
          : status === "partial"
            ? input.partialReason
            : input.weakReason,
    }];
  });
  const comparedWeight = factors.reduce((total, factor) => total + factor.weight, 0);
  const earned = factors.reduce((total, factor) => total + factor.weightedPoints, 0);
  const score = comparedWeight
    ? Math.round((earned / comparedWeight) * 100)
    : null;

  return {
    score,
    label: scoreLabel(score),
    comparedWeight,
    factors,
    reasons: factors
      .filter((factor) => factor.status === "strong")
      .sort(
        (first, second) =>
          Number(CORE_LIVING_FIT_FACTORS.has(second.key)) -
            Number(CORE_LIVING_FIT_FACTORS.has(first.key)) ||
          second.weightedPoints - first.weightedPoints,
      )
      .slice(0, LIVING_FIT_CONFIG.reasonLimits.positive)
      .map((factor) => factor.reason),
    considerations: factors
      .filter((factor) => factor.status !== "strong")
      .sort(
        (first, second) =>
          Number(CORE_LIVING_FIT_FACTORS.has(second.key)) -
            Number(CORE_LIVING_FIT_FACTORS.has(first.key)) ||
          second.weight * (1 - second.alignment) -
            first.weight * (1 - first.alignment),
      )
      .slice(0, LIVING_FIT_CONFIG.reasonLimits.negative)
      .map((factor) => factor.reason),
  };
}

function normalizedText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("en-IN")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

function localityAlignment(locality: string, preferredLocalities: string[]) {
  if (!preferredLocalities.length) return null;
  const target = normalizedText(locality);
  return preferredLocalities.some((value) => normalizedText(value) === target)
    ? 1
    : 0;
}

type BudgetRange = { minimum: number | null; maximum: number | null };

function budgetAlignment(first: BudgetRange | null, second: BudgetRange | null) {
  if (!first || !second) return null;
  const firstMinimum = first.minimum ?? 0;
  const firstMaximum = first.maximum ?? Number.POSITIVE_INFINITY;
  const secondMinimum = second.minimum ?? 0;
  const secondMaximum = second.maximum ?? Number.POSITIVE_INFINITY;
  const overlapStart = Math.max(firstMinimum, secondMinimum);
  const overlapEnd = Math.min(firstMaximum, secondMaximum);
  if (overlapStart <= overlapEnd) return 1;
  const gap = overlapStart - overlapEnd;
  const finiteValues = [firstMaximum, secondMaximum].filter(Number.isFinite);
  const reference = Math.max(...finiteValues, firstMinimum, secondMinimum, 1);
  const ratio = gap / reference;
  return ratio <= 0.1 ? 0.7 : ratio <= 0.25 ? 0.4 : 0;
}

function formatRupees(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function listingBudgetReasons(
  viewerBudget: BudgetRange | null,
  listingBudget: BudgetRange | null,
) {
  const defaultReasons = {
    strong: "Budget matches",
    partial: "Rent is close to your budget",
    weak: "Rent is outside your budget",
  };
  if (!viewerBudget || !listingBudget) return defaultReasons;
  const viewerMaximum = viewerBudget.maximum;
  const listingAmount = listingBudget.minimum ?? listingBudget.maximum;
  if (viewerMaximum === null || listingAmount === null) return defaultReasons;
  const difference = listingAmount - viewerMaximum;
  if (difference <= 0) {
    return {
      ...defaultReasons,
      strong: difference < 0 ? "Rent is within your budget" : "Budget matches",
    };
  }
  return {
    ...defaultReasons,
    partial: `Rent is ${formatRupees(difference)} above your budget`,
    weak: `Rent is ${formatRupees(difference)} above your budget`,
  };
}

function listingBudgetAlignment(
  viewerBudget: BudgetRange | null,
  listingBudget: BudgetRange | null,
) {
  if (!viewerBudget || !listingBudget) return null;
  const listingAmount = listingBudget.minimum ?? listingBudget.maximum;
  if (listingAmount === null) return null;
  if (viewerBudget.maximum !== null) {
    const difference = listingAmount - viewerBudget.maximum;
    if (difference <= 0) return 1;
    const differenceRatio = difference / Math.max(viewerBudget.maximum, 1);
    return differenceRatio <= 0.1 ? 0.6 : differenceRatio <= 0.25 ? 0.35 : 0;
  }
  return budgetAlignment(viewerBudget, listingBudget);
}

function dateAlignment(first: string | null, second: string | null) {
  if (!first || !second) return null;
  const firstTime = new Date(`${first.slice(0, 10)}T00:00:00.000Z`).getTime();
  const secondTime = new Date(`${second.slice(0, 10)}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(firstTime) || !Number.isFinite(secondTime)) return null;
  const days = Math.abs(firstTime - secondTime) / 86_400_000;
  return days <= 7 ? 1 : days <= 30 ? 0.75 : days <= 60 ? 0.45 : 0.1;
}

const lifestyleKeys = new Set([
  "diet",
  "smoking",
  "drinking",
  "sleepSchedule",
  "cleanliness",
  "pets",
  "occupationStatus",
]);

function factorAlignment(
  compatibility: CompatibilityResult | null,
  key: "budget" | "locality",
) {
  return compatibility?.factors.find((factor) => factor.key === key)?.alignment ?? null;
}

function lifestyleAlignment(compatibility: CompatibilityResult | null) {
  const factors =
    compatibility?.factors.filter((factor) => lifestyleKeys.has(factor.key)) ?? [];
  if (!factors.length) return null;
  const weight = factors.reduce((total, factor) => total + factor.weight, 0);
  return weight
    ? factors.reduce(
        (total, factor) => total + factor.alignment * factor.weight,
        0,
      ) / weight
    : null;
}

function matchingLifestyleCount(compatibility: CompatibilityResult | null) {
  return (
    compatibility?.factors.filter(
      (factor) => lifestyleKeys.has(factor.key) && factor.status === "match",
    ).length ?? 0
  );
}

function commuteAlignment(post: CommunityPost) {
  if (!post.commute) return null;
  if (post.commute.withinPreferredRange === true) return 1;
  if (post.commute.withinPreferredRange === false) return 0.2;
  if (post.commute.distanceKm <= 3) return 1;
  if (post.commute.distanceKm <= 8) return 0.8;
  if (post.commute.distanceKm <= 15) return 0.5;
  return 0.2;
}

function listingCommuteReasons(post: CommunityPost) {
  if (!post.commute) {
    return {
      strong: "Commute fits your preference",
      partial: "Commute may be manageable",
      weak: "Commute may be longer",
    };
  }
  const approximateMinutes = Math.max(
    5,
    Math.round(
      post.commute.distanceKm * LIVING_FIT_CONFIG.commuteMinutesPerKm,
    ),
  );
  const estimate = `Approx. ${approximateMinutes}-minute commute`;
  return {
    strong: `${estimate} fits your preferred range`,
    partial: `${estimate} may be manageable`,
    weak: `${estimate} is beyond your preferred range`,
  };
}

function propertyTermsAlignment(post: CommunityPost): {
  alignment: number;
  strong: string;
  partial: string;
  weak: string;
} | null {
  if (post.category !== "Room Available" && post.category !== "PG Available") {
    return null;
  }
  const monthlyAmount = post.monthlyAmountMin ?? post.monthlyAmountMax;
  if (!monthlyAmount || monthlyAmount <= 0) return null;

  const signals: Array<{ alignment: number; reason: string }> = [];
  if (typeof post.securityDeposit === "number") {
    const preferredDeposit =
      monthlyAmount *
      LIVING_FIT_CONFIG.propertyTerms.preferredDepositMonths;
    const cautionDeposit =
      monthlyAmount * LIVING_FIT_CONFIG.propertyTerms.cautionDepositMonths;
    signals.push(
      post.securityDeposit <= preferredDeposit
        ? { alignment: 1, reason: "Deposit is within the two-month preference" }
        : post.securityDeposit <= cautionDeposit
          ? {
              alignment: 0.55,
              reason: `Deposit is ${formatRupees(post.securityDeposit - preferredDeposit)} above the preferred range`,
            }
          : {
              alignment: 0.1,
              reason: `Deposit is ${formatRupees(post.securityDeposit - preferredDeposit)} above the preferred range`,
            },
    );
  }
  if (typeof post.maintenanceAmount === "number") {
    const maintenanceShare = post.maintenanceAmount / monthlyAmount;
    signals.push(
      maintenanceShare <=
        LIVING_FIT_CONFIG.propertyTerms.preferredMaintenanceShare
        ? { alignment: 1, reason: "Maintenance is within the preferred range" }
        : maintenanceShare <=
            LIVING_FIT_CONFIG.propertyTerms.cautionMaintenanceShare
          ? { alignment: 0.55, reason: "Maintenance is slightly above the preferred range" }
          : { alignment: 0.1, reason: "Maintenance is above the preferred range" },
    );
  }
  if (!signals.length) return null;
  const weakest = [...signals].sort(
    (first, second) => first.alignment - second.alignment,
  )[0];
  const alignment =
    signals.reduce((total, signal) => total + signal.alignment, 0) /
    signals.length;
  return {
    alignment,
    strong: signals.map(({ reason }) => reason).join(" · "),
    partial: weakest.reason,
    weak: weakest.reason,
  };
}

export function calculateListingRecommendation(
  post: CommunityPost,
  viewer: UserProfile,
): RecommendationResult {
  const viewerCompatibility = compatibilityProfileFromUserProfile(viewer);
  const compatibility = post.author.compatibilityProfile
    ? calculateCompatibility(viewerCompatibility, post.author.compatibilityProfile)
    : null;
  const lifestyleMatches = matchingLifestyleCount(compatibility);
  const listingAmount = post.monthlyAmountMin ?? post.monthlyAmountMax;
  const listingBudget =
    post.category === "Room Available" || post.category === "PG Available"
      ? listingAmount === null
        ? null
        : { minimum: listingAmount, maximum: listingAmount }
      : post.monthlyAmountMin !== null || post.monthlyAmountMax !== null
        ? { minimum: post.monthlyAmountMin, maximum: post.monthlyAmountMax }
        : null;
  const budgetReasons = listingBudgetReasons(
    viewerCompatibility.budget,
    listingBudget,
  );
  const commuteFit = commuteAlignment(post);
  const commuteReasons = listingCommuteReasons(post);
  const propertyTerms = propertyTermsAlignment(post);
  const visitHistoryFit =
    post.category === "Room Available" || post.category === "PG Available"
      ? listingVisitOutcomeAlignment(
          {
            category: post.category,
            locality: post.locality,
            monthlyAmountMin: post.monthlyAmountMin,
            monthlyAmountMax: post.monthlyAmountMax,
          },
          viewer.visitOutcomeHistory,
        )
      : null;

  const personalizedFactors: FactorInput[] = [
    {
      key: "locality",
      label: "Locality",
      weight: LISTING_RECOMMENDATION_WEIGHTS.locality,
      alignment: localityAlignment(post.locality, viewer.preferredLocalities),
      strongReason: `Locality matches · ${post.locality}`,
      partialReason: `${post.locality} is close to your locality preferences`,
      weakReason: `${post.locality} is outside your preferred localities`,
    },
    {
      key: "budget",
      label: "Budget",
      weight: LISTING_RECOMMENDATION_WEIGHTS.budget,
      alignment: listingBudgetAlignment(
        viewerCompatibility.budget,
        listingBudget,
      ),
      strongReason: budgetReasons.strong,
      partialReason: budgetReasons.partial,
      weakReason: budgetReasons.weak,
    },
    {
      key: "compatibility",
      label: "Profile compatibility",
      weight: LISTING_RECOMMENDATION_WEIGHTS.compatibility,
      alignment: compatibility?.score === null || compatibility?.score === undefined
        ? null
        : compatibility.score / 100,
      strongReason: `${compatibility?.score}% preference compatibility with the poster`,
      partialReason: `${compatibility?.score}% preference compatibility with the poster`,
      weakReason: `${compatibility?.score}% preference compatibility with the poster`,
    },
    {
      key: "commute",
      label: "Commute",
      weight: LISTING_RECOMMENDATION_WEIGHTS.commute,
      alignment: commuteFit,
      strongReason: commuteReasons.strong,
      partialReason: commuteReasons.partial,
      weakReason: commuteReasons.weak,
    },
    {
      key: "moveIn",
      label: "Move-in timing",
      weight: LISTING_RECOMMENDATION_WEIGHTS.moveIn,
      alignment: dateAlignment(viewer.moveInDate, post.moveInDateValue),
      strongReason: "Move-in date fits",
      partialReason: "Availability is near your move-in date",
      weakReason: "Availability and your move-in date are far apart",
    },
    {
      key: "lifestyle",
      label: "Lifestyle",
      weight: LISTING_RECOMMENDATION_WEIGHTS.lifestyle,
      alignment: lifestyleAlignment(compatibility),
      strongReason: `${lifestyleMatches} relevant lifestyle preferences align`,
      partialReason: "Some lifestyle preferences align",
      weakReason: "Several lifestyle preferences may need discussion",
    },
    {
      key: "property",
      label: "Property terms",
      weight: LISTING_RECOMMENDATION_WEIGHTS.property,
      alignment: propertyTerms?.alignment ?? null,
      strongReason: propertyTerms?.strong ?? "Property terms fit",
      partialReason: propertyTerms?.partial ?? "Some property terms may need planning",
      weakReason: propertyTerms?.weak ?? "Property terms may need discussion",
    },
  ];

  if (!personalizedFactors.some((factor) => factor.alignment !== null)) {
    return buildRecommendation(personalizedFactors);
  }

  return buildRecommendation([
    ...personalizedFactors,
    {
      key: "freshness",
      label: "Listing freshness",
      weight: LISTING_RECOMMENDATION_WEIGHTS.freshness,
      alignment: freshnessRecommendationAlignment(post.availability),
      strongReason: "The listing was recently confirmed available",
      partialReason: "The listing is reserved but was recently confirmed",
      weakReason: post.availability.isStale
        ? "The listing may need an availability confirmation"
        : "The listing is not currently available",
    },
    {
      key: "responsiveness",
      label: "Responsiveness",
      weight: LISTING_RECOMMENDATION_WEIGHTS.responsiveness,
      alignment: post.author.responsiveness.recommendationAlignment,
      strongReason: "The poster usually responds quickly",
      partialReason: "The poster has been active recently",
      weakReason: "The poster has limited recent activity",
    },
    {
      key: "visitHistory",
      label: "Your visit history",
      weight: LISTING_RECOMMENDATION_WEIGHTS.visitHistory,
      alignment: visitHistoryFit,
      strongReason: "This fits patterns from your private visit outcomes",
      partialReason: "This partly matches your private visit outcomes",
      weakReason: "Your private visit outcomes suggest a different fit",
    },
    {
      key: "trust",
      label: "Trust signals",
      weight: LISTING_RECOMMENDATION_WEIGHTS.trust,
      alignment: trustRecommendationAlignment(post.trust),
      strongReason: post.trust.reasons[0] ?? "Established trust signals",
      partialReason: post.trust.reasons[0] ?? "Trust history is developing",
      weakReason: "Trust history is still developing",
    },
  ]);
}

function commuteRangeAlignment(
  first: number | null,
  second: number | null,
) {
  if (first === null || second === null) return null;
  const differenceRatio = Math.abs(first - second) / Math.max(first, second, 1);
  return differenceRatio <= 0.2 ? 1 : differenceRatio <= 0.5 ? 0.65 : 0.3;
}

export function calculatePeopleRecommendation(input: {
  compatibility: CompatibilityResult | null;
  viewerMoveInDate: string | null;
  candidateMoveInDate: string | null;
  viewerCommuteKm: number | null;
  candidateCommuteKm: number | null;
  responsiveness: PeopleDiscoveryProfile["responsiveness"];
  trust: PeopleDiscoveryProfile["trust"];
  visitOutcome?: VisitOutcomeType | null;
}): RecommendationResult {
  const lifestyleMatches = matchingLifestyleCount(input.compatibility);
  const commuteFit = commuteRangeAlignment(
    input.viewerCommuteKm,
    input.candidateCommuteKm,
  );

  const personalizedFactors: FactorInput[] = [
    {
      key: "locality",
      label: "Locality",
      weight: PEOPLE_RECOMMENDATION_WEIGHTS.locality,
      alignment: factorAlignment(input.compatibility, "locality"),
      strongReason: "Preferred localities match",
      partialReason: "Locality preferences are partly aligned",
      weakReason: "Preferred localities do not overlap",
    },
    {
      key: "budget",
      label: "Budget",
      weight: PEOPLE_RECOMMENDATION_WEIGHTS.budget,
      alignment: factorAlignment(input.compatibility, "budget"),
      strongReason: "Budget preferences match",
      partialReason: "Monthly budgets are close",
      weakReason: "Monthly budgets are far apart",
    },
    {
      key: "compatibility",
      label: "Overall compatibility",
      weight: PEOPLE_RECOMMENDATION_WEIGHTS.compatibility,
      alignment:
        input.compatibility?.score === null ||
        input.compatibility?.score === undefined
          ? null
          : input.compatibility.score / 100,
      strongReason: `${input.compatibility?.score}% overall preference compatibility`,
      partialReason: `${input.compatibility?.score}% overall preference compatibility`,
      weakReason: `${input.compatibility?.score}% overall preference compatibility`,
    },
    {
      key: "commute",
      label: "Commute preference",
      weight: PEOPLE_RECOMMENDATION_WEIGHTS.commute,
      alignment: commuteFit,
      strongReason: "Preferred commute ranges are similar",
      partialReason: "Commute preferences are reasonably close",
      weakReason: "Preferred commute ranges differ",
    },
    {
      key: "moveIn",
      label: "Move-in timing",
      weight: PEOPLE_RECOMMENDATION_WEIGHTS.moveIn,
      alignment: dateAlignment(
        input.viewerMoveInDate,
        input.candidateMoveInDate,
      ),
      strongReason: "Move-in dates align",
      partialReason: "Move-in timing is reasonably close",
      weakReason: "Move-in timing is far apart",
    },
    {
      key: "lifestyle",
      label: "Lifestyle",
      weight: PEOPLE_RECOMMENDATION_WEIGHTS.lifestyle,
      alignment: lifestyleAlignment(input.compatibility),
      strongReason: `${lifestyleMatches} relevant lifestyle preferences align`,
      partialReason: "Some lifestyle preferences align",
      weakReason: "Several lifestyle preferences may need discussion",
    },
  ];

  if (!personalizedFactors.some((factor) => factor.alignment !== null)) {
    return buildRecommendation(personalizedFactors);
  }

  return buildRecommendation([
    ...personalizedFactors,
    {
      key: "responsiveness",
      label: "Responsiveness",
      weight: PEOPLE_RECOMMENDATION_WEIGHTS.responsiveness,
      alignment: input.responsiveness.recommendationAlignment,
      strongReason: "This member usually responds quickly",
      partialReason: "This member has been active recently",
      weakReason: "This member has limited recent activity",
    },
    {
      key: "visitHistory",
      label: "Your visit history",
      weight: PEOPLE_RECOMMENDATION_WEIGHTS.visitHistory,
      alignment: personVisitOutcomeAlignment(input.visitOutcome ?? null),
      strongReason: "Your private visit history supports this match",
      partialReason: "Your private visit history shows some interest",
      weakReason: "Your private visit history suggests a weaker fit",
    },
    {
      key: "trust",
      label: "Trust signals",
      weight: PEOPLE_RECOMMENDATION_WEIGHTS.trust,
      alignment: trustRecommendationAlignment(input.trust),
      strongReason: input.trust.reasons[0] ?? "Established trust signals",
      partialReason: input.trust.reasons[0] ?? "Trust history is developing",
      weakReason: "Trust history is still developing",
    },
  ]);
}

export function rankListingRecommendations(
  posts: CommunityPost[],
  viewer: UserProfile | null,
  enabled: boolean,
) {
  const scored = posts.map((post) => ({
    ...post,
    recommendation: viewer
      ? calculateListingRecommendation(post, viewer)
      : null,
  }));
  if (!viewer || !enabled) return rankFreshListingsFirst(scored);
  return rankFreshListingsFirst(scored).sort(
    (first, second) =>
      (second.recommendation?.score ?? -1) -
        (first.recommendation?.score ?? -1) ||
      (trustRecommendationAlignment(second.trust) ?? 0) -
        (trustRecommendationAlignment(first.trust) ?? 0) ||
      Number(first.availability.isStale) -
        Number(second.availability.isStale),
  );
}

export function rankPeopleRecommendations<T extends PeopleDiscoveryProfile>(
  profiles: T[],
  enabled: boolean,
) {
  if (!enabled) return profiles;
  return [...profiles].sort(
    (first, second) =>
      (second.recommendation?.score ?? -1) -
        (first.recommendation?.score ?? -1) ||
      (trustRecommendationAlignment(second.trust) ?? 0) -
        (trustRecommendationAlignment(first.trust) ?? 0),
  );
}

export const calculateListingLivingFit = calculateListingRecommendation;
export const calculateFlatmateLivingFit = calculatePeopleRecommendation;
export const rankListingsByLivingFit = rankListingRecommendations;
export const rankFlatmatesByLivingFit = rankPeopleRecommendations;
