import type { ListingDecision, ListingDecisionSignal } from "@/types/listing-decision";
import type { ListingRealityScore } from "@/types/listing-reality";
import type { LocalityPulse } from "@/types/locality-pulse";
import type { MoveInReadiness } from "@/types/move-in-readiness";
import type { RecommendationResult } from "@/types/recommendation";

export const LISTING_DECISION_CONFIG = {
  livingFit: { positive: 70, caution: 40 },
  reality: { positive: 70, caution: 50 },
} as const;

function livingFitSignal(
  livingFit: RecommendationResult | null,
): ListingDecisionSignal {
  if (!livingFit || livingFit.score === null) {
    return {
      key: "livingFit",
      label: "Living Fit",
      value: "No personal comparison available",
      explanation: "A completed viewer profile is needed to compare budget, locality, commute, and preferences.",
      status: "missing",
    };
  }
  const status = livingFit.score >= LISTING_DECISION_CONFIG.livingFit.positive
    ? "positive"
    : livingFit.score < LISTING_DECISION_CONFIG.livingFit.caution
      ? "caution"
      : "neutral";
  return {
    key: "livingFit",
    label: "Living Fit",
    value: `${livingFit.score}% · ${livingFit.label}`,
    explanation:
      livingFit.reasons[0] ??
      livingFit.considerations[0] ??
      "Based on the preferences currently available in your profile.",
    status,
  };
}

function realitySignal(reality: ListingRealityScore): ListingDecisionSignal {
  if (reality.score === null) {
    return {
      key: "reality",
      label: "Reality Score",
      value: "Not enough verified feedback",
      explanation: "The verified-visit sample threshold has not been met yet.",
      status: "missing",
    };
  }
  const status = reality.score >= LISTING_DECISION_CONFIG.reality.positive
    ? "positive"
    : reality.score < LISTING_DECISION_CONFIG.reality.caution
      ? "caution"
      : "neutral";
  const strongestCategory = [...reality.categories].sort(
    (first, second) => second.score - first.score,
  )[0];
  return {
    key: "reality",
    label: "Reality Score",
    value: `${reality.score}% · ${reality.label}`,
    explanation: strongestCategory
      ? `${strongestCategory.label}: ${strongestCategory.indicator}. Based on aggregated verified visits.`
      : "Based on aggregated feedback from verified completed visits.",
    status,
  };
}

function readinessSignal(readiness: MoveInReadiness): ListingDecisionSignal {
  return {
    key: "readiness",
    label: "Move-in Readiness",
    value: `${readiness.score}/100 · ${readiness.label}`,
    explanation:
      readiness.reasons[0] ??
      readiness.considerations[0] ??
      "Based on current listing availability and preparation signals.",
    status:
      readiness.level === "high"
        ? "positive"
        : readiness.level === "low"
          ? "caution"
          : "neutral",
  };
}

function localityPulseSignal(
  localityPulse: LocalityPulse | null,
  locality: string,
): ListingDecisionSignal {
  if (!localityPulse) {
    return {
      key: "localityPulse",
      label: "Locality Pulse",
      value: "Not enough locality data",
      explanation: "A privacy-safe locality summary is not available for this view.",
      status: "missing",
    };
  }
  const preferredMetrics = [
    localityPulse.listingFreshness,
    localityPulse.supplyDemandTrend,
    localityPulse.activeListings,
  ];
  const metric = preferredMetrics.find(({ status }) => status === "AVAILABLE");
  if (!metric || metric.status !== "AVAILABLE") {
    return {
      key: "localityPulse",
      label: "Locality Pulse",
      value: "Not enough locality data",
      explanation: `At least ${localityPulse.minimumSampleSize} eligible records are required before ${locality} trends are shown.`,
      status: "missing",
    };
  }
  return {
    key: "localityPulse",
    label: "Locality Pulse",
    value: String(metric.value),
    explanation: `${locality} context · ${metric.detail}`,
    status: "neutral",
  };
}

export function buildListingDecision(input: {
  livingFit: RecommendationResult | null;
  reality: ListingRealityScore;
  readiness: MoveInReadiness;
  localityPulse: LocalityPulse | null;
  locality: string;
}): ListingDecision {
  const signals = [
    livingFitSignal(input.livingFit),
    realitySignal(input.reality),
    readinessSignal(input.readiness),
    localityPulseSignal(input.localityPulse, input.locality),
  ];
  const livingFit = signals.find(({ key }) => key === "livingFit")!;
  const reality = signals.find(({ key }) => key === "reality")!;
  const readiness = signals.find(({ key }) => key === "readiness")!;

  if (
    readiness.status === "caution" ||
    livingFit.status === "caution" ||
    reality.status === "caution"
  ) {
    return {
      label: "Low Priority",
      explanation: "One or more available signals need attention before you proceed.",
      signals,
    };
  }

  if (
    readiness.status === "positive" &&
    livingFit.status === "positive"
  ) {
    return {
      label: "Strong Match",
      explanation: "Personal fit and current listing readiness are both strong.",
      signals,
    };
  }

  return {
    label: "Worth Considering",
    explanation: "The available signals are promising or still developing—review each one below.",
    signals,
  };
}
