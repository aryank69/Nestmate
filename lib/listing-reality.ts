import type {
  ListingRealityCategoryKey,
  ListingRealityRatings,
  ListingRealityScore,
} from "@/types/listing-reality";
import type {
  VisitAttendanceConfirmation,
  VisitRequestStatus,
  VisitRole,
} from "@/types/visit";

export const LISTING_REALITY_MIN_RATING = 1;
export const LISTING_REALITY_MAX_RATING = 5;
export const LISTING_REALITY_MIN_RESPONSES = 3;
export const MAX_LISTING_REALITY_NOTE_LENGTH = 1000;

export const LISTING_REALITY_CATEGORIES = [
  { key: "photosAccuracy", label: "Photos", weight: 1 },
  { key: "costAccuracy", label: "Rent & deposit", weight: 1 },
  { key: "amenitiesAccuracy", label: "Amenities", weight: 1 },
  { key: "conditionAccuracy", label: "Cleanliness & condition", weight: 1 },
  { key: "locationAccuracy", label: "Location", weight: 1 },
  { key: "descriptionAccuracy", label: "Listing description", weight: 1 },
] as const satisfies ReadonlyArray<{
  key: ListingRealityCategoryKey;
  label: string;
  weight: number;
}>;

export type ListingRealityAggregate = ListingRealityRatings & {
  responseCount: number;
};

export function parseListingRealityRatings(
  input: Record<string, unknown>,
): ListingRealityRatings | null {
  const parsed = {} as ListingRealityRatings;
  for (const { key } of LISTING_REALITY_CATEGORIES) {
    const value = typeof input[key] === "number" ? input[key] : Number(input[key]);
    if (
      !Number.isInteger(value) ||
      value < LISTING_REALITY_MIN_RATING ||
      value > LISTING_REALITY_MAX_RATING
    ) {
      return null;
    }
    parsed[key] = value;
  }
  return parsed;
}

export function cleanListingRealityNote(value: string) {
  return value.trim().slice(0, MAX_LISTING_REALITY_NOTE_LENGTH) || null;
}

export function canSubmitListingRealityFeedback(
  visit: {
    role: VisitRole;
    status: VisitRequestStatus;
    scheduledAt: string | Date | null;
    requesterAttendance?: VisitAttendanceConfirmation | null;
    ownerAttendance?: VisitAttendanceConfirmation | null;
    hasExistingFeedback?: boolean;
  },
  now = new Date(),
) {
  if (visit.role !== "REQUESTER") {
    return {
      eligible: false,
      reason: "Listing owners cannot rate their own listing.",
    };
  }
  if (visit.status !== "ACCEPTED" || !visit.scheduledAt) {
    return {
      eligible: false,
      reason: "Reality feedback is available after an accepted visit.",
    };
  }
  const scheduledAt = new Date(visit.scheduledAt).getTime();
  if (!Number.isFinite(scheduledAt) || now.getTime() < scheduledAt + 60 * 60_000) {
    return {
      eligible: false,
      reason: "Reality feedback opens after the scheduled visit ends.",
    };
  }
  if (
    visit.requesterAttendance !== "HAPPENED" ||
    visit.ownerAttendance !== "HAPPENED"
  ) {
    return {
      eligible: false,
      reason: "Both participants must confirm that the visit happened.",
    };
  }
  return {
    eligible: true,
    reason: visit.hasExistingFeedback
      ? "You can update your verified visit rating."
      : "Verified visit rating is available.",
  };
}

function categoryIndicator(score: number) {
  if (score >= 80) return "Matches closely";
  if (score >= 60) return "Mostly matches";
  if (score >= 40) return "Mixed accuracy";
  return "Needs attention";
}

function overallLabel(score: number) {
  if (score >= 85) return "Highly consistent with visits";
  if (score >= 70) return "Mostly accurate";
  if (score >= 50) return "Mixed accuracy";
  return "Often differs from visits";
}

function ratingToScore(rating: number) {
  const bounded = Math.min(
    LISTING_REALITY_MAX_RATING,
    Math.max(LISTING_REALITY_MIN_RATING, rating),
  );
  return Math.round(((bounded - 1) / 4) * 100);
}

export function notEnoughListingRealityFeedback(): ListingRealityScore {
  return {
    score: null,
    label: "Not enough verified feedback",
    responseCount: null,
    categories: [],
  };
}

export function calculateListingRealityScore(
  aggregate: ListingRealityAggregate | null,
): ListingRealityScore {
  if (!aggregate || aggregate.responseCount < LISTING_REALITY_MIN_RESPONSES) {
    return notEnoughListingRealityFeedback();
  }

  const categories = LISTING_REALITY_CATEGORIES.map(({ key, label }) => {
    const score = ratingToScore(aggregate[key]);
    return { key, label, score, indicator: categoryIndicator(score) };
  });
  const totalWeight = LISTING_REALITY_CATEGORIES.reduce(
    (sum, category) => sum + category.weight,
    0,
  );
  const score = Math.round(
    LISTING_REALITY_CATEGORIES.reduce(
      (sum, category, index) => sum + categories[index].score * category.weight,
      0,
    ) / totalWeight,
  );

  return {
    score,
    label: overallLabel(score),
    responseCount: aggregate.responseCount,
    categories,
  };
}
