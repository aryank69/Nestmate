import type { ListingAvailabilityStatus } from "@/lib/listing-freshness";
import type {
  MoveInReadiness,
  MoveInReadinessFactor,
  MoveInReadinessFactorKey,
} from "@/types/move-in-readiness";
import type { ResponsivenessIndicator } from "@/types/responsiveness";
import type { TrustScore } from "@/types/trust";
import type { VerificationKind } from "@/types/verification";

const DAY_MS = 86_400_000;

export const MOVE_IN_READINESS_CONFIG = {
  weights: {
    availability: 20,
    freshness: 20,
    photos: 12,
    verification: 14,
    responsiveness: 10,
    visitSlots: 12,
    propertyDetails: 12,
  },
  bands: { high: 75, medium: 50 },
  recentListingDays: 14,
  recentPhotoContextDays: 45,
  reasonLimits: { positive: 5, caution: 2 },
} as const satisfies {
  weights: Record<MoveInReadinessFactorKey, number>;
  bands: { high: number; medium: number };
  recentListingDays: number;
  recentPhotoContextDays: number;
  reasonLimits: { positive: number; caution: number };
};

export type ListingPropertyDetailEvidence = {
  rent: boolean;
  availabilityDate: boolean;
  furnishing: boolean;
  roomType: boolean;
  occupancy: boolean;
  deposit: boolean;
  maintenance: boolean;
  preferredOccupant: boolean;
  attachedBathroom: boolean;
  parking: boolean;
  amenities: boolean;
};

export type MoveInReadinessEvidence = {
  availability: {
    status: ListingAvailabilityStatus;
    isStale: boolean;
    ageDays: number;
  };
  imageCount: number;
  latestPhotoAt: Date | string | null;
  verificationKinds: VerificationKind[];
  trust: TrustScore;
  responsiveness: ResponsivenessIndicator;
  hasOpenVisitSlots: boolean;
  propertyDetails: ListingPropertyDetailEvidence;
};

type FactorSeed = Omit<MoveInReadinessFactor, "weightedPoints" | "tone">;

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function ageDays(value: Date | string, now: Date) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp)
    ? Math.max(0, Math.floor((now.getTime() - timestamp) / DAY_MS))
    : Number.POSITIVE_INFINITY;
}

function factor(seed: FactorSeed): MoveInReadinessFactor {
  const alignment = clamp(seed.alignment);
  return {
    ...seed,
    alignment,
    weightedPoints: Number((seed.weight * alignment).toFixed(2)),
    tone: alignment >= 0.7 ? "positive" : alignment < 0.5 ? "caution" : "neutral",
  };
}

function availabilityFactor(
  status: ListingAvailabilityStatus,
): MoveInReadinessFactor {
  if (status === "AVAILABLE") {
    return factor({
      key: "availability",
      label: "Availability",
      weight: MOVE_IN_READINESS_CONFIG.weights.availability,
      alignment: 1,
      reason: "Available now",
    });
  }
  if (status === "RESERVED") {
    return factor({
      key: "availability",
      label: "Availability",
      weight: MOVE_IN_READINESS_CONFIG.weights.availability,
      alignment: 0.4,
      reason: "Currently reserved",
    });
  }
  return factor({
    key: "availability",
    label: "Availability",
    weight: MOVE_IN_READINESS_CONFIG.weights.availability,
    alignment: 0,
    reason: "Listing is closed",
  });
}

function freshnessFactor(input: MoveInReadinessEvidence["availability"]) {
  const alignment = input.status === "CLOSED"
    ? 0
    : input.isStale
      ? 0.15
      : input.ageDays <= MOVE_IN_READINESS_CONFIG.recentListingDays
        ? 1
        : 0.7;
  return factor({
    key: "freshness",
    label: "Listing freshness",
    weight: MOVE_IN_READINESS_CONFIG.weights.freshness,
    alignment,
    reason:
      input.status === "CLOSED"
        ? "Listing is no longer active"
        : input.isStale
          ? "Availability needs reconfirmation"
          : input.ageDays <= MOVE_IN_READINESS_CONFIG.recentListingDays
            ? "Recently updated"
            : "Availability was confirmed recently",
  });
}

