import type { ListingAvailabilityStatus } from "@/lib/listing-freshness";
import type { ResponsivenessIndicator } from "@/types/responsiveness";
import type {
  ListingFeedbackAggregate,
  TrustReason,
  TrustScore,
} from "@/types/trust";
import type { VerificationKind } from "@/types/verification";

export const TRUST_NEUTRAL_SCORE = 50;
export const TRUST_MIN_SCORE = 25;
export const TRUST_MAX_SCORE = 90;
export const TRUST_RANKING_WEIGHT = 4;
export const MIN_ATTENDANCE_TRUST_SAMPLES = 3;
export const MIN_FEEDBACK_TRUST_RESPONSES = 3;

type UserTrustEvidence = {
  verificationKinds: VerificationKind[];
  profileCompleteness: number;
  completedVisits: number;
  attendanceConfirmed: number;
  attendanceHappened: number;
  responsiveness: ResponsivenessIndicator;
  reportCount: number;
  moderationActions: Array<
    "DISMISS" | "WARN" | "HIDE_CONTENT" | "RESTRICT" | "SUSPEND" | "RESTORE_USER" | "SUPPORT_CASE_UPDATE"
  >;
  isRestricted: boolean;
};

type ListingTrustEvidence = {
  ownerTrust: TrustScore;
  verificationKinds: VerificationKind[];
  availability: {
    status: ListingAvailabilityStatus;
    isStale: boolean;
  };
  feedback: ListingFeedbackAggregate | null;
};

function clampScore(value: number) {
  return Math.max(TRUST_MIN_SCORE, Math.min(TRUST_MAX_SCORE, Math.round(value)));
}

function publicResult(
  score: number,
  evidenceSources: number,
  reasons: TrustReason[],
): TrustScore {
  if (evidenceSources < 2) {
    return {
      score: TRUST_NEUTRAL_SCORE,
      confidence: "neutral",
      label: "Trust history building",
      reasons: [],
    };
  }
  const bounded = clampScore(score);
  return {
    score: bounded,
    confidence: "established",
    label:
      bounded >= 75
        ? "Strong trust signals"
        : bounded >= 60
          ? "Established trust signals"
          : "Trust history developing",
    reasons: [...new Set(reasons)].slice(0, 3),
  };
}

export function calculateProfileCompleteness(input: {
  name: string;
  email: string | null;
  dateOfBirth: Date | string | null;
  profession: string | null;
  companyOrCollege: string | null;
  bio: string | null;
  hasBudget: boolean;
  hasMoveInDate: boolean;
  preferredLocalityCount: number;
  lifestylePreferenceCount: number;
}) {
  const completed = [
    input.name.trim().length >= 2,
    Boolean(input.email),
    Boolean(input.dateOfBirth),
    Boolean(input.profession),
    Boolean(input.companyOrCollege),
    Boolean(input.bio && input.bio.trim().length >= 30),
    input.hasBudget,
    input.hasMoveInDate,
    input.preferredLocalityCount > 0,
    input.lifestylePreferenceCount >= 4,
  ].filter(Boolean).length;
  return completed / 10;
}