function photosFactor(
  imageCount: number,
  latestPhotoAt: Date | string | null,
  now: Date,
) {
  const hasPhotos = imageCount > 0;
  const photoAge = latestPhotoAt ? ageDays(latestPhotoAt, now) : null;
  const recentContext =
    hasPhotos &&
    photoAge !== null &&
    photoAge <= MOVE_IN_READINESS_CONFIG.recentPhotoContextDays;
  return factor({
    key: "photos",
    label: "Photos",
    weight: MOVE_IN_READINESS_CONFIG.weights.photos,
    alignment: !hasPhotos ? 0 : recentContext ? 1 : 0.55,
    reason: !hasPhotos
      ? "No photos have been added"
      : recentContext
        ? "Recent photos provided"
        : photoAge === null
          ? "Photos are available"
          : "Photos may need refreshing",
  });
}

function verificationFactor(
  verificationKinds: VerificationKind[],
  trust: TrustScore,
) {
  const verified = new Set(verificationKinds);
  const propertyVerified = verified.has("PROPERTY");
  const detailsVerified = verified.has("LISTING_DETAILS");
  const trustAlignment = trust.confidence === "established" ? trust.score / 100 : 0.5;
  const alignment = propertyVerified
    ? 1
    : detailsVerified
      ? Math.max(0.85, trustAlignment)
      : trustAlignment;
  return factor({
    key: "verification",
    label: "Verification and trust",
    weight: MOVE_IN_READINESS_CONFIG.weights.verification,
    alignment,
    reason: propertyVerified
      ? "Property verification completed"
      : detailsVerified
        ? "Listing details verified"
        : trust.confidence === "established"
          ? trust.label
          : "Verification history is building",
  });
}

function responsivenessFactor(responsiveness: ResponsivenessIndicator) {
  const alignment = responsiveness.recommendationAlignment ?? 0.5;
  return factor({
    key: "responsiveness",
    label: "Owner responsiveness",
    weight: MOVE_IN_READINESS_CONFIG.weights.responsiveness,
    alignment,
    reason:
      responsiveness.level === "quick"
        ? "Owner usually responds quickly"
        : responsiveness.level === "active"
          ? "Owner has been active recently"
          : responsiveness.level === "limited"
            ? "Owner response activity is limited"
            : "Owner response history is building",
  });
}

function propertyDetailsFactor(details: ListingPropertyDetailEvidence) {
  const values = Object.values(details);
  const completed = values.filter(Boolean).length;
  const alignment = values.length ? completed / values.length : 0;
  return factor({
    key: "propertyDetails",
    label: "Property details",
    weight: MOVE_IN_READINESS_CONFIG.weights.propertyDetails,
    alignment,
    reason:
      alignment >= 0.8
        ? "Property details are complete"
        : alignment >= 0.5
          ? "Some property details are still missing"
          : "Key property details are missing",
  });
}

export function calculateMoveInReadiness(
  evidence: MoveInReadinessEvidence,
  now = new Date(),
): MoveInReadiness {
  const factors = [
    availabilityFactor(evidence.availability.status),
    freshnessFactor(evidence.availability),
    photosFactor(evidence.imageCount, evidence.latestPhotoAt, now),
    verificationFactor(evidence.verificationKinds, evidence.trust),
    responsivenessFactor(evidence.responsiveness),
    factor({
      key: "visitSlots",
      label: "Visit availability",
      weight: MOVE_IN_READINESS_CONFIG.weights.visitSlots,
      alignment: evidence.hasOpenVisitSlots ? 1 : 0.25,
      reason: evidence.hasOpenVisitSlots
        ? "Visit slots available"
        : "No open visit slots currently",
    }),
    propertyDetailsFactor(evidence.propertyDetails),
  ];
  const score = Math.round(
    factors.reduce((total, current) => total + current.weightedPoints, 0),
  );
  const level = score >= MOVE_IN_READINESS_CONFIG.bands.high
    ? "high"
    : score >= MOVE_IN_READINESS_CONFIG.bands.medium
      ? "medium"
      : "low";

  return {
    score,
    level,
    label:
      level === "high"
        ? "High readiness"
        : level === "medium"
          ? "Medium readiness"
          : "Low readiness",
    factors,
    reasons: factors
      .filter(({ tone }) => tone === "positive")
      .sort((first, second) => second.weightedPoints - first.weightedPoints)
      .slice(0, MOVE_IN_READINESS_CONFIG.reasonLimits.positive)
      .map(({ reason }) => reason),
    considerations: factors
      .filter(({ tone }) => tone === "caution")
      .sort(
        (first, second) =>
          second.weight * (1 - second.alignment) -
          first.weight * (1 - first.alignment),
      )
      .slice(0, MOVE_IN_READINESS_CONFIG.reasonLimits.caution)
      .map(({ reason }) => reason),
  };
}

export function readinessRankingValue(readiness: MoveInReadiness | null) {
  return readiness?.score ?? -1;
}