export function calculateUserTrustScore(evidence: UserTrustEvidence): TrustScore {
  let score = TRUST_NEUTRAL_SCORE;
  let sources = 0;
  const reasons: TrustReason[] = [];
  const verified = new Set(evidence.verificationKinds);

  if (verified.has("EMAIL")) {
    score += 4;
    sources += 1;
    reasons.push("Verified profile");
  }
  if (verified.has("PHONE")) score += 4;
  if (verified.has("IDENTITY")) score += 7;
  if (verified.has("PROFILE_COMPLETE")) score += 4;
  if (verified.has("PHONE") || verified.has("IDENTITY") || verified.has("PROFILE_COMPLETE")) {
    sources += 1;
    reasons.push("Verified profile");
  }

  if (evidence.profileCompleteness >= 0.8) {
    score += 5;
    sources += 1;
    reasons.push("Profile information complete");
  } else if (evidence.profileCompleteness >= 0.6) {
    score += 2;
    sources += 1;
  }

  if (evidence.completedVisits >= 3) {
    score += 4;
    sources += 1;
    reasons.push("Active Roomzi history");
  } else if (evidence.completedVisits > 0) {
    score += 1;
    sources += 1;
  }

  if (evidence.attendanceConfirmed >= MIN_ATTENDANCE_TRUST_SAMPLES) {
    const consistency = evidence.attendanceHappened / evidence.attendanceConfirmed;
    sources += 1;
    if (consistency >= 0.85) {
      score += 6;
      reasons.push("Consistent visit history");
    } else if (consistency >= 0.65) {
      score += 2;
    } else if (consistency < 0.5) {
      score -= 6;
    }
  }

  if (evidence.responsiveness.level === "quick") {
    score += 4;
    sources += 1;
    reasons.push("Usually responds quickly");
  } else if (evidence.responsiveness.level === "active") {
    score += 2;
    sources += 1;
    reasons.push("Active Roomzi history");
  } else if (evidence.responsiveness.level === "limited") {
    score -= 2;
    sources += 1;
  }

  // Sensitive safety inputs are deliberately capped and never become public reasons.
  score -= Math.min(5, Math.max(0, evidence.reportCount - 1));
  const moderationPenalty = evidence.moderationActions.reduce((total, action) => {
    if (action === "WARN") return total + 2;
    if (action === "HIDE_CONTENT") return total + 3;
    if (action === "RESTRICT") return total + 6;
    if (action === "SUSPEND") return total + 9;
    return total;
  }, 0);
  score -= Math.min(15, moderationPenalty);
  if (evidence.reportCount > 1 || evidence.moderationActions.some((action) =>
    ["WARN", "HIDE_CONTENT", "RESTRICT", "SUSPEND"].includes(action)
  )) {
    sources += 1;
  }
  if (evidence.isRestricted) {
    score -= 7;
    sources += 1;
  }

  return publicResult(score, sources, reasons);
}

export function calculateListingTrustScore(evidence: ListingTrustEvidence): TrustScore {
  let score = evidence.ownerTrust.score;
  let sources = evidence.ownerTrust.confidence === "established" ? 1 : 0;
  const reasons: TrustReason[] = [];
  const verified = new Set(evidence.verificationKinds);

  if (verified.has("LISTING_DETAILS")) {
    score += 4;
    sources += 1;
    reasons.push("Verified listing details");
  }
  if (verified.has("PROPERTY")) {
    score += 7;
    sources += 1;
    reasons.push("Verified listing details");
  }

  if (evidence.availability.status !== "CLOSED") {
    sources += 1;
    if (!evidence.availability.isStale) {
      score += evidence.availability.status === "AVAILABLE" ? 4 : 2;
      reasons.push("Listing recently confirmed");
    } else {
      score -= 5;
    }
  }

  if (
    evidence.feedback &&
    evidence.feedback.responseCount >= MIN_FEEDBACK_TRUST_RESPONSES
  ) {
    sources += 1;
    const average = (
      evidence.feedback.propertyAccuracy +
      evidence.feedback.cleanliness +
      evidence.feedback.communicationQuality +
      evidence.feedback.safetyComfort +
      evidence.feedback.overallExperience
    ) / 5;
    if (average >= 4.2) {
      score += 6;
      reasons.push("Positive aggregated visit feedback");
    } else if (average >= 3.5) {
      score += 3;
    } else if (average < 2.5) {
      score -= 5;
    }
  }

  reasons.push(...evidence.ownerTrust.reasons);

  return publicResult(score, sources, reasons);
}

export function trustRecommendationAlignment(trust: TrustScore) {
  return trust.confidence === "neutral" ? null : trust.score / 100;
}
